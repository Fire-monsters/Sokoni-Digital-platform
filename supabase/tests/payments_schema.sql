begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

select has_type('public', 'payment_provider', 'payment provider enum exists');
select has_type('public', 'payment_status', 'payment status enum exists');
select has_type('public', 'payment_event_processing_status', 'event status enum exists');
select has_type('public', 'reconciliation_result', 'reconciliation result enum exists');
select has_table('public', 'payment_attempts', 'payment attempts table exists');
select has_table('public', 'payment_provider_events', 'provider events table exists');
select has_table('public', 'payment_reconciliation_runs', 'reconciliation table exists');
select has_table('public', 'payment_audit_events', 'payment audit table exists');
select has_column(
  'public',
  'payment_provider_events',
  'authenticity_verified_at',
  'provider events record when authenticity was established'
);
select has_column(
  'public',
  'payment_provider_events',
  'verification_method',
  'provider events record the verification mechanism'
);
select is(
  (select enum_range(null::public.payment_provider)::text),
  '{pesapal,market_pickup}',
  'provider enum contains only normalized providers'
);
select is(
  (select enum_range(null::public.payment_status)::text),
  '{created,initiating,pending,successful,failed,cancelled,expired,requires_reconciliation}',
  'payment lifecycle states are complete and ordered'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.payment_attempts'::regclass),
  'payment attempts use RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.payment_provider_events'::regclass),
  'provider events use RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.payment_reconciliation_runs'::regclass),
  'reconciliation runs use RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.payment_audit_events'::regclass),
  'payment audit uses RLS'
);

insert into auth.users (id, aud, role, email) values
  ('03000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'payment-owner@example.test'),
  ('03000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'other-owner@example.test');
insert into public.markets (id, name, slug) values
  ('13000000-0000-4000-8000-000000000001', 'Payment Market', 'payment-market');
insert into public.carts (id, consumer_id, market_id, status) values
  ('83000000-0000-4000-8000-000000000001', '03000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'converted'),
  ('83000000-0000-4000-8000-000000000002', '03000000-0000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000001', 'converted');
insert into public.customer_checkouts (
  id, reference, consumer_id, cart_id, market_id, total_ugx,
  items_subtotal_ugx, client_reference, reservation_expires_at
) values
  (
    '93000000-0000-4000-8000-000000000001', 'EK-2026-900001',
    '03000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000001', 33000, 33000,
    'a3000000-0000-4000-8000-000000000001', now() + interval '15 minutes'
  ),
  (
    '93000000-0000-4000-8000-000000000002', 'EK-2026-900002',
    '03000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000002',
    '13000000-0000-4000-8000-000000000001', 18000, 18000,
    'a3000000-0000-4000-8000-000000000002', now() + interval '15 minutes'
  );

insert into public.payment_attempts (
  id, checkout_id, consumer_id, provider, payment_method, status, amount_ugx, payer_phone_e164,
  merchant_reference, provider_transaction_id, resolved_at
) values
  (
    'b3000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
    '03000000-0000-4000-8000-000000000001', 'pesapal', 'mtn_momo', 'successful', 33000,
    '+256772123456', 'EK-P-900001', 'mtn-900001', now()
  ),
  (
    'b3000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000002',
    '03000000-0000-4000-8000-000000000002', 'pesapal', null, 'pending', 18000,
    '+256752123456', 'EK-P-900002', 'airtel-900002', null
  );

select throws_ok(
  $$insert into public.payment_attempts (
    checkout_id, consumer_id, provider, amount_ugx, payer_phone_e164, merchant_reference
  ) values (
    '93000000-0000-4000-8000-000000000001', '03000000-0000-4000-8000-000000000001',
    'pesapal', 33000, '0772123456', 'EK-P-BAD-PHONE'
  )$$,
  '23514', null, 'mobile money phone must be E.164'
);
select throws_ok(
  $$insert into public.payment_attempts (
    checkout_id, consumer_id, provider, payment_method, amount_ugx, payer_phone_e164, merchant_reference
  ) values (
    '93000000-0000-4000-8000-000000000001', '03000000-0000-4000-8000-000000000001',
    'market_pickup', 'market_pickup', 33000, '+256772123456', 'EK-P-BAD-PICKUP'
  )$$,
  '23514', null, 'market pickup cannot retain a payer phone'
);
select throws_ok(
  $$insert into public.payment_attempts (
    checkout_id, consumer_id, provider, amount_ugx, payer_phone_e164, merchant_reference
  ) values (
    '93000000-0000-4000-8000-000000000001', '03000000-0000-4000-8000-000000000001',
    'pesapal', 0, '+256772123456', 'EK-P-ZERO'
  )$$,
  '23514', null, 'zero-value attempts are rejected'
);
select throws_ok(
  $$insert into public.payment_attempts (
    checkout_id, consumer_id, provider, status, amount_ugx, payer_phone_e164,
    merchant_reference, resolved_at
  ) values (
    '93000000-0000-4000-8000-000000000001', '03000000-0000-4000-8000-000000000001',
    'pesapal', 'successful', 33000, '+256772123456', 'EK-P-SECOND-SUCCESS', now()
  )$$,
  '23505', null, 'a checkout can succeed only once'
);
select throws_ok(
  $$insert into public.payment_attempts (
    checkout_id, consumer_id, provider, status, amount_ugx, payer_phone_e164,
    merchant_reference
  ) values (
    '93000000-0000-4000-8000-000000000001', '03000000-0000-4000-8000-000000000001',
    'pesapal', 'failed', 33000, '+256772123456', 'EK-P-UNRESOLVED-FAILURE'
  )$$,
  '23514', null, 'terminal attempt requires resolution time'
);
select throws_ok(
  $$insert into public.payment_attempts (
    checkout_id, consumer_id, provider, amount_ugx, payer_phone_e164, merchant_reference
  ) values (
    '93000000-0000-4000-8000-000000000001', '03000000-0000-4000-8000-000000000002',
    'pesapal', 33000, '+256772123456', 'EK-P-WRONG-OWNER'
  )$$,
  '23503', null, 'attempt consumer must own the checkout'
);

insert into public.payment_provider_events (
  id, provider, provider_event_id, provider_transaction_id, merchant_reference,
  payload, payload_hash, signature_verified, processing_status, processed_at
) values (
  'c3000000-0000-4000-8000-000000000001', 'pesapal', 'event-900001', 'mtn-900001',
  'EK-P-900001', '{"status":"SUCCESSFUL"}', repeat('a', 64), true, 'processed', now()
);
select throws_ok(
  $$insert into public.payment_provider_events (
    provider, provider_event_id, payload, payload_hash
  ) values ('pesapal', 'event-900001', '{}', repeat('b', 64))$$,
  '23505', null, 'provider event id deduplicates callbacks'
);
select throws_ok(
  $$insert into public.payment_provider_events (
    provider, payload, payload_hash
  ) values ('pesapal', '{}', repeat('a', 64))$$,
  '23505', null, 'payload hash is the fallback duplicate key'
);

insert into public.payment_reconciliation_runs (
  payment_attempt_id, provider, previous_status, provider_status, result,
  provider_amount_ugx, provider_currency, provider_response, run_source
) values (
  'b3000000-0000-4000-8000-000000000002', 'pesapal', 'pending', 'pending',
  'no_change', 18000, 'UGX', '{"status":"PENDING"}', 'scheduled_job'
);
select is((select count(*)::integer from public.payment_reconciliation_runs), 1, 'reconciliation evidence is retained');
select throws_ok(
  $$insert into public.payment_reconciliation_runs (
    payment_attempt_id, provider, previous_status, result, run_source
  ) values (
    'b3000000-0000-4000-8000-000000000002', 'market_pickup', 'pending', 'no_change', 'scheduled_job'
  )$$,
  '23503', null, 'reconciliation provider must match the attempt'
);

insert into public.payment_audit_events (
  payment_attempt_id, provider_event_id, action, previous_status, next_status
) values (
  'b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
  'payment.succeeded', 'pending', 'successful'
);
select is((select count(*)::integer from public.payment_audit_events), 1, 'payment transition audit is retained');

set local role authenticated;
select set_config('request.jwt.claim.sub', '03000000-0000-4000-8000-000000000001', true);
select is((select count(*)::integer from public.payment_attempts), 1, 'consumer reads only owned attempts');
select is((select merchant_reference from public.payment_attempts), 'EK-P-900001', 'owner sees the expected attempt');
select is(
  has_table_privilege(current_user, 'public.payment_provider_events', 'select'),
  false,
  'consumer has no raw provider-event privilege'
);
select is(
  has_table_privilege(current_user, 'public.payment_reconciliation_runs', 'select'),
  false,
  'consumer has no reconciliation-evidence privilege'
);
select is(
  has_table_privilege(current_user, 'public.payment_audit_events', 'select'),
  false,
  'consumer has no internal payment-audit privilege'
);

select * from finish();
rollback;
