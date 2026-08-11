#!/usr/bin/env bash
set -euo pipefail

database_url="${1:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
psql=(psql "$database_url" -X -v ON_ERROR_STOP=1 -q)

cleanup() {
  "${psql[@]}" <<'SQL'
delete from public.payment_audit_events where payment_attempt_id in (
  select id from public.payment_attempts where checkout_id in (
    '96000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002'
  )
);
delete from public.payment_reconciliation_runs where payment_attempt_id in (
  select id from public.payment_attempts where checkout_id in (
    '96000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002'
  )
);
delete from public.payment_attempts where checkout_id in (
  '96000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002'
);
delete from public.inventory_reservations where checkout_id in (
  '96000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002'
);
delete from public.vendor_orders where checkout_id in (
  '96000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002'
);
delete from public.checkout_fulfilments where checkout_id in (
  '96000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002'
);
delete from public.checkout_status_history where checkout_id in (
  '96000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002'
);
delete from public.customer_checkouts where id in (
  '96000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002'
);
delete from public.carts where id in (
  '86000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000002'
);
delete from public.listings where id in (
  '56000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000002'
);
delete from public.sellers where id = '46000000-0000-4000-8000-000000000001';
delete from public.catalog_products where id in (
  '36000000-0000-4000-8000-000000000001', '36000000-0000-4000-8000-000000000002'
);
delete from public.categories where id = '26000000-0000-4000-8000-000000000001';
delete from public.markets where id = '16000000-0000-4000-8000-000000000001';
delete from auth.users where id = '06000000-0000-4000-8000-000000000001';
SQL
}

cleanup
trap cleanup EXIT

"${psql[@]}" <<'SQL'
insert into auth.users (id, aud, role, email) values
  ('06000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'payment-race@example.test');
insert into public.markets (id, name, slug) values
  ('16000000-0000-4000-8000-000000000001', 'Payment Race Market', 'payment-race-market');
insert into public.categories (id, name, slug) values
  ('26000000-0000-4000-8000-000000000001', 'Payment Race Produce', 'payment-race-produce');
insert into public.catalog_products (id, category_id, name, slug) values
  ('36000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', 'Race Beans', 'payment-race-beans'),
  ('36000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000001', 'Race Peas', 'payment-race-peas');
insert into public.sellers (id, business_name, market_id, verification_status) values
  ('46000000-0000-4000-8000-000000000001', 'Payment Race Seller', '16000000-0000-4000-8000-000000000001', 'approved');
insert into public.listings (
  id, seller_id, catalog_product_id, package_quantity, package_unit,
  approved_price_ugx, status, stock_on_hand, stock_reserved
) values
  ('56000000-0000-4000-8000-000000000001', '46000000-0000-4000-8000-000000000001',
   '36000000-0000-4000-8000-000000000001', 1, 'kg', 5000, 'active', 5, 1),
  ('56000000-0000-4000-8000-000000000002', '46000000-0000-4000-8000-000000000001',
   '36000000-0000-4000-8000-000000000002', 1, 'kg', 5000, 'active', 5, 1);
insert into public.carts (id, consumer_id, market_id, status) values
  ('86000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000001', 'converted'),
  ('86000000-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000001', 'converted');
insert into public.customer_checkouts (
  id, reference, consumer_id, cart_id, market_id, items_subtotal_ugx, total_ugx,
  client_reference, reservation_expires_at
) values
  ('96000000-0000-4000-8000-000000000001', 'EK-2026-930001', '06000000-0000-4000-8000-000000000001',
   '86000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000001', 5000, 5000,
   'a6000000-0000-4000-8000-000000000001', now() - interval '1 second'),
  ('96000000-0000-4000-8000-000000000002', 'EK-2026-930002', '06000000-0000-4000-8000-000000000001',
   '86000000-0000-4000-8000-000000000002', '16000000-0000-4000-8000-000000000001', 5000, 5000,
   'a6000000-0000-4000-8000-000000000002', now() + interval '15 minutes');
insert into public.vendor_orders (id, reference, checkout_id, seller_id, subtotal_ugx) values
  ('d6000000-0000-4000-8000-000000000001', 'EK-S-9300001', '96000000-0000-4000-8000-000000000001', '46000000-0000-4000-8000-000000000001', 5000),
  ('d6000000-0000-4000-8000-000000000002', 'EK-S-9300002', '96000000-0000-4000-8000-000000000002', '46000000-0000-4000-8000-000000000001', 5000);
insert into public.inventory_reservations (
  id, checkout_id, seller_order_id, listing_id, quantity, expires_at
) values
  ('e6000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000001', 1, now() - interval '1 second'),
  ('e6000000-0000-4000-8000-000000000002', '96000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000002', '56000000-0000-4000-8000-000000000002', 1, now() + interval '15 minutes');
insert into public.payment_attempts (
  checkout_id, consumer_id, provider, status, amount_ugx, merchant_reference,
  provider_transaction_id, initiated_at, next_reconciliation_at
) values
  ('96000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000001', 'pesapal', 'pending', 5000, 'EK-P-RACE-EXPIRY', 'tracking-race-expiry', now(), now()),
  ('96000000-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000001', 'pesapal', 'pending', 5000, 'EK-P-RACE-RECON', 'tracking-race-recon', now(), now());
SQL

payment_success() {
  local reference="$1" tracking="$2"
  "${psql[@]}" -c "select public.process_payment_result('pesapal', '$tracking', '$reference', 'successful', 5000, 'UGX', 'mtn_momo', null, 'race-confirmation', null, 'Completed')" >/dev/null
}

payment_success EK-P-RACE-EXPIRY tracking-race-expiry & callback_pid=$!
"${psql[@]}" -c "select public.expire_inventory_reservations(100)" >/dev/null & expiry_pid=$!
wait "$callback_pid"
wait "$expiry_pid"

expiry_race="$(${psql[@]} -Atc "
  select c.status || ':' || p.status || ':' || r.status || ':' || l.stock_on_hand || ':' || l.stock_reserved
  from public.customer_checkouts c
  join public.payment_attempts p on p.checkout_id = c.id
  join public.inventory_reservations r on r.checkout_id = c.id
  join public.listings l on l.id = r.listing_id
  where c.id = '96000000-0000-4000-8000-000000000001'
")"
if [[ "$expiry_race" != "paid:successful:committed:4:0" && "$expiry_race" != "expired:requires_reconciliation:expired:5:0" ]]; then
  echo "callback/expiry invariant failed: $expiry_race" >&2
  exit 1
fi

payment_success EK-P-RACE-RECON tracking-race-recon & callback_pid=$!
payment_success EK-P-RACE-RECON tracking-race-recon & reconciliation_pid=$!
wait "$callback_pid"
wait "$reconciliation_pid"

reconciliation_race="$(${psql[@]} -Atc "
  select c.status || ':' || p.status || ':' || r.status || ':' || l.stock_on_hand || ':' || l.stock_reserved || ':' ||
    (select count(*) from public.payment_audit_events a where a.payment_attempt_id = p.id and a.action = 'payment.succeeded')
  from public.customer_checkouts c
  join public.payment_attempts p on p.checkout_id = c.id
  join public.inventory_reservations r on r.checkout_id = c.id
  join public.listings l on l.id = r.listing_id
  where c.id = '96000000-0000-4000-8000-000000000002'
")"
if [[ "$reconciliation_race" != "paid:successful:committed:4:0:1" ]]; then
  echo "callback/reconciliation invariant failed: $reconciliation_race" >&2
  exit 1
fi

echo "payment races passed: expiry=$expiry_race reconciliation=$reconciliation_race"
