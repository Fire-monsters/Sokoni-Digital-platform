#!/usr/bin/env bash
set -euo pipefail

database_url="${1:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
psql=(psql "$database_url" -X -v ON_ERROR_STOP=1 -q)

"${psql[@]}" <<'SQL'
insert into auth.users (id, aud, role, email) values
  ('03000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'race-a@example.test'),
  ('03000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'race-b@example.test');
insert into public.markets (id, name, slug) values ('13000000-0000-4000-8000-000000000001', 'Race Market', 'race-market');
insert into public.categories (id, name, slug) values ('23000000-0000-4000-8000-000000000001', 'Race Produce', 'race-produce');
insert into public.catalog_products (id, category_id, name, slug) values ('33000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', 'Race Tomatoes', 'race-tomatoes');
insert into public.sellers (id, business_name, market_id, verification_status) values ('43000000-0000-4000-8000-000000000001', 'Race Seller', '13000000-0000-4000-8000-000000000001', 'approved');
insert into public.listings (id, seller_id, catalog_product_id, package_quantity, package_unit, approved_price_ugx, status, stock_on_hand)
values ('53000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 1, 'kg', 4000, 'active', 5);
insert into public.consumer_addresses (id, consumer_id, label, summary, phone_number) values
  ('73000000-0000-4000-8000-000000000001', '03000000-0000-4000-8000-000000000001', 'Contact', 'Race A', '+256700000001'),
  ('73000000-0000-4000-8000-000000000002', '03000000-0000-4000-8000-000000000002', 'Contact', 'Race B', '+256700000002');
insert into public.carts (id, consumer_id, market_id) values
  ('83000000-0000-4000-8000-000000000001', '03000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001'),
  ('83000000-0000-4000-8000-000000000002', '03000000-0000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000001');
insert into public.cart_items (cart_id, listing_id, quantity, price_snapshot_ugx, listing_version) values
  ('83000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 3, 4000, 1),
  ('83000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000001', 3, 4000, 1);
SQL

checkout() {
  local consumer_id="$1" cart_id="$2" address_id="$3" reference="$4"
  "${psql[@]}" -c "select public.create_checkout_from_cart('$consumer_id', '$cart_id', 'market_pickup', null, '$address_id', '13000000-0000-4000-8000-000000000001', 'immediate', null, '$reference', 15)" >/dev/null
}

set +e
checkout 03000000-0000-4000-8000-000000000001 83000000-0000-4000-8000-000000000001 73000000-0000-4000-8000-000000000001 93000000-0000-4000-8000-000000000001 & first_pid=$!
checkout 03000000-0000-4000-8000-000000000002 83000000-0000-4000-8000-000000000002 73000000-0000-4000-8000-000000000002 93000000-0000-4000-8000-000000000002 & second_pid=$!
wait "$first_pid"; first_status=$?
wait "$second_pid"; second_status=$?
set -e

if [[ $((first_status + second_status)) -eq 0 || $first_status -ne 0 && $second_status -ne 0 ]]; then
  echo "expected exactly one concurrent checkout to succeed" >&2
  exit 1
fi

result="$(${psql[@]} -Atc "select stock_reserved || ':' || stock_on_hand || ':' || (select count(*) from public.customer_checkouts) from public.listings where id = '53000000-0000-4000-8000-000000000001'")"
if [[ "$result" != "3:5:1" ]]; then
  echo "oversell invariant failed: $result" >&2
  exit 1
fi
echo "concurrent checkout passed: one success, one rejection, stock 3/5 reserved"
