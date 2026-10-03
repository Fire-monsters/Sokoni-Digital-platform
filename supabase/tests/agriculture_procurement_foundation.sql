-- Standalone PostgreSQL assertions. Fixtures are rolled back.
begin;
create function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'Assertion failed: %', message; end if;
end;
$$;
create function pg_temp.expect_error(statement text, expected text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected then return; end if;
    raise;
  end;
  raise exception 'Expected SQLSTATE % for %', expected, statement;
end;
$$;

insert into auth.users(id, phone_confirmed_at) values
  ('ac000000-0000-4000-8000-000000000001', now()),
  ('ac000000-0000-4000-8000-000000000002', now()),
  ('ac000000-0000-4000-8000-000000000003', now());
insert into public.businesses(id, owner_id, kind, name, location, status) values
  ('ac000000-0000-4000-8000-000000000011', 'ac000000-0000-4000-8000-000000000001', 'farmer', 'Maize Farm', 'Kampala', 'approved'),
  ('ac000000-0000-4000-8000-000000000012', 'ac000000-0000-4000-8000-000000000002', 'warehouse', 'Central Warehouse', 'Kampala', 'approved'),
  ('ac000000-0000-4000-8000-000000000013', 'ac000000-0000-4000-8000-000000000003', 'farmer', 'Pending Farm', 'Jinja', 'draft');
insert into public.business_memberships(business_id, user_id, role) values
  ('ac000000-0000-4000-8000-000000000011', 'ac000000-0000-4000-8000-000000000001', 'owner'),
  ('ac000000-0000-4000-8000-000000000012', 'ac000000-0000-4000-8000-000000000002', 'owner');

do $$
declare
  maize uuid;
  listing_id uuid;
  offer_id uuid;
  po_id uuid;
  operation_id uuid := gen_random_uuid();
begin
  select id into maize from public.agricultural_products where slug = 'maize';
  perform pg_temp.expect_error(format(
    'insert into public.farmer_listings(farmer_business_id,product_id,quantity_kg,location,status,published_at) values (%L,%L,1000,%L,%L,now())',
    'ac000000-0000-4000-8000-000000000013', maize, 'Jinja', 'published'
  ), '23514');
  insert into public.farmer_listings(
    farmer_business_id, product_id, quantity_kg, location,
    asking_price_ugx_per_kg, status, published_at
  ) values (
    'ac000000-0000-4000-8000-000000000011', maize, 1000, 'Kampala',
    1200, 'published', now()
  ) returning id into listing_id;
  perform pg_temp.assert_true((select count(*) = 1 from public.business_applications
    where id = 'ac000000-0000-4000-8000-000000000011' and status = 'approved'),
    'business application view reflects business state');
  perform pg_temp.assert_true((select not public from storage.buckets
    where id = 'farmer-listing-photos'), 'listing photo bucket is private');

  insert into public.procurement_offers(
    listing_id, farmer_business_id, warehouse_business_id, product_id,
    quantity_kg, terms
  ) values (
    listing_id, 'ac000000-0000-4000-8000-000000000011',
    'ac000000-0000-4000-8000-000000000012', maize, 1000,
    'Delivery to Central Warehouse'
  ) returning id into offer_id;
  perform pg_temp.expect_error(format(
    'update public.procurement_offers set status=%L,submitted_at=now() where id=%L',
    'submitted', offer_id
  ), '23514');
  insert into public.procurement_offer_grade_prices(offer_id, grade, price_ugx_per_kg)
  values (offer_id, 'A', 1500), (offer_id, 'B', 1200), (offer_id, 'C', 900);
  update public.procurement_offers set status = 'submitted', submitted_at = now()
  where id = offer_id;
  perform pg_temp.expect_error(format(
    'update public.procurement_offer_grade_prices set price_ugx_per_kg=1 where offer_id=%L and grade=%L',
    offer_id, 'A'
  ), '23514');
  update public.procurement_offers set status = 'accepted', decided_at = now()
  where id = offer_id;
  update public.businesses set status = 'suspended'
  where id = 'ac000000-0000-4000-8000-000000000011';
  perform pg_temp.expect_error(format(
    'select public.create_purchase_order_from_offer(%L,%L,%L)',
    'ac000000-0000-4000-8000-000000000002', offer_id, operation_id
  ), '23514');
  update public.businesses set status = 'approved'
  where id = 'ac000000-0000-4000-8000-000000000011';
  perform pg_temp.expect_error(format(
    'select public.create_purchase_order_from_offer(%L,%L,%L)',
    'ac000000-0000-4000-8000-000000000003', offer_id, gen_random_uuid()
  ), '42501');
  po_id := public.create_purchase_order_from_offer(
    'ac000000-0000-4000-8000-000000000002', offer_id, operation_id);
  perform pg_temp.assert_true(po_id = public.create_purchase_order_from_offer(
    'ac000000-0000-4000-8000-000000000002', offer_id, operation_id),
    'same operation returns the purchase order');
  perform pg_temp.expect_error(format(
    'select public.create_purchase_order_from_offer(%L,%L,%L)',
    'ac000000-0000-4000-8000-000000000002', offer_id, gen_random_uuid()
  ), '23505');
  perform pg_temp.assert_true((select count(*) = 3 from public.purchase_order_grade_prices p
    join public.purchase_order_lines l on l.id = p.purchase_order_line_id
    where l.purchase_order_id = po_id), 'all grade prices copied');
  perform pg_temp.assert_true((select ordered_quantity_kg = 1000 and product_id = maize
    from public.purchase_order_lines where purchase_order_id = po_id),
    'quantity and product copied');
  perform pg_temp.assert_true((select offer_terms = 'Delivery to Central Warehouse'
    from public.purchase_orders where id = po_id), 'commercial terms copied');
  perform pg_temp.assert_true((select price_ugx_per_kg = 1500
    from public.purchase_order_grade_prices p
    join public.purchase_order_lines l on l.id = p.purchase_order_line_id
    where l.purchase_order_id = po_id and p.grade = 'A'),
    'accepted price copied');
  perform pg_temp.expect_error(format(
    'update public.purchase_order_lines set ordered_quantity_kg=1 where purchase_order_id=%L',
    po_id
  ), '23514');
  perform pg_temp.assert_true((select count(*) = 1 from public.purchase_order_status_history
    where purchase_order_id = po_id and new_status = 'open'),
    'purchase order creation is audited');
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ac000000-0000-4000-8000-000000000001', true);
do $$
begin
  perform pg_temp.assert_true(not has_table_privilege('authenticated',
    'public.procurement_offers', 'SELECT'), 'clients cannot read offers directly');
  perform pg_temp.assert_true(not has_function_privilege('authenticated',
    'public.create_purchase_order_from_offer(uuid,uuid,uuid)', 'EXECUTE'),
    'clients cannot create purchase orders directly');
  perform pg_temp.assert_true(not has_table_privilege('service_role',
    'public.purchase_orders', 'INSERT'),
    'service role creates orders only through the database function');
end;
$$;
reset role;
select '1..1';
select 'ok 1 - procurement schema, approval gate, offer prices, PO snapshot, replay and access';
rollback;
