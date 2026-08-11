-- Phase 3 slices 2-3: countable package inventory and carts.

alter table public.listings
  add column stock_on_hand integer not null default 0,
  add column stock_reserved integer not null default 0,
  add column low_stock_threshold integer not null default 3;

alter table public.listings
  add constraint listings_stock_non_negative check (
    stock_on_hand >= 0
    and stock_reserved >= 0
    and stock_reserved <= stock_on_hand
  ),
  add constraint listings_low_stock_threshold_non_negative check (low_stock_threshold >= 0);

alter table public.listings
  add column stock_available integer
  generated always as (stock_on_hand - stock_reserved) stored;

create index listings_available_inventory_idx
  on public.listings (id, stock_available)
  where status = 'active' and stock_available > 0;

create or replace function public.sync_listing_availability_from_stock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.availability := case
    when new.stock_on_hand - new.stock_reserved = 0 then 'unavailable'::public.listing_availability
    when new.stock_on_hand - new.stock_reserved <= new.low_stock_threshold then 'low_stock'::public.listing_availability
    else 'available'::public.listing_availability
  end;
  return new;
end;
$$;

create trigger listings_sync_availability
before insert or update of stock_on_hand, stock_reserved, low_stock_threshold
on public.listings
for each row execute function public.sync_listing_availability_from_stock();

-- Existing listings need an explicit stock count before they become purchasable.
update public.listings set stock_on_hand = 0;

create type public.cart_status as enum ('active', 'merged', 'converted', 'abandoned', 'expired');

create table public.carts (
  id uuid primary key default extensions.gen_random_uuid(),
  consumer_id uuid references auth.users(id) on delete cascade,
  guest_token_hash text,
  installation_id uuid,
  market_id uuid not null references public.markets(id),
  status public.cart_status not null default 'active',
  currency_code text not null default 'UGX' check (currency_code = 'UGX'),
  merged_into_cart_id uuid references public.carts(id),
  expires_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carts_exactly_one_owner check (
    (consumer_id is not null)::integer + (guest_token_hash is not null)::integer = 1
  ),
  constraint guest_cart_has_installation check (
    consumer_id is not null or installation_id is not null
  ),
  constraint guest_hash_is_sha256 check (
    guest_token_hash is null or guest_token_hash ~ '^[0-9a-f]{64}$'
  )
);

create table public.cart_items (
  id uuid primary key default extensions.gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  listing_id uuid not null references public.listings(id),
  quantity integer not null check (quantity > 0),
  price_snapshot_ugx integer not null check (price_snapshot_ugx > 0),
  listing_version integer not null check (listing_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, listing_id)
);

create table public.cart_item_operations (
  operation_id uuid primary key,
  cart_id uuid not null references public.carts(id) on delete cascade,
  listing_id uuid not null references public.listings(id),
  requested_quantity integer not null check (requested_quantity >= 0),
  resulting_cart_version integer not null,
  created_at timestamptz not null default now()
);

create unique index carts_one_active_consumer_market_idx
  on public.carts (consumer_id, market_id) where status = 'active' and consumer_id is not null;
create unique index carts_one_active_guest_market_idx
  on public.carts (guest_token_hash, installation_id, market_id)
  where status = 'active' and guest_token_hash is not null;
create index cart_items_cart_idx on public.cart_items (cart_id, created_at, id);

create trigger carts_set_updated_at before update on public.carts
for each row execute function public.set_updated_at();
create trigger cart_items_set_updated_at before update on public.cart_items
for each row execute function public.set_updated_at();

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;

create or replace function public.cart_owner_matches(
  requested_cart public.carts,
  requested_consumer_id uuid,
  requested_guest_token_hash text,
  requested_installation_id uuid
)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when requested_consumer_id is not null then requested_cart.consumer_id = requested_consumer_id
    else requested_cart.consumer_id is null
      and requested_cart.guest_token_hash = requested_guest_token_hash
      and requested_cart.installation_id = requested_installation_id
  end;
$$;

create or replace function public.get_or_create_cart(
  requested_market_id uuid,
  requested_consumer_id uuid default null,
  requested_guest_token_hash text default null,
  requested_installation_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result_id uuid;
begin
  if (requested_consumer_id is null) = (requested_guest_token_hash is null) then
    raise exception 'exactly one cart owner is required' using errcode = '22023';
  end if;
  if requested_consumer_id is null and requested_installation_id is null then
    raise exception 'installation id is required for guest carts' using errcode = '22023';
  end if;

  select id into result_id from public.carts
  where market_id = requested_market_id and status = 'active'
    and ((requested_consumer_id is not null and consumer_id = requested_consumer_id)
      or (requested_consumer_id is null and guest_token_hash = requested_guest_token_hash
        and installation_id = requested_installation_id))
  for update;

  if result_id is null then
    insert into public.carts (consumer_id, guest_token_hash, installation_id, market_id)
    values (requested_consumer_id, requested_guest_token_hash, requested_installation_id, requested_market_id)
    on conflict do nothing returning id into result_id;
    if result_id is null then
      select id into strict result_id from public.carts
      where market_id = requested_market_id and status = 'active'
        and ((requested_consumer_id is not null and consumer_id = requested_consumer_id)
          or (requested_consumer_id is null and guest_token_hash = requested_guest_token_hash
            and installation_id = requested_installation_id));
    end if;
  end if;
  return result_id;
end;
$$;

create or replace function public.mutate_cart_item(
  requested_cart_id uuid,
  requested_listing_id uuid,
  requested_quantity integer,
  requested_consumer_id uuid default null,
  requested_guest_token_hash text default null,
  requested_installation_id uuid default null,
  expected_cart_version integer default null,
  requested_operation_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare cart_record public.carts; listing_record public.listings; item_id uuid; existing_operation public.cart_item_operations;
begin
  if requested_operation_id is not null then
    select * into existing_operation from public.cart_item_operations where operation_id = requested_operation_id;
    if existing_operation.operation_id is not null then
      if existing_operation.cart_id <> requested_cart_id
        or existing_operation.listing_id <> requested_listing_id
        or existing_operation.requested_quantity <> requested_quantity then
        raise exception 'operation id was reused with a different mutation' using errcode = '22023';
      end if;
      select id into item_id from public.cart_items
      where cart_id = requested_cart_id and listing_id = requested_listing_id;
      return item_id;
    end if;
  end if;
  select * into cart_record from public.carts where id = requested_cart_id and status = 'active' for update;
  if cart_record.id is null or not public.cart_owner_matches(cart_record, requested_consumer_id, requested_guest_token_hash, requested_installation_id) then
    raise exception 'active cart not found' using errcode = 'P0002';
  end if;
  if expected_cart_version is not null and cart_record.version <> expected_cart_version then
    raise exception 'cart version conflict' using errcode = '40001';
  end if;
  if requested_quantity < 0 then raise exception 'quantity cannot be negative' using errcode = '22023'; end if;

  if requested_quantity = 0 then
    delete from public.cart_items where cart_id = requested_cart_id and listing_id = requested_listing_id returning id into item_id;
  else
    select l.* into listing_record from public.listings l join public.sellers s on s.id = l.seller_id
    where l.id = requested_listing_id and l.status = 'active' and l.approved_price_ugx is not null
      and s.verification_status = 'approved' and s.market_id = cart_record.market_id for share of l;
    if listing_record.id is null then raise exception 'listing is not purchasable' using errcode = '23514'; end if;
    if requested_quantity > listing_record.stock_available then raise exception 'insufficient stock' using errcode = '23514'; end if;
    insert into public.cart_items (cart_id, listing_id, quantity, price_snapshot_ugx, listing_version)
    values (requested_cart_id, requested_listing_id, requested_quantity, listing_record.approved_price_ugx, listing_record.version)
    on conflict (cart_id, listing_id) do update set quantity = excluded.quantity,
      price_snapshot_ugx = excluded.price_snapshot_ugx, listing_version = excluded.listing_version
    returning id into item_id;
  end if;
  update public.carts set version = version + 1 where id = requested_cart_id;
  if requested_operation_id is not null then
    insert into public.cart_item_operations (
      operation_id, cart_id, listing_id, requested_quantity, resulting_cart_version
    ) select requested_operation_id, requested_cart_id, requested_listing_id,
      requested_quantity, version from public.carts where id = requested_cart_id;
  end if;
  return item_id;
end;
$$;

create or replace function public.clear_cart(
  requested_cart_id uuid, requested_consumer_id uuid default null,
  requested_guest_token_hash text default null, requested_installation_id uuid default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare cart_record public.carts;
begin
  select * into cart_record from public.carts where id = requested_cart_id and status = 'active' for update;
  if cart_record.id is null or not public.cart_owner_matches(cart_record, requested_consumer_id, requested_guest_token_hash, requested_installation_id) then
    raise exception 'active cart not found' using errcode = 'P0002';
  end if;
  delete from public.cart_items where cart_id = requested_cart_id;
  update public.carts set version = version + 1 where id = requested_cart_id;
end;
$$;

revoke all on function public.get_or_create_cart(uuid, uuid, text, uuid) from public;
revoke all on function public.mutate_cart_item(uuid, uuid, integer, uuid, text, uuid, integer, uuid) from public;
revoke all on function public.clear_cart(uuid, uuid, text, uuid) from public;
grant execute on function public.get_or_create_cart(uuid, uuid, text, uuid) to service_role;
grant execute on function public.mutate_cart_item(uuid, uuid, integer, uuid, text, uuid, integer, uuid) to service_role;
grant execute on function public.clear_cart(uuid, uuid, text, uuid) to service_role;

create or replace function public.merge_guest_cart(
  requested_guest_cart_id uuid,
  requested_consumer_id uuid,
  requested_guest_token_hash text,
  requested_installation_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  guest_cart public.carts;
  account_cart_id uuid;
  source_item record;
  existing_quantity integer;
  requested_total integer;
  accepted_total integer;
  adjustments jsonb := '[]'::jsonb;
begin
  select * into guest_cart from public.carts
  where id = requested_guest_cart_id and status = 'active' for update;
  if guest_cart.id is null or guest_cart.consumer_id is not null
    or guest_cart.guest_token_hash <> requested_guest_token_hash
    or guest_cart.installation_id <> requested_installation_id then
    raise exception 'active guest cart not found' using errcode = 'P0002';
  end if;

  account_cart_id := public.get_or_create_cart(guest_cart.market_id, requested_consumer_id, null, null);
  perform 1 from public.carts where id = account_cart_id for update;

  for source_item in
    select ci.*, l.stock_available, l.approved_price_ugx, l.version as current_listing_version,
      l.status, s.verification_status, s.market_id as seller_market_id
    from public.cart_items ci
    join public.listings l on l.id = ci.listing_id
    join public.sellers s on s.id = l.seller_id
    where ci.cart_id = guest_cart.id
    order by ci.listing_id
    for update of l
  loop
    if source_item.status <> 'active' or source_item.verification_status <> 'approved'
      or source_item.approved_price_ugx is null or source_item.seller_market_id <> guest_cart.market_id then
      adjustments := adjustments || jsonb_build_array(jsonb_build_object(
        'listingId', source_item.listing_id, 'type', 'ITEM_REMOVED',
        'requestedQuantity', source_item.quantity, 'acceptedQuantity', 0,
        'message', 'This item is no longer purchasable.'
      ));
      continue;
    end if;

    select quantity into existing_quantity from public.cart_items
    where cart_id = account_cart_id and listing_id = source_item.listing_id;
    requested_total := source_item.quantity + coalesce(existing_quantity, 0);
    accepted_total := least(requested_total, source_item.stock_available);
    if accepted_total = 0 then
      adjustments := adjustments || jsonb_build_array(jsonb_build_object(
        'listingId', source_item.listing_id, 'type', 'UNAVAILABLE',
        'requestedQuantity', requested_total, 'acceptedQuantity', 0,
        'message', 'This item is currently unavailable.'
      ));
      continue;
    end if;
    if accepted_total < requested_total then
      adjustments := adjustments || jsonb_build_array(jsonb_build_object(
        'listingId', source_item.listing_id, 'type', 'QUANTITY_REDUCED',
        'requestedQuantity', requested_total, 'acceptedQuantity', accepted_total,
        'message', format('Only %s packages are currently available.', accepted_total)
      ));
    end if;
    if source_item.price_snapshot_ugx <> source_item.approved_price_ugx then
      adjustments := adjustments || jsonb_build_array(jsonb_build_object(
        'listingId', source_item.listing_id, 'type', 'PRICE_CHANGED',
        'requestedQuantity', accepted_total, 'acceptedQuantity', accepted_total,
        'message', 'The item price was updated.'
      ));
    end if;
    insert into public.cart_items (cart_id, listing_id, quantity, price_snapshot_ugx, listing_version)
    values (account_cart_id, source_item.listing_id, accepted_total,
      source_item.approved_price_ugx, source_item.current_listing_version)
    on conflict (cart_id, listing_id) do update set quantity = excluded.quantity,
      price_snapshot_ugx = excluded.price_snapshot_ugx, listing_version = excluded.listing_version;
  end loop;

  update public.carts set status = 'merged', merged_into_cart_id = account_cart_id
  where id = guest_cart.id;
  update public.carts set version = version + 1 where id = account_cart_id;
  return jsonb_build_object('cartId', account_cart_id, 'adjustments', adjustments);
end;
$$;

revoke all on function public.merge_guest_cart(uuid, uuid, text, uuid) from public;
grant execute on function public.merge_guest_cart(uuid, uuid, text, uuid) to service_role;
