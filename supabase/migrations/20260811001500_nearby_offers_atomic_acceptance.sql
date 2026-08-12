-- Phase 6 slices 4-5: nearby offer waves, expiry, and atomic acceptance.

alter table public.markets
  add column latitude numeric(9, 6) check (latitude between -90 and 90),
  add column longitude numeric(10, 6) check (longitude between -180 and 180),
  add constraint markets_coordinates_shape check (
    (latitude is null and longitude is null)
    or (latitude is not null and longitude is not null)
  );

create type public.delivery_offer_status as enum (
  'pending', 'accepted', 'rejected', 'expired', 'withdrawn'
);
create type public.delivery_offer_wave_status as enum (
  'open', 'accepted', 'expired', 'exhausted'
);

create table public.delivery_offer_waves (
  id uuid primary key default extensions.gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  operation_id uuid not null unique,
  wave_number integer not null check (wave_number > 0),
  max_distance_km numeric(7, 3) not null check (max_distance_km > 0 and max_distance_km <= 50),
  max_offers integer not null check (max_offers between 1 and 20),
  offer_ttl_seconds integer not null check (offer_ttl_seconds between 15 and 300),
  status public.delivery_offer_wave_status not null default 'open',
  offered_count integer not null default 0 check (offered_count >= 0),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (delivery_id, wave_number)
);

create table public.delivery_offers (
  id uuid primary key default extensions.gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  wave_id uuid not null references public.delivery_offer_waves(id) on delete cascade,
  transporter_id uuid not null references public.transporter_profiles(id),
  status public.delivery_offer_status not null default 'pending',
  distance_km numeric(7, 3) not null check (distance_km >= 0 and distance_km <= 100),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  rejected_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  constraint delivery_offer_expiry_shape check (expires_at > offered_at),
  constraint delivery_offer_status_timestamps check (
    (status = 'pending' and accepted_at is null and rejected_at is null and withdrawn_at is null)
    or (status = 'accepted' and accepted_at is not null and rejected_at is null and withdrawn_at is null)
    or (status = 'rejected' and rejected_at is not null and accepted_at is null and withdrawn_at is null)
    or (status = 'expired' and accepted_at is null and rejected_at is null and withdrawn_at is null)
    or (status = 'withdrawn' and withdrawn_at is not null and accepted_at is null and rejected_at is null)
  ),
  unique (delivery_id, transporter_id),
  unique (id, delivery_id, transporter_id)
);

create table public.delivery_offer_acceptance_operations (
  operation_id uuid primary key,
  offer_id uuid not null,
  delivery_id uuid not null,
  transporter_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  expected_delivery_version integer not null check (expected_delivery_version > 0),
  result_delivery_version integer not null check (result_delivery_version > 0),
  created_at timestamptz not null default now(),
  foreign key (offer_id, delivery_id, transporter_id)
    references public.delivery_offers(id, delivery_id, transporter_id) on delete cascade
);

create index delivery_offers_delivery_status_idx
  on public.delivery_offers (delivery_id, status, expires_at, id);
create index delivery_offers_transporter_pending_idx
  on public.delivery_offers (transporter_id, expires_at, offered_at desc)
  where status = 'pending';
create index delivery_offers_expiry_idx
  on public.delivery_offers (expires_at, id)
  where status = 'pending';
create index delivery_offer_waves_delivery_idx
  on public.delivery_offer_waves (delivery_id, wave_number desc);

drop index public.deliveries_assigned_active_idx;
create unique index deliveries_one_active_per_transporter_idx
  on public.deliveries (assigned_transporter_id)
  where status in (
    'assigned', 'arrived_at_market', 'picked_up', 'in_transit', 'arrived_at_customer'
  );

create or replace function public.haversine_distance_km(
  p_latitude_a double precision,
  p_longitude_a double precision,
  p_latitude_b double precision,
  p_longitude_b double precision
)
returns double precision
language sql
immutable
strict
set search_path = ''
as $$
  select 2 * 6371.0088 * asin(
    sqrt(
      least(
        1.0,
        power(sin(radians(p_latitude_b - p_latitude_a) / 2), 2)
        + cos(radians(p_latitude_a)) * cos(radians(p_latitude_b))
        * power(sin(radians(p_longitude_b - p_longitude_a) / 2), 2)
      )
    )
  );
$$;

create or replace function public.find_nearby_transporters(
  p_delivery_id uuid,
  p_max_distance_km numeric default 5,
  p_limit integer default 20
)
returns table (
  transporter_id uuid,
  distance_km numeric,
  location_received_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_max_distance_km <= 0 or p_max_distance_km > 50 then
    raise exception 'maximum distance must be between 0 and 50 kilometres'
      using errcode = '22023';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'candidate limit must be between 1 and 100'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.deliveries where id = p_delivery_id) then
    raise exception 'delivery not found' using errcode = 'P0002';
  end if;

  return query
  select
    candidate.transporter_id,
    round(candidate.distance_km::numeric, 3),
    candidate.location_received_at
  from (
    select
      transporter.id as transporter_id,
      public.haversine_distance_km(
        location.latitude::double precision,
        location.longitude::double precision,
        market.latitude::double precision,
        market.longitude::double precision
      ) as distance_km,
      location.received_at as location_received_at,
      transporter.availability_updated_at
    from public.deliveries delivery
    join public.delivery_groups delivery_group on delivery_group.id = delivery.delivery_group_id
    join public.markets market on market.id = delivery_group.market_id
    cross join public.transporter_profiles transporter
    join public.transporter_locations_current location
      on location.transporter_id = transporter.id
    where delivery.id = p_delivery_id
      and delivery.assigned_transporter_id is null
      and delivery.status in ('unassigned', 'offering')
      and market.latitude is not null
      and market.longitude is not null
      and transporter.verification_status = 'approved'
      and transporter.availability = 'available'
      and location.received_at >= now() - interval '10 minutes'
      and not exists (
        select 1
        from public.delivery_offers existing_offer
        where existing_offer.delivery_id = delivery.id
          and existing_offer.transporter_id = transporter.id
      )
  ) candidate
  where candidate.distance_km <= p_max_distance_km
  order by candidate.distance_km, candidate.availability_updated_at, candidate.transporter_id
  limit p_limit;
end;
$$;

create or replace function public.offer_delivery_to_nearby_transporters(
  p_delivery_id uuid,
  p_operation_id uuid,
  p_max_distance_km numeric default 5,
  p_max_offers integer default 5,
  p_offer_ttl_seconds integer default 45
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_record public.deliveries;
  existing_wave public.delivery_offer_waves;
  wave_record public.delivery_offer_waves;
  candidate_record record;
  next_wave_number integer;
  inserted_count integer := 0;
  transition_operation_id uuid := p_operation_id;
begin
  if p_max_distance_km <= 0 or p_max_distance_km > 50
    or p_max_offers < 1 or p_max_offers > 20
    or p_offer_ttl_seconds < 15 or p_offer_ttl_seconds > 300 then
    raise exception 'invalid delivery offer wave configuration' using errcode = '22023';
  end if;

  select * into delivery_record
  from public.deliveries
  where id = p_delivery_id
  for update;

  if delivery_record.id is null then
    raise exception 'delivery not found' using errcode = 'P0002';
  end if;

  select * into existing_wave
  from public.delivery_offer_waves
  where operation_id = p_operation_id;

  if existing_wave.id is not null then
    if existing_wave.delivery_id <> p_delivery_id
      or existing_wave.max_distance_km <> p_max_distance_km
      or existing_wave.max_offers <> p_max_offers
      or existing_wave.offer_ttl_seconds <> p_offer_ttl_seconds then
      raise exception 'operation id was already used for another offer wave'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'deliveryId', existing_wave.delivery_id,
      'waveId', existing_wave.id,
      'waveNumber', existing_wave.wave_number,
      'offeredCount', existing_wave.offered_count,
      'expiresAt', existing_wave.expires_at,
      'deliveryStatus', delivery_record.status,
      'deliveryVersion', delivery_record.version,
      'duplicate', true
    );
  end if;

  if delivery_record.assigned_transporter_id is not null
    or delivery_record.status not in ('unassigned', 'offering') then
    raise exception 'delivery is not available for offers' using errcode = '23514';
  end if;

  -- Opportunistically expire this delivery's stale offers before opening another wave.
  with expired as (
    update public.delivery_offers offer
    set status = 'expired'
    where offer.delivery_id = p_delivery_id
      and offer.status = 'pending'
      and offer.expires_at <= now()
    returning offer.transporter_id, offer.wave_id
  )
  update public.transporter_profiles transporter
  set availability = 'available', availability_updated_at = now()
  where transporter.id in (select transporter_id from expired)
    and transporter.availability = 'offer_pending'
    and not exists (
      select 1 from public.delivery_offers pending_offer
      where pending_offer.transporter_id = transporter.id
        and pending_offer.status = 'pending'
        and pending_offer.expires_at > now()
    );

  update public.delivery_offer_waves wave
  set status = 'expired', completed_at = now()
  where wave.delivery_id = p_delivery_id
    and wave.status = 'open'
    and not exists (
      select 1 from public.delivery_offers offer
      where offer.wave_id = wave.id and offer.status = 'pending'
    );

  if exists (
    select 1 from public.delivery_offers offer
    where offer.delivery_id = p_delivery_id
      and offer.status = 'pending'
      and offer.expires_at > now()
  ) then
    raise exception 'delivery already has an active offer wave' using errcode = '23514';
  end if;

  select coalesce(max(wave_number), 0) + 1 into next_wave_number
  from public.delivery_offer_waves
  where delivery_id = p_delivery_id;

  insert into public.delivery_offer_waves (
    delivery_id, operation_id, wave_number, max_distance_km, max_offers,
    offer_ttl_seconds, expires_at
  ) values (
    p_delivery_id, p_operation_id, next_wave_number, p_max_distance_km,
    p_max_offers, p_offer_ttl_seconds,
    now() + make_interval(secs => p_offer_ttl_seconds)
  ) returning * into wave_record;

  for candidate_record in
    select candidate.transporter_id, candidate.distance_km
    from public.find_nearby_transporters(
      p_delivery_id, p_max_distance_km, p_max_offers
    ) candidate
    join public.transporter_profiles transporter
      on transporter.id = candidate.transporter_id
    order by candidate.distance_km, candidate.transporter_id
    for update of transporter skip locked
  loop
    insert into public.delivery_offers (
      delivery_id, wave_id, transporter_id, distance_km, expires_at
    ) values (
      p_delivery_id, wave_record.id, candidate_record.transporter_id,
      candidate_record.distance_km, wave_record.expires_at
    );
    update public.transporter_profiles
    set availability = 'offer_pending', availability_updated_at = now()
    where id = candidate_record.transporter_id and availability = 'available';
    if found then inserted_count := inserted_count + 1; end if;
  end loop;

  update public.delivery_offer_waves
  set offered_count = inserted_count,
      status = case
        when inserted_count = 0 then 'exhausted'::public.delivery_offer_wave_status
        else 'open'::public.delivery_offer_wave_status
      end,
      completed_at = case when inserted_count = 0 then now() else null end
  where id = wave_record.id
  returning * into wave_record;

  if inserted_count > 0 and delivery_record.status = 'unassigned' then
    perform public.transition_delivery(
      p_delivery_id, null, 'system', 'offering', delivery_record.version,
      transition_operation_id, 'nearby_offer_wave_started',
      jsonb_build_object('waveId', wave_record.id, 'waveNumber', wave_record.wave_number)
    );
    select * into delivery_record from public.deliveries where id = p_delivery_id;
  elsif inserted_count = 0 and delivery_record.status = 'offering' then
    perform public.transition_delivery(
      p_delivery_id, null, 'system', 'unassigned', delivery_record.version,
      extensions.gen_random_uuid(), 'no_eligible_nearby_transporters',
      jsonb_build_object('waveId', wave_record.id, 'waveNumber', wave_record.wave_number)
    );
    select * into delivery_record from public.deliveries where id = p_delivery_id;
  end if;

  insert into public.notification_events (
    user_id, event_type, entity_type, entity_id, title, body, priority, payload, dedupe_key
  )
  select
    transporter.user_id,
    'delivery.offer_created',
    'delivery_offer',
    offer.id,
    'New delivery nearby',
    'A delivery from ' || market.name || ' is available near you.',
    'normal',
    jsonb_build_object(
      'offerId', offer.id,
      'deliveryId', offer.delivery_id,
      'pickupMarket', market.name,
      'deliveryZone', delivery_group.delivery_zone_name,
      'distanceToPickupKm', offer.distance_km,
      'deliveryFeeUgx', delivery.fee_ugx,
      'expiresAt', offer.expires_at,
      'deliveryVersion', delivery.version,
      'waveNumber', wave_record.wave_number
    ),
    'delivery_offer:' || offer.id::text || ':created'
  from public.delivery_offers offer
  join public.deliveries delivery on delivery.id = offer.delivery_id
  join public.delivery_groups delivery_group on delivery_group.id = delivery.delivery_group_id
  join public.markets market on market.id = delivery_group.market_id
  join public.transporter_profiles transporter on transporter.id = offer.transporter_id
  where offer.wave_id = wave_record.id
  on conflict (dedupe_key) do nothing;

  insert into public.notification_deliveries (event_id, channel)
  select event.id, 'push'
  from public.notification_events event
  where event.dedupe_key in (
    select 'delivery_offer:' || offer.id::text || ':created'
    from public.delivery_offers offer where offer.wave_id = wave_record.id
  )
  on conflict (event_id, channel) do nothing;

  insert into public.notification_audit_events (notification_event_id, action, details)
  select event.id, 'notification.enqueued', jsonb_build_object('channel', 'push')
  from public.notification_events event
  where event.dedupe_key in (
    select 'delivery_offer:' || offer.id::text || ':created'
    from public.delivery_offers offer where offer.wave_id = wave_record.id
  )
    and not exists (
      select 1 from public.notification_audit_events audit
      where audit.notification_event_id = event.id and audit.action = 'notification.enqueued'
    );

  return jsonb_build_object(
    'deliveryId', p_delivery_id,
    'waveId', wave_record.id,
    'waveNumber', wave_record.wave_number,
    'offeredCount', inserted_count,
    'expiresAt', wave_record.expires_at,
    'deliveryStatus', delivery_record.status,
    'deliveryVersion', delivery_record.version,
    'duplicate', false
  );
end;
$$;

create or replace function public.expire_delivery_offers(p_batch_size integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_offer_ids uuid[];
  delivery_id_value uuid;
  delivery_record public.deliveries;
  expired_count integer := 0;
begin
  if p_batch_size < 1 or p_batch_size > 1000 then
    raise exception 'batch size must be between 1 and 1000' using errcode = '22023';
  end if;

  select array_agg(id) into expired_offer_ids
  from (
    select offer.id
    from public.delivery_offers offer
    where offer.status = 'pending' and offer.expires_at <= now()
    order by offer.expires_at, offer.id
    for update skip locked
    limit p_batch_size
  ) candidate;

  if expired_offer_ids is null then return 0; end if;

  update public.delivery_offers
  set status = 'expired'
  where id = any(expired_offer_ids);
  get diagnostics expired_count = row_count;

  update public.transporter_profiles transporter
  set availability = 'available', availability_updated_at = now()
  where transporter.id in (
    select offer.transporter_id
    from public.delivery_offers offer
    where offer.id = any(expired_offer_ids)
  )
    and transporter.availability = 'offer_pending'
    and not exists (
      select 1 from public.delivery_offers pending_offer
      where pending_offer.transporter_id = transporter.id
        and pending_offer.status = 'pending'
        and pending_offer.expires_at > now()
    )
    and not exists (
      select 1 from public.deliveries active_delivery
      where active_delivery.assigned_transporter_id = transporter.id
        and active_delivery.status in (
          'assigned', 'arrived_at_market', 'picked_up', 'in_transit', 'arrived_at_customer'
        )
    );

  update public.delivery_offer_waves wave
  set status = 'expired', completed_at = now()
  where wave.status = 'open'
    and wave.id in (
      select offer.wave_id from public.delivery_offers offer
      where offer.id = any(expired_offer_ids)
    )
    and not exists (
      select 1 from public.delivery_offers pending_offer
      where pending_offer.wave_id = wave.id and pending_offer.status = 'pending'
    );

  for delivery_id_value in
    select distinct offer.delivery_id
    from public.delivery_offers offer
    where offer.id = any(expired_offer_ids)
  loop
    select * into delivery_record
    from public.deliveries
    where id = delivery_id_value
    for update;

    if delivery_record.status = 'offering'
      and delivery_record.assigned_transporter_id is null
      and not exists (
        select 1 from public.delivery_offers pending_offer
        where pending_offer.delivery_id = delivery_id_value
          and pending_offer.status = 'pending'
          and pending_offer.expires_at > now()
      ) then
      perform public.transition_delivery(
        delivery_id_value, null, 'system', 'unassigned', delivery_record.version,
        extensions.gen_random_uuid(), 'delivery_offer_wave_expired', '{}'::jsonb
      );
    end if;
  end loop;

  return expired_count;
end;
$$;

create or replace function public.accept_delivery_offer(
  p_offer_id uuid,
  p_transporter_user_id uuid,
  p_expected_delivery_version integer,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  offer_record public.delivery_offers;
  offer_delivery_id uuid;
  delivery_record public.deliveries;
  transporter_record public.transporter_profiles;
  existing_operation public.delivery_offer_acceptance_operations;
  next_version integer;
begin
  select delivery_id into offer_delivery_id
  from public.delivery_offers
  where id = p_offer_id;

  if offer_delivery_id is null then
    raise exception 'delivery offer not found' using errcode = 'P0002';
  end if;

  -- Serialize contenders before either transaction owns a competing offer row.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(offer_delivery_id::text, 0)
  );

  select * into offer_record
  from public.delivery_offers
  where id = p_offer_id
  for update;

  if offer_record.id is null then
    raise exception 'delivery offer not found' using errcode = 'P0002';
  end if;

  select * into transporter_record
  from public.transporter_profiles
  where id = offer_record.transporter_id
  for update;

  if transporter_record.user_id <> p_transporter_user_id
    or transporter_record.verification_status <> 'approved' then
    raise exception 'delivery offer does not belong to this approved rider'
      using errcode = '42501';
  end if;

  select * into delivery_record
  from public.deliveries
  where id = offer_record.delivery_id
  for update;

  select * into existing_operation
  from public.delivery_offer_acceptance_operations
  where operation_id = p_operation_id;

  if existing_operation.operation_id is not null then
    if existing_operation.offer_id <> p_offer_id
      or existing_operation.actor_user_id <> p_transporter_user_id
      or existing_operation.expected_delivery_version <> p_expected_delivery_version then
      raise exception 'operation id was already used for another offer acceptance'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'offerId', existing_operation.offer_id,
      'deliveryId', existing_operation.delivery_id,
      'transporterId', existing_operation.transporter_id,
      'status', 'assigned',
      'version', existing_operation.result_delivery_version,
      'operationId', existing_operation.operation_id,
      'duplicate', true
    );
  end if;

  if offer_record.status <> 'pending' then
    raise exception 'DELIVERY_OFFER_NOT_PENDING' using errcode = 'P0001';
  end if;
  if offer_record.expires_at <= now() then
    raise exception 'DELIVERY_OFFER_EXPIRED' using errcode = 'P0001';
  end if;
  if delivery_record.assigned_transporter_id is not null
    or delivery_record.status = 'assigned' then
    raise exception 'DELIVERY_ALREADY_ASSIGNED' using errcode = 'P0001';
  end if;
  if delivery_record.status <> 'offering' then
    raise exception 'delivery is not accepting offers' using errcode = '23514';
  end if;
  if delivery_record.version <> p_expected_delivery_version then
    raise exception 'delivery version conflict' using errcode = '40001';
  end if;
  if transporter_record.availability <> 'offer_pending' then
    raise exception 'rider is not available for this offer' using errcode = '23514';
  end if;

  next_version := delivery_record.version + 1;

  insert into public.delivery_offer_acceptance_operations (
    operation_id, offer_id, delivery_id, transporter_id, actor_user_id,
    expected_delivery_version, result_delivery_version
  ) values (
    p_operation_id, offer_record.id, delivery_record.id, transporter_record.id,
    p_transporter_user_id, p_expected_delivery_version, next_version
  );

  update public.delivery_offers
  set status = 'accepted', accepted_at = now()
  where id = offer_record.id;

  with withdrawn as (
    update public.delivery_offers
    set status = 'withdrawn', withdrawn_at = now()
    where delivery_id = delivery_record.id
      and id <> offer_record.id
      and status = 'pending'
    returning transporter_id
  )
  update public.transporter_profiles transporter
  set availability = 'available', availability_updated_at = now()
  where transporter.id in (select transporter_id from withdrawn)
    and transporter.availability = 'offer_pending';

  update public.deliveries
  set assigned_transporter_id = transporter_record.id,
      status = 'assigned',
      assigned_at = now(),
      version = next_version
  where id = delivery_record.id;

  update public.transporter_profiles
  set availability = 'assigned', availability_updated_at = now()
  where id = transporter_record.id;

  update public.delivery_offer_waves
  set status = case
        when id = offer_record.wave_id then 'accepted'::public.delivery_offer_wave_status
        else 'exhausted'::public.delivery_offer_wave_status
      end,
      completed_at = now()
  where delivery_id = delivery_record.id and status = 'open';

  insert into public.delivery_operations (
    operation_id, delivery_id, actor_user_id, actor_type, requested_status,
    expected_version, result_status, result_version, reason, metadata
  ) values (
    p_operation_id, delivery_record.id, p_transporter_user_id, 'rider', 'assigned',
    p_expected_delivery_version, 'assigned', next_version, 'delivery_offer_accepted',
    jsonb_build_object('offerId', offer_record.id, 'waveId', offer_record.wave_id)
  );

  insert into public.delivery_status_history (
    delivery_id, operation_id, actor_user_id, actor_type, from_status,
    to_status, from_version, to_version, reason
  ) values (
    delivery_record.id, p_operation_id, p_transporter_user_id, 'rider',
    delivery_record.status, 'assigned', delivery_record.version, next_version,
    'delivery_offer_accepted'
  );

  insert into public.delivery_audit_events (
    delivery_id, operation_id, actor_user_id, actor_type, action,
    previous_status, next_status, details
  ) values (
    delivery_record.id, p_operation_id, p_transporter_user_id, 'rider',
    'delivery.offer_accepted', delivery_record.status, 'assigned',
    jsonb_build_object('offerId', offer_record.id, 'waveId', offer_record.wave_id)
  );

  insert into public.notification_events (
    user_id, event_type, entity_type, entity_id, title, body, priority, payload, dedupe_key
  )
  select recipient.user_id, recipient.event_type, 'delivery', delivery_record.id,
    recipient.title, recipient.body, 'normal',
    jsonb_build_object(
      'deliveryId', delivery_record.id,
      'offerId', offer_record.id,
      'status', 'assigned',
      'version', next_version
    ),
    'delivery:' || delivery_record.id::text || ':' || recipient.event_type || ':version:' || next_version::text
  from (
    values
      (p_transporter_user_id, 'delivery.offer_accepted', 'Delivery accepted', 'The delivery is now assigned to you.'),
      ((select consumer_id from public.delivery_groups where id = delivery_record.delivery_group_id),
       'delivery.rider_assigned', 'Rider assigned', 'A rider has accepted your delivery.')
  ) recipient(user_id, event_type, title, body)
  on conflict (dedupe_key) do nothing;

  insert into public.notification_deliveries (event_id, channel)
  select event.id, 'push'
  from public.notification_events event
  where event.dedupe_key in (
    'delivery:' || delivery_record.id::text || ':delivery.offer_accepted:version:' || next_version::text,
    'delivery:' || delivery_record.id::text || ':delivery.rider_assigned:version:' || next_version::text
  )
  on conflict (event_id, channel) do nothing;

  insert into public.notification_audit_events (notification_event_id, action, details)
  select event.id, 'notification.enqueued', jsonb_build_object('channel', 'push')
  from public.notification_events event
  where event.dedupe_key in (
    'delivery:' || delivery_record.id::text || ':delivery.offer_accepted:version:' || next_version::text,
    'delivery:' || delivery_record.id::text || ':delivery.rider_assigned:version:' || next_version::text
  )
    and not exists (
      select 1 from public.notification_audit_events audit
      where audit.notification_event_id = event.id and audit.action = 'notification.enqueued'
    );

  return jsonb_build_object(
    'offerId', offer_record.id,
    'deliveryId', delivery_record.id,
    'transporterId', transporter_record.id,
    'status', 'assigned',
    'version', next_version,
    'operationId', p_operation_id,
    'duplicate', false
  );
end;
$$;

alter table public.delivery_offer_waves enable row level security;
alter table public.delivery_offers enable row level security;
alter table public.delivery_offer_acceptance_operations enable row level security;

revoke all on table public.delivery_offer_waves from public;
revoke all on table public.delivery_offers from public;
revoke all on table public.delivery_offer_acceptance_operations from public;

revoke all on function public.haversine_distance_km(double precision, double precision, double precision, double precision) from public;
revoke all on function public.find_nearby_transporters(uuid, numeric, integer) from public;
revoke all on function public.offer_delivery_to_nearby_transporters(uuid, uuid, numeric, integer, integer) from public;
revoke all on function public.expire_delivery_offers(integer) from public;
revoke all on function public.accept_delivery_offer(uuid, uuid, integer, uuid) from public;
grant execute on function public.haversine_distance_km(double precision, double precision, double precision, double precision) to service_role;
grant execute on function public.find_nearby_transporters(uuid, numeric, integer) to service_role;
grant execute on function public.offer_delivery_to_nearby_transporters(uuid, uuid, numeric, integer, integer) to service_role;
grant execute on function public.expire_delivery_offers(integer) to service_role;
grant execute on function public.accept_delivery_offer(uuid, uuid, integer, uuid) to service_role;
