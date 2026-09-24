begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

select ok(
  to_regprocedure('public.admin_get_operational_overview(timestamptz,timestamptz,timestamptz)') is not null,
  'admin operational overview function exists'
);
select ok(
  to_regprocedure('public.admin_list_orders(integer,integer,text,uuid,uuid,text,text,text,text,timestamptz,timestamptz,boolean,boolean,text,text,timestamptz)') is not null,
  'admin order list function exists'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.admin_get_operational_overview(timestamptz,timestamptz,timestamptz)',
    'execute'
  ),
  'anonymous users cannot execute the overview read model'
);
select ok(
  to_regprocedure('public.admin_list_audit_events(integer,integer,text,uuid,text,text,uuid,timestamptz,timestamptz,text,text)') is not null,
  'admin audit event list function exists'
);
select ok(
  to_regprocedure('public.admin_get_audit_event(text)') is not null,
  'admin audit event detail function exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.admin_list_audit_events(integer,integer,text,uuid,text,text,uuid,timestamptz,timestamptz,text,text)',
    'execute'
  ),
  'authenticated clients cannot execute audit event reads directly'
);
select ok(
  not has_function_privilege('anon', 'public.admin_get_audit_event(text)', 'execute'),
  'anonymous clients cannot execute audit detail reads'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'payment_audit_admin_created_idx'
  ),
  'audit feed has a payment event timeline index'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.admin_list_orders(integer,integer,text,uuid,uuid,text,text,text,text,timestamptz,timestamptz,boolean,boolean,text,text,timestamptz)',
    'execute'
  ),
  'authenticated clients cannot execute the order read model directly'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'customer_checkouts_admin_created_idx'
  ),
  'admin order queue has a created-at index'
);
select is(
  jsonb_typeof(public.admin_get_operational_overview()->'attentionRequired'),
  'array',
  'overview returns an attention queue'
);
select is(
  public.admin_list_orders()->'pagination'->>'page',
  '1',
  'order queue returns the default pagination contract'
);
select ok(
  to_regprocedure('public.admin_get_order_investigation(uuid)') is not null,
  'admin order investigation function exists'
);
select ok(
  to_regprocedure('public.admin_list_applications(integer,integer,text,text,text,uuid,timestamptz,timestamptz,text,text)') is not null,
  'admin application list function exists'
);
select ok(
  not has_function_privilege('authenticated', 'public.admin_get_order_investigation(uuid)', 'execute'),
  'authenticated clients cannot execute order investigations directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.admin_list_applications(integer,integer,text,text,text,uuid,timestamptz,timestamptz,text,text)',
    'execute'
  ),
  'anonymous clients cannot execute the application queue'
);
select has_table('public', 'refund_cases', 'refund cases have an authoritative persistence model');
select has_type('public', 'refund_reason', 'refund reasons use a database enum');
select ok(
  to_regprocedure('public.admin_list_payment_reconciliation(integer,integer,text,text,text,text,text,text,timestamptz,timestamptz,text,text)') is not null,
  'admin payment reconciliation function exists'
);
select ok(
  to_regprocedure('public.admin_list_refunds(integer,integer,text,text,text,text,bigint,bigint,timestamptz,timestamptz,text,text)') is not null,
  'admin refund list function exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.admin_list_payment_reconciliation(integer,integer,text,text,text,text,text,text,timestamptz,timestamptz,text,text)',
    'execute'
  ),
  'authenticated clients cannot execute payment reconciliation reads directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.admin_list_refunds(integer,integer,text,text,text,text,bigint,bigint,timestamptz,timestamptz,text,text)',
    'execute'
  ),
  'anonymous clients cannot execute refund reads'
);
select is(
  public.admin_list_applications()->'pagination'->>'page',
  '1',
  'application queue returns the default pagination contract'
);
select throws_ok(
  $$select public.admin_get_order_investigation('10000000-0000-4000-8000-000000000099')$$,
  'P0002',
  'order not found',
  'order investigation rejects an unknown order'
);

insert into auth.users (id, aud, role, email, phone, raw_user_meta_data) values (
  '0a000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'admin-read-model@example.test',
  '+256700000314',
  '{"display_name":"Read Model Customer"}'::jsonb
);
insert into public.markets (id, name, slug) values (
  '1a000000-0000-4000-8000-000000000001',
  'Read Model Market',
  'read-model-market'
);
insert into public.carts (id, consumer_id, market_id) values (
  '2a000000-0000-4000-8000-000000000001',
  '0a000000-0000-4000-8000-000000000001',
  '1a000000-0000-4000-8000-000000000001'
);
insert into public.customer_checkouts (
  id, reference, consumer_id, cart_id, market_id, status, items_subtotal_ugx,
  total_ugx, client_reference, reservation_expires_at
) values (
  '3a000000-0000-4000-8000-000000000001',
  'EK-2026-READ01',
  '0a000000-0000-4000-8000-000000000001',
  '2a000000-0000-4000-8000-000000000001',
  '1a000000-0000-4000-8000-000000000001',
  'confirmed_unpaid',
  10000,
  10000,
  '4a000000-0000-4000-8000-000000000001',
  now() + interval '15 minutes'
);
insert into public.checkout_fulfilments (
  checkout_id, type, schedule_type, phone_number, pickup_market_id
) values (
  '3a000000-0000-4000-8000-000000000001',
  'market_pickup',
  'immediate',
  '+256700000314',
  '1a000000-0000-4000-8000-000000000001'
);
insert into public.sellers (id, business_name, market_id) values (
  '5a000000-0000-4000-8000-000000000001',
  'Read Model Vendor',
  '1a000000-0000-4000-8000-000000000001'
);
insert into public.seller_accounts (seller_id, user_id) values (
  '5a000000-0000-4000-8000-000000000001',
  '0a000000-0000-4000-8000-000000000001'
);
insert into public.payment_attempts (
  id, checkout_id, consumer_id, provider, payment_method, status,
  amount_ugx, merchant_reference, provider_transaction_id
) values (
  '6a000000-0000-4000-8000-000000000001',
  '3a000000-0000-4000-8000-000000000001',
  '0a000000-0000-4000-8000-000000000001',
  'pesapal',
  'mtn_momo',
  'pending',
  10000,
  'PAY-READ-001',
  'PROVIDER-READ-001'
);
insert into public.payment_audit_events (
  id, payment_attempt_id, actor_user_id, action, previous_status, next_status, details
) values (
  '6b000000-0000-4000-8000-000000000001',
  '6a000000-0000-4000-8000-000000000001',
  '0a000000-0000-4000-8000-000000000001',
  'payment.status_changed',
  'created',
  'pending',
  '{"reason":"Provider accepted the request","operationId":"8a000000-0000-4000-8000-000000000001","ip":"127.0.0.1","device":"integration-test"}'::jsonb
);
insert into public.payment_provider_events (
  provider, provider_event_id, provider_transaction_id, merchant_reference,
  payload, payload_hash, processing_status
) values (
  'pesapal',
  'EVENT-READ-001',
  'PROVIDER-READ-001',
  'PAY-READ-001',
  '{}'::jsonb,
  repeat('a', 64),
  'received'
);
insert into public.refund_cases (
  id, checkout_id, payment_attempt_id, reason, requested_amount_ugx,
  status, approval_state, proposed_by
) values (
  '7a000000-0000-4000-8000-000000000001',
  '3a000000-0000-4000-8000-000000000001',
  '6a000000-0000-4000-8000-000000000001',
  'missing_products',
  2500,
  'awaiting_approval',
  'pending',
  '0a000000-0000-4000-8000-000000000001'
);

select is(
  public.admin_get_order_investigation('3a000000-0000-4000-8000-000000000001')->'order'->>'reference',
  'EK-2026-READ01',
  'order investigation returns the requested order'
);
select is(
  jsonb_typeof(
    public.admin_get_order_investigation('3a000000-0000-4000-8000-000000000001')->'timeline'
  ),
  'array',
  'order investigation returns a unified timeline'
);
select is(
  public.admin_list_applications(p_type => 'vendor')->'data'->0->>'status',
  'pending_review',
  'application queue normalizes pending vendor status'
);
select is(
  public.admin_list_payment_reconciliation(p_provider => 'pesapal')->'data'->0->>'paymentId',
  '6a000000-0000-4000-8000-000000000001',
  'payment reconciliation queue returns the matching payment'
);
select is(
  public.admin_list_payment_reconciliation(p_callback_status => 'received')->'data'->0
    ->'callback'->>'received',
  'true',
  'payment reconciliation queue exposes callback state'
);
select is(
  public.admin_list_refunds(p_reason => 'missing_products')->'data'->0->>'orderReference',
  'EK-2026-READ01',
  'refund queue includes order context'
);
select is(
  public.admin_list_refunds(p_min_amount => 2000, p_max_amount => 3000)
    ->'pagination'->>'totalItems',
  '1',
  'refund queue applies amount filters'
);
select is(
  public.admin_list_audit_events(p_action => 'payment.status_changed')->'data'->0->>'id',
  'payment:6b000000-0000-4000-8000-000000000001',
  'audit queue filters events by action'
);
select is(
  public.admin_list_audit_events(p_entity_type => 'payment', p_entity_id => '6a000000-0000-4000-8000-000000000001')
    ->'pagination'->>'totalItems',
  '1',
  'audit queue filters by entity type and ID'
);
select is(
  public.admin_list_audit_events(p_query => 'PAY-READ-001')->'pagination'->>'totalItems',
  '1',
  'audit search matches an entity reference'
);
select is(
  public.admin_list_audit_events(p_staff_user_id => '0a000000-0000-4000-8000-000000000001')
    ->'data'->0->'actor'->>'name',
  'Read Model Customer',
  'audit queue resolves and filters the actor'
);
select is(
  public.admin_get_audit_event('payment:6b000000-0000-4000-8000-000000000001')
    ->'previousState'->>'status',
  'created',
  'audit detail includes the previous state'
);

select * from finish();
rollback;
