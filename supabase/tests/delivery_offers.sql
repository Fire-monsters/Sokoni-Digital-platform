begin;
create extension if not exists pgtap with schema extensions;
select plan(87);

insert into auth.users (id, aud, role, email) values
  ('07000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'offers-rider-a@example.test'),
  ('07000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'offers-rider-b@example.test'),
  ('07000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'offers-rider-stale@example.test'),
  ('07000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'offers-rider-far@example.test'),
  ('07000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'offers-consumer@example.test'),
  ('07000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'offers-vendor@example.test'),
  ('07000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'offers-vendor-two@example.test');

insert into public.markets (id, name, slug, latitude, longitude) values
  ('17000000-0000-4000-8000-000000000001', 'Offers Market', 'offers-market', 0.061200, 32.463700);
insert into public.delivery_zones (id, market_id, name, delivery_fee_ugx) values
  ('27000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000001', 'Lunyo', 5000);
insert into public.consumer_addresses (id, consumer_id, label, summary, phone_number) values
  ('37000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000005', 'Home', 'Lunyo, Entebbe', '+256700000005');
insert into public.sellers (id, business_name, market_id, verification_status) values
  ('47000000-0000-4000-8000-000000000001', 'Offers Seller', '17000000-0000-4000-8000-000000000001', 'approved'),
  ('47000000-0000-4000-8000-000000000002', 'Offers Seller Two', '17000000-0000-4000-8000-000000000001', 'approved');
insert into public.seller_accounts (seller_id, user_id) values
  ('47000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000006'),
  ('47000000-0000-4000-8000-000000000002', '07000000-0000-4000-8000-000000000007');
insert into public.carts (id, consumer_id, market_id, status) values
  ('57000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000005', '17000000-0000-4000-8000-000000000001', 'converted'),
  ('57000000-0000-4000-8000-000000000002', '07000000-0000-4000-8000-000000000005', '17000000-0000-4000-8000-000000000001', 'converted'),
  ('57000000-0000-4000-8000-000000000003', '07000000-0000-4000-8000-000000000005', '17000000-0000-4000-8000-000000000001', 'converted');
insert into public.customer_checkouts (
  id, reference, consumer_id, cart_id, market_id, status, items_subtotal_ugx,
  delivery_fee_ugx, total_ugx, client_reference, reservation_expires_at
) values
  ('67000000-0000-4000-8000-000000000001', 'EK-2026-970001', '07000000-0000-4000-8000-000000000005', '57000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000001', 'paid', 10000, 5000, 15000, '77000000-0000-4000-8000-000000000001', now() + interval '15 minutes'),
  ('67000000-0000-4000-8000-000000000002', 'EK-2026-970002', '07000000-0000-4000-8000-000000000005', '57000000-0000-4000-8000-000000000002', '17000000-0000-4000-8000-000000000001', 'paid', 8000, 5000, 13000, '77000000-0000-4000-8000-000000000002', now() + interval '15 minutes'),
  ('67000000-0000-4000-8000-000000000003', 'EK-2026-970003', '07000000-0000-4000-8000-000000000005', '57000000-0000-4000-8000-000000000003', '17000000-0000-4000-8000-000000000001', 'paid', 7000, 5000, 12000, '77000000-0000-4000-8000-000000000003', now() + interval '15 minutes');
insert into public.checkout_fulfilments (
  checkout_id, type, schedule_type, delivery_zone_id, delivery_zone_name,
  address_id, address_label, address_summary, phone_number
) values
  ('67000000-0000-4000-8000-000000000001', 'delivery', 'immediate', '27000000-0000-4000-8000-000000000001', 'Lunyo', '37000000-0000-4000-8000-000000000001', 'Home', 'Lunyo, Entebbe', '+256700000005'),
  ('67000000-0000-4000-8000-000000000002', 'delivery', 'immediate', '27000000-0000-4000-8000-000000000001', 'Lunyo', '37000000-0000-4000-8000-000000000001', 'Home', 'Lunyo, Entebbe', '+256700000005'),
  ('67000000-0000-4000-8000-000000000003', 'delivery', 'immediate', '27000000-0000-4000-8000-000000000001', 'Lunyo', '37000000-0000-4000-8000-000000000001', 'Home', 'Lunyo, Entebbe', '+256700000005');
insert into public.vendor_orders (
  id, reference, checkout_id, seller_id, status, subtotal_ugx
) values
  ('87000000-0000-4000-8000-000000000001', 'EK-S-9700001', '67000000-0000-4000-8000-000000000001', '47000000-0000-4000-8000-000000000001', 'ready_for_pickup', 10000),
  ('87000000-0000-4000-8000-000000000004', 'EK-S-9700004', '67000000-0000-4000-8000-000000000001', '47000000-0000-4000-8000-000000000002', 'ready_for_pickup', 6000),
  ('87000000-0000-4000-8000-000000000002', 'EK-S-9700002', '67000000-0000-4000-8000-000000000002', '47000000-0000-4000-8000-000000000001', 'ready_for_pickup', 8000),
  ('87000000-0000-4000-8000-000000000003', 'EK-S-9700003', '67000000-0000-4000-8000-000000000003', '47000000-0000-4000-8000-000000000001', 'ready_for_pickup', 7000);
insert into public.delivery_groups (
  id, checkout_id, consumer_id, market_id, delivery_zone_id, delivery_address_id,
  delivery_zone_name, address_label, address_summary, phone_number
) values
  ('97000000-0000-4000-8000-000000000001', '67000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000005', '17000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', '37000000-0000-4000-8000-000000000001', 'Lunyo', 'Home', 'Lunyo, Entebbe', '+256700000005'),
  ('97000000-0000-4000-8000-000000000002', '67000000-0000-4000-8000-000000000002', '07000000-0000-4000-8000-000000000005', '17000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', '37000000-0000-4000-8000-000000000001', 'Lunyo', 'Home', 'Lunyo, Entebbe', '+256700000005'),
  ('97000000-0000-4000-8000-000000000003', '67000000-0000-4000-8000-000000000003', '07000000-0000-4000-8000-000000000005', '17000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', '37000000-0000-4000-8000-000000000001', 'Lunyo', 'Home', 'Lunyo, Entebbe', '+256700000005');
insert into public.delivery_group_orders (delivery_group_id, seller_order_id) values
  ('97000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001'),
  ('97000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000004'),
  ('97000000-0000-4000-8000-000000000002', '87000000-0000-4000-8000-000000000002'),
  ('97000000-0000-4000-8000-000000000003', '87000000-0000-4000-8000-000000000003');
insert into public.deliveries (id, reference, delivery_group_id, fee_ugx) values
  ('a7000000-0000-4000-8000-000000000001', 'DL-9700001', '97000000-0000-4000-8000-000000000001', 5000),
  ('a7000000-0000-4000-8000-000000000002', 'DL-9700002', '97000000-0000-4000-8000-000000000002', 5000),
  ('a7000000-0000-4000-8000-000000000003', 'DL-9700003', '97000000-0000-4000-8000-000000000003', 5000);

insert into public.transporter_profiles (
  id, user_id, display_name, verification_status, availability
) values
  ('b7000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000001', 'Nearby Rider A', 'approved', 'available'),
  ('b7000000-0000-4000-8000-000000000002', '07000000-0000-4000-8000-000000000002', 'Nearby Rider B', 'approved', 'available'),
  ('b7000000-0000-4000-8000-000000000003', '07000000-0000-4000-8000-000000000003', 'Stale Rider', 'approved', 'available'),
  ('b7000000-0000-4000-8000-000000000004', '07000000-0000-4000-8000-000000000004', 'Far Rider', 'approved', 'available');
insert into public.transporter_locations_current (
  transporter_id, latitude, longitude, accuracy_meters, captured_at, received_at
) values
  ('b7000000-0000-4000-8000-000000000001', 0.061200, 32.463700, 20, now(), now()),
  ('b7000000-0000-4000-8000-000000000002', 0.070000, 32.463700, 25, now(), now()),
  ('b7000000-0000-4000-8000-000000000003', 0.062000, 32.463700, 25, now() - interval '11 minutes', now() - interval '11 minutes'),
  ('b7000000-0000-4000-8000-000000000004', 0.200000, 32.463700, 25, now(), now());

select ok(public.haversine_distance_km(0.0612, 32.4637, 0.0612, 32.4637) < 0.001, 'distance is zero for the same coordinate');
select is((select count(*)::integer from public.find_nearby_transporters('a7000000-0000-4000-8000-000000000001', 5, 20)), 2, 'candidate search excludes stale and out-of-radius riders');
select is((select transporter_id from public.find_nearby_transporters('a7000000-0000-4000-8000-000000000001', 5, 20) limit 1), 'b7000000-0000-4000-8000-000000000001'::uuid, 'candidate search ranks the nearest rider first');
select throws_ok($$select public.offer_delivery_to_nearby_transporters(
  'a7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000099', 5, 2, 10
)$$, '22023', null, 'offer TTL cannot be shorter than fifteen seconds');

select is((public.offer_delivery_to_nearby_transporters(
  'a7000000-0000-4000-8000-000000000001',
  'c7000000-0000-4000-8000-000000000001', 5, 2, 45
)->>'offeredCount'), '2', 'the first wave offers the two nearest eligible riders');
select is((select status::text from public.deliveries where id = 'a7000000-0000-4000-8000-000000000001'), 'offering', 'an offer wave moves the delivery to offering');
select is((select version from public.deliveries where id = 'a7000000-0000-4000-8000-000000000001'), 2, 'starting the first wave increments delivery version');
select is((select count(*)::integer from public.delivery_offers where delivery_id = 'a7000000-0000-4000-8000-000000000001' and status = 'pending'), 2, 'wave creation stores two pending offers');
select is((select count(*)::integer from public.transporter_profiles where id in ('b7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002') and availability = 'offer_pending'), 2, 'offered riders become offer pending');
select is((select count(*)::integer from public.notification_events where event_type = 'delivery.offer_created' and payload->>'deliveryId' = 'a7000000-0000-4000-8000-000000000001'), 2, 'each offer enqueues one rider notification');
select is((select count(*)::integer from public.notification_deliveries delivery join public.notification_events event on event.id = delivery.event_id where event.event_type = 'delivery.offer_created' and event.payload->>'deliveryId' = 'a7000000-0000-4000-8000-000000000001'), 2, 'each offer notification has push delivery work');
select is((public.get_current_delivery_offer('07000000-0000-4000-8000-000000000001')->>'deliveryId'), 'a7000000-0000-4000-8000-000000000001', 'the rider sees only their current pending offer');
select is((public.offer_delivery_to_nearby_transporters(
  'a7000000-0000-4000-8000-000000000001',
  'c7000000-0000-4000-8000-000000000001', 5, 2, 45
)->>'duplicate'), 'true', 'an identical offer-wave operation safely replays');
select throws_ok($$select public.offer_delivery_to_nearby_transporters(
  'a7000000-0000-4000-8000-000000000001',
  'c7000000-0000-4000-8000-000000000002', 7, 2, 45
)$$, '23514', null, 'another wave cannot start while pending offers remain');

select throws_ok(format($query$select public.accept_delivery_offer(
  %L, '07000000-0000-4000-8000-000000000002', 2,
  'd7000000-0000-4000-8000-000000000001'
)$query$, (select id from public.delivery_offers where delivery_id = 'a7000000-0000-4000-8000-000000000001' and transporter_id = 'b7000000-0000-4000-8000-000000000001')), '42501', null, 'a rider cannot accept another rider offer');
select throws_ok(format($query$select public.accept_delivery_offer(
  %L, '07000000-0000-4000-8000-000000000001', 1,
  'd7000000-0000-4000-8000-000000000002'
)$query$, (select id from public.delivery_offers where delivery_id = 'a7000000-0000-4000-8000-000000000001' and transporter_id = 'b7000000-0000-4000-8000-000000000001')), '40001', null, 'acceptance rejects a stale delivery version');
select is((public.accept_delivery_offer(
  (select id from public.delivery_offers where delivery_id = 'a7000000-0000-4000-8000-000000000001' and transporter_id = 'b7000000-0000-4000-8000-000000000001'),
  '07000000-0000-4000-8000-000000000001', 2,
  'd7000000-0000-4000-8000-000000000003'
)->>'status'), 'assigned', 'a pending unexpired offer atomically assigns the rider');
select is((select assigned_transporter_id from public.deliveries where id = 'a7000000-0000-4000-8000-000000000001'), 'b7000000-0000-4000-8000-000000000001'::uuid, 'the accepted rider owns the delivery assignment');
select is((select version from public.deliveries where id = 'a7000000-0000-4000-8000-000000000001'), 3, 'acceptance increments delivery version');
select is((select status::text from public.delivery_offers where delivery_id = 'a7000000-0000-4000-8000-000000000001' and transporter_id = 'b7000000-0000-4000-8000-000000000001'), 'accepted', 'the selected offer is accepted');
select is((select status::text from public.delivery_offers where delivery_id = 'a7000000-0000-4000-8000-000000000001' and transporter_id = 'b7000000-0000-4000-8000-000000000002'), 'withdrawn', 'the competing pending offer is withdrawn');
select is((select availability::text from public.transporter_profiles where id = 'b7000000-0000-4000-8000-000000000001'), 'assigned', 'the winner availability becomes assigned');
select is((select availability::text from public.transporter_profiles where id = 'b7000000-0000-4000-8000-000000000002'), 'available', 'the competing rider returns to available');
select is((select count(*)::integer from public.delivery_status_history where delivery_id = 'a7000000-0000-4000-8000-000000000001'), 2, 'wave start and acceptance both write delivery history');
select is((public.accept_delivery_offer(
  (select id from public.delivery_offers where delivery_id = 'a7000000-0000-4000-8000-000000000001' and transporter_id = 'b7000000-0000-4000-8000-000000000001'),
  '07000000-0000-4000-8000-000000000001', 2,
  'd7000000-0000-4000-8000-000000000003'
)->>'duplicate'), 'true', 'an identical acceptance safely replays');
select is((select count(*)::integer from public.notification_events where entity_id = 'a7000000-0000-4000-8000-000000000001' and event_type in ('delivery.offer_accepted', 'delivery.rider_assigned')), 2, 'acceptance notifies the rider and consumer');
select is((select count(*)::integer from public.delivery_pickups where delivery_id = 'a7000000-0000-4000-8000-000000000001'), 2, 'assignment initializes one checklist row per seller order');
select is((public.get_current_rider_delivery('07000000-0000-4000-8000-000000000001')->>'reference'), 'DL-9700001', 'the assigned rider can reload the current delivery');
select is((public.transition_delivery(
  'a7000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000001',
  'rider', 'arrived_at_market', 3, 'd7000000-0000-4000-8000-000000000010'
)->>'status'), 'arrived_at_market', 'the rider records arrival at the market');
select throws_ok($$select public.transition_delivery(
  'a7000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000001',
  'rider', 'picked_up', 4, 'd7000000-0000-4000-8000-000000000011'
)$$, '23514', 'ALL_PICKUPS_REQUIRED', 'picked up is blocked until every seller handover is complete');
select is((public.confirm_delivery_pickup(
  '87000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000006',
  'vendor', 'd7000000-0000-4000-8000-000000000012'
)->>'status'), 'pending', 'vendor confirmation alone does not transfer custody');
select is((public.confirm_delivery_pickup(
  '87000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000006',
  'vendor', 'd7000000-0000-4000-8000-000000000012'
)->>'duplicate'), 'true', 'vendor handover confirmation safely replays');
select is((public.confirm_delivery_pickup(
  '87000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000001',
  'rider', 'd7000000-0000-4000-8000-000000000013'
)->>'status'), 'collected', 'rider confirmation completes the seller handover');
select is((select count(*)::integer from public.delivery_pickups where delivery_id = 'a7000000-0000-4000-8000-000000000001' and status = 'collected'), 1, 'one collected seller does not complete a multi-seller pickup');
select throws_ok($$select public.transition_delivery(
  'a7000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000001',
  'rider', 'picked_up', 4, 'd7000000-0000-4000-8000-000000000017'
)$$, '23514', 'ALL_PICKUPS_REQUIRED', 'every seller in a multi-seller delivery must hand over');
select is((public.confirm_delivery_pickup(
  '87000000-0000-4000-8000-000000000004', '07000000-0000-4000-8000-000000000007',
  'vendor', 'd7000000-0000-4000-8000-000000000018'
)->>'vendorConfirmed'), 'true', 'the second vendor confirms their separate order');
select is((public.confirm_delivery_pickup(
  '87000000-0000-4000-8000-000000000004', '07000000-0000-4000-8000-000000000001',
  'rider', 'd7000000-0000-4000-8000-000000000019'
)->>'status'), 'collected', 'the rider collects the second seller order');
select is((select count(*)::integer from public.delivery_pickups where delivery_id = 'a7000000-0000-4000-8000-000000000001' and status = 'collected'), 2, 'all multi-seller checklist rows are collected');
select is((public.transition_delivery(
  'a7000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000001',
  'rider', 'picked_up', 4, 'd7000000-0000-4000-8000-000000000014'
)->>'status'), 'picked_up', 'all collected seller orders allow picked up');
select is((public.transition_delivery(
  'a7000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000001',
  'rider', 'in_transit', 5, 'd7000000-0000-4000-8000-000000000015'
)->>'status'), 'in_transit', 'the rider starts transit with a versioned update');
select is((public.transition_delivery(
  'a7000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000001',
  'rider', 'arrived_at_customer', 6, 'd7000000-0000-4000-8000-000000000016'
)->>'status'), 'arrived_at_customer', 'the rider records customer arrival');
select is((select count(*)::integer from public.notification_events where entity_id = 'a7000000-0000-4000-8000-000000000001' and event_type = 'delivery.status_changed'), 4, 'each rider progress step enqueues one consumer notification');
select throws_ok($$select public.complete_delivery(
  'a7000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000001',
  7, 'd7000000-0000-4000-8000-000000000030'
)$$, '23514', 'DELIVERY_PROOF_REQUIRED', 'completion is blocked before PIN and evidence');
create temporary table delivery_pin_context (pin text not null);
insert into delivery_pin_context (pin)
select public.rotate_delivery_pin(
  'a7000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000005'
)->>'pin';
select matches((select pin from delivery_pin_context), '^[0-9]{6}$', 'the consumer receives a six-digit delivery PIN');
select isnt(
  (select pin_hash from public.delivery_confirmations where delivery_id = 'a7000000-0000-4000-8000-000000000001'),
  (select pin from delivery_pin_context),
  'only a PIN hash is persisted'
);
select is((public.confirm_delivery_consumer_pin(
  'a7000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000001',
  (select case when pin = '000000' then '111111' else '000000' end from delivery_pin_context),
  'd7000000-0000-4000-8000-000000000031'
)->>'remainingAttempts'), '4', 'an incorrect PIN consumes one persisted attempt');
select is((public.confirm_delivery_consumer_pin(
  'a7000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000001',
  (select pin from delivery_pin_context), 'd7000000-0000-4000-8000-000000000032'
)->>'confirmed'), 'true', 'the assigned rider can confirm the consumer PIN');
select is((public.confirm_delivery_consumer_pin(
  'a7000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000001',
  (select pin from delivery_pin_context), 'd7000000-0000-4000-8000-000000000032'
)->>'duplicate'), 'true', 'PIN confirmation safely replays');
select throws_ok($$select public.complete_delivery(
  'a7000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000001',
  7, 'd7000000-0000-4000-8000-000000000033'
)$$, '23514', 'DELIVERY_PROOF_REQUIRED', 'PIN confirmation alone cannot complete delivery');
select is((public.ensure_delivery_proof(
  'a7000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000001',
  'e7000000-0000-4000-8000-000000000001'
)->>'transporterId'), 'b7000000-0000-4000-8000-000000000001', 'proof is bound to the assigned rider');
select is((public.create_delivery_proof_image_intent(
  'a7000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000001',
  'e7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000002',
  'a7000000-0000-4000-8000-000000000001/b7000000-0000-4000-8000-000000000001/e7000000-0000-4000-8000-000000000002/original.jpg',
  'a7000000-0000-4000-8000-000000000001/b7000000-0000-4000-8000-000000000001/e7000000-0000-4000-8000-000000000002/thumbnail.jpg',
  'image/jpeg', 120000, 960, 720, now(), 0.0612, 32.4637, 25
)->>'duplicate'), 'false', 'valid proof metadata creates an upload intent');
select is((public.finalize_delivery_proof_image(
  'a7000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000001',
  'e7000000-0000-4000-8000-000000000002',
  'a7000000-0000-4000-8000-000000000001/b7000000-0000-4000-8000-000000000001/e7000000-0000-4000-8000-000000000002/original.jpg',
  'a7000000-0000-4000-8000-000000000001/b7000000-0000-4000-8000-000000000001/e7000000-0000-4000-8000-000000000002/thumbnail.jpg',
  'image/jpeg', 120000, 960, 720
)->>'status'), 'ready', 'finalized proof metadata becomes valid evidence');
select is((public.complete_delivery(
  'a7000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000001',
  7, 'd7000000-0000-4000-8000-000000000034'
)->>'status'), 'delivered', 'PIN and ready proof permit atomic completion');
select is((select count(*)::integer from public.notification_events where entity_id = 'a7000000-0000-4000-8000-000000000001' and event_type = 'delivery.completed'), 1, 'completion enqueues one consumer notification');
select is((select availability::text from public.transporter_profiles where id = 'b7000000-0000-4000-8000-000000000001'), 'available', 'completion releases the rider for another delivery');
update public.transporter_profiles
set availability = 'offline', availability_updated_at = now()
where id = 'b7000000-0000-4000-8000-000000000001';
select ok(not has_function_privilege('authenticated', 'public.confirm_delivery_pickup(uuid,uuid,text,uuid)', 'EXECUTE'), 'authenticated clients cannot bypass pickup confirmation APIs');
select ok(not has_function_privilege('authenticated', 'public.get_current_rider_delivery(uuid)', 'EXECUTE'), 'authenticated clients cannot bypass rider assignment reads');

select is((public.offer_delivery_to_nearby_transporters(
  'a7000000-0000-4000-8000-000000000002',
  'c7000000-0000-4000-8000-000000000003', 5, 1, 45
)->>'offeredCount'), '1', 'a second delivery can offer the remaining available rider');
update public.delivery_offers
set offered_at = now() - interval '2 minutes', expires_at = now() - interval '1 minute'
where delivery_id = 'a7000000-0000-4000-8000-000000000002';
update public.delivery_offer_waves
set started_at = now() - interval '2 minutes', expires_at = now() - interval '1 minute'
where delivery_id = 'a7000000-0000-4000-8000-000000000002';
select throws_ok(format($query$select public.accept_delivery_offer(
  %L, '07000000-0000-4000-8000-000000000002', 2,
  'd7000000-0000-4000-8000-000000000004'
)$query$, (select id from public.delivery_offers where delivery_id = 'a7000000-0000-4000-8000-000000000002')), 'P0001', 'DELIVERY_OFFER_EXPIRED', 'acceptance checks authoritative database expiry');
select is(public.expire_delivery_offers(100), 1, 'expiry claims and expires the pending offer');
select is((select status::text from public.deliveries where id = 'a7000000-0000-4000-8000-000000000002'), 'unassigned', 'a delivery without pending offers returns to unassigned');
select is((select availability::text from public.transporter_profiles where id = 'b7000000-0000-4000-8000-000000000002'), 'available', 'expiry restores rider availability');
select ok(not has_function_privilege('authenticated', 'public.accept_delivery_offer(uuid,uuid,integer,uuid)', 'EXECUTE'), 'authenticated clients cannot bypass the acceptance API');

select is((public.offer_delivery_to_nearby_transporters(
  'a7000000-0000-4000-8000-000000000003',
  'c7000000-0000-4000-8000-000000000004', 5, 1, 45
)->>'offeredCount'), '1', 'a fresh delivery creates an offer for rejection');
select is((public.get_current_delivery_offer('07000000-0000-4000-8000-000000000002')->>'deliveryId'), 'a7000000-0000-4000-8000-000000000003', 'current offer reads return the new rejection candidate');
select is((public.reject_delivery_offer(
  (select id from public.delivery_offers where delivery_id = 'a7000000-0000-4000-8000-000000000003'),
  '07000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000020'
)->>'status'), 'rejected', 'the rider can reject their pending offer');
select is((select status::text from public.deliveries where id = 'a7000000-0000-4000-8000-000000000003'), 'unassigned', 'the last rejection exhausts the wave and restores the delivery');
select is((select availability::text from public.transporter_profiles where id = 'b7000000-0000-4000-8000-000000000002'), 'available', 'offer rejection restores rider availability');
select is((public.reject_delivery_offer(
  (select id from public.delivery_offers where delivery_id = 'a7000000-0000-4000-8000-000000000003'),
  '07000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000020'
)->>'duplicate'), 'true', 'an identical rejection safely replays');

select is((public.dispatcher_assign_delivery(
  'a7000000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000002',
  '07000000-0000-4000-8000-000000000006', 'No automated rider accepted', 3,
  'f7000000-0000-4000-8000-000000000001', false
)->>'status'), 'assigned', 'dispatcher can manually assign an unassigned delivery');
select is((select assigned_transporter_id from public.deliveries where id = 'a7000000-0000-4000-8000-000000000003'), 'b7000000-0000-4000-8000-000000000002'::uuid, 'manual assignment stores the selected rider');
select is((public.dispatcher_assign_delivery(
  'a7000000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000002',
  '07000000-0000-4000-8000-000000000006', 'No automated rider accepted', 3,
  'f7000000-0000-4000-8000-000000000001', false
)->>'duplicate'), 'true', 'manual assignment safely replays');
update public.transporter_profiles
set availability = 'available', availability_updated_at = now()
where id = 'b7000000-0000-4000-8000-000000000001';
select is((public.dispatcher_assign_delivery(
  'a7000000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000001',
  '07000000-0000-4000-8000-000000000006', 'Original rider reported a vehicle problem', 4,
  'f7000000-0000-4000-8000-000000000002', true
)->>'previousTransporterId'), 'b7000000-0000-4000-8000-000000000002', 'dispatcher reassignment records the previous rider');
select is((select availability::text from public.transporter_profiles where id = 'b7000000-0000-4000-8000-000000000002'), 'available', 'reassignment releases the previous rider');
select is((select availability::text from public.transporter_profiles where id = 'b7000000-0000-4000-8000-000000000001'), 'assigned', 'reassignment reserves the new rider');
select is((public.report_delivery_issue(
  'a7000000-0000-4000-8000-000000000003', '07000000-0000-4000-8000-000000000001',
  'VEHICLE_PROBLEM', 'Rear tyre needs inspection', 5,
  'f7000000-0000-4000-8000-000000000003'
)->>'status'), 'open', 'the assigned rider reports a structured exception');
select is((select status::text from public.deliveries where id = 'a7000000-0000-4000-8000-000000000003'), 'assigned', 'reporting an issue does not silently terminate delivery');
select is((select count(*)::integer from public.notification_events where entity_id = 'a7000000-0000-4000-8000-000000000003' and event_type = 'delivery.issue'), 1, 'a delivery issue notifies the consumer');
select is((select count(*)::integer from public.notification_deliveries delivery join public.notification_events event on event.id = delivery.event_id where event.entity_id = 'a7000000-0000-4000-8000-000000000003' and event.event_type = 'delivery.issue'), 2, 'critical delivery issues fan out to push and SMS work');
select is((public.resolve_delivery_issue(
  (select id from public.delivery_issues where delivery_id = 'a7000000-0000-4000-8000-000000000003'),
  '07000000-0000-4000-8000-000000000006', 'RESUME_DELIVERY',
  'Rider confirmed the vehicle is safe', 'f7000000-0000-4000-8000-000000000004'
)->>'status'), 'resolved', 'dispatcher can resolve an exception with a structured outcome');
select is((select status::text from public.delivery_issues where delivery_id = 'a7000000-0000-4000-8000-000000000003'), 'resolved', 'issue resolution is persisted for the exception queue');
select is((public.dispatcher_delivery_action(
  'a7000000-0000-4000-8000-000000000003', '07000000-0000-4000-8000-000000000006',
  'CANCEL_ASSIGNMENT', 'Rider is no longer able to collect', 5,
  'f7000000-0000-4000-8000-000000000005'
)->>'status'), 'unassigned', 'dispatcher can cancel an assignment before custody transfer');
select is((select status::text from public.deliveries where id = 'a7000000-0000-4000-8000-000000000003'), 'unassigned', 'cancelled assignment returns delivery to the waiting queue');
select is((select assigned_transporter_id from public.deliveries where id = 'a7000000-0000-4000-8000-000000000003'), null::uuid, 'cancelled assignment removes the rider identity');
select is((select availability::text from public.transporter_profiles where id = 'b7000000-0000-4000-8000-000000000001'), 'available', 'cancelled assignment releases the rider');
select is((public.dispatcher_delivery_action(
  'a7000000-0000-4000-8000-000000000003', '07000000-0000-4000-8000-000000000006',
  'CANCEL_ASSIGNMENT', 'Rider is no longer able to collect', 5,
  'f7000000-0000-4000-8000-000000000005'
)->>'duplicate'), 'true', 'dispatcher assignment cancellation safely replays');
select is((select count(*)::integer from public.delivery_audit_events where delivery_id = 'a7000000-0000-4000-8000-000000000003' and action = 'delivery.cancel_assignment'), 1, 'dispatcher cancellation writes one audit event');

select * from finish();
rollback;
