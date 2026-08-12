-- Phase 6 slices 2-3: delivery state machine and rider operational state.

create type public.delivery_status as enum (
  'unassigned',
  'offering',
  'assigned',
  'arrived_at_market',
  'picked_up',
  'in_transit',
  'arrived_at_customer',
  'delivered',
  'assignment_cancelled',
  'pickup_failed',
  'delivery_failed',
  'customer_unavailable',
  'issue_reported',
  'returned'
);

create type public.delivery_actor_type as enum ('system', 'rider', 'dispatcher');
create type public.transporter_verification_status as enum (
  'pending', 'approved', 'rejected', 'suspended'
);
create type public.rider_availability as enum (
  'offline', 'available', 'offer_pending', 'assigned', 'busy'
);

create sequence public.delivery_reference_sequence;

create table public.transporter_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 100),
  verification_status public.transporter_verification_status not null default 'pending',
  availability public.rider_availability not null default 'offline',
  availability_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transporter_operational_status check (
    verification_status = 'approved'
    or availability = 'offline'
  )
);

create table public.transporter_locations_current (
  transporter_id uuid primary key references public.transporter_profiles(id) on delete cascade,
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(10, 6) not null check (longitude between -180 and 180),
  accuracy_meters numeric(8, 2) not null check (accuracy_meters > 0 and accuracy_meters <= 500),
  captured_at timestamptz not null,
  received_at timestamptz not null default now()
);

create table public.delivery_groups (
  id uuid primary key default extensions.gen_random_uuid(),
  checkout_id uuid not null unique references public.customer_checkouts(id),
  consumer_id uuid not null references auth.users(id),
  market_id uuid not null references public.markets(id),
  delivery_zone_id uuid not null references public.delivery_zones(id),
  delivery_address_id uuid not null references public.consumer_addresses(id),
  delivery_zone_name text not null,
  address_label text not null,
  address_summary text not null,
  phone_number text not null,
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.delivery_group_orders (
  delivery_group_id uuid not null references public.delivery_groups(id) on delete cascade,
  seller_order_id uuid not null unique references public.vendor_orders(id),
  created_at timestamptz not null default now(),
  primary key (delivery_group_id, seller_order_id)
);

create table public.deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  reference text not null unique default (
    'DL-' || lpad(nextval('public.delivery_reference_sequence')::text, 7, '0')
  ),
  delivery_group_id uuid not null unique references public.delivery_groups(id),
  assigned_transporter_id uuid references public.transporter_profiles(id),
  status public.delivery_status not null default 'unassigned',
  version integer not null default 1 check (version > 0),
  fee_ugx integer not null check (fee_ugx >= 0),
  assigned_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_assignment_shape check (
    (status in ('unassigned', 'offering') and assigned_transporter_id is null)
    or (status not in ('unassigned', 'offering') and assigned_transporter_id is not null)
  ),
  constraint delivered_timestamp_shape check (
    (status = 'delivered' and completed_at is not null)
    or (status <> 'delivered' and completed_at is null)
  )
);

create table public.delivery_operations (
  operation_id uuid primary key,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  actor_type public.delivery_actor_type not null,
  requested_status public.delivery_status not null,
  expected_version integer not null check (expected_version > 0),
  result_status public.delivery_status not null,
  result_version integer not null check (result_version > 0),
  reason text check (reason is null or char_length(reason) <= 500),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.delivery_status_history (
  id bigint generated always as identity primary key,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  operation_id uuid not null references public.delivery_operations(operation_id),
  actor_user_id uuid references auth.users(id),
  actor_type public.delivery_actor_type not null,
  from_status public.delivery_status not null,
  to_status public.delivery_status not null,
  from_version integer not null check (from_version > 0),
  to_version integer not null check (to_version = from_version + 1),
  reason text,
  created_at timestamptz not null default now(),
  unique (delivery_id, operation_id)
);

create table public.delivery_audit_events (
  id bigint generated always as identity primary key,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  operation_id uuid not null references public.delivery_operations(operation_id),
  actor_user_id uuid references auth.users(id),
  actor_type public.delivery_actor_type not null,
  action text not null,
  previous_status public.delivery_status,
  next_status public.delivery_status,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (delivery_id, operation_id)
);

create table public.transporter_availability_operations (
  operation_id uuid primary key,
  transporter_id uuid not null references public.transporter_profiles(id) on delete cascade,
  requested_availability public.rider_availability not null,
  previous_availability public.rider_availability not null,
  result_availability public.rider_availability not null,
  created_at timestamptz not null default now()
);

create table public.transporter_availability_history (
  id bigint generated always as identity primary key,
  transporter_id uuid not null references public.transporter_profiles(id) on delete cascade,
  operation_id uuid not null unique references public.transporter_availability_operations(operation_id),
  from_availability public.rider_availability not null,
  to_availability public.rider_availability not null,
  created_at timestamptz not null default now()
);

create table public.transporter_location_operations (
  operation_id uuid primary key,
  transporter_id uuid not null references public.transporter_profiles(id) on delete cascade,
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(10, 6) not null check (longitude between -180 and 180),
  accuracy_meters numeric(8, 2) not null check (accuracy_meters > 0 and accuracy_meters <= 500),
  captured_at timestamptz not null,
  received_at timestamptz not null default now()
);

create index transporter_profiles_available_idx
  on public.transporter_profiles (availability_updated_at, id)
  where verification_status = 'approved' and availability = 'available';
create index transporter_profiles_verification_idx
  on public.transporter_profiles (verification_status, updated_at desc, id);
create index transporter_locations_freshness_idx
  on public.transporter_locations_current (received_at desc, transporter_id);
create index deliveries_assigned_active_idx
  on public.deliveries (assigned_transporter_id, updated_at desc, id)
  where status in (
    'assigned', 'arrived_at_market', 'picked_up', 'in_transit', 'arrived_at_customer'
  );
create index deliveries_status_created_idx
  on public.deliveries (status, created_at, id);
create index delivery_history_timeline_idx
  on public.delivery_status_history (delivery_id, created_at, id);
create index delivery_audit_timeline_idx
  on public.delivery_audit_events (delivery_id, created_at, id);
create index delivery_group_orders_order_idx
  on public.delivery_group_orders (seller_order_id, delivery_group_id);
create index availability_history_timeline_idx
  on public.transporter_availability_history (transporter_id, created_at, id);
create index location_operations_rider_received_idx
  on public.transporter_location_operations (transporter_id, received_at desc);

create trigger transporter_profiles_set_updated_at
before update on public.transporter_profiles
for each row execute function public.set_updated_at();
create trigger delivery_groups_set_updated_at
before update on public.delivery_groups
for each row execute function public.set_updated_at();
create trigger deliveries_set_updated_at
before update on public.deliveries
for each row execute function public.set_updated_at();

create or replace function public.validate_delivery_group()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  checkout_record public.customer_checkouts;
  fulfilment_record public.checkout_fulfilments;
begin
  select * into checkout_record
  from public.customer_checkouts
  where id = new.checkout_id;

  select * into fulfilment_record
  from public.checkout_fulfilments
  where checkout_id = new.checkout_id;

  if checkout_record.id is null or fulfilment_record.checkout_id is null
    or fulfilment_record.type <> 'delivery'
    or checkout_record.consumer_id <> new.consumer_id
    or checkout_record.market_id <> new.market_id
    or fulfilment_record.delivery_zone_id <> new.delivery_zone_id
    or fulfilment_record.address_id <> new.delivery_address_id then
    raise exception 'delivery group does not match checkout fulfilment'
      using errcode = '23514';
  end if;

  new.delivery_zone_name := fulfilment_record.delivery_zone_name;
  new.address_label := fulfilment_record.address_label;
  new.address_summary := fulfilment_record.address_summary;
  new.phone_number := fulfilment_record.phone_number;
  new.scheduled_for := fulfilment_record.requested_for;

  return new;
end;
$$;

create trigger delivery_groups_validate
before insert or update of checkout_id, consumer_id, market_id, delivery_zone_id, delivery_address_id
on public.delivery_groups
for each row execute function public.validate_delivery_group();

create or replace function public.validate_delivery_group_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.delivery_groups delivery_group
    join public.vendor_orders seller_order
      on seller_order.checkout_id = delivery_group.checkout_id
    where delivery_group.id = new.delivery_group_id
      and seller_order.id = new.seller_order_id
      and seller_order.status = 'ready_for_pickup'
  ) then
    raise exception 'delivery group orders must be ready and belong to the group checkout'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger delivery_group_orders_validate
before insert or update of delivery_group_id, seller_order_id
on public.delivery_group_orders
for each row execute function public.validate_delivery_group_order();

create or replace function public.validate_delivery_job()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.delivery_groups delivery_group
    join public.customer_checkouts checkout_record
      on checkout_record.id = delivery_group.checkout_id
    where delivery_group.id = new.delivery_group_id
      and checkout_record.delivery_fee_ugx = new.fee_ugx
      and exists (
        select 1
        from public.delivery_group_orders group_order
        where group_order.delivery_group_id = delivery_group.id
      )
      and not exists (
        select 1
        from public.delivery_group_orders group_order
        join public.vendor_orders seller_order on seller_order.id = group_order.seller_order_id
        where group_order.delivery_group_id = delivery_group.id
          and seller_order.status <> 'ready_for_pickup'
      )
  ) then
    raise exception 'delivery requires a ready group and the checkout delivery fee'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger deliveries_validate_job
before insert or update of delivery_group_id, fee_ugx
on public.deliveries
for each row execute function public.validate_delivery_job();

create or replace function public.transition_delivery(
  p_delivery_id uuid,
  p_actor_user_id uuid,
  p_actor_type text,
  p_to_status text,
  p_expected_version integer,
  p_operation_id uuid,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_record public.deliveries;
  existing_operation public.delivery_operations;
  requested_status public.delivery_status;
  requested_actor_type public.delivery_actor_type;
  next_version integer;
begin
  if p_to_status not in (
    'unassigned', 'offering', 'assigned', 'arrived_at_market', 'picked_up',
    'in_transit', 'arrived_at_customer', 'delivered', 'assignment_cancelled',
    'pickup_failed', 'delivery_failed', 'customer_unavailable', 'issue_reported',
    'returned'
  ) then
    raise exception 'unsupported delivery status' using errcode = '22023';
  end if;
  if p_actor_type not in ('system', 'rider', 'dispatcher') then
    raise exception 'unsupported delivery actor type' using errcode = '22023';
  end if;
  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'delivery transition reason is too long' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'delivery transition metadata must be an object' using errcode = '22023';
  end if;

  requested_status := p_to_status::public.delivery_status;
  requested_actor_type := p_actor_type::public.delivery_actor_type;
  if requested_actor_type <> 'system' and p_actor_user_id is null then
    raise exception 'rider and dispatcher transitions require an actor user'
      using errcode = '22023';
  end if;

  select * into delivery_record
  from public.deliveries
  where id = p_delivery_id
  for update;

  if delivery_record.id is null then
    raise exception 'delivery not found' using errcode = 'P0002';
  end if;

  select * into existing_operation
  from public.delivery_operations
  where operation_id = p_operation_id;

  if existing_operation.operation_id is not null then
    if existing_operation.delivery_id <> p_delivery_id
      or existing_operation.actor_user_id is distinct from p_actor_user_id
      or existing_operation.actor_type <> requested_actor_type
      or existing_operation.requested_status <> requested_status
      or existing_operation.expected_version <> p_expected_version
      or existing_operation.reason is distinct from p_reason
      or existing_operation.metadata <> coalesce(p_metadata, '{}'::jsonb) then
      raise exception 'operation id was already used for another delivery transition'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'deliveryId', existing_operation.delivery_id,
      'status', existing_operation.result_status,
      'version', existing_operation.result_version,
      'operationId', existing_operation.operation_id,
      'duplicate', true
    );
  end if;

  if delivery_record.version <> p_expected_version then
    raise exception 'delivery version conflict' using errcode = '40001';
  end if;

  if requested_actor_type = 'rider' and not exists (
    select 1
    from public.transporter_profiles transporter
    where transporter.id = delivery_record.assigned_transporter_id
      and transporter.user_id = p_actor_user_id
      and transporter.verification_status = 'approved'
  ) then
    raise exception 'delivery is not assigned to this approved rider' using errcode = '42501';
  end if;

  if not (
    (delivery_record.status = 'unassigned' and requested_status = 'offering')
    or (delivery_record.status = 'offering' and requested_status in ('assigned', 'unassigned'))
    or (delivery_record.status = 'assigned' and requested_status in (
      'arrived_at_market', 'assignment_cancelled', 'issue_reported'
    ))
    or (delivery_record.status = 'arrived_at_market' and requested_status in (
      'picked_up', 'pickup_failed', 'issue_reported'
    ))
    or (delivery_record.status = 'picked_up' and requested_status in (
      'in_transit', 'issue_reported'
    ))
    or (delivery_record.status = 'in_transit' and requested_status in (
      'arrived_at_customer', 'customer_unavailable', 'delivery_failed', 'issue_reported'
    ))
    or (delivery_record.status = 'arrived_at_customer' and requested_status in (
      'delivered', 'customer_unavailable', 'issue_reported'
    ))
  ) then
    raise exception 'invalid delivery transition: % -> %', delivery_record.status, requested_status
      using errcode = '23514';
  end if;

  if requested_status = 'assigned' and delivery_record.assigned_transporter_id is null then
    raise exception 'DELIVERY_ASSIGNMENT_REQUIRED' using errcode = '23514';
  end if;

  -- Slice 9 will replace this guard with the evidence + consumer-confirmation lookup.
  if requested_status = 'delivered' then
    raise exception 'DELIVERY_PROOF_REQUIRED' using errcode = '23514';
  end if;

  next_version := delivery_record.version + 1;

  insert into public.delivery_operations (
    operation_id, delivery_id, actor_user_id, actor_type, requested_status,
    expected_version, result_status, result_version, reason, metadata
  ) values (
    p_operation_id, p_delivery_id, p_actor_user_id, requested_actor_type,
    requested_status, p_expected_version, requested_status, next_version,
    p_reason, coalesce(p_metadata, '{}'::jsonb)
  );

  update public.deliveries
  set status = requested_status,
      version = next_version
  where id = p_delivery_id;

  insert into public.delivery_status_history (
    delivery_id, operation_id, actor_user_id, actor_type, from_status,
    to_status, from_version, to_version, reason
  ) values (
    p_delivery_id, p_operation_id, p_actor_user_id, requested_actor_type,
    delivery_record.status, requested_status, delivery_record.version, next_version,
    p_reason
  );

  insert into public.delivery_audit_events (
    delivery_id, operation_id, actor_user_id, actor_type, action,
    previous_status, next_status, details
  ) values (
    p_delivery_id, p_operation_id, p_actor_user_id, requested_actor_type,
    'delivery.status_changed', delivery_record.status, requested_status,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('reason', p_reason)
  );

  return jsonb_build_object(
    'deliveryId', p_delivery_id,
    'status', requested_status,
    'version', next_version,
    'operationId', p_operation_id,
    'duplicate', false
  );
end;
$$;

create or replace function public.get_transporter_operational_state(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  transporter_record public.transporter_profiles;
  location_record public.transporter_locations_current;
  location_fresh boolean := false;
  eligible boolean := false;
begin
  select * into transporter_record
  from public.transporter_profiles
  where user_id = p_user_id;

  if transporter_record.id is null then
    raise exception 'transporter profile not found' using errcode = 'P0002';
  end if;

  select * into location_record
  from public.transporter_locations_current
  where transporter_id = transporter_record.id;

  if location_record.transporter_id is not null then
    location_fresh := location_record.received_at >= now() - case
      when transporter_record.availability = 'available' then interval '10 minutes'
      else interval '15 minutes'
    end;
  end if;
  eligible := transporter_record.verification_status = 'approved'
    and transporter_record.availability = 'available'
    and location_fresh;

  return jsonb_build_object(
    'transporterId', transporter_record.id,
    'displayName', transporter_record.display_name,
    'verificationStatus', transporter_record.verification_status,
    'availability', transporter_record.availability,
    'availabilityUpdatedAt', transporter_record.availability_updated_at,
    'locationIsFresh', location_fresh,
    'eligibleForOffers', eligible,
    'lastLocation', case when location_record.transporter_id is null then null else
      jsonb_build_object(
        'latitude', location_record.latitude,
        'longitude', location_record.longitude,
        'accuracyMeters', location_record.accuracy_meters,
        'capturedAt', location_record.captured_at,
        'receivedAt', location_record.received_at
      )
    end
  );
end;
$$;

create or replace function public.set_transporter_availability(
  p_user_id uuid,
  p_availability text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  transporter_record public.transporter_profiles;
  existing_operation public.transporter_availability_operations;
  requested_availability public.rider_availability;
  result jsonb;
begin
  if p_availability not in ('offline', 'available') then
    raise exception 'riders may only choose offline or available' using errcode = '22023';
  end if;
  requested_availability := p_availability::public.rider_availability;

  select * into transporter_record
  from public.transporter_profiles
  where user_id = p_user_id
  for update;

  if transporter_record.id is null then
    raise exception 'transporter profile not found' using errcode = 'P0002';
  end if;
  if transporter_record.verification_status <> 'approved' then
    raise exception 'approved transporter profile required' using errcode = '42501';
  end if;

  select * into existing_operation
  from public.transporter_availability_operations
  where operation_id = p_operation_id;

  if existing_operation.operation_id is not null then
    if existing_operation.transporter_id <> transporter_record.id
      or existing_operation.requested_availability <> requested_availability then
      raise exception 'operation id was already used for another availability change'
        using errcode = '23505';
    end if;
    result := public.get_transporter_operational_state(p_user_id);
    return result || jsonb_build_object('operationId', p_operation_id, 'duplicate', true);
  end if;

  if exists (
    select 1
    from public.transporter_availability_operations operation
    where operation.transporter_id = transporter_record.id
      and operation.created_at > now() - interval '5 seconds'
  ) then
    raise exception 'AVAILABILITY_RATE_LIMITED' using errcode = 'P0001';
  end if;

  if transporter_record.availability in ('offer_pending', 'assigned', 'busy')
    or exists (
      select 1
      from public.deliveries delivery
      where delivery.assigned_transporter_id = transporter_record.id
        and delivery.status in (
          'assigned', 'arrived_at_market', 'picked_up', 'in_transit', 'arrived_at_customer'
        )
    ) then
    raise exception 'ACTIVE_DELIVERY_REQUIRES_SYSTEM_AVAILABILITY' using errcode = '23514';
  end if;

  insert into public.transporter_availability_operations (
    operation_id, transporter_id, requested_availability,
    previous_availability, result_availability
  ) values (
    p_operation_id, transporter_record.id, requested_availability,
    transporter_record.availability, requested_availability
  );

  update public.transporter_profiles
  set availability = requested_availability,
      availability_updated_at = now()
  where id = transporter_record.id;

  insert into public.transporter_availability_history (
    transporter_id, operation_id, from_availability, to_availability
  ) values (
    transporter_record.id, p_operation_id,
    transporter_record.availability, requested_availability
  );

  result := public.get_transporter_operational_state(p_user_id);
  return result || jsonb_build_object('operationId', p_operation_id, 'duplicate', false);
end;
$$;

create or replace function public.update_transporter_location(
  p_user_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_meters numeric,
  p_captured_at timestamptz,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  transporter_record public.transporter_profiles;
  current_location public.transporter_locations_current;
  existing_operation public.transporter_location_operations;
  received_at_value timestamptz := clock_timestamp();
begin
  if p_latitude is null or p_latitude not between -90 and 90
    or p_longitude is null or p_longitude not between -180 and 180
    or p_accuracy_meters is null or p_accuracy_meters <= 0 or p_accuracy_meters > 500 then
    raise exception 'invalid transporter location' using errcode = '22023';
  end if;
  if p_captured_at is null
    or p_captured_at < now() - interval '15 minutes'
    or p_captured_at > now() + interval '2 minutes' then
    raise exception 'transporter location timestamp is stale or in the future'
      using errcode = '22023';
  end if;

  select * into transporter_record
  from public.transporter_profiles
  where user_id = p_user_id
  for update;

  if transporter_record.id is null then
    raise exception 'transporter profile not found' using errcode = 'P0002';
  end if;
  if transporter_record.verification_status <> 'approved' then
    raise exception 'approved transporter profile required' using errcode = '42501';
  end if;

  select * into existing_operation
  from public.transporter_location_operations
  where operation_id = p_operation_id;

  if existing_operation.operation_id is not null then
    if existing_operation.transporter_id <> transporter_record.id
      or existing_operation.latitude <> p_latitude
      or existing_operation.longitude <> p_longitude
      or existing_operation.accuracy_meters <> p_accuracy_meters
      or existing_operation.captured_at <> p_captured_at then
      raise exception 'operation id was already used for another location update'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'transporterId', transporter_record.id,
      'receivedAt', existing_operation.received_at,
      'locationIsFresh', true,
      'operationId', p_operation_id,
      'duplicate', true
    );
  end if;

  select * into current_location
  from public.transporter_locations_current
  where transporter_id = transporter_record.id
  for update;

  if current_location.transporter_id is not null
    and current_location.received_at > received_at_value - interval '15 seconds' then
    raise exception 'LOCATION_RATE_LIMITED' using errcode = 'P0001';
  end if;
  if current_location.transporter_id is not null
    and p_captured_at < current_location.captured_at then
    raise exception 'LOCATION_OLDER_THAN_CURRENT' using errcode = '40001';
  end if;

  insert into public.transporter_location_operations (
    operation_id, transporter_id, latitude, longitude, accuracy_meters,
    captured_at, received_at
  ) values (
    p_operation_id, transporter_record.id, p_latitude, p_longitude,
    p_accuracy_meters, p_captured_at, received_at_value
  );

  insert into public.transporter_locations_current (
    transporter_id, latitude, longitude, accuracy_meters, captured_at, received_at
  ) values (
    transporter_record.id, p_latitude, p_longitude, p_accuracy_meters,
    p_captured_at, received_at_value
  )
  on conflict (transporter_id) do update
  set latitude = excluded.latitude,
      longitude = excluded.longitude,
      accuracy_meters = excluded.accuracy_meters,
      captured_at = excluded.captured_at,
      received_at = excluded.received_at;

  return jsonb_build_object(
    'transporterId', transporter_record.id,
    'receivedAt', received_at_value,
    'locationIsFresh', true,
    'operationId', p_operation_id,
    'duplicate', false
  );
end;
$$;

alter table public.transporter_profiles enable row level security;
alter table public.transporter_locations_current enable row level security;
alter table public.delivery_groups enable row level security;
alter table public.delivery_group_orders enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_operations enable row level security;
alter table public.delivery_status_history enable row level security;
alter table public.delivery_audit_events enable row level security;
alter table public.transporter_availability_operations enable row level security;
alter table public.transporter_availability_history enable row level security;
alter table public.transporter_location_operations enable row level security;

revoke all on table public.transporter_profiles from public;
revoke all on table public.transporter_locations_current from public;
revoke all on table public.delivery_groups from public;
revoke all on table public.delivery_group_orders from public;
revoke all on table public.deliveries from public;
revoke all on table public.delivery_operations from public;
revoke all on table public.delivery_status_history from public;
revoke all on table public.delivery_audit_events from public;
revoke all on table public.transporter_availability_operations from public;
revoke all on table public.transporter_availability_history from public;
revoke all on table public.transporter_location_operations from public;

revoke all on function public.transition_delivery(uuid, uuid, text, text, integer, uuid, text, jsonb) from public;
revoke all on function public.get_transporter_operational_state(uuid) from public;
revoke all on function public.set_transporter_availability(uuid, text, uuid) from public;
revoke all on function public.update_transporter_location(uuid, numeric, numeric, numeric, timestamptz, uuid) from public;
grant execute on function public.transition_delivery(uuid, uuid, text, text, integer, uuid, text, jsonb) to service_role;
grant execute on function public.get_transporter_operational_state(uuid) to service_role;
grant execute on function public.set_transporter_availability(uuid, text, uuid) to service_role;
grant execute on function public.update_transporter_location(uuid, numeric, numeric, numeric, timestamptz, uuid) to service_role;
