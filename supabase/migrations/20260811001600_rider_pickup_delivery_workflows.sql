-- Phase 6 slices 6-8: rider assignment read models, pickup custody, and delivery progress.

create type public.delivery_pickup_status as enum ('pending', 'collected');
create type public.delivery_pickup_actor_type as enum ('vendor', 'rider');

create table public.delivery_offer_rejection_operations (
  operation_id uuid primary key,
  offer_id uuid not null references public.delivery_offers(id) on delete cascade,
  transporter_id uuid not null references public.transporter_profiles(id),
  actor_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.delivery_pickups (
  id uuid primary key default extensions.gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  seller_order_id uuid not null references public.vendor_orders(id),
  status public.delivery_pickup_status not null default 'pending',
  vendor_confirmed_by uuid references auth.users(id),
  vendor_confirmed_at timestamptz,
  rider_confirmed_by uuid references auth.users(id),
  rider_confirmed_at timestamptz,
  collected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (delivery_id, seller_order_id),
  constraint delivery_pickup_confirmation_shape check (
    (vendor_confirmed_by is null) = (vendor_confirmed_at is null)
    and (rider_confirmed_by is null) = (rider_confirmed_at is null)
    and (
      (status = 'pending' and collected_at is null)
      or (
        status = 'collected' and collected_at is not null
        and vendor_confirmed_at is not null and rider_confirmed_at is not null
      )
    )
  )
);

create table public.delivery_pickup_operations (
  operation_id uuid primary key,
  pickup_id uuid not null references public.delivery_pickups(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  actor_type public.delivery_pickup_actor_type not null,
  result_status public.delivery_pickup_status not null,
  created_at timestamptz not null default now()
);

create table public.delivery_pickup_audit_events (
  id bigint generated always as identity primary key,
  pickup_id uuid not null references public.delivery_pickups(id) on delete cascade,
  operation_id uuid not null unique references public.delivery_pickup_operations(operation_id),
  actor_user_id uuid not null references auth.users(id),
  actor_type public.delivery_pickup_actor_type not null,
  action text not null,
  created_at timestamptz not null default now()
);

create index delivery_pickups_delivery_status_idx
  on public.delivery_pickups (delivery_id, status, seller_order_id);
create index delivery_pickups_seller_order_idx
  on public.delivery_pickups (seller_order_id, delivery_id);
create index delivery_pickup_operations_pickup_idx
  on public.delivery_pickup_operations (pickup_id, created_at, operation_id);

create trigger delivery_pickups_set_updated_at
before update on public.delivery_pickups
for each row execute function public.set_updated_at();

create or replace function public.initialize_delivery_pickups()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'assigned' and old.status is distinct from new.status then
    insert into public.delivery_pickups (delivery_id, seller_order_id)
    select new.id, group_order.seller_order_id
    from public.delivery_group_orders group_order
    where group_order.delivery_group_id = new.delivery_group_id
    on conflict (delivery_id, seller_order_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger deliveries_initialize_pickups
after update of status on public.deliveries
for each row execute function public.initialize_delivery_pickups();

insert into public.delivery_pickups (delivery_id, seller_order_id)
select delivery.id, group_order.seller_order_id
from public.deliveries delivery
join public.delivery_group_orders group_order
  on group_order.delivery_group_id = delivery.delivery_group_id
where delivery.status in (
  'assigned', 'arrived_at_market', 'picked_up', 'in_transit', 'arrived_at_customer', 'delivered'
)
on conflict (delivery_id, seller_order_id) do nothing;

create or replace function public.enforce_all_delivery_pickups_collected()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'picked_up' and old.status is distinct from new.status and (
    not exists (
      select 1 from public.delivery_pickups pickup where pickup.delivery_id = new.id
    )
    or exists (
      select 1 from public.delivery_pickups pickup
      where pickup.delivery_id = new.id and pickup.status <> 'collected'
    )
  ) then
    raise exception 'ALL_PICKUPS_REQUIRED' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger deliveries_require_all_pickups
before update of status on public.deliveries
for each row execute function public.enforce_all_delivery_pickups_collected();

create or replace function public.reject_delivery_offer(
  p_offer_id uuid,
  p_transporter_user_id uuid,
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
  transporter_record public.transporter_profiles;
  existing_operation public.delivery_offer_rejection_operations;
  delivery_record public.deliveries;
begin
  select delivery_id into offer_delivery_id from public.delivery_offers where id = p_offer_id;
  if offer_delivery_id is null then
    raise exception 'delivery offer not found' using errcode = 'P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(offer_delivery_id::text, 0)
  );

  select * into existing_operation
  from public.delivery_offer_rejection_operations
  where operation_id = p_operation_id;

  if existing_operation.operation_id is not null then
    if existing_operation.offer_id <> p_offer_id
      or existing_operation.actor_user_id <> p_transporter_user_id then
      raise exception 'operation id was already used for another offer rejection'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'offerId', existing_operation.offer_id, 'status', 'rejected',
      'operationId', existing_operation.operation_id, 'duplicate', true
    );
  end if;

  select * into offer_record from public.delivery_offers where id = p_offer_id for update;
  if offer_record.id is null then
    raise exception 'delivery offer not found' using errcode = 'P0002';
  end if;
  select * into transporter_record
  from public.transporter_profiles where id = offer_record.transporter_id for update;
  if transporter_record.user_id <> p_transporter_user_id
    or transporter_record.verification_status <> 'approved' then
    raise exception 'delivery offer does not belong to this approved rider'
      using errcode = '42501';
  end if;
  if offer_record.status <> 'pending' then
    raise exception 'DELIVERY_OFFER_NOT_PENDING' using errcode = 'P0001';
  end if;

  insert into public.delivery_offer_rejection_operations (
    operation_id, offer_id, transporter_id, actor_user_id
  ) values (p_operation_id, offer_record.id, transporter_record.id, p_transporter_user_id);
  update public.delivery_offers
  set status = 'rejected', rejected_at = now()
  where id = offer_record.id;
  update public.transporter_profiles
  set availability = 'available', availability_updated_at = now()
  where id = transporter_record.id and availability = 'offer_pending';

  if not exists (
    select 1 from public.delivery_offers pending_offer
    where pending_offer.delivery_id = offer_record.delivery_id
      and pending_offer.status = 'pending' and pending_offer.expires_at > now()
  ) then
    update public.delivery_offer_waves
    set status = 'exhausted', completed_at = now()
    where delivery_id = offer_record.delivery_id and status = 'open';
    select * into delivery_record
    from public.deliveries where id = offer_record.delivery_id for update;
    if delivery_record.status = 'offering' then
      perform public.transition_delivery(
        delivery_record.id, null, 'system', 'unassigned', delivery_record.version,
        extensions.gen_random_uuid(), 'delivery_offer_wave_rejected', '{}'::jsonb
      );
    end if;
  end if;

  return jsonb_build_object(
    'offerId', offer_record.id, 'status', 'rejected',
    'operationId', p_operation_id, 'duplicate', false
  );
end;
$$;

create or replace function public.confirm_delivery_pickup(
  p_seller_order_id uuid,
  p_actor_user_id uuid,
  p_actor_type text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pickup_record public.delivery_pickups;
  delivery_record public.deliveries;
  actor_type_value public.delivery_pickup_actor_type;
  existing_operation public.delivery_pickup_operations;
  result_status public.delivery_pickup_status;
begin
  if p_actor_type not in ('vendor', 'rider') then
    raise exception 'unsupported pickup actor' using errcode = '22023';
  end if;
  actor_type_value := p_actor_type::public.delivery_pickup_actor_type;

  select * into existing_operation
  from public.delivery_pickup_operations where operation_id = p_operation_id;
  if existing_operation.operation_id is not null then
    select * into pickup_record from public.delivery_pickups where id = existing_operation.pickup_id;
    if pickup_record.seller_order_id <> p_seller_order_id
      or existing_operation.actor_user_id <> p_actor_user_id
      or existing_operation.actor_type <> actor_type_value then
      raise exception 'operation id was already used for another pickup confirmation'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'pickupId', pickup_record.id, 'deliveryId', pickup_record.delivery_id,
      'sellerOrderId', pickup_record.seller_order_id,
      'status', pickup_record.status,
      'vendorConfirmed', pickup_record.vendor_confirmed_at is not null,
      'riderConfirmed', pickup_record.rider_confirmed_at is not null,
      'operationId', p_operation_id, 'duplicate', true
    );
  end if;

  select * into pickup_record
  from public.delivery_pickups where seller_order_id = p_seller_order_id for update;
  if pickup_record.id is null then
    raise exception 'delivery pickup not found' using errcode = 'P0002';
  end if;
  select * into delivery_record from public.deliveries where id = pickup_record.delivery_id for update;
  if delivery_record.status <> 'arrived_at_market' then
    raise exception 'RIDER_ARRIVAL_REQUIRED' using errcode = '23514';
  end if;

  if actor_type_value = 'rider' and not exists (
    select 1 from public.transporter_profiles transporter
    where transporter.id = delivery_record.assigned_transporter_id
      and transporter.user_id = p_actor_user_id
      and transporter.verification_status = 'approved'
  ) then
    raise exception 'pickup is not assigned to this approved rider' using errcode = '42501';
  end if;
  if actor_type_value = 'vendor' and not exists (
    select 1
    from public.vendor_orders seller_order
    join public.seller_accounts account on account.seller_id = seller_order.seller_id
    join public.sellers seller on seller.id = seller_order.seller_id
    where seller_order.id = pickup_record.seller_order_id
      and account.user_id = p_actor_user_id
      and seller.verification_status = 'approved'
      and seller_order.status = 'ready_for_pickup'
  ) then
    raise exception 'pickup does not belong to this approved vendor' using errcode = '42501';
  end if;

  if actor_type_value = 'vendor' then
    update public.delivery_pickups
    set vendor_confirmed_by = coalesce(vendor_confirmed_by, p_actor_user_id),
        vendor_confirmed_at = coalesce(vendor_confirmed_at, now())
    where id = pickup_record.id;
  else
    update public.delivery_pickups
    set rider_confirmed_by = coalesce(rider_confirmed_by, p_actor_user_id),
        rider_confirmed_at = coalesce(rider_confirmed_at, now())
    where id = pickup_record.id;
  end if;

  update public.delivery_pickups
  set status = 'collected', collected_at = coalesce(collected_at, now())
  where id = pickup_record.id
    and vendor_confirmed_at is not null and rider_confirmed_at is not null;

  select * into pickup_record from public.delivery_pickups where id = pickup_record.id;
  result_status := pickup_record.status;
  insert into public.delivery_pickup_operations (
    operation_id, pickup_id, actor_user_id, actor_type, result_status
  ) values (p_operation_id, pickup_record.id, p_actor_user_id, actor_type_value, result_status);
  insert into public.delivery_pickup_audit_events (
    pickup_id, operation_id, actor_user_id, actor_type, action
  ) values (
    pickup_record.id, p_operation_id, p_actor_user_id, actor_type_value,
    case when result_status = 'collected' then 'pickup.collected' else 'pickup.confirmed' end
  );

  return jsonb_build_object(
    'pickupId', pickup_record.id, 'deliveryId', pickup_record.delivery_id,
    'sellerOrderId', pickup_record.seller_order_id, 'status', pickup_record.status,
    'vendorConfirmed', pickup_record.vendor_confirmed_at is not null,
    'riderConfirmed', pickup_record.rider_confirmed_at is not null,
    'operationId', p_operation_id, 'duplicate', false
  );
end;
$$;

create or replace function public.get_current_delivery_offer(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', offer.id,
    'deliveryId', delivery.id,
    'deliveryReference', delivery.reference,
    'deliveryVersion', delivery.version,
    'distanceKm', offer.distance_km,
    'feeUgx', delivery.fee_ugx,
    'offeredAt', offer.offered_at,
    'expiresAt', offer.expires_at,
    'market', jsonb_build_object('id', market.id, 'name', market.name),
    'zoneName', delivery_group.delivery_zone_name,
    'sellerCount', (select count(*) from public.delivery_group_orders group_order where group_order.delivery_group_id = delivery_group.id),
    'packageCount', (
      select coalesce(sum(item.quantity), 0)
      from public.delivery_group_orders group_order
      join public.vendor_order_items item on item.vendor_order_id = group_order.seller_order_id
      where group_order.delivery_group_id = delivery_group.id
    )
  )
  from public.delivery_offers offer
  join public.transporter_profiles transporter on transporter.id = offer.transporter_id
  join public.deliveries delivery on delivery.id = offer.delivery_id
  join public.delivery_groups delivery_group on delivery_group.id = delivery.delivery_group_id
  join public.markets market on market.id = delivery_group.market_id
  where transporter.user_id = p_user_id
    and transporter.verification_status = 'approved'
    and offer.status = 'pending' and offer.expires_at > now()
    and delivery.status = 'offering'
  order by offer.expires_at, offer.id
  limit 1;
$$;

create or replace function public.get_current_rider_delivery(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', delivery.id,
    'reference', delivery.reference,
    'status', delivery.status,
    'version', delivery.version,
    'feeUgx', delivery.fee_ugx,
    'assignedAt', delivery.assigned_at,
    'market', jsonb_build_object('id', market.id, 'name', market.name),
    'destination', jsonb_build_object(
      'label', delivery_group.address_label,
      'summary', delivery_group.address_summary,
      'zoneName', delivery_group.delivery_zone_name,
      'phoneNumber', delivery_group.phone_number
    ),
    'pickups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pickup.id,
        'sellerOrderId', pickup.seller_order_id,
        'sellerOrderReference', seller_order.reference,
        'sellerName', seller.business_name,
        'itemCount', (select coalesce(sum(item.quantity), 0) from public.vendor_order_items item where item.vendor_order_id = seller_order.id),
        'status', pickup.status,
        'vendorConfirmed', pickup.vendor_confirmed_at is not null,
        'riderConfirmed', pickup.rider_confirmed_at is not null,
        'collectedAt', pickup.collected_at
      ) order by seller.business_name, seller_order.id)
      from public.delivery_pickups pickup
      join public.vendor_orders seller_order on seller_order.id = pickup.seller_order_id
      join public.sellers seller on seller.id = seller_order.seller_id
      where pickup.delivery_id = delivery.id
    ), '[]'::jsonb)
  )
  from public.deliveries delivery
  join public.transporter_profiles transporter on transporter.id = delivery.assigned_transporter_id
  join public.delivery_groups delivery_group on delivery_group.id = delivery.delivery_group_id
  join public.markets market on market.id = delivery_group.market_id
  where transporter.user_id = p_user_id
    and delivery.status in ('assigned', 'arrived_at_market', 'picked_up', 'in_transit', 'arrived_at_customer')
  order by delivery.assigned_at desc, delivery.id
  limit 1;
$$;

create or replace function public.enqueue_delivery_status_notification()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  consumer_user_id uuid;
  message_title text;
  message_body text;
begin
  if old.status is not distinct from new.status
    or new.status not in ('arrived_at_market', 'picked_up', 'in_transit', 'arrived_at_customer') then
    return new;
  end if;
  select consumer_id into consumer_user_id
  from public.delivery_groups where id = new.delivery_group_id;
  message_title := case new.status
    when 'arrived_at_market' then 'Rider at the market'
    when 'picked_up' then 'Order collected'
    when 'in_transit' then 'Order on the way'
    when 'arrived_at_customer' then 'Rider has arrived'
    else 'Delivery update'
  end;
  message_body := case new.status
    when 'arrived_at_market' then 'Your rider is collecting the seller orders.'
    when 'picked_up' then 'Every seller handover is confirmed.'
    when 'in_transit' then 'Your order is travelling to your delivery address.'
    when 'arrived_at_customer' then 'Meet your rider and check the order before confirming delivery.'
    else 'Your delivery status is now ' || replace(new.status::text, '_', ' ') || '.'
  end;

  insert into public.notification_events (
    user_id, event_type, entity_type, entity_id, title, body, priority, payload, dedupe_key
  ) values (
    consumer_user_id, 'delivery.status_changed', 'delivery', new.id,
    message_title, message_body,
    (case when new.status = 'arrived_at_customer' then 'critical' else 'normal' end)::public.notification_priority,
    jsonb_build_object('deliveryId', new.id, 'status', new.status, 'version', new.version),
    'delivery:' || new.id::text || ':status:' || new.status::text || ':version:' || new.version::text
  ) on conflict (dedupe_key) do nothing;

  insert into public.notification_deliveries (event_id, channel)
  select event.id, 'push' from public.notification_events event
  where event.dedupe_key = 'delivery:' || new.id::text || ':status:' || new.status::text || ':version:' || new.version::text
  on conflict (event_id, channel) do nothing;
  insert into public.notification_audit_events (notification_event_id, action, details)
  select event.id, 'notification.enqueued', jsonb_build_object('channel', 'push')
  from public.notification_events event
  where event.dedupe_key = 'delivery:' || new.id::text || ':status:' || new.status::text || ':version:' || new.version::text
    and not exists (
      select 1 from public.notification_audit_events audit
      where audit.notification_event_id = event.id and audit.action = 'notification.enqueued'
    );
  return new;
end;
$$;

create trigger deliveries_enqueue_status_notification
after update of status on public.deliveries
for each row execute function public.enqueue_delivery_status_notification();

alter table public.delivery_offer_rejection_operations enable row level security;
alter table public.delivery_pickups enable row level security;
alter table public.delivery_pickup_operations enable row level security;
alter table public.delivery_pickup_audit_events enable row level security;

revoke all on table public.delivery_offer_rejection_operations from public;
revoke all on table public.delivery_pickups from public;
revoke all on table public.delivery_pickup_operations from public;
revoke all on table public.delivery_pickup_audit_events from public;
revoke all on function public.reject_delivery_offer(uuid, uuid, uuid) from public;
revoke all on function public.confirm_delivery_pickup(uuid, uuid, text, uuid) from public;
revoke all on function public.get_current_delivery_offer(uuid) from public;
revoke all on function public.get_current_rider_delivery(uuid) from public;

grant execute on function public.reject_delivery_offer(uuid, uuid, uuid) to service_role;
grant execute on function public.confirm_delivery_pickup(uuid, uuid, text, uuid) to service_role;
grant execute on function public.get_current_delivery_offer(uuid) to service_role;
grant execute on function public.get_current_rider_delivery(uuid) to service_role;
