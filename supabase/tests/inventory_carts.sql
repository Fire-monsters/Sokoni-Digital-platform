begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select has_column('public', 'listings', 'stock_on_hand', 'listings track package stock');
select has_column('public', 'listings', 'stock_available', 'available stock is generated');
select has_index('public', 'listings', 'listings_available_inventory_idx', 'available inventory is indexed');
select has_table('public', 'carts', 'carts exist');
select has_table('public', 'cart_items', 'cart items exist');
select has_index('public', 'carts', 'carts_one_active_consumer_market_idx', 'active consumer carts are unique');

insert into public.markets (id, name, slug) values
  ('11000000-0000-4000-8000-000000000001', 'Cart Test Market', 'cart-test');
insert into public.categories (id, name, slug) values
  ('21000000-0000-4000-8000-000000000001', 'Cart Test Category', 'cart-test');
insert into public.catalog_products (id, category_id, name, slug) values
  ('31000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Beans', 'cart-test-beans');
insert into public.sellers (id, business_name, market_id, verification_status) values
  ('41000000-0000-4000-8000-000000000001', 'Cart Test Seller', '11000000-0000-4000-8000-000000000001', 'approved');
insert into public.listings (id, seller_id, catalog_product_id, package_quantity, package_unit,
  approved_price_ugx, status, stock_on_hand)
values ('51000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001', 1, 'kg', 5000, 'active', 5);

select is((select stock_available from public.listings where id = '51000000-0000-4000-8000-000000000001'), 5, 'available stock is derived');
select is((select availability::text from public.listings where id = '51000000-0000-4000-8000-000000000001'), 'available', 'availability follows stock');
update public.listings set stock_reserved = 3 where id = '51000000-0000-4000-8000-000000000001';
select is((select availability::text from public.listings where id = '51000000-0000-4000-8000-000000000001'), 'low_stock', 'threshold derives low stock');
select throws_ok($$ update public.listings set stock_reserved = 6 where id = '51000000-0000-4000-8000-000000000001' $$, '23514', null, 'reserved stock cannot exceed on-hand stock');

select lives_ok($$ select public.get_or_create_cart(
  '11000000-0000-4000-8000-000000000001', null,
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '71000000-0000-4000-8000-000000000001') $$, 'guest cart is created through the ownership boundary');
select is((select count(*)::integer from public.carts), 1, 'get-or-create does not duplicate carts');
select lives_ok($$ select public.get_or_create_cart(
  '11000000-0000-4000-8000-000000000001', null,
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '71000000-0000-4000-8000-000000000001') $$, 'guest cart retrieval is idempotent');

update public.listings set stock_reserved = 0 where id = '51000000-0000-4000-8000-000000000001';
select lives_ok($$ select public.mutate_cart_item(
  (select id from public.carts limit 1), '51000000-0000-4000-8000-000000000001', 2,
  null, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '71000000-0000-4000-8000-000000000001', null,
  '81000000-0000-4000-8000-000000000001') $$, 'cart mutation succeeds');
select lives_ok($$ select public.mutate_cart_item(
  (select id from public.carts limit 1), '51000000-0000-4000-8000-000000000001', 2,
  null, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '71000000-0000-4000-8000-000000000001', null,
  '81000000-0000-4000-8000-000000000001') $$, 'cart mutation retry is idempotent');
select is(
  (select version from public.carts limit 1), 2,
  'retrying an operation id does not increment the cart twice'
);

select * from finish();
rollback;
