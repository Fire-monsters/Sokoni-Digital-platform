begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into public.markets (id, name, slug) values
  ('10000000-0000-4000-8000-000000000001', 'Kitooro Market', 'kitooro');

insert into public.categories (id, name, slug) values
  ('20000000-0000-4000-8000-000000000001', 'Vegetables', 'vegetables');

insert into public.catalog_products (id, category_id, name, slug) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Tomatoes', 'tomatoes');

insert into public.sellers (id, business_name, market_id, verification_status) values
  ('40000000-0000-4000-8000-000000000001', 'Approved Stall', '10000000-0000-4000-8000-000000000001', 'approved'),
  ('40000000-0000-4000-8000-000000000002', 'Pending Stall', '10000000-0000-4000-8000-000000000001', 'pending');

insert into public.listings (
  id, seller_id, catalog_product_id, package_quantity, package_unit,
  approved_price_ugx, status, availability, updated_at
) values
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 1, 'kg', 5000, 'active', 'available', '2026-08-06T10:00:00Z'),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 2, 'kg', null, 'draft', 'available', '2026-08-06T09:00:00Z'),
  ('50000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 1, 'kg', 4500, 'active', 'available', '2026-08-06T08:00:00Z');

set local role anon;

select is(
  (select count(*)::integer from public.catalogue_listing_cards),
  1,
  'guests see only active listings from approved sellers'
);

select ok(
  exists (select 1 from public.catalogue_listing_cards where product_name = 'Tomatoes'),
  'public card exposes the product name'
);

select is_empty(
  $$ select id from public.catalogue_listing_cards where id = '50000000-0000-4000-8000-000000000002' $$,
  'draft listings are absent from the public catalogue'
);

select is_empty(
  $$ select id from public.catalogue_listing_cards where id = '50000000-0000-4000-8000-000000000003' $$,
  'unapproved sellers are absent from the public catalogue'
);

select is(
  (select count(*)::integer from public.catalogue_listing_details),
  1,
  'guest detail view has the same visibility boundary'
);

reset role;

set local role authenticated;

select throws_ok(
  $$ update public.listings set approved_price_ugx = 1 where id = '50000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'vendors cannot approve their own prices'
);

reset role;

insert into public.listing_images (
  id, listing_id, storage_path, thumbnail_path, is_primary
) values (
  '60000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'seller/listing/original.jpg',
  'seller/listing/thumbnail.jpg',
  true
);

select throws_ok(
  $$ insert into public.listing_images (listing_id, storage_path, is_primary) values ('50000000-0000-4000-8000-000000000001', 'seller/listing/second.jpg', true) $$,
  '23505',
  null,
  'a listing can have only one ready primary image'
);

insert into public.listing_price_requests (
  listing_id, seller_id, proposed_price_ugx
) values (
  '50000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  5500
);

select throws_ok(
  $$ insert into public.listing_price_requests (listing_id, seller_id, proposed_price_ugx) values ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 6000) $$,
  '23505',
  null,
  'a listing can have only one pending price request'
);

select throws_ok(
  $$ insert into public.listing_price_requests (listing_id, seller_id, proposed_price_ugx) values ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 6000) $$,
  '23514',
  null,
  'a price request seller must own its listing'
);

update public.listings
set status = 'archived'
where id = '50000000-0000-4000-8000-000000000001';

select is(
  (select count(*)::integer from public.catalogue_listing_cards),
  0,
  'archived listings disappear from the catalogue'
);

select has_index(
  'public',
  'listings',
  'listings_public_catalogue_idx',
  'the public catalogue filter has a supporting index'
);

select * from finish();
rollback;
