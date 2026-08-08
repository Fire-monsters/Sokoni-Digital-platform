begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, aud, role, email) values
  ('01000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'vendor@example.test'),
  ('01000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'admin@example.test');

insert into public.markets (id, name, slug) values
  ('11000000-0000-4000-8000-000000000001', 'Kitooro Market', 'workflow-market');
insert into public.categories (id, name, slug) values
  ('21000000-0000-4000-8000-000000000001', 'Vegetables', 'workflow-vegetables');
insert into public.catalog_products (id, category_id, name, slug) values
  ('31000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Tomatoes', 'workflow-tomatoes');
insert into public.sellers (id, business_name, market_id, verification_status) values
  ('41000000-0000-4000-8000-000000000001', 'Workflow Stall', '11000000-0000-4000-8000-000000000001', 'approved');
insert into public.seller_accounts (seller_id, user_id) values
  ('41000000-0000-4000-8000-000000000001', '01000000-0000-4000-8000-000000000001');
insert into public.listings (
  id, seller_id, catalog_product_id, package_quantity, package_unit
) values (
  '51000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001', 1, 'kg'
);
insert into public.listing_images (listing_id, storage_path, thumbnail_path, is_primary) values
  ('51000000-0000-4000-8000-000000000001', 'workflow/original-1.jpg', 'workflow/thumb-1.jpg', true);
insert into public.listing_price_requests (listing_id, seller_id, proposed_price_ugx) values
  ('51000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', 5000);

select is(
  (public.submit_listing_for_approval(
    '51000000-0000-4000-8000-000000000001',
    '01000000-0000-4000-8000-000000000001'
  )).status::text,
  'pending_approval',
  'an owned complete draft can be submitted'
);

select is(
  (public.approve_listing_and_price(
    '51000000-0000-4000-8000-000000000001',
    '01000000-0000-4000-8000-000000000002',
    'Approved'
  )).status::text,
  'active',
  'approval activates the listing atomically'
);

select is(
  (select approved_price_ugx from public.listings where id = '51000000-0000-4000-8000-000000000001'),
  5000,
  'approval copies the proposed price'
);

select is(
  (public.change_listing_availability(
    '51000000-0000-4000-8000-000000000001',
    '01000000-0000-4000-8000-000000000001',
    'low_stock', 1,
    '71000000-0000-4000-8000-000000000001'
  )).version,
  2,
  'availability uses optimistic versioning'
);

select is(
  (public.change_listing_availability(
    '51000000-0000-4000-8000-000000000001',
    '01000000-0000-4000-8000-000000000001',
    'low_stock', 1,
    '71000000-0000-4000-8000-000000000001'
  )).version,
  2,
  'replayed availability operations are idempotent'
);

select throws_ok(
  $$ update public.listings set status = 'draft' where id = '51000000-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'invalid lifecycle transitions are rejected'
);

insert into public.listing_images (listing_id, storage_path, sort_order) values
  ('51000000-0000-4000-8000-000000000001', 'workflow/original-2.jpg', 1),
  ('51000000-0000-4000-8000-000000000001', 'workflow/original-3.jpg', 2),
  ('51000000-0000-4000-8000-000000000001', 'workflow/original-4.jpg', 3);

select throws_ok(
  $$ insert into public.listing_images (listing_id, storage_path, sort_order) values ('51000000-0000-4000-8000-000000000001', 'workflow/original-5.jpg', 4) $$,
  '23514',
  null,
  'a fifth ready image is rejected'
);

select is(
  (select count(*)::integer from public.catalogue_audit_events where entity_id = '51000000-0000-4000-8000-000000000001'),
  2,
  'submission and approval produce audit events'
);

insert into public.listing_price_requests (
  listing_id, seller_id, proposed_price_ugx, current_price_ugx
) values (
  '51000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001', 6000, 5000
) returning id \gset price_

select is(
  (public.review_price_request(
    :'price_id',
    '01000000-0000-4000-8000-000000000002',
    'approved',
    'Market price accepted'
  )).status::text,
  'approved',
  'an active listing price request can be approved'
);

select is(
  (select approved_price_ugx from public.listings where id = '51000000-0000-4000-8000-000000000001'),
  6000,
  'price approval changes the public price without changing lifecycle state'
);

select * from finish();
rollback;
