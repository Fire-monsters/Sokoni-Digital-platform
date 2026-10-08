-- Milestone 1 procurement schema. This is separate from the consumer marketplace's
-- sellers, listings, orders and inventory reservations.

-- The existing businesses row is the application state of record. Expose the
-- requested application object without a second, divergent status column.
create view public.business_applications with (security_invoker = true) as
select id, owner_id, kind, name, location, status, review_reason, version,
       created_at, updated_at
from public.businesses;
revoke all on public.business_applications from public, anon, authenticated;
grant select on public.business_applications to service_role;
comment on view public.business_applications is
  'Business application read model; businesses.status and business_audit_events are authoritative.';

create table public.farmer_listings (
  id uuid primary key default extensions.gen_random_uuid(),
  farmer_business_id uuid not null references public.businesses(id),
  product_id uuid not null references public.agricultural_products(id),
  quantity_kg numeric(14, 3) not null check (quantity_kg > 0),
  location text not null check (length(btrim(location)) between 2 and 300),
  asking_price_ugx_per_kg bigint check (asking_price_ugx_per_kg is null or asking_price_ugx_per_kg > 0),
  availability text not null default 'available' check (availability in ('available', 'unavailable')),
  status text not null default 'draft' check (status in ('draft', 'published', 'withdrawn', 'closed')),
  description text check (description is null or length(description) <= 2000),
  version integer not null default 1 check (version > 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, farmer_business_id),
  unique (id, product_id),
  constraint published_farmer_listing_has_date check (status <> 'published' or published_at is not null)
);
create index farmer_listings_owner_idx on public.farmer_listings(farmer_business_id, created_at desc, id);
create index farmer_listings_discovery_idx on public.farmer_listings(product_id, created_at desc, id)
  where status = 'published' and availability = 'available';

create table public.farmer_listing_photos (
  id uuid primary key default extensions.gen_random_uuid(),
  listing_id uuid not null references public.farmer_listings(id) on delete cascade,
  storage_path text not null unique check (length(storage_path) between 1 and 500),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 10485760),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (listing_id, sort_order)
);

create table public.listing_reviews (
  id uuid primary key default extensions.gen_random_uuid(),
  listing_id uuid not null references public.farmer_listings(id),
  warehouse_business_id uuid not null references public.businesses(id),
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('request_information', 'reject', 'offer')),
  reason text check (reason is null or length(btrim(reason)) between 3 and 2000),
  created_at timestamptz not null default now(),
  unique (id, listing_id, warehouse_business_id),
  constraint listing_review_rejection_reason check (action <> 'reject' or reason is not null)
);
create index listing_reviews_listing_idx on public.listing_reviews(listing_id, created_at desc, id);
create index listing_reviews_warehouse_idx on public.listing_reviews(warehouse_business_id, created_at desc, id);

create table public.listing_information_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  review_id uuid not null unique references public.listing_reviews(id),
  question text not null check (length(btrim(question)) between 3 and 2000),
  response text check (response is null or length(btrim(response)) between 1 and 4000),
  responded_by uuid references auth.users(id),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint listing_information_response_complete check (
    (response is null and responded_by is null and responded_at is null) or
    (response is not null and responded_by is not null and responded_at is not null)
  )
);

create table public.procurement_offers (
  id uuid primary key default extensions.gen_random_uuid(),
  listing_id uuid not null,
  farmer_business_id uuid not null,
  warehouse_business_id uuid not null references public.businesses(id),
  product_id uuid not null,
  review_id uuid,
  quantity_kg numeric(14, 3) not null check (quantity_kg > 0),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'accepted', 'rejected', 'withdrawn', 'expired')),
  terms text check (terms is null or length(terms) <= 4000),
  version integer not null default 1 check (version > 0),
  expires_at timestamptz,
  submitted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (listing_id, farmer_business_id) references public.farmer_listings(id, farmer_business_id),
  foreign key (listing_id, product_id) references public.farmer_listings(id, product_id),
  foreign key (review_id, listing_id, warehouse_business_id)
    references public.listing_reviews(id, listing_id, warehouse_business_id),
  unique (id, farmer_business_id, warehouse_business_id),
  unique (id, listing_id, product_id),
  constraint procurement_offer_parties_differ check (farmer_business_id <> warehouse_business_id),
  constraint procurement_offer_submitted_at check (status = 'draft' or submitted_at is not null),
  constraint procurement_offer_decided_at check
    (status not in ('accepted', 'rejected') or decided_at is not null)
);
create index procurement_offers_farmer_idx on public.procurement_offers(farmer_business_id, created_at desc, id);
create index procurement_offers_warehouse_idx on public.procurement_offers(warehouse_business_id, created_at desc, id);
create index procurement_offers_listing_idx on public.procurement_offers(listing_id, created_at desc, id);

create table public.procurement_offer_grade_prices (
  offer_id uuid not null references public.procurement_offers(id) on delete cascade,
  grade text not null check (grade in ('A', 'B', 'C')),
  price_ugx_per_kg bigint not null check (price_ugx_per_kg > 0),
  primary key (offer_id, grade)
);

create table public.purchase_orders (
  id uuid primary key default extensions.gen_random_uuid(),
  offer_id uuid not null unique references public.procurement_offers(id),
  listing_id uuid not null references public.farmer_listings(id),
  product_id uuid not null references public.agricultural_products(id),
  farmer_business_id uuid not null references public.businesses(id),
  warehouse_business_id uuid not null references public.businesses(id),
  operation_id uuid not null unique,
  status text not null default 'open' check (status in ('open', 'cancelled', 'closed')),
  currency_code text not null default 'UGX' check (currency_code = 'UGX'),
  offer_terms text check (offer_terms is null or length(offer_terms) <= 4000),
  accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (offer_id, farmer_business_id, warehouse_business_id)
    references public.procurement_offers(id, farmer_business_id, warehouse_business_id),
  foreign key (offer_id, listing_id, product_id)
    references public.procurement_offers(id, listing_id, product_id),
  unique (id, product_id),
  constraint purchase_order_parties_differ check (farmer_business_id <> warehouse_business_id)
);
create index purchase_orders_farmer_idx on public.purchase_orders(farmer_business_id, created_at desc, id);
create index purchase_orders_warehouse_idx on public.purchase_orders(warehouse_business_id, created_at desc, id);

create table public.purchase_order_lines (
  id uuid primary key default extensions.gen_random_uuid(),
  purchase_order_id uuid not null unique,
  product_id uuid not null,
  ordered_quantity_kg numeric(14, 3) not null check (ordered_quantity_kg > 0),
  created_at timestamptz not null default now(),
  foreign key (purchase_order_id, product_id) references public.purchase_orders(id, product_id),
  unique (id, purchase_order_id)
);

create table public.purchase_order_grade_prices (
  purchase_order_line_id uuid not null references public.purchase_order_lines(id),
  grade text not null check (grade in ('A', 'B', 'C')),
  price_ugx_per_kg bigint not null check (price_ugx_per_kg > 0),
  primary key (purchase_order_line_id, grade)
);

create table public.purchase_order_status_history (
  id uuid primary key default extensions.gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id),
  actor_id uuid not null references auth.users(id),
  previous_status text,
  new_status text not null check (new_status in ('open', 'cancelled', 'closed')),
  reason text check (reason is null or length(btrim(reason)) between 3 and 2000),
  operation_id uuid not null unique,
  created_at timestamptz not null default now()
);
create index purchase_order_status_history_order_idx
  on public.purchase_order_status_history(purchase_order_id, created_at, id);

-- Uploads are private; the API will issue scoped signed upload/read URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('farmer-listing-photos', 'farmer-listing-photos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- No new table is directly writable or readable from a client token. The API
-- must authorize the verified actor and use transaction-local operations.
alter table public.farmer_listings enable row level security;
alter table public.farmer_listing_photos enable row level security;
alter table public.listing_reviews enable row level security;
alter table public.listing_information_requests enable row level security;
alter table public.procurement_offers enable row level security;
alter table public.procurement_offer_grade_prices enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.purchase_order_grade_prices enable row level security;
alter table public.purchase_order_status_history enable row level security;
revoke all on public.farmer_listings, public.farmer_listing_photos, public.listing_reviews,
  public.listing_information_requests, public.procurement_offers,
  public.procurement_offer_grade_prices, public.purchase_orders,
  public.purchase_order_lines, public.purchase_order_grade_prices,
  public.purchase_order_status_history from public, anon, authenticated;
grant select, insert, update, delete on public.farmer_listings, public.farmer_listing_photos,
  public.listing_reviews, public.listing_information_requests, public.procurement_offers,
  public.procurement_offer_grade_prices to service_role;
grant select on public.purchase_orders, public.purchase_order_lines,
  public.purchase_order_grade_prices, public.purchase_order_status_history to service_role;

-- Commercial terms and history are snapshots. Future amendments use separate,
-- audited records instead of editing these rows in place.
create function public.reject_procurement_snapshot_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Procurement snapshot is append-only' using errcode = '23514';
end;
$$;
revoke all on function public.reject_procurement_snapshot_mutation() from public, anon, authenticated;
create function public.reject_committed_offer_price_mutation()
returns trigger language plpgsql set search_path = '' as $$
declare offer_id uuid;
begin
  offer_id := case when tg_op = 'DELETE' then old.offer_id else new.offer_id end;
  if exists (select 1 from public.procurement_offers where id = offer_id and status <> 'draft') then
    raise exception 'Submitted offer prices are immutable' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.reject_committed_offer_price_mutation() from public, anon, authenticated;
create trigger procurement_offer_grade_prices_immutable
  before insert or update or delete on public.procurement_offer_grade_prices
  for each row execute function public.reject_committed_offer_price_mutation();
create trigger purchase_order_lines_immutable
  before update or delete on public.purchase_order_lines
  for each row execute function public.reject_procurement_snapshot_mutation();
create trigger purchase_order_grade_prices_immutable
  before update or delete on public.purchase_order_grade_prices
  for each row execute function public.reject_procurement_snapshot_mutation();
create trigger purchase_order_status_history_immutable
  before update or delete on public.purchase_order_status_history
  for each row execute function public.reject_procurement_snapshot_mutation();

create function public.check_procurement_trade_access()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'farmer_listings' then
    if not exists (select 1 from public.businesses b where b.id = new.farmer_business_id
      and b.kind = 'farmer') then
      raise exception 'Farmer business required' using errcode = '23514';
    end if;
    if new.status = 'published' and (
      not exists (select 1 from public.businesses b where b.id = new.farmer_business_id
        and b.kind = 'farmer' and b.status = 'approved') or
      not exists (select 1 from public.agricultural_products p
        where p.id = new.product_id and p.active)
    ) then
      raise exception 'Approved farmer and active product required' using errcode = '23514';
    end if;
  elsif tg_table_name = 'procurement_offers' then
    if not exists (select 1 from public.businesses b where b.id = new.warehouse_business_id
      and b.kind = 'warehouse') then
      raise exception 'Warehouse business required' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and old.status <> 'draft' and
      (new.listing_id, new.farmer_business_id, new.warehouse_business_id,
       new.product_id, new.quantity_kg, new.terms) is distinct from
      (old.listing_id, old.farmer_business_id, old.warehouse_business_id,
       old.product_id, old.quantity_kg, old.terms) then
      raise exception 'Submitted offer terms are immutable' using errcode = '23514';
    end if;
    if new.status in ('submitted', 'accepted') and (
      not exists (select 1 from public.businesses b where b.id = new.warehouse_business_id
        and b.kind = 'warehouse' and b.status = 'approved') or
      not exists (select 1 from public.businesses b where b.id = new.farmer_business_id
        and b.kind = 'farmer' and b.status = 'approved') or
      not exists (select 1 from public.farmer_listings l where l.id = new.listing_id
        and l.status = 'published' and l.availability = 'available'
        and new.quantity_kg <= l.quantity_kg) or
      (select count(*) from public.procurement_offer_grade_prices p
        where p.offer_id = new.id) <> 3
    ) then
      raise exception 'Offer requires approved parties, available listing and A/B/C prices'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'purchase_orders' then
    if not exists (select 1 from public.procurement_offers o where o.id = new.offer_id
      and o.status = 'accepted' and o.decided_at = new.accepted_at) then
      raise exception 'Accepted offer required' using errcode = '23514';
    end if;
    if not exists (select 1 from public.businesses b where b.id = new.farmer_business_id
      and b.kind = 'farmer' and b.status = 'approved') or
      not exists (select 1 from public.businesses b where b.id = new.warehouse_business_id
      and b.kind = 'warehouse' and b.status = 'approved') then
      raise exception 'Approved trading parties required' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.check_procurement_trade_access() from public, anon, authenticated;
create trigger farmer_listing_trade_access before insert or update on public.farmer_listings
  for each row execute function public.check_procurement_trade_access();
create trigger procurement_offer_trade_access before insert or update on public.procurement_offers
  for each row execute function public.check_procurement_trade_access();
create trigger purchase_order_trade_access before insert or update on public.purchase_orders
  for each row execute function public.check_procurement_trade_access();

-- The API can call this as one database transaction after obtaining p_actor from
-- a verified access token. Every accepted commercial term is copied to the PO.
create function public.create_purchase_order_from_offer(
  p_actor uuid, p_offer_id uuid, p_operation_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare offer_row public.procurement_offers; existing public.purchase_orders;
  po_id uuid; line_id uuid;
begin
  if p_actor is null or p_offer_id is null or p_operation_id is null then
    raise exception 'Actor, offer and operation are required' using errcode = '22023';
  end if;
  select * into offer_row from public.procurement_offers where id = p_offer_id for update;
  if not found then raise exception 'Offer not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.business_memberships m
    join public.businesses b on b.id = m.business_id
    where m.business_id = offer_row.warehouse_business_id and m.user_id = p_actor
      and m.active and b.kind = 'warehouse' and b.status = 'approved') then
    raise exception 'Approved warehouse membership required' using errcode = '42501';
  end if;
  select * into existing from public.purchase_orders where offer_id = p_offer_id;
  if found then
    if existing.operation_id <> p_operation_id then
      raise exception 'Offer already converted to a purchase order' using errcode = '23505';
    end if;
    return existing.id;
  end if;
  if offer_row.status <> 'accepted' or offer_row.decided_at is null or
    (select count(*) from public.procurement_offer_grade_prices where offer_id = p_offer_id) <> 3 then
    raise exception 'Accepted offer with A/B/C prices required' using errcode = '23514';
  end if;
  insert into public.purchase_orders(
    offer_id, listing_id, product_id, farmer_business_id, warehouse_business_id,
    operation_id, offer_terms, accepted_at
  ) values (
    offer_row.id, offer_row.listing_id, offer_row.product_id,
    offer_row.farmer_business_id, offer_row.warehouse_business_id,
    p_operation_id, offer_row.terms, offer_row.decided_at
  ) returning id into po_id;
  insert into public.purchase_order_lines(purchase_order_id, product_id, ordered_quantity_kg)
  values (po_id, offer_row.product_id, offer_row.quantity_kg) returning id into line_id;
  insert into public.purchase_order_grade_prices(purchase_order_line_id, grade, price_ugx_per_kg)
  select line_id, grade, price_ugx_per_kg from public.procurement_offer_grade_prices
  where offer_id = p_offer_id;
  insert into public.purchase_order_status_history(
    purchase_order_id, actor_id, previous_status, new_status, operation_id
  ) values (po_id, p_actor, null, 'open', p_operation_id);
  return po_id;
end;
$$;
revoke all on function public.create_purchase_order_from_offer(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_purchase_order_from_offer(uuid, uuid, uuid)
  to service_role;
