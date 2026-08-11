-- Phase 3 slices 4-6: checkout transaction, idempotency and reservation expiry.

create type public.checkout_status as enum (
  'awaiting_payment', 'paid', 'confirmed_unpaid', 'expired', 'cancelled'
);
create type public.vendor_order_status as enum (
  'awaiting_payment', 'confirmed', 'expired', 'cancelled'
);
create type public.fulfilment_type as enum ('delivery', 'market_pickup');
create type public.schedule_type as enum ('immediate', 'scheduled');
create type public.inventory_reservation_status as enum (
  'active', 'committed', 'released', 'expired'
);
create type public.idempotency_status as enum ('processing', 'completed', 'failed');

create table public.delivery_zones (
  id uuid primary key default extensions.gen_random_uuid(),
  market_id uuid not null references public.markets(id),
  name text not null,
  delivery_fee_ugx integer not null check (delivery_fee_ugx >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.consumer_addresses (
  id uuid primary key default extensions.gen_random_uuid(),
  consumer_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  summary text not null,
  phone_number text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence public.checkout_reference_sequence;
create sequence public.vendor_order_reference_sequence;

create table public.customer_checkouts (
  id uuid primary key default extensions.gen_random_uuid(),
  reference text not null unique,
  consumer_id uuid not null references auth.users(id),
  cart_id uuid not null unique references public.carts(id),
  market_id uuid not null references public.markets(id),
  status public.checkout_status not null default 'awaiting_payment',
  currency_code text not null default 'UGX' check (currency_code = 'UGX'),
  items_subtotal_ugx integer not null check (items_subtotal_ugx >= 0),
  delivery_fee_ugx integer not null default 0 check (delivery_fee_ugx >= 0),
  service_fee_ugx integer not null default 0 check (service_fee_ugx >= 0),
  total_ugx integer not null check (total_ugx >= 0),
  client_reference uuid not null,
  reservation_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (consumer_id, client_reference)
);

create table public.vendor_orders (
  id uuid primary key default extensions.gen_random_uuid(),
  reference text not null unique,
  checkout_id uuid not null references public.customer_checkouts(id) on delete cascade,
  seller_id uuid not null references public.sellers(id),
  status public.vendor_order_status not null default 'awaiting_payment',
  subtotal_ugx integer not null check (subtotal_ugx > 0),
  commission_ugx integer not null default 0 check (commission_ugx >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (checkout_id, seller_id)
);

create table public.vendor_order_items (
  id uuid primary key default extensions.gen_random_uuid(),
  vendor_order_id uuid not null references public.vendor_orders(id) on delete cascade,
  listing_id uuid not null references public.listings(id),
  seller_id uuid not null references public.sellers(id),
  product_name text not null,
  package_quantity numeric(10, 2) not null,
  package_unit text not null,
  unit_price_ugx integer not null check (unit_price_ugx > 0),
  quantity integer not null check (quantity > 0),
  line_total_ugx integer not null check (line_total_ugx > 0),
  thumbnail_bucket text,
  thumbnail_path text,
  created_at timestamptz not null default now(),
  unique (vendor_order_id, listing_id)
);

create table public.inventory_reservations (
  id uuid primary key default extensions.gen_random_uuid(),
  checkout_id uuid not null references public.customer_checkouts(id) on delete cascade,
  seller_order_id uuid not null references public.vendor_orders(id) on delete cascade,
  listing_id uuid not null references public.listings(id),
  quantity integer not null check (quantity > 0),
  status public.inventory_reservation_status not null default 'active',
  expires_at timestamptz not null,
  committed_at timestamptz,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  unique (checkout_id, listing_id)
);

create table public.checkout_fulfilments (
  checkout_id uuid primary key references public.customer_checkouts(id) on delete cascade,
  type public.fulfilment_type not null,
  schedule_type public.schedule_type not null,
  requested_for timestamptz,
  delivery_zone_id uuid references public.delivery_zones(id),
  delivery_zone_name text,
  address_id uuid references public.consumer_addresses(id),
  address_label text,
  address_summary text,
  phone_number text not null,
  pickup_market_id uuid references public.markets(id),
  pickup_code_hash text,
  created_at timestamptz not null default now(),
  constraint checkout_fulfilment_shape check (
    (type = 'delivery' and delivery_zone_id is not null and address_id is not null and pickup_market_id is null)
    or (type = 'market_pickup' and pickup_market_id is not null and delivery_zone_id is null and address_id is null)
  ),
  constraint scheduled_fulfilment_has_time check (
    (schedule_type = 'immediate' and requested_for is null)
    or (schedule_type = 'scheduled' and requested_for is not null)
  )
);

create table public.checkout_status_history (
  id bigint generated always as identity primary key,
  checkout_id uuid not null references public.customer_checkouts(id) on delete cascade,
  from_status public.checkout_status,
  to_status public.checkout_status not null,
  reason text,
  created_at timestamptz not null default now()
);

create table public.idempotency_records (
  id uuid primary key default extensions.gen_random_uuid(),
  idempotency_key uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  status public.idempotency_status not null default 'processing',
  response_status integer,
  response_body jsonb,
  locked_until timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, operation, idempotency_key)
);

alter table public.carts add column converted_checkout_id uuid references public.customer_checkouts(id);

create index reservations_expiry_idx on public.inventory_reservations (expires_at, id)
  where status = 'active';
create index reservations_listing_active_idx on public.inventory_reservations (listing_id)
  where status = 'active';
create index checkouts_consumer_created_idx on public.customer_checkouts (consumer_id, created_at desc);
create index vendor_orders_checkout_idx on public.vendor_orders (checkout_id, seller_id);
create index idempotency_expiry_idx on public.idempotency_records (expires_at);

create trigger delivery_zones_set_updated_at before update on public.delivery_zones
for each row execute function public.set_updated_at();
create trigger consumer_addresses_set_updated_at before update on public.consumer_addresses
for each row execute function public.set_updated_at();
create trigger customer_checkouts_set_updated_at before update on public.customer_checkouts
for each row execute function public.set_updated_at();
create trigger vendor_orders_set_updated_at before update on public.vendor_orders
for each row execute function public.set_updated_at();

alter table public.delivery_zones enable row level security;
alter table public.consumer_addresses enable row level security;
alter table public.customer_checkouts enable row level security;
alter table public.vendor_orders enable row level security;
alter table public.vendor_order_items enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.checkout_fulfilments enable row level security;
alter table public.checkout_status_history enable row level security;
alter table public.idempotency_records enable row level security;

create policy delivery_zones_public_read on public.delivery_zones for select
to anon, authenticated using (is_active);
create policy addresses_owner_read on public.consumer_addresses for select
to authenticated using (consumer_id = auth.uid());
create policy checkouts_owner_read on public.customer_checkouts for select
to authenticated using (consumer_id = auth.uid());

grant select on public.delivery_zones to anon, authenticated;
grant select on public.consumer_addresses, public.customer_checkouts to authenticated;

create or replace function public.create_checkout_from_cart(
  p_consumer_id uuid,
  p_cart_id uuid,
  p_fulfilment_type text,
  p_delivery_zone_id uuid default null,
  p_address_id uuid default null,
  p_market_id uuid default null,
  p_schedule_type text default 'immediate',
  p_requested_for timestamptz default null,
  p_client_reference uuid default extensions.gen_random_uuid(),
  p_reservation_minutes integer default 15
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  cart_record public.carts;
  checkout_record public.customer_checkouts;
  zone_record public.delivery_zones;
  address_record public.consumer_addresses;
  item_record record;
  seller_record record;
  seller_order_record public.vendor_orders;
  items_subtotal integer;
  delivery_fee integer := 0;
  reservation_expiry timestamptz;
  pickup_code text;
  pickup_entropy bytea;
begin
  select * into checkout_record from public.customer_checkouts
  where consumer_id = p_consumer_id and client_reference = p_client_reference;
  if checkout_record.id is not null then
    return jsonb_build_object(
      'checkoutId', checkout_record.id,
      'reference', checkout_record.reference,
      'reservationExpiresAt', checkout_record.reservation_expires_at,
      'pickupCode', null
    );
  end if;
  if p_reservation_minutes < 1 or p_reservation_minutes > 60 then
    raise exception 'reservation minutes must be between 1 and 60' using errcode = '22023';
  end if;
  if p_fulfilment_type not in ('delivery', 'market_pickup') then
    raise exception 'invalid fulfilment type' using errcode = '22023';
  end if;
  if p_schedule_type not in ('immediate', 'scheduled')
    or (p_schedule_type = 'immediate' and p_requested_for is not null)
    or (p_schedule_type = 'scheduled' and (p_requested_for is null or p_requested_for <= now())) then
    raise exception 'invalid fulfilment schedule' using errcode = '22023';
  end if;

  select * into cart_record from public.carts
  where id = p_cart_id and consumer_id = p_consumer_id and status = 'active' for update;
  if cart_record.id is null then raise exception 'active cart not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.cart_items where cart_id = p_cart_id) then
    raise exception 'cart is empty' using errcode = '23514';
  end if;

  -- Lock every listing in a stable order before any validation or write.
  perform l.id from public.listings l join public.cart_items ci on ci.listing_id = l.id
  where ci.cart_id = p_cart_id order by l.id for update of l;

  if exists (
    select 1 from public.cart_items ci
    join public.listings l on l.id = ci.listing_id
    join public.sellers s on s.id = l.seller_id
    where ci.cart_id = p_cart_id and (
      l.status <> 'active' or l.approved_price_ugx is null
      or s.verification_status <> 'approved' or s.market_id <> cart_record.market_id
      or l.stock_available < ci.quantity
    )
  ) then raise exception 'cart contains unavailable or insufficient stock' using errcode = '23514'; end if;

  if p_fulfilment_type = 'delivery' then
    select * into zone_record from public.delivery_zones
    where id = p_delivery_zone_id and market_id = cart_record.market_id and is_active;
    select * into address_record from public.consumer_addresses
    where id = p_address_id and consumer_id = p_consumer_id;
    if zone_record.id is null or address_record.id is null then
      raise exception 'valid delivery zone and owned address are required' using errcode = '23514';
    end if;
    delivery_fee := zone_record.delivery_fee_ugx;
  else
    if p_market_id is null or p_market_id <> cart_record.market_id then
      raise exception 'pickup market must match the cart market' using errcode = '23514';
    end if;
    -- Pickup requires a consumer contact address record for its verified phone number.
    select * into address_record from public.consumer_addresses
    where id = p_address_id and consumer_id = p_consumer_id;
    if address_record.id is null then raise exception 'an owned contact address is required' using errcode = '23514'; end if;
    pickup_entropy := extensions.gen_random_bytes(3);
    pickup_code := lpad(((
      get_byte(pickup_entropy, 0) * 65536
      + get_byte(pickup_entropy, 1) * 256
      + get_byte(pickup_entropy, 2)
    ) % 1000000)::text, 6, '0');
  end if;

  select sum(ci.quantity * l.approved_price_ugx)::integer into strict items_subtotal
  from public.cart_items ci join public.listings l on l.id = ci.listing_id where ci.cart_id = p_cart_id;
  reservation_expiry := now() + make_interval(mins => p_reservation_minutes);

  insert into public.customer_checkouts (
    reference, consumer_id, cart_id, market_id, items_subtotal_ugx,
    delivery_fee_ugx, total_ugx, client_reference, reservation_expires_at
  ) values (
    'EK-' || extract(year from now())::integer || '-' || lpad(nextval('public.checkout_reference_sequence')::text, 6, '0'),
    p_consumer_id, p_cart_id, cart_record.market_id, items_subtotal,
    delivery_fee, items_subtotal + delivery_fee, p_client_reference, reservation_expiry
  ) returning * into checkout_record;

  for seller_record in
    select l.seller_id, sum(ci.quantity * l.approved_price_ugx)::integer as subtotal
    from public.cart_items ci join public.listings l on l.id = ci.listing_id
    where ci.cart_id = p_cart_id group by l.seller_id order by l.seller_id
  loop
    insert into public.vendor_orders (reference, checkout_id, seller_id, subtotal_ugx)
    values (
      'EK-S-' || lpad(nextval('public.vendor_order_reference_sequence')::text, 7, '0'),
      checkout_record.id, seller_record.seller_id, seller_record.subtotal
    ) returning * into seller_order_record;

    for item_record in
      select ci.listing_id, ci.quantity, l.catalog_product_id, l.package_quantity,
        l.package_unit, l.approved_price_ugx, l.seller_id, cp.name,
        image.storage_bucket, coalesce(image.thumbnail_path, image.storage_path) as thumbnail_path
      from public.cart_items ci
      join public.listings l on l.id = ci.listing_id
      join public.catalog_products cp on cp.id = l.catalog_product_id
      left join lateral (
        select li.storage_bucket, li.storage_path, li.thumbnail_path from public.listing_images li
        where li.listing_id = l.id and li.upload_status = 'ready'
        order by li.is_primary desc, li.sort_order, li.id limit 1
      ) image on true
      where ci.cart_id = p_cart_id and l.seller_id = seller_record.seller_id order by l.id
    loop
      insert into public.vendor_order_items (
        vendor_order_id, listing_id, seller_id, product_name, package_quantity,
        package_unit, unit_price_ugx, quantity, line_total_ugx, thumbnail_bucket, thumbnail_path
      ) values (
        seller_order_record.id, item_record.listing_id, item_record.seller_id, item_record.name,
        item_record.package_quantity, item_record.package_unit, item_record.approved_price_ugx,
        item_record.quantity, item_record.quantity * item_record.approved_price_ugx,
        item_record.storage_bucket, item_record.thumbnail_path
      );
      update public.listings set stock_reserved = stock_reserved + item_record.quantity,
        version = version + 1 where id = item_record.listing_id
        and stock_available >= item_record.quantity;
      if not found then raise exception 'insufficient stock' using errcode = '23514'; end if;
      insert into public.inventory_reservations (
        checkout_id, seller_order_id, listing_id, quantity, expires_at
      ) values (
        checkout_record.id, seller_order_record.id, item_record.listing_id,
        item_record.quantity, reservation_expiry
      );
    end loop;
  end loop;

  insert into public.checkout_fulfilments (
    checkout_id, type, schedule_type, requested_for, delivery_zone_id,
    delivery_zone_name, address_id, address_label, address_summary, phone_number,
    pickup_market_id, pickup_code_hash
  ) values (
    checkout_record.id, p_fulfilment_type::public.fulfilment_type,
    p_schedule_type::public.schedule_type, p_requested_for,
    case when p_fulfilment_type = 'delivery' then zone_record.id end,
    case when p_fulfilment_type = 'delivery' then zone_record.name end,
    case when p_fulfilment_type = 'delivery' then address_record.id end,
    case when p_fulfilment_type = 'delivery' then address_record.label end,
    case when p_fulfilment_type = 'delivery' then address_record.summary end,
    address_record.phone_number,
    case when p_fulfilment_type = 'market_pickup' then cart_record.market_id end,
    case when pickup_code is not null then encode(extensions.digest(pickup_code, 'sha256'), 'hex') end
  );
  insert into public.checkout_status_history (checkout_id, to_status, reason)
  values (checkout_record.id, checkout_record.status, 'checkout_created');
  update public.carts set status = 'converted', converted_checkout_id = checkout_record.id
  where id = p_cart_id;

  return jsonb_build_object(
    'checkoutId', checkout_record.id,
    'reference', checkout_record.reference,
    'reservationExpiresAt', checkout_record.reservation_expires_at,
    'pickupCode', pickup_code
  );
end;
$$;

create or replace function public.expire_inventory_reservations(p_batch_size integer default 100)
returns integer language plpgsql security definer set search_path = '' as $$
declare reservation_ids uuid[]; expired_count integer := 0;
begin
  if p_batch_size < 1 or p_batch_size > 1000 then
    raise exception 'batch size must be between 1 and 1000' using errcode = '22023';
  end if;
  select array_agg(id) into reservation_ids from (
    select r.id from public.inventory_reservations r
    where r.status = 'active' and r.expires_at <= now()
    order by r.expires_at, r.id for update skip locked limit p_batch_size
  ) selected;
  if reservation_ids is null then return 0; end if;

  -- Lock all affected inventory in the same stable order used by checkout creation.
  perform l.id from public.listings l
  where l.id in (select distinct r.listing_id from public.inventory_reservations r where r.id = any(reservation_ids))
  order by l.id for update;
  if exists (
    select 1 from public.listings l join (
      select listing_id, sum(quantity)::integer quantity from public.inventory_reservations
      where id = any(reservation_ids) group by listing_id
    ) release on release.listing_id = l.id where l.stock_reserved < release.quantity
  ) then raise exception 'reserved stock invariant violated' using errcode = '23514'; end if;
  update public.listings l set stock_reserved = l.stock_reserved - release.quantity, version = l.version + 1
  from (
    select listing_id, sum(quantity)::integer quantity from public.inventory_reservations
    where id = any(reservation_ids) group by listing_id
  ) release where l.id = release.listing_id;
  update public.inventory_reservations set status = 'expired', released_at = now(),
    release_reason = 'payment_window_expired' where id = any(reservation_ids);
  get diagnostics expired_count = row_count;
  update public.vendor_orders set status = 'expired'
  where id in (select seller_order_id from public.inventory_reservations where id = any(reservation_ids))
    and status = 'awaiting_payment'
    and not exists (
      select 1 from public.inventory_reservations active
      where active.seller_order_id = public.vendor_orders.id and active.status = 'active'
    );

  with expired_checkouts as (
    select c.id from public.customer_checkouts c
    where c.status = 'awaiting_payment'
      and exists (select 1 from public.inventory_reservations r where r.checkout_id = c.id)
      and not exists (select 1 from public.inventory_reservations r where r.checkout_id = c.id and r.status = 'active')
  ), updated as (
    update public.customer_checkouts c set status = 'expired'
    from expired_checkouts e where c.id = e.id returning c.id
  )
  insert into public.checkout_status_history (checkout_id, from_status, to_status, reason)
  select id, 'awaiting_payment', 'expired', 'reservation_expired' from updated;
  return expired_count;
end;
$$;

create or replace function public.claim_idempotency_record(
  p_user_id uuid, p_operation text, p_idempotency_key uuid, p_request_hash text,
  p_lock_seconds integer default 30, p_ttl_hours integer default 24
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare record public.idempotency_records; inserted_count integer;
begin
  insert into public.idempotency_records (
    user_id, operation, idempotency_key, request_hash, locked_until, expires_at
  ) values (
    p_user_id, p_operation, p_idempotency_key, p_request_hash,
    now() + make_interval(secs => p_lock_seconds), now() + make_interval(hours => p_ttl_hours)
  ) on conflict (user_id, operation, idempotency_key) do nothing;
  get diagnostics inserted_count = row_count;
  select * into strict record from public.idempotency_records
  where user_id = p_user_id and operation = p_operation and idempotency_key = p_idempotency_key
  for update;
  if inserted_count = 1 then return jsonb_build_object('action', 'proceed', 'recordId', record.id); end if;
  if record.request_hash <> p_request_hash then return jsonb_build_object('action', 'conflict'); end if;
  if record.status = 'completed' then
    return jsonb_build_object('action', 'replay', 'responseStatus', record.response_status, 'responseBody', record.response_body);
  end if;
  if record.status = 'processing' and record.locked_until > now() then
    return jsonb_build_object('action', 'in_progress');
  end if;
  update public.idempotency_records set status = 'processing', locked_until = now() + make_interval(secs => p_lock_seconds)
  where id = record.id;
  return jsonb_build_object('action', 'proceed', 'recordId', record.id);
end;
$$;

create or replace function public.complete_idempotency_record(
  p_record_id uuid, p_response_status integer, p_response_body jsonb
)
returns void language sql security definer set search_path = '' as $$
  update public.idempotency_records set status = 'completed', response_status = p_response_status,
    response_body = p_response_body, locked_until = null, completed_at = now() where id = p_record_id;
$$;
create or replace function public.fail_idempotency_record(p_record_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.idempotency_records set status = 'failed', locked_until = null where id = p_record_id;
$$;
create or replace function public.cleanup_idempotency_records(p_batch_size integer default 500)
returns integer language plpgsql security definer set search_path = '' as $$
declare deleted_count integer;
begin
  with targets as (
    select id from public.idempotency_records where expires_at <= now()
    order by expires_at for update skip locked limit p_batch_size
  ) delete from public.idempotency_records r using targets t where r.id = t.id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.create_checkout_from_cart(uuid, uuid, text, uuid, uuid, uuid, text, timestamptz, uuid, integer) from public;
revoke all on function public.expire_inventory_reservations(integer) from public;
revoke all on function public.claim_idempotency_record(uuid, text, uuid, text, integer, integer) from public;
revoke all on function public.complete_idempotency_record(uuid, integer, jsonb) from public;
revoke all on function public.fail_idempotency_record(uuid) from public;
revoke all on function public.cleanup_idempotency_records(integer) from public;
grant execute on function public.create_checkout_from_cart(uuid, uuid, text, uuid, uuid, uuid, text, timestamptz, uuid, integer) to service_role;
grant execute on function public.expire_inventory_reservations(integer) to service_role;
grant execute on function public.claim_idempotency_record(uuid, text, uuid, text, integer, integer) to service_role;
grant execute on function public.complete_idempotency_record(uuid, integer, jsonb) to service_role;
grant execute on function public.fail_idempotency_record(uuid) to service_role;
grant execute on function public.cleanup_idempotency_records(integer) to service_role;

-- Supabase Cron is the single scheduler. Express exposes the same job for manual observability only.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'expire-inventory-reservations', '* * * * *',
  $$select public.expire_inventory_reservations(100)$$
);
select cron.schedule(
  'cleanup-idempotency-records', '17 * * * *',
  $$select public.cleanup_idempotency_records(500)$$
);
