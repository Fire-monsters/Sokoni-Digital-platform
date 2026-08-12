#!/usr/bin/env bash
set -euo pipefail

database_url="${1:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
psql=(psql "$database_url" -X -v ON_ERROR_STOP=1 -q)
delivery_id="a8000000-0000-4000-8000-000000000001"

cleanup() {
  "${psql[@]}" <<'SQL'
delete from public.notification_events
where payload->>'deliveryId' = 'a8000000-0000-4000-8000-000000000001';
delete from public.deliveries where id = 'a8000000-0000-4000-8000-000000000001';
delete from public.delivery_group_orders where delivery_group_id = '98000000-0000-4000-8000-000000000001';
delete from public.delivery_groups where id = '98000000-0000-4000-8000-000000000001';
delete from public.vendor_orders where id = '88000000-0000-4000-8000-000000000001';
delete from public.checkout_fulfilments where checkout_id = '68000000-0000-4000-8000-000000000001';
delete from public.customer_checkouts where id = '68000000-0000-4000-8000-000000000001';
delete from public.carts where id = '58000000-0000-4000-8000-000000000001';
delete from public.transporter_locations_current where transporter_id in (
  'b8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000002'
);
delete from public.transporter_profiles where id in (
  'b8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000002'
);
delete from public.consumer_addresses where id = '38000000-0000-4000-8000-000000000001';
delete from public.sellers where id = '48000000-0000-4000-8000-000000000001';
delete from public.delivery_zones where id = '28000000-0000-4000-8000-000000000001';
delete from public.markets where id = '18000000-0000-4000-8000-000000000001';
delete from auth.users where id in (
  '08000000-0000-4000-8000-000000000001',
  '08000000-0000-4000-8000-000000000002',
  '08000000-0000-4000-8000-000000000003'
);
SQL
}

cleanup
trap cleanup EXIT

"${psql[@]}" <<'SQL'
insert into auth.users (id, aud, role, email) values
  ('08000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'accept-race-a@example.test'),
  ('08000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'accept-race-b@example.test'),
  ('08000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'accept-race-consumer@example.test');
insert into public.markets (id, name, slug, latitude, longitude) values
  ('18000000-0000-4000-8000-000000000001', 'Acceptance Race Market', 'acceptance-race-market', 0.0612, 32.4637);
insert into public.delivery_zones (id, market_id, name, delivery_fee_ugx) values
  ('28000000-0000-4000-8000-000000000001', '18000000-0000-4000-8000-000000000001', 'Race Zone', 5000);
insert into public.consumer_addresses (id, consumer_id, label, summary, phone_number) values
  ('38000000-0000-4000-8000-000000000001', '08000000-0000-4000-8000-000000000003', 'Home', 'Race destination', '+256700000003');
insert into public.sellers (id, business_name, market_id, verification_status) values
  ('48000000-0000-4000-8000-000000000001', 'Acceptance Race Seller', '18000000-0000-4000-8000-000000000001', 'approved');
insert into public.carts (id, consumer_id, market_id, status) values
  ('58000000-0000-4000-8000-000000000001', '08000000-0000-4000-8000-000000000003', '18000000-0000-4000-8000-000000000001', 'converted');
insert into public.customer_checkouts (
  id, reference, consumer_id, cart_id, market_id, status, items_subtotal_ugx,
  delivery_fee_ugx, total_ugx, client_reference, reservation_expires_at
) values (
  '68000000-0000-4000-8000-000000000001', 'EK-2026-980001',
  '08000000-0000-4000-8000-000000000003', '58000000-0000-4000-8000-000000000001',
  '18000000-0000-4000-8000-000000000001', 'paid', 10000, 5000, 15000,
  '78000000-0000-4000-8000-000000000001', now() + interval '15 minutes'
);
insert into public.checkout_fulfilments (
  checkout_id, type, schedule_type, delivery_zone_id, delivery_zone_name,
  address_id, address_label, address_summary, phone_number
) values (
  '68000000-0000-4000-8000-000000000001', 'delivery', 'immediate',
  '28000000-0000-4000-8000-000000000001', 'Race Zone',
  '38000000-0000-4000-8000-000000000001', 'Home', 'Race destination', '+256700000003'
);
insert into public.vendor_orders (
  id, reference, checkout_id, seller_id, status, subtotal_ugx
) values (
  '88000000-0000-4000-8000-000000000001', 'EK-S-9800001',
  '68000000-0000-4000-8000-000000000001', '48000000-0000-4000-8000-000000000001',
  'ready_for_pickup', 10000
);
insert into public.delivery_groups (
  id, checkout_id, consumer_id, market_id, delivery_zone_id, delivery_address_id,
  delivery_zone_name, address_label, address_summary, phone_number
) values (
  '98000000-0000-4000-8000-000000000001', '68000000-0000-4000-8000-000000000001',
  '08000000-0000-4000-8000-000000000003', '18000000-0000-4000-8000-000000000001',
  '28000000-0000-4000-8000-000000000001', '38000000-0000-4000-8000-000000000001',
  'Race Zone', 'Home', 'Race destination', '+256700000003'
);
insert into public.delivery_group_orders (delivery_group_id, seller_order_id) values
  ('98000000-0000-4000-8000-000000000001', '88000000-0000-4000-8000-000000000001');
insert into public.deliveries (id, reference, delivery_group_id, fee_ugx) values
  ('a8000000-0000-4000-8000-000000000001', 'DL-9800001', '98000000-0000-4000-8000-000000000001', 5000);
insert into public.transporter_profiles (
  id, user_id, display_name, verification_status, availability
) values
  ('b8000000-0000-4000-8000-000000000001', '08000000-0000-4000-8000-000000000001', 'Race Rider A', 'approved', 'available'),
  ('b8000000-0000-4000-8000-000000000002', '08000000-0000-4000-8000-000000000002', 'Race Rider B', 'approved', 'available');
insert into public.transporter_locations_current (
  transporter_id, latitude, longitude, accuracy_meters, captured_at, received_at
) values
  ('b8000000-0000-4000-8000-000000000001', 0.0612, 32.4637, 20, now(), now()),
  ('b8000000-0000-4000-8000-000000000002', 0.0620, 32.4637, 20, now(), now());
select public.offer_delivery_to_nearby_transporters(
  'a8000000-0000-4000-8000-000000000001',
  'c8000000-0000-4000-8000-000000000001', 5, 2, 45
);
SQL

offer_a="$(${psql[@]} -Atc "select id from public.delivery_offers where delivery_id = '$delivery_id' and transporter_id = 'b8000000-0000-4000-8000-000000000001'")"
offer_b="$(${psql[@]} -Atc "select id from public.delivery_offers where delivery_id = '$delivery_id' and transporter_id = 'b8000000-0000-4000-8000-000000000002'")"

accept_offer() {
  local offer_id="$1" rider_user_id="$2" operation_id="$3"
  "${psql[@]}" -c "select public.accept_delivery_offer('$offer_id', '$rider_user_id', 2, '$operation_id')" >/dev/null
}

set +e
accept_offer "$offer_a" 08000000-0000-4000-8000-000000000001 d8000000-0000-4000-8000-000000000001 & first_pid=$!
accept_offer "$offer_b" 08000000-0000-4000-8000-000000000002 d8000000-0000-4000-8000-000000000002 & second_pid=$!
wait "$first_pid"; first_status=$?
wait "$second_pid"; second_status=$?
set -e

if [[ $((first_status + second_status)) -eq 0 || $first_status -ne 0 && $second_status -ne 0 ]]; then
  echo "expected exactly one concurrent offer acceptance to succeed" >&2
  exit 1
fi

result="$(${psql[@]} -Atc "
  select d.status || ':' || d.version || ':' ||
    (select count(*) from public.delivery_offers where delivery_id = d.id and status = 'accepted') || ':' ||
    (select count(*) from public.delivery_offers where delivery_id = d.id and status = 'withdrawn') || ':' ||
    (select count(*) from public.transporter_profiles where id in (
      'b8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000002'
    ) and availability = 'assigned') || ':' ||
    (select count(*) from public.delivery_offer_acceptance_operations where delivery_id = d.id)
  from public.deliveries d where d.id = '$delivery_id'
")"

if [[ "$result" != "assigned:3:1:1:1:1" ]]; then
  echo "atomic offer acceptance invariant failed: $result" >&2
  exit 1
fi

echo "concurrent offer acceptance passed: one winner, one withdrawal, one assignment"
