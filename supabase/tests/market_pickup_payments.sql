begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, aud, role, email) values
  ('05000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'pickup-consumer@example.test'),
  ('05000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'pickup-vendor@example.test');
insert into public.markets (id, name, slug) values
  ('15000000-0000-4000-8000-000000000001', 'Pickup Market', 'pickup-market');
insert into public.categories (id, name, slug) values
  ('25000000-0000-4000-8000-000000000001', 'Pickup Produce', 'pickup-produce');
insert into public.catalog_products (id, category_id, name, slug) values
  ('35000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000001', 'Pickup Beans', 'pickup-beans');
insert into public.sellers (id, business_name, market_id, verification_status) values
  ('45000000-0000-4000-8000-000000000001', 'Pickup Seller', '15000000-0000-4000-8000-000000000001', 'approved');
insert into public.seller_accounts (seller_id, user_id) values
  ('45000000-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000002');
insert into public.listings (
  id, seller_id, catalog_product_id, package_quantity, package_unit,
  approved_price_ugx, status, stock_on_hand, stock_reserved
) values (
  '55000000-0000-4000-8000-000000000001', '45000000-0000-4000-8000-000000000001',
  '35000000-0000-4000-8000-000000000001', 1, 'kg', 5000, 'active', 5, 2
);
insert into public.carts (id, consumer_id, market_id, status) values
  ('85000000-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000001',
   '15000000-0000-4000-8000-000000000001', 'converted');
insert into public.customer_checkouts (
  id, reference, consumer_id, cart_id, market_id, items_subtotal_ugx, total_ugx,
  client_reference, reservation_expires_at
) values (
  '95000000-0000-4000-8000-000000000001', 'EK-2026-920001',
  '05000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001', 10000, 10000,
  'a5000000-0000-4000-8000-000000000001', now() + interval '15 minutes'
);
insert into public.checkout_fulfilments (
  checkout_id, type, schedule_type, phone_number, pickup_market_id, pickup_code_hash
) values (
  '95000000-0000-4000-8000-000000000001', 'market_pickup', 'immediate', '+256772123456',
  '15000000-0000-4000-8000-000000000001', encode(extensions.digest('483921', 'sha256'), 'hex')
);
insert into public.vendor_orders (id, reference, checkout_id, seller_id, subtotal_ugx) values (
  'd5000000-0000-4000-8000-000000000001', 'EK-S-9200001',
  '95000000-0000-4000-8000-000000000001', '45000000-0000-4000-8000-000000000001', 10000
);
insert into public.inventory_reservations (
  id, checkout_id, seller_order_id, listing_id, quantity, expires_at
) values (
  'e5000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000001',
  2, now() + interval '15 minutes'
);

select lives_ok($$select public.create_market_pickup_payment_attempt(
  '05000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001'
)$$, 'consumer can select pay at pickup');
select is((select provider::text from public.payment_attempts), 'market_pickup', 'pickup uses its own provider');
select is((select status::text from public.payment_attempts), 'pending', 'pickup payment remains pending');
select is((select status::text from public.customer_checkouts), 'confirmed_unpaid', 'order is confirmed separately from payment');
select is((select status::text from public.inventory_reservations), 'committed', 'pickup inventory is committed');
select is((select stock_on_hand from public.listings), 3, 'allocated pickup stock leaves on hand');
select is((select stock_reserved from public.listings), 0, 'allocated pickup stock leaves reserved');
select is((select status::text from public.vendor_orders), 'awaiting_vendor_acceptance', 'vendor can prepare pickup order');

select throws_ok($$select public.record_market_pickup_payment(
  '05000000-0000-4000-8000-000000000002', false,
  '95000000-0000-4000-8000-000000000001', 9999, 'UGX', 'cash', '483921',
  'f5000000-0000-4000-8000-000000000001'
)$$, '23514', null, 'mismatched amount cannot be recorded');
select throws_ok($$select public.record_market_pickup_payment(
  '05000000-0000-4000-8000-000000000002', false,
  '95000000-0000-4000-8000-000000000001', 10000, 'UGX', 'cash', '000000',
  'f5000000-0000-4000-8000-000000000002'
)$$, '22023', null, 'wrong pickup code cannot be recorded');
select throws_ok($$select public.record_market_pickup_payment(
  '05000000-0000-4000-8000-000000000001', false,
  '95000000-0000-4000-8000-000000000001', 10000, 'UGX', 'cash', '483921',
  'f5000000-0000-4000-8000-000000000003'
)$$, '42501', null, 'unprivileged consumer cannot record collection');
select lives_ok($$select public.record_market_pickup_payment(
  '05000000-0000-4000-8000-000000000002', false,
  '95000000-0000-4000-8000-000000000001', 10000, 'UGX', 'cash', '483921',
  'f5000000-0000-4000-8000-000000000004'
)$$, 'sole-order vendor can record collected payment');
select is((select status::text from public.payment_attempts), 'successful', 'pickup payment becomes successful');
select is((select status::text from public.customer_checkouts), 'paid', 'checkout becomes paid');
select is((select count(*)::integer from public.market_pickup_payment_records), 1, 'collection evidence is retained once');
select is((select count(*)::integer from public.payment_audit_events where action = 'market_pickup.payment_recorded'), 1, 'collection is audited');
select is(
  (public.record_market_pickup_payment(
    '05000000-0000-4000-8000-000000000002', false,
    '95000000-0000-4000-8000-000000000001', 10000, 'UGX', 'cash', '483921',
    'f5000000-0000-4000-8000-000000000004'
  )->>'duplicate')::boolean,
  true,
  'same operation replay is idempotent'
);

select * from finish();
rollback;
