begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

insert into auth.users (id, aud, role, email) values
  ('05000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'phase5-vendor@example.test'),
  ('05000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'phase5-other@example.test'),
  ('05000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'phase5-consumer@example.test');
insert into public.markets (id, name, slug) values
  ('15000000-0000-4000-8000-000000000001', 'Phase 5 Market', 'phase-5-market');
insert into public.sellers (id, business_name, market_id, verification_status) values
  ('45000000-0000-4000-8000-000000000001', 'Phase 5 Seller', '15000000-0000-4000-8000-000000000001', 'approved');
insert into public.seller_accounts (seller_id, user_id) values
  ('45000000-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000001');

insert into public.carts (id, consumer_id, market_id, status) values
  ('85000000-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000003', '15000000-0000-4000-8000-000000000001', 'converted'),
  ('85000000-0000-4000-8000-000000000002', '05000000-0000-4000-8000-000000000003', '15000000-0000-4000-8000-000000000001', 'converted'),
  ('85000000-0000-4000-8000-000000000003', '05000000-0000-4000-8000-000000000003', '15000000-0000-4000-8000-000000000001', 'converted');
insert into public.customer_checkouts (
  id, reference, consumer_id, cart_id, market_id, status,
  items_subtotal_ugx, total_ugx, client_reference, reservation_expires_at
) values
  ('95000000-0000-4000-8000-000000000001', 'EK-2026-950001', '05000000-0000-4000-8000-000000000003', '85000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', 'paid', 10000, 10000, 'a5000000-0000-4000-8000-000000000001', now() + interval '15 minutes'),
  ('95000000-0000-4000-8000-000000000002', 'EK-2026-950002', '05000000-0000-4000-8000-000000000003', '85000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000001', 'paid', 8000, 8000, 'a5000000-0000-4000-8000-000000000002', now() + interval '15 minutes'),
  ('95000000-0000-4000-8000-000000000003', 'EK-2026-950003', '05000000-0000-4000-8000-000000000003', '85000000-0000-4000-8000-000000000003', '15000000-0000-4000-8000-000000000001', 'paid', 6000, 6000, 'a5000000-0000-4000-8000-000000000003', now() + interval '15 minutes');
insert into public.vendor_orders (
  id, reference, checkout_id, seller_id, status, subtotal_ugx
) values
  ('d5000000-0000-4000-8000-000000000001', 'EK-S-9500001', '95000000-0000-4000-8000-000000000001', '45000000-0000-4000-8000-000000000001', 'confirmed', 10000),
  ('d5000000-0000-4000-8000-000000000002', 'EK-S-9500002', '95000000-0000-4000-8000-000000000002', '45000000-0000-4000-8000-000000000001', 'awaiting_vendor_acceptance', 8000),
  ('d5000000-0000-4000-8000-000000000003', 'EK-S-9500003', '95000000-0000-4000-8000-000000000003', '45000000-0000-4000-8000-000000000001', 'awaiting_vendor_acceptance', 6000);

select is((select public from storage.buckets where id = 'quality-check-images'), false, 'quality image bucket is private');
select is((select file_size_limit from storage.buckets where id = 'quality-check-images'), 500000::bigint, 'quality image bucket enforces the compression ceiling');
select is((
  select count(*)::integer from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and (coalesce(qual, '') like '%quality-check-images%' or coalesce(with_check, '') like '%quality-check-images%')
), 0, 'quality image storage has no direct client RLS policy');

select is(
  (select status::text from public.vendor_orders where id = 'd5000000-0000-4000-8000-000000000001'),
  'awaiting_vendor_acceptance',
  'legacy confirmed writes normalize to the Phase 5 entry state'
);

select is(
  (public.transition_vendor_order(
    'd5000000-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000001',
    'accepted', 1, 'b5000000-0000-4000-8000-000000000001'
  )->>'status'),
  'accepted',
  'awaiting vendor acceptance transitions to accepted'
);
select is(
  (select version from public.vendor_orders where id = 'd5000000-0000-4000-8000-000000000001'),
  2,
  'a transition increments the optimistic version'
);
select is(
  (public.transition_vendor_order(
    'd5000000-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000001',
    'accepted', 1, 'b5000000-0000-4000-8000-000000000001'
  )->>'duplicate'),
  'true',
  'an identical operation replay returns its stored result'
);
select is((select count(*)::integer from public.vendor_order_status_history where vendor_order_id = 'd5000000-0000-4000-8000-000000000001'), 1, 'replay does not duplicate history');
select is((select count(*)::integer from public.vendor_order_audit_events where vendor_order_id = 'd5000000-0000-4000-8000-000000000001'), 1, 'replay does not duplicate audit events');
select is((select count(*)::integer from public.vendor_order_operations where vendor_order_id = 'd5000000-0000-4000-8000-000000000001'), 1, 'replay does not duplicate operation records');

select throws_ok($$select public.transition_vendor_order(
  'd5000000-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000001',
  'preparing', 2, 'b5000000-0000-4000-8000-000000000001'
)$$, '23505', null, 'an operation ID cannot be reused with another payload');
select throws_ok($$select public.transition_vendor_order(
  'd5000000-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000001',
  'preparing', 1, 'b5000000-0000-4000-8000-000000000002'
)$$, '40001', null, 'a stale expected version is rejected');
select throws_ok($$select public.transition_vendor_order(
  'd5000000-0000-4000-8000-000000000002', '05000000-0000-4000-8000-000000000001',
  'preparing', 1, 'b5000000-0000-4000-8000-000000000003'
)$$, '23514', null, 'awaiting acceptance cannot jump to preparing');
select throws_ok($$select public.transition_vendor_order(
  'd5000000-0000-4000-8000-000000000002', '05000000-0000-4000-8000-000000000002',
  'accepted', 1, 'b5000000-0000-4000-8000-000000000004'
)$$, '42501', null, 'another user cannot transition the seller order');
select throws_ok($$select public.transition_vendor_order(
  'd5000000-0000-4000-8000-000000000099', '05000000-0000-4000-8000-000000000001',
  'accepted', 1, 'b5000000-0000-4000-8000-000000000005'
)$$, 'P0002', null, 'a missing seller order is rejected');

select is(
  (public.transition_vendor_order(
    'd5000000-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000001',
    'preparing', 2, 'b5000000-0000-4000-8000-000000000006'
  )->>'status'),
  'preparing',
  'accepted transitions to preparing'
);
select throws_ok($$select public.transition_vendor_order(
  'd5000000-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000001',
  'quality_verified', 3, 'b5000000-0000-4000-8000-000000000007'
)$$, '23514', 'PACKING_IMAGE_REQUIRED', 'quality verification requires packing proof');

insert into public.quality_checks (
  id, vendor_order_id, seller_id, status, packed_by_user_id, verified_at, checklist
) values (
  'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
  '45000000-0000-4000-8000-000000000001', 'completed',
  '05000000-0000-4000-8000-000000000001', now(),
  '{"itemsChecked":true,"quantitiesChecked":true,"packagingSecure":true}'::jsonb
);
insert into public.quality_check_images (
  id, quality_check_id, vendor_order_id, storage_path, thumbnail_path,
  mime_type, byte_size, width, height, is_packing_proof, upload_status
) values (
  'e5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001', 'seller/order/check/image-1.jpg',
  'seller/order/check/image-1-thumb.jpg', 'image/jpeg', 200000, 1280, 960, true, 'pending'
);
select throws_ok($$select public.transition_vendor_order(
  'd5000000-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000001',
  'quality_verified', 3, 'b5000000-0000-4000-8000-000000000008'
)$$, '23514', 'PACKING_IMAGE_REQUIRED', 'pending packing metadata is not valid proof');

update public.quality_check_images set upload_status = 'ready'
where id = 'e5000000-0000-4000-8000-000000000001';
select is(
  (public.transition_vendor_order(
    'd5000000-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000001',
    'quality_verified', 3, 'b5000000-0000-4000-8000-000000000009'
  )->>'status'),
  'quality_verified',
  'completed quality metadata with ready packing proof allows verification'
);
select is(
  (public.transition_vendor_order(
    'd5000000-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000001',
    'ready_for_pickup', 4, 'b5000000-0000-4000-8000-000000000010'
  )->>'status'),
  'ready_for_pickup',
  'quality verified transitions to ready for pickup'
);
select throws_ok($$select public.transition_vendor_order(
  'd5000000-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000001',
  'preparing', 5, 'b5000000-0000-4000-8000-000000000011'
)$$, '23514', null, 'ready for pickup cannot move backwards');
select is((select count(*)::integer from public.vendor_order_status_history where vendor_order_id = 'd5000000-0000-4000-8000-000000000001'), 4, 'every applied transition has one history row');
select is((select count(*)::integer from public.vendor_order_audit_events where vendor_order_id = 'd5000000-0000-4000-8000-000000000001'), 4, 'every applied transition has one audit event');

select public.transition_vendor_order(
  'd5000000-0000-4000-8000-000000000003', '05000000-0000-4000-8000-000000000001',
  'accepted', 1, 'b5000000-0000-4000-8000-000000000012'
);
select public.transition_vendor_order(
  'd5000000-0000-4000-8000-000000000003', '05000000-0000-4000-8000-000000000001',
  'preparing', 2, 'b5000000-0000-4000-8000-000000000013'
);
select throws_ok($$select public.transition_vendor_order(
  'd5000000-0000-4000-8000-000000000003', '05000000-0000-4000-8000-000000000001',
  'ready_for_pickup', 3, 'b5000000-0000-4000-8000-000000000014'
)$$, '23514', null, 'preparing cannot jump directly to ready for pickup');

insert into public.quality_check_images (
  id, quality_check_id, vendor_order_id, storage_path,
  mime_type, byte_size, width, height, upload_status
) values
  ('e5000000-0000-4000-8000-000000000002', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'seller/order/check/image-2.jpg', 'image/jpeg', 150000, 1280, 960, 'ready'),
  ('e5000000-0000-4000-8000-000000000003', 'c5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'seller/order/check/image-3.jpg', 'image/jpeg', 150000, 1280, 960, 'ready');
select throws_ok($$insert into public.quality_check_images (
  id, quality_check_id, vendor_order_id, storage_path,
  mime_type, byte_size, width, height, upload_status
) values (
  'e5000000-0000-4000-8000-000000000004', 'c5000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001', 'seller/order/check/image-4.jpg',
  'image/jpeg', 150000, 1280, 960, 'ready'
)$$, '23514', null, 'a quality check cannot have more than three active images');

select is(
  (public.transition_vendor_order(
    'd5000000-0000-4000-8000-000000000002', '05000000-0000-4000-8000-000000000001',
    'cancelled', 1, 'b5000000-0000-4000-8000-000000000015'
  )->>'status'),
  'cancelled',
  'awaiting acceptance may be cancelled'
);
select throws_ok($$select public.transition_vendor_order(
  'd5000000-0000-4000-8000-000000000002', '05000000-0000-4000-8000-000000000001',
  'accepted', 2, 'b5000000-0000-4000-8000-000000000016'
)$$, '23514', null, 'cancelled is terminal');
select ok(
  not has_function_privilege('authenticated', 'public.transition_vendor_order(uuid,uuid,text,integer,uuid)', 'EXECUTE'),
  'authenticated clients cannot execute the transition RPC directly'
);

select is((public.ensure_quality_check(
  'd5000000-0000-4000-8000-000000000003', '05000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000003'
)->>'qualityCheckId'), 'c5000000-0000-4000-8000-000000000003', 'upload workflow creates one owned draft quality check');
select throws_ok($$select public.complete_quality_check(
  'd5000000-0000-4000-8000-000000000003', '05000000-0000-4000-8000-000000000001',
  true, true, true, null, 'f5000000-0000-4000-8000-000000000001'
)$$, '23514', 'PACKING_IMAGE_REQUIRED', 'a checklist cannot complete without ready packing proof');
select is((public.create_quality_image_intent(
  'd5000000-0000-4000-8000-000000000003', '05000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000003', 'e5000000-0000-4000-8000-000000000005',
  '45000000-0000-4000-8000-000000000001/d5000000-0000-4000-8000-000000000003/c5000000-0000-4000-8000-000000000003/e5000000-0000-4000-8000-000000000005/original.jpg',
  '45000000-0000-4000-8000-000000000001/d5000000-0000-4000-8000-000000000003/c5000000-0000-4000-8000-000000000003/e5000000-0000-4000-8000-000000000005/thumbnail.jpg',
  'image/jpeg', 180000, 1280, 960
)->>'duplicate'), 'false', 'quality upload intent reserves pending metadata');
select is((public.create_quality_image_intent(
  'd5000000-0000-4000-8000-000000000003', '05000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000003', 'e5000000-0000-4000-8000-000000000005',
  '45000000-0000-4000-8000-000000000001/d5000000-0000-4000-8000-000000000003/c5000000-0000-4000-8000-000000000003/e5000000-0000-4000-8000-000000000005/original.jpg',
  '45000000-0000-4000-8000-000000000001/d5000000-0000-4000-8000-000000000003/c5000000-0000-4000-8000-000000000003/e5000000-0000-4000-8000-000000000005/thumbnail.jpg',
  'image/jpeg', 180000, 1280, 960
)->>'duplicate'), 'true', 'identical quality upload intent safely replays');
select throws_ok($$select public.create_quality_image_intent(
  'd5000000-0000-4000-8000-000000000003', '05000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000003', 'e5000000-0000-4000-8000-000000000006',
  'another-seller/order/check/image/original.jpg', 'another-seller/order/check/image/thumbnail.jpg',
  'image/jpeg', 180000, 1280, 960
)$$, '22023', null, 'upload paths cannot cross seller ownership boundaries');
select is((public.finalize_quality_image(
  'd5000000-0000-4000-8000-000000000003', '05000000-0000-4000-8000-000000000001',
  'e5000000-0000-4000-8000-000000000005',
  '45000000-0000-4000-8000-000000000001/d5000000-0000-4000-8000-000000000003/c5000000-0000-4000-8000-000000000003/e5000000-0000-4000-8000-000000000005/original.jpg',
  '45000000-0000-4000-8000-000000000001/d5000000-0000-4000-8000-000000000003/c5000000-0000-4000-8000-000000000003/e5000000-0000-4000-8000-000000000005/thumbnail.jpg',
  'image/jpeg', 180000, 1280, 960
)->>'uploadStatus'), 'ready', 'matching uploaded metadata finalizes as ready');
select is((select is_packing_proof from public.quality_check_images where id = 'e5000000-0000-4000-8000-000000000005'), true, 'first finalized image becomes authoritative packing proof');
select is((public.finalize_quality_image(
  'd5000000-0000-4000-8000-000000000003', '05000000-0000-4000-8000-000000000001',
  'e5000000-0000-4000-8000-000000000005',
  '45000000-0000-4000-8000-000000000001/d5000000-0000-4000-8000-000000000003/c5000000-0000-4000-8000-000000000003/e5000000-0000-4000-8000-000000000005/original.jpg',
  '45000000-0000-4000-8000-000000000001/d5000000-0000-4000-8000-000000000003/c5000000-0000-4000-8000-000000000003/e5000000-0000-4000-8000-000000000005/thumbnail.jpg',
  'image/jpeg', 180000, 1280, 960
)->>'duplicate'), 'true', 'image finalization safely replays');
select throws_ok($$select public.complete_quality_check(
  'd5000000-0000-4000-8000-000000000003', '05000000-0000-4000-8000-000000000001',
  true, false, true, null, 'f5000000-0000-4000-8000-000000000002'
)$$, '23514', null, 'all packing checklist items are required');
select is((public.complete_quality_check(
  'd5000000-0000-4000-8000-000000000003', '05000000-0000-4000-8000-000000000001',
  true, true, true, 'Packed securely', 'f5000000-0000-4000-8000-000000000003'
)->>'status'), 'completed', 'ready proof and a complete checklist create the verification record');
select is((public.complete_quality_check(
  'd5000000-0000-4000-8000-000000000003', '05000000-0000-4000-8000-000000000001',
  true, true, true, 'Packed securely', 'f5000000-0000-4000-8000-000000000003'
)->>'duplicate'), 'true', 'quality-check completion safely replays');
select is((
  select count(*)::integer from public.quality_check_audit_events
  where quality_check_id = 'c5000000-0000-4000-8000-000000000003'
), 1, 'quality-check completion writes one audit event');

select is((
  select count(*)::integer from public.notification_events
  where entity_id = 'd5000000-0000-4000-8000-000000000001'
    and event_type = 'vendor_order.accepted'
), 1, 'a successful state change enqueues one notification event');
select is((
  select count(*)::integer from public.notification_deliveries delivery
  join public.notification_events event on event.id = delivery.event_id
  where event.entity_id = 'd5000000-0000-4000-8000-000000000001'
    and event.event_type = 'vendor_order.accepted' and delivery.channel = 'push'
), 1, 'an outbox event starts with one push delivery');
select is((
  select priority::text from public.notification_events
  where entity_id = 'd5000000-0000-4000-8000-000000000002'
    and event_type = 'vendor_order.cancelled'
), 'critical', 'critical order events are marked for fallback delivery');
select public.fail_notification_delivery(
  (select delivery.id from public.notification_deliveries delivery
   join public.notification_events event on event.id = delivery.event_id
   where event.entity_id = 'd5000000-0000-4000-8000-000000000002'
     and event.event_type = 'vendor_order.cancelled' and delivery.channel = 'push'),
  'push unavailable', 30, 5, true
);
select is((
  select count(*)::integer from public.notification_deliveries delivery
  join public.notification_events event on event.id = delivery.event_id
  where event.entity_id = 'd5000000-0000-4000-8000-000000000002'
    and event.event_type = 'vendor_order.cancelled' and delivery.channel = 'sms'
), 1, 'failed critical push creates one SMS fallback delivery');
select ok((
  select count(*) from public.notification_audit_events audit
  join public.notification_events event on event.id = audit.notification_event_id
  where event.entity_id = 'd5000000-0000-4000-8000-000000000002'
) >= 3, 'notification enqueue, retry, and fallback actions are audited');
select ok(
  not has_function_privilege('authenticated', 'public.claim_notification_deliveries(integer,integer)', 'EXECUTE'),
  'authenticated clients cannot claim outbox deliveries directly'
);

select * from finish();
rollback;
