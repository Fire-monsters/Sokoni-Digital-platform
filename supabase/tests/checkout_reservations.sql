begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, aud, role, email) values
  ('02000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'checkout@example.test');
insert into public.markets (id, name, slug) values
  ('12000000-0000-4000-8000-000000000001', 'Checkout Market', 'checkout-market');
insert into public.categories (id, name, slug) values
  ('22000000-0000-4000-8000-000000000001', 'Checkout Produce', 'checkout-produce');
insert into public.catalog_products (id, category_id, name, slug) values
  ('32000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'Tomatoes', 'checkout-tomatoes'),
  ('32000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000001', 'Onions', 'checkout-onions');
insert into public.sellers (id, business_name, market_id, verification_status) values
  ('42000000-0000-4000-8000-000000000001', 'Seller One', '12000000-0000-4000-8000-000000000001', 'approved'),
  ('42000000-0000-4000-8000-000000000002', 'Seller Two', '12000000-0000-4000-8000-000000000001', 'approved');
insert into public.listings (
  id, seller_id, catalog_product_id, package_quantity, package_unit,
  approved_price_ugx, status, stock_on_hand
) values
  ('52000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 1, 'kg', 4000, 'active', 5),
  ('52000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000002', 2, 'kg', 3000, 'active', 4);
insert into public.delivery_zones (id, market_id, name, delivery_fee_ugx) values
  ('62000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'Central', 5000);
insert into public.consumer_addresses (id, consumer_id, label, summary, phone_number) values
  ('72000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001', 'Home', 'Lugard Avenue', '+256700000000');
insert into public.carts (id, consumer_id, market_id) values
  ('82000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001');
insert into public.cart_items (cart_id, listing_id, quantity, price_snapshot_ugx, listing_version) values
  ('82000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 2, 3500, 1),
  ('82000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', 1, 3000, 1);

select lives_ok($$ select public.create_checkout_from_cart(
  '02000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001',
  'delivery', '62000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001',
  null, 'immediate', null, '92000000-0000-4000-8000-000000000001', 15
) $$, 'checkout transaction succeeds');
select is((select count(*)::integer from public.customer_checkouts), 1, 'one customer checkout is created');
select is((select count(*)::integer from public.vendor_orders), 2, 'items are grouped into seller orders');
select is((select count(*)::integer from public.vendor_order_items), 2, 'immutable order items are created');
select is((select items_subtotal_ugx from public.customer_checkouts), 11000, 'authoritative prices calculate subtotal');
select is((select total_ugx from public.customer_checkouts), 16000, 'server delivery fee calculates total');
select is((select product_name from public.vendor_order_items where listing_id = '52000000-0000-4000-8000-000000000001'), 'Tomatoes', 'product snapshot is stored');
select is((select unit_price_ugx from public.vendor_order_items where listing_id = '52000000-0000-4000-8000-000000000001'), 4000, 'approved price snapshot replaces cart price');
select is((select stock_reserved from public.listings where id = '52000000-0000-4000-8000-000000000001'), 2, 'inventory is reserved');
select is((select count(*)::integer from public.inventory_reservations), 2, 'one reservation exists per listing');
select is((select status::text from public.carts), 'converted', 'cart is converted atomically');
select lives_ok($$ select public.create_checkout_from_cart(
  '02000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001',
  'delivery', '62000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001',
  null, 'immediate', null, '92000000-0000-4000-8000-000000000001', 15
) $$, 'client reference safely replays at the database boundary');
select is((select count(*)::integer from public.customer_checkouts), 1, 'database replay creates no duplicate checkout');

insert into public.carts (id, consumer_id, market_id) values
  ('82000000-0000-4000-8000-000000000002', '02000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001');
insert into public.cart_items (cart_id, listing_id, quantity, price_snapshot_ugx, listing_version) values
  ('82000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000001', 4, 4000, 1);
select throws_ok($$ select public.create_checkout_from_cart(
  '02000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000002',
  'delivery', '62000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001',
  null, 'immediate', null, '92000000-0000-4000-8000-000000000002', 15
) $$, '23514', null, 'insufficient stock rejects checkout');
select is((select count(*)::integer from public.customer_checkouts), 1, 'failed checkout creates no checkout row');
select is((select count(*)::integer from public.inventory_reservations), 2, 'failed checkout creates no reservations');

update public.inventory_reservations set expires_at = now() - interval '1 minute';
select is(public.expire_inventory_reservations(100), 2, 'expiry releases the batch');
select is(public.expire_inventory_reservations(100), 0, 'expiry is safe to repeat');
select is((select sum(stock_reserved)::integer from public.listings), 0, 'expired inventory is fully released');
select is((select status::text from public.customer_checkouts), 'expired', 'unpaid checkout becomes expired');
select is((select count(*)::integer from public.checkout_status_history where to_status = 'expired'), 1, 'expiry history is recorded once');

select is((public.claim_idempotency_record(
  '02000000-0000-4000-8000-000000000001', 'checkout.create',
  'a2000000-0000-4000-8000-000000000001', repeat('a', 64)
)->>'action'), 'proceed', 'new idempotency key proceeds');
select is((public.claim_idempotency_record(
  '02000000-0000-4000-8000-000000000001', 'checkout.create',
  'a2000000-0000-4000-8000-000000000001', repeat('b', 64)
)->>'action'), 'conflict', 'key reuse with another payload conflicts');
select lives_ok($$ select public.complete_idempotency_record(
  (select id from public.idempotency_records where idempotency_key = 'a2000000-0000-4000-8000-000000000001'),
  201, '{"success":true}'::jsonb
) $$, 'completed idempotency response is stored');

select * from finish();
rollback;
