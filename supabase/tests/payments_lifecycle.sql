begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, aud, role, email) values
  ('04000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'lifecycle@example.test');
insert into public.markets (id, name, slug) values
  ('14000000-0000-4000-8000-000000000001', 'Lifecycle Market', 'lifecycle-market');
insert into public.categories (id, name, slug) values
  ('24000000-0000-4000-8000-000000000001', 'Lifecycle Produce', 'lifecycle-produce');
insert into public.catalog_products (id, category_id, name, slug) values
  ('34000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000001', 'Beans', 'lifecycle-beans');
insert into public.sellers (id, business_name, market_id, verification_status) values
  ('44000000-0000-4000-8000-000000000001', 'Lifecycle Seller', '14000000-0000-4000-8000-000000000001', 'approved');
insert into public.listings (
  id, seller_id, catalog_product_id, package_quantity, package_unit,
  approved_price_ugx, status, stock_on_hand, stock_reserved
) values (
  '54000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001', 1, 'kg', 5000, 'active', 5, 2
);
insert into public.carts (id, consumer_id, market_id, status) values
  ('84000000-0000-4000-8000-000000000001', '04000000-0000-4000-8000-000000000001',
   '14000000-0000-4000-8000-000000000001', 'converted');
insert into public.customer_checkouts (
  id, reference, consumer_id, cart_id, market_id, items_subtotal_ugx, total_ugx,
  client_reference, reservation_expires_at
) values (
  '94000000-0000-4000-8000-000000000001', 'EK-2026-910001',
  '04000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001', 10000, 10000,
  'a4000000-0000-4000-8000-000000000001', now() + interval '15 minutes'
);
insert into public.vendor_orders (
  id, reference, checkout_id, seller_id, subtotal_ugx
) values (
  'd4000000-0000-4000-8000-000000000001', 'EK-S-9100001',
  '94000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001', 10000
);
insert into public.inventory_reservations (
  id, checkout_id, seller_order_id, listing_id, quantity, expires_at
) values (
  'e4000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000001',
  2, now() + interval '15 minutes'
);

select lives_ok($$select public.create_pesapal_payment_attempt(
  '04000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
  '+256772123456', 3, 15
)$$, 'authoritative payment attempt creation succeeds');
select is((select status::text from public.payment_attempts), 'initiating', 'new attempt starts initiating');
select is((select amount_ugx from public.payment_attempts), 10000::bigint, 'amount comes from checkout');
select throws_ok($$select public.create_pesapal_payment_attempt(
  '04000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
  '+256772123456', 3, 15
)$$, '55000', null, 'a second unresolved attempt is rejected');
select lives_ok($$select public.mark_payment_attempt_pending(
  (select id from public.payment_attempts), 'pesapal-track-success', 'EK-P-REQUEST-1',
  'https://pay.example.test/order/1'
)$$, 'accepted Pesapal order becomes pending');
select is((select status::text from public.payment_attempts), 'pending', 'attempt is pending, not successful');
select lives_ok($$select public.process_payment_result(
  'pesapal', 'pesapal-track-success', (select merchant_reference from public.payment_attempts),
  'successful', 10000, 'UGX', 'mtn_momo', null, 'CONFIRM-1', null, 'Completed'
)$$, 'provider-confirmed success finalizes transactionally');
select is((select status::text from public.payment_attempts), 'successful', 'attempt becomes successful');
select is((select status::text from public.customer_checkouts), 'paid', 'checkout becomes paid');
select is((select status::text from public.inventory_reservations), 'committed', 'reservation is committed');
select is((select stock_on_hand from public.listings), 3, 'committed quantity leaves stock on hand');
select is((select stock_reserved from public.listings), 0, 'committed quantity leaves reserved stock');
select is((select status::text from public.vendor_orders), 'awaiting_vendor_acceptance', 'seller order becomes actionable');
select is((select count(*)::integer from public.checkout_status_history where to_status = 'paid'), 1, 'paid history is recorded once');
select lives_ok($$select public.process_payment_result(
  'pesapal', 'pesapal-track-success', (select merchant_reference from public.payment_attempts),
  'successful', 10000, 'UGX', 'mtn_momo', null, 'CONFIRM-1', null, 'Completed'
)$$, 'successful replay is idempotent');
select is((select stock_on_hand from public.listings), 3, 'success replay cannot consume inventory twice');

insert into public.carts (id, consumer_id, market_id, status) values
  ('84000000-0000-4000-8000-000000000002', '04000000-0000-4000-8000-000000000001',
   '14000000-0000-4000-8000-000000000001', 'converted');
insert into public.customer_checkouts (
  id, reference, consumer_id, cart_id, market_id, items_subtotal_ugx, total_ugx,
  client_reference, reservation_expires_at
) values (
  '94000000-0000-4000-8000-000000000002', 'EK-2026-910002',
  '04000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000002',
  '14000000-0000-4000-8000-000000000001', 5000, 5000,
  'a4000000-0000-4000-8000-000000000002', now() + interval '15 minutes'
);
insert into public.vendor_orders (id, reference, checkout_id, seller_id, subtotal_ugx) values (
  'd4000000-0000-4000-8000-000000000002', 'EK-S-9100002',
  '94000000-0000-4000-8000-000000000002', '44000000-0000-4000-8000-000000000001', 5000
);
update public.listings set stock_reserved = 1 where id = '54000000-0000-4000-8000-000000000001';
insert into public.inventory_reservations (
  id, checkout_id, seller_order_id, listing_id, quantity, expires_at
) values (
  'e4000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000002',
  'd4000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000001',
  1, now() + interval '15 minutes'
);
select public.create_pesapal_payment_attempt(
  '04000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000002',
  '+256752123456', 3, 15
);
select public.mark_payment_attempt_pending(
  (select id from public.payment_attempts where checkout_id = '94000000-0000-4000-8000-000000000002'),
  'pesapal-track-failure', 'EK-P-REQUEST-2', 'https://pay.example.test/order/2'
);
select public.process_payment_result(
  'pesapal', 'pesapal-track-failure',
  (select merchant_reference from public.payment_attempts where checkout_id = '94000000-0000-4000-8000-000000000002'),
  'successful', 4999, 'UGX', 'airtel_money', null, null, null, 'Completed'
);
select is((select status::text from public.payment_attempts where checkout_id = '94000000-0000-4000-8000-000000000002'), 'requires_reconciliation', 'amount mismatch requires reconciliation');
select is((select status::text from public.customer_checkouts where id = '94000000-0000-4000-8000-000000000002'), 'awaiting_payment', 'mismatch cannot confirm checkout');
select is((select status::text from public.inventory_reservations where id = 'e4000000-0000-4000-8000-000000000002'), 'active', 'mismatch keeps inventory reserved');
update public.payment_attempts
set next_reconciliation_at = now() - interval '1 second'
where checkout_id = '94000000-0000-4000-8000-000000000002';
select is(
  jsonb_array_length(public.claim_payment_reconciliation_batch(10, 55)),
  1,
  'reconciliation worker atomically claims the due attempt'
);
select ok(
  (select reconciliation_claimed_until > now() from public.payment_attempts
   where checkout_id = '94000000-0000-4000-8000-000000000002'),
  'claim receives a future lease'
);
select lives_ok(
  $$select public.release_payment_reconciliation_claim(
    (select id from public.payment_attempts
     where checkout_id = '94000000-0000-4000-8000-000000000002'), 30
  )$$,
  'reconciliation claim can be released with a retry delay'
);
select is(
  (select reconciliation_claimed_until from public.payment_attempts
   where checkout_id = '94000000-0000-4000-8000-000000000002'),
  null,
  'released reconciliation claim clears its lease'
);
select lives_ok($$select public.process_payment_result(
  'pesapal', 'pesapal-track-failure',
  (select merchant_reference from public.payment_attempts where checkout_id = '94000000-0000-4000-8000-000000000002'),
  'failed', 5000, 'UGX', 'airtel_money', null, null, 'DECLINED', 'Declined'
)$$, 'definitive provider failure releases transactionally');
select is((select status::text from public.payment_attempts where checkout_id = '94000000-0000-4000-8000-000000000002'), 'failed', 'attempt becomes failed');
select is((select status::text from public.customer_checkouts where id = '94000000-0000-4000-8000-000000000002'), 'payment_failed', 'checkout records payment failure');
select is((select status::text from public.inventory_reservations where id = 'e4000000-0000-4000-8000-000000000002'), 'released', 'definitive failure releases reservation');
select is((select stock_reserved from public.listings), 0, 'definitive failure restores available stock');

select * from finish();
rollback;
