begin;

create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (id, aud, role, email) values
  ('02000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'catalogue-vendor@example.test'),
  ('02000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'catalogue-reviewer@example.test');
insert into public.markets (id, name, slug) values
  ('12000000-0000-4000-8000-000000000001', 'Slice 3.2 Market', 'slice-32-market');
insert into public.categories (id, name, slug) values
  ('22000000-0000-4000-8000-000000000001', 'Slice 3.2 Produce', 'slice-32-produce');
insert into public.catalog_products (id, category_id, name, slug) values
  ('32000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'Matooke', 'slice-32-matooke');
insert into public.sellers (id, business_name, market_id, verification_status) values
  ('42000000-0000-4000-8000-000000000001', 'Slice 3.2 Stall', '12000000-0000-4000-8000-000000000001', 'approved');
insert into public.seller_accounts (seller_id, user_id) values
  ('42000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001');
insert into public.listings (
  id, seller_id, catalog_product_id, package_quantity, package_unit, description
) values (
  '52000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001', 2, 'clusters', 'Fresh matooke'
), (
  '52000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001', 1, 'cluster', 'Second listing'
);
insert into public.listing_images (id, listing_id, storage_path, thumbnail_path, is_primary) values
  ('62000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'slice32/item.jpg', 'slice32/thumb.jpg', true),
  ('62000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000002', 'slice32/item2.jpg', null, true);
insert into public.listing_price_requests (id, listing_id, seller_id, proposed_price_ugx, reason) values
  ('72000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', 4000, 'Initial price'),
  ('72000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000001', 3000, 'Initial price');

select public.submit_listing_for_approval('52000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001');
select public.submit_listing_for_approval('52000000-0000-4000-8000-000000000002', '02000000-0000-4000-8000-000000000001');

select is(
  public.get_admin_listing_review('52000000-0000-4000-8000-000000000001')->>'vendorName',
  'Slice 3.2 Stall', 'listing detail contains the vendor'
);
select is(
  jsonb_array_length(public.get_admin_listing_review('52000000-0000-4000-8000-000000000001')->'images'),
  1, 'listing detail contains images'
);
select is(
  jsonb_array_length(public.get_admin_listing_review('52000000-0000-4000-8000-000000000001')->'priceHistory'),
  1, 'listing detail contains price history'
);
select is(jsonb_array_length(public.get_admin_listing_review_queue()), 2, 'pending queue is database-backed');

select is(
  public.admin_review_listing(
    '52000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000002',
    'approved', 'Images verified', 1, '82000000-0000-4000-8000-000000000001'
  )->>'status',
  'active', 'listing approval activates the listing'
);
select is((select version from public.listings where id = '52000000-0000-4000-8000-000000000001'), 2, 'listing review increments version');
select is((select approved_price_ugx from public.listings where id = '52000000-0000-4000-8000-000000000001'), 4000, 'initial price is approved atomically');
select is((select count(*)::integer from public.catalogue_review_operations where operation_id = '82000000-0000-4000-8000-000000000001'), 1, 'review operation is recorded');
select is((select count(*)::integer from public.catalogue_audit_events where action = 'listing.approve' and entity_id = '52000000-0000-4000-8000-000000000001'), 1, 'listing approval is audited');
select is(
  public.admin_review_listing(
    '52000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000002',
    'approved', 'Images verified', 1, '82000000-0000-4000-8000-000000000001'
  )->>'duplicate',
  'true', 'identical listing command replay is idempotent'
);
select throws_ok(
  $$ select public.admin_review_listing(
    '52000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000002',
    'approved', 'Different input', 1, '82000000-0000-4000-8000-000000000001'
  ) $$,
  '23505', null, 'conflicting listing command replay is rejected'
);

insert into public.listing_price_requests (
  id, listing_id, seller_id, proposed_price_ugx, current_price_ugx, reason
) values (
  '72000000-0000-4000-8000-000000000003', '52000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000001', 6500, 4000, 'Input costs increased'
);

select is((public.get_admin_price_review_queue()->0->>'largePriceChange')::boolean, true, 'large price changes are flagged');
select is((public.get_admin_price_review_queue()->0->>'percentageChange')::numeric, 62.5::numeric, 'percentage change is projected');
select is(jsonb_array_length(public.get_admin_price_review_queue()->0->'images'), 1, 'price review includes listing images');
select is(
  public.admin_review_price_request(
    '72000000-0000-4000-8000-000000000003', '02000000-0000-4000-8000-000000000002',
    'approved', 'Market evidence checked', '82000000-0000-4000-8000-000000000002'
  )->>'status',
  'approved', 'price review approves the request'
);
select is((select approved_price_ugx from public.listings where id = '52000000-0000-4000-8000-000000000001'), 6500, 'price approval updates the listing price');
select is(
  (select previous_state->>'approvedPriceUgx' from public.catalogue_audit_events where entity_id = '72000000-0000-4000-8000-000000000003'),
  '4000', 'price audit preserves the previous approved price'
);
select is(
  public.admin_review_price_request(
    '72000000-0000-4000-8000-000000000003', '02000000-0000-4000-8000-000000000002',
    'approved', 'Market evidence checked', '82000000-0000-4000-8000-000000000002'
  )->>'duplicate',
  'true', 'identical price command replay is idempotent'
);
select is(
  public.admin_review_listing(
    '52000000-0000-4000-8000-000000000002', '02000000-0000-4000-8000-000000000002',
    'changes_requested', 'Package size is unclear', 1, '82000000-0000-4000-8000-000000000003'
  )->>'status',
  'changes_requested', 'reviewer can request listing changes'
);
select is(
  (select review_note from public.listing_price_requests where id = '72000000-0000-4000-8000-000000000002'),
  'Package size is unclear', 'change request note is visible on the vendor price request'
);
select is(jsonb_array_length(public.get_admin_listing_review_queue()), 0, 'reviewed listings leave the pending queue');

select * from finish();
rollback;
