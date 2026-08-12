begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

insert into auth.users (id, aud, role, email) values
  ('06000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'phase6-rider@example.test'),
  ('06000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'phase6-other-rider@example.test'),
  ('06000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'phase6-consumer@example.test'),
  ('06000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'phase6-dispatcher@example.test'),
  ('06000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'phase6-pending-rider@example.test');

insert into public.markets (id, name, slug) values
  ('16000000-0000-4000-8000-000000000001', 'Phase 6 Market', 'phase-6-market');
insert into public.delivery_zones (id, market_id, name, delivery_fee_ugx) values
  ('26000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000001', 'Lunyo', 5000);
insert into public.consumer_addresses (id, consumer_id, label, summary, phone_number) values
  ('36000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000003', 'Home', 'Lunyo, Entebbe', '+256700000003');
insert into public.sellers (id, business_name, market_id, verification_status) values
  ('46000000-0000-4000-8000-000000000001', 'Phase 6 Seller', '16000000-0000-4000-8000-000000000001', 'approved');
insert into public.carts (id, consumer_id, market_id, status) values
  ('56000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000003', '16000000-0000-4000-8000-000000000001', 'converted');
insert into public.customer_checkouts (
  id, reference, consumer_id, cart_id, market_id, status, items_subtotal_ugx,
  delivery_fee_ugx, total_ugx, client_reference, reservation_expires_at
) values (
  '66000000-0000-4000-8000-000000000001', 'EK-2026-960001',
  '06000000-0000-4000-8000-000000000003', '56000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000001', 'paid', 10000, 5000, 15000,
  '76000000-0000-4000-8000-000000000001', now() + interval '15 minutes'
);
insert into public.checkout_fulfilments (
  checkout_id, type, schedule_type, delivery_zone_id, delivery_zone_name,
  address_id, address_label, address_summary, phone_number
) values (
  '66000000-0000-4000-8000-000000000001', 'delivery', 'immediate',
  '26000000-0000-4000-8000-000000000001', 'Lunyo',
  '36000000-0000-4000-8000-000000000001', 'Home', 'Lunyo, Entebbe', '+256700000003'
);
insert into public.vendor_orders (
  id, reference, checkout_id, seller_id, status, subtotal_ugx
) values
  ('86000000-0000-4000-8000-000000000001', 'EK-S-9600001', '66000000-0000-4000-8000-000000000001', '46000000-0000-4000-8000-000000000001', 'ready_for_pickup', 10000);

insert into public.delivery_groups (
  id, checkout_id, consumer_id, market_id, delivery_zone_id, delivery_address_id,
  delivery_zone_name, address_label, address_summary, phone_number
) values (
  '96000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001',
  '06000000-0000-4000-8000-000000000003', '16000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001', '36000000-0000-4000-8000-000000000001',
  'Lunyo', 'Home', 'Lunyo, Entebbe', '+256700000003'
);
insert into public.delivery_group_orders (delivery_group_id, seller_order_id) values
  ('96000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000001');

insert into public.transporter_profiles (
  id, user_id, display_name, verification_status, availability
) values
  ('a6000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000001', 'Joseph Rider', 'approved', 'offline'),
  ('a6000000-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000002', 'Sarah Rider', 'approved', 'assigned'),
  ('a6000000-0000-4000-8000-000000000005', '06000000-0000-4000-8000-000000000005', 'Pending Rider', 'pending', 'offline');

insert into public.deliveries (
  id, reference, delivery_group_id, status, fee_ugx
) values (
  'b6000000-0000-4000-8000-000000000001', 'DL-9600001',
  '96000000-0000-4000-8000-000000000001', 'unassigned', 5000
);

select is(
  (public.transition_delivery(
    'b6000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000004',
    'dispatcher', 'offering', 1, 'c6000000-0000-4000-8000-000000000001'
  )->>'status'),
  'offering',
  'an unassigned delivery can enter offering'
);
select is((select version from public.deliveries where id = 'b6000000-0000-4000-8000-000000000001'), 2, 'a transition increments the delivery version');
select is(
  (public.transition_delivery(
    'b6000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000004',
    'dispatcher', 'offering', 1, 'c6000000-0000-4000-8000-000000000001'
  )->>'duplicate'),
  'true',
  'an identical delivery operation replays safely'
);
select is((select count(*)::integer from public.delivery_status_history where delivery_id = 'b6000000-0000-4000-8000-000000000001'), 1, 'a replay does not duplicate delivery history');
select is((select count(*)::integer from public.delivery_audit_events where delivery_id = 'b6000000-0000-4000-8000-000000000001'), 1, 'a replay does not duplicate audit events');
select throws_ok($$select public.transition_delivery(
  'b6000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000004',
  'dispatcher', 'unassigned', 2, 'c6000000-0000-4000-8000-000000000001'
)$$, '23505', null, 'an operation ID cannot be reused with another transition payload');
select throws_ok($$select public.transition_delivery(
  'b6000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000004',
  'dispatcher', 'unassigned', 1, 'c6000000-0000-4000-8000-000000000002'
)$$, '40001', null, 'a stale delivery version is rejected');
select throws_ok($$select public.transition_delivery(
  'b6000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000004',
  'dispatcher', 'picked_up', 2, 'c6000000-0000-4000-8000-000000000003'
)$$, '23514', null, 'offering cannot jump to picked up');
select throws_ok($$select public.transition_delivery(
  'b6000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000004',
  'dispatcher', 'assigned', 2, 'c6000000-0000-4000-8000-000000000004'
)$$, '23514', 'DELIVERY_ASSIGNMENT_REQUIRED', 'assignment requires an assigned transporter');
select is(
  (public.transition_delivery(
    'b6000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000004',
    'dispatcher', 'unassigned', 2, 'c6000000-0000-4000-8000-000000000005'
  )->>'status'),
  'unassigned',
  'an exhausted offer wave can return to unassigned'
);

-- Assign through the future atomic-acceptance shape, then exercise rider-owned transitions.
update public.deliveries
set assigned_transporter_id = 'a6000000-0000-4000-8000-000000000002',
    status = 'assigned', version = 4, assigned_at = now()
where id = 'b6000000-0000-4000-8000-000000000001';

select throws_ok($$select public.transition_delivery(
  'b6000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000001',
  'rider', 'arrived_at_market', 4, 'c6000000-0000-4000-8000-000000000006'
)$$, '42501', null, 'a different rider cannot transition the delivery');
select is((public.transition_delivery(
  'b6000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000002',
  'rider', 'arrived_at_market', 4, 'c6000000-0000-4000-8000-000000000007'
)->>'status'), 'arrived_at_market', 'the assigned rider can arrive at market');
-- Pickup custody is covered in delivery_offers.sql; satisfy that invariant here so this
-- state-machine fixture can continue exercising later canonical transitions.
update public.delivery_pickups
set vendor_confirmed_by = '06000000-0000-4000-8000-000000000004',
    vendor_confirmed_at = now(),
    rider_confirmed_by = '06000000-0000-4000-8000-000000000002',
    rider_confirmed_at = now(),
    status = 'collected',
    collected_at = now()
where delivery_id = 'b6000000-0000-4000-8000-000000000001';
select is((public.transition_delivery(
  'b6000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000002',
  'rider', 'picked_up', 5, 'c6000000-0000-4000-8000-000000000008'
)->>'status'), 'picked_up', 'arrived at market can transition to picked up');
select is((public.transition_delivery(
  'b6000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000002',
  'rider', 'in_transit', 6, 'c6000000-0000-4000-8000-000000000009'
)->>'status'), 'in_transit', 'picked up can transition to in transit');
select is((public.transition_delivery(
  'b6000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000002',
  'rider', 'arrived_at_customer', 7, 'c6000000-0000-4000-8000-000000000010'
)->>'status'), 'arrived_at_customer', 'in transit can transition to arrived at customer');
select throws_ok($$select public.transition_delivery(
  'b6000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000002',
  'rider', 'delivered', 8, 'c6000000-0000-4000-8000-000000000011'
)$$, '23514', 'DELIVERY_PROOF_REQUIRED', 'delivered remains gated until evidence and consumer confirmation exist');
select is((select count(*)::integer from public.delivery_status_history where delivery_id = 'b6000000-0000-4000-8000-000000000001'), 6, 'each applied delivery transition has one history row');
select ok(
  not has_function_privilege('authenticated', 'public.transition_delivery(uuid,uuid,text,text,integer,uuid,text,jsonb)', 'EXECUTE'),
  'authenticated clients cannot call the delivery transition RPC directly'
);

select is((public.get_transporter_operational_state(
  '06000000-0000-4000-8000-000000000001'
)->>'eligibleForOffers'), 'false', 'a rider without a fresh location is not offer eligible');
select is((public.set_transporter_availability(
  '06000000-0000-4000-8000-000000000001', 'available',
  'd6000000-0000-4000-8000-000000000001'
)->>'availability'), 'available', 'an approved rider can go available');
select is((public.set_transporter_availability(
  '06000000-0000-4000-8000-000000000001', 'available',
  'd6000000-0000-4000-8000-000000000001'
)->>'duplicate'), 'true', 'an identical availability change replays safely');
select is((select count(*)::integer from public.transporter_availability_history where transporter_id = 'a6000000-0000-4000-8000-000000000001'), 1, 'availability replay does not duplicate history');
select throws_ok($$select public.set_transporter_availability(
  '06000000-0000-4000-8000-000000000001', 'offline',
  'd6000000-0000-4000-8000-000000000004'
)$$, 'P0001', 'AVAILABILITY_RATE_LIMITED', 'availability changes enforce a database cadence limit');
select throws_ok($$select public.set_transporter_availability(
  '06000000-0000-4000-8000-000000000005', 'available',
  'd6000000-0000-4000-8000-000000000002'
)$$, '42501', null, 'a pending rider cannot go available');
select throws_ok($$select public.set_transporter_availability(
  '06000000-0000-4000-8000-000000000002', 'available',
  'd6000000-0000-4000-8000-000000000003'
)$$, '23514', 'ACTIVE_DELIVERY_REQUIRES_SYSTEM_AVAILABILITY', 'an assigned rider cannot override system availability');

select is((public.update_transporter_location(
  '06000000-0000-4000-8000-000000000001', 0.0612, 32.4637, 35,
  now(), 'e6000000-0000-4000-8000-000000000001'
)->>'locationIsFresh'), 'true', 'an approved rider can submit a coarse current location');
select is((public.update_transporter_location(
  '06000000-0000-4000-8000-000000000001', 0.0612, 32.4637, 35,
  (select captured_at from public.transporter_location_operations where operation_id = 'e6000000-0000-4000-8000-000000000001'),
  'e6000000-0000-4000-8000-000000000001'
)->>'duplicate'), 'true', 'an identical location operation replays despite the cadence limit');
select is((public.get_transporter_operational_state(
  '06000000-0000-4000-8000-000000000001'
)->>'eligibleForOffers'), 'true', 'an available approved rider with fresh location is offer eligible');
select throws_ok($$select public.update_transporter_location(
  '06000000-0000-4000-8000-000000000001', 0.0613, 32.4638, 30,
  now(), 'e6000000-0000-4000-8000-000000000002'
)$$, 'P0001', 'LOCATION_RATE_LIMITED', 'location updates enforce the database cadence limit');
select throws_ok($$select public.update_transporter_location(
  '06000000-0000-4000-8000-000000000001', 0.0613, 32.4638, 501,
  now(), 'e6000000-0000-4000-8000-000000000003'
)$$, '22023', null, 'unacceptably inaccurate locations are rejected');
select throws_ok($$select public.update_transporter_location(
  '06000000-0000-4000-8000-000000000001', 0.0613, 32.4638, 30,
  now() - interval '16 minutes', 'e6000000-0000-4000-8000-000000000004'
)$$, '22023', null, 'stale captured locations are rejected');

update public.transporter_locations_current
set received_at = now() - interval '11 minutes'
where transporter_id = 'a6000000-0000-4000-8000-000000000001';
select is((public.get_transporter_operational_state(
  '06000000-0000-4000-8000-000000000001'
)->>'eligibleForOffers'), 'false', 'a location older than ten minutes removes an available rider from offer eligibility');
select ok(
  not has_function_privilege('authenticated', 'public.update_transporter_location(uuid,numeric,numeric,numeric,timestamp with time zone,uuid)', 'EXECUTE'),
  'authenticated clients cannot bypass the rider location API'
);

select * from finish();
rollback;
