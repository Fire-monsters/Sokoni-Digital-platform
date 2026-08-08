create extension if not exists pgcrypto with schema extensions;

create type public.seller_verification_status as enum (
  'pending',
  'approved',
  'rejected',
  'suspended'
);

create type public.listing_status as enum (
  'draft',
  'pending_approval',
  'changes_requested',
  'active',
  'paused',
  'archived'
);

create type public.listing_availability as enum (
  'available',
  'low_stock',
  'unavailable'
);

create type public.price_review_status as enum (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

create table public.markets (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sellers (
  id uuid primary key default extensions.gen_random_uuid(),
  business_name text not null,
  market_id uuid references public.markets(id),
  verification_status public.seller_verification_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sellers is
  'Public-safe seller display data only. Account ownership is isolated in seller_accounts.';

create table public.seller_accounts (
  seller_id uuid primary key references public.sellers(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.owns_seller(requested_seller_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.seller_accounts
    where seller_id = requested_seller_id
      and user_id = auth.uid()
  );
$$;

create table public.catalog_products (
  id uuid primary key default extensions.gen_random_uuid(),
  category_id uuid not null references public.categories(id),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default extensions.gen_random_uuid(),
  seller_id uuid not null references public.sellers(id),
  catalog_product_id uuid not null references public.catalog_products(id),
  package_quantity numeric(10, 2) not null check (package_quantity > 0),
  package_unit text not null check (length(trim(package_unit)) between 1 and 30),
  description text check (description is null or length(description) <= 1000),
  approved_price_ugx integer check (approved_price_ugx is null or approved_price_ugx > 0),
  status public.listing_status not null default 'draft',
  availability public.listing_availability not null default 'available',
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint active_listing_requires_approved_price check (
    status <> 'active' or approved_price_ugx is not null
  )
);

create table public.listing_images (
  id uuid primary key default extensions.gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  storage_bucket text not null default 'listing-images',
  storage_path text not null unique,
  thumbnail_path text,
  mime_type text check (mime_type is null or mime_type in ('image/jpeg', 'image/webp')),
  width integer,
  height integer,
  byte_size integer,
  blur_hash text,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_primary boolean not null default false,
  upload_status text not null default 'ready' check (upload_status in ('ready', 'failed')),
  created_at timestamptz not null default now(),
  constraint listing_images_positive_dimensions check (
    (width is null or width > 0)
    and (height is null or height > 0)
    and (byte_size is null or byte_size > 0)
  )
);

create or replace function public.listing_price_request_seller_matches(
  requested_listing_id uuid,
  requested_seller_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.listings
    where id = requested_listing_id
      and seller_id = requested_seller_id
  );
$$;

create table public.listing_price_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  seller_id uuid not null references public.sellers(id),
  proposed_price_ugx integer not null check (proposed_price_ugx > 0),
  current_price_ugx integer check (current_price_ugx is null or current_price_ugx > 0),
  reason text,
  status public.price_review_status not null default 'pending',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  constraint price_request_seller_owns_listing check (
    public.listing_price_request_seller_matches(listing_id, seller_id)
  )
);

create unique index listing_one_pending_price_request_idx
  on public.listing_price_requests (listing_id)
  where status = 'pending';

create unique index listing_one_primary_image_idx
  on public.listing_images (listing_id)
  where is_primary and upload_status = 'ready';

create index listings_public_catalogue_idx
  on public.listings (
    status,
    availability,
    catalog_product_id,
    updated_at desc,
    id desc
  )
  where status = 'active';

create index listings_seller_status_idx
  on public.listings (seller_id, status, updated_at desc);

create index catalogue_products_category_idx
  on public.catalog_products (category_id, name);

create index listing_images_primary_idx
  on public.listing_images (listing_id, is_primary desc, sort_order)
  where upload_status = 'ready';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger markets_set_updated_at
before update on public.markets
for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create trigger sellers_set_updated_at
before update on public.sellers
for each row execute function public.set_updated_at();

create trigger catalog_products_set_updated_at
before update on public.catalog_products
for each row execute function public.set_updated_at();

create trigger listings_set_updated_at
before update on public.listings
for each row execute function public.set_updated_at();

create or replace view public.catalogue_listing_cards
with (security_invoker = true, security_barrier = true)
as
select
  l.id,
  l.catalog_product_id,
  cp.name as product_name,
  cp.slug as product_slug,
  c.id as category_id,
  c.name as category_name,
  c.slug as category_slug,
  s.id as seller_id,
  s.business_name as vendor_name,
  m.id as market_id,
  m.name as market_name,
  l.package_quantity,
  l.package_unit,
  l.approved_price_ugx,
  l.availability,
  l.updated_at,
  image.storage_bucket as primary_image_bucket,
  image.storage_path as primary_image_path,
  image.thumbnail_path,
  image.blur_hash
from public.listings l
join public.catalog_products cp on cp.id = l.catalog_product_id and cp.is_active
join public.categories c on c.id = cp.category_id and c.is_active
join public.sellers s on s.id = l.seller_id
left join public.markets m on m.id = s.market_id and m.is_active
left join lateral (
  select
    li.storage_bucket,
    li.storage_path,
    li.thumbnail_path,
    li.blur_hash
  from public.listing_images li
  where li.listing_id = l.id
    and li.upload_status = 'ready'
  order by li.is_primary desc, li.sort_order asc, li.id asc
  limit 1
) image on true
where l.status = 'active'
  and l.approved_price_ugx is not null
  and s.verification_status = 'approved';

create or replace view public.catalogue_listing_details
with (security_invoker = true, security_barrier = true)
as
select
  card.*,
  l.description,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', li.id,
        'bucket', li.storage_bucket,
        'path', li.storage_path,
        'thumbnailPath', li.thumbnail_path,
        'blurHash', li.blur_hash,
        'sortOrder', li.sort_order,
        'isPrimary', li.is_primary
      ) order by li.is_primary desc, li.sort_order asc, li.id asc
    ) filter (where li.id is not null),
    '[]'::jsonb
  ) as images
from public.catalogue_listing_cards card
join public.listings l on l.id = card.id
left join public.listing_images li
  on li.listing_id = l.id
  and li.upload_status = 'ready'
group by
  card.id,
  card.catalog_product_id,
  card.product_name,
  card.product_slug,
  card.category_id,
  card.category_name,
  card.category_slug,
  card.seller_id,
  card.vendor_name,
  card.market_id,
  card.market_name,
  card.package_quantity,
  card.package_unit,
  card.approved_price_ugx,
  card.availability,
  card.updated_at,
  card.primary_image_bucket,
  card.primary_image_path,
  card.thumbnail_path,
  card.blur_hash,
  l.description;

alter table public.markets enable row level security;
alter table public.categories enable row level security;
alter table public.sellers enable row level security;
alter table public.seller_accounts enable row level security;
alter table public.catalog_products enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.listing_price_requests enable row level security;

create policy markets_public_read on public.markets
  for select using (is_active);

create policy categories_public_read on public.categories
  for select using (is_active);

create policy sellers_public_read on public.sellers
  for select using (verification_status = 'approved');

create policy seller_accounts_owner_read on public.seller_accounts
  for select to authenticated using (user_id = (select auth.uid()));

create policy catalog_products_public_read on public.catalog_products
  for select using (
    is_active
    and exists (
      select 1 from public.categories c
      where c.id = category_id and c.is_active
    )
  );

create policy listings_public_or_owner_read on public.listings
  for select using (
    (
      status = 'active'
      and approved_price_ugx is not null
      and exists (
        select 1 from public.sellers s
        where s.id = seller_id and s.verification_status = 'approved'
      )
    )
    or public.owns_seller(seller_id)
  );

create policy listings_owner_insert on public.listings
  for insert to authenticated with check (
    status = 'draft'
    and approved_price_ugx is null
    and public.owns_seller(seller_id)
    and exists (
      select 1
      from public.sellers s
      where s.id = seller_id
        and s.verification_status = 'approved'
    )
  );

create policy listings_owner_update on public.listings
  for update to authenticated
  using (public.owns_seller(seller_id))
  with check (public.owns_seller(seller_id));

create policy listing_images_public_or_owner_read on public.listing_images
  for select using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and (
          (
            l.status = 'active'
            and exists (
              select 1 from public.sellers s
              where s.id = l.seller_id and s.verification_status = 'approved'
            )
          )
          or public.owns_seller(l.seller_id)
        )
    )
  );

create policy listing_images_owner_write on public.listing_images
  for all to authenticated
  using (
    exists (
      select 1
      from public.listings l
      where l.id = listing_id and public.owns_seller(l.seller_id)
    )
  )
  with check (
    exists (
      select 1
      from public.listings l
      where l.id = listing_id and public.owns_seller(l.seller_id)
    )
  );

create policy price_requests_owner_read on public.listing_price_requests
  for select to authenticated using (public.owns_seller(seller_id));

create policy price_requests_owner_insert on public.listing_price_requests
  for insert to authenticated with check (
    status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and review_note is null
    and public.owns_seller(seller_id)
    and exists (
      select 1
      from public.sellers s
      where s.id = seller_id
        and s.verification_status = 'approved'
    )
  );

grant usage on schema public to anon, authenticated;
grant select on public.markets, public.categories, public.sellers,
  public.catalog_products, public.listings, public.listing_images to anon, authenticated;
grant select on public.catalogue_listing_cards, public.catalogue_listing_details to anon, authenticated;
grant select on public.seller_accounts, public.listing_price_requests to authenticated;
grant insert on public.listings to authenticated;
grant update (
  catalog_product_id,
  package_quantity,
  package_unit,
  description,
  availability
) on public.listings to authenticated;
grant insert, update, delete on public.listing_images to authenticated;
grant insert on public.listing_price_requests to authenticated;

revoke all on function public.listing_price_request_seller_matches(uuid, uuid) from public;
grant execute on function public.listing_price_request_seller_matches(uuid, uuid) to authenticated;
revoke all on function public.owns_seller(uuid) from public;
grant execute on function public.owns_seller(uuid) to anon, authenticated;
