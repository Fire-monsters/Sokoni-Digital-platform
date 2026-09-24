begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

select has_table('public', 'audit_events', 'canonical audit ledger exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.audit_events'::regclass),
  'canonical audit ledger has RLS enabled'
);
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'select'),
  'authenticated clients cannot read the canonical ledger directly');
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'insert'),
  'authenticated clients cannot forge canonical audit events');
select ok(has_table_privilege('service_role', 'public.audit_events', 'select'),
  'the trusted API role can read the ledger');
select ok(not has_table_privilege('service_role', 'public.audit_events', 'insert'),
  'the API service role cannot manufacture canonical audit events');
select is(
  (select count(*)::integer from pg_trigger
    where tgname in (
      'catalogue_capture_sensitive_audit','vendor_order_capture_sensitive_audit',
      'quality_check_capture_sensitive_audit','payment_capture_sensitive_audit',
      'delivery_capture_sensitive_audit','delivery_pickup_capture_sensitive_audit',
      'application_capture_sensitive_audit','order_support_capture_sensitive_audit'
    ) and not tgisinternal),
  8,
  'all sensitive workflow audit sources feed the canonical ledger'
);

insert into auth.users(id,aud,role,email) values
  ('0f000000-0000-4000-8000-000000000001','authenticated','authenticated','audit-reviewer@example.test');
select set_config('app.audit_context', jsonb_build_object(
  'requestId','audit-http-request','operationId','1f000000-0000-4000-8000-000000000001',
  'ipAddress','127.0.0.1','userAgent','Audit test agent'
)::text, true);
insert into public.catalogue_audit_events(
  id,actor_user_id,action,entity_type,entity_id,previous_state,next_state
) values (
  '2f000000-0000-4000-8000-000000000001','0f000000-0000-4000-8000-000000000001',
  'listing.approve','listing','3f000000-0000-4000-8000-000000000001',
  '{"status":"pending_approval"}','{"status":"active","reviewNote":"Evidence verified"}'
);

select is((select action from public.audit_events where source_type='catalogue' and source_id='2f000000-0000-4000-8000-000000000001'),
  'catalogue.listing_approved','actions use the cross-workflow naming contract');
select is(public.normalize_sensitive_audit_action('application','application.approve'),
  'application.approved','historical application actions use the canonical vocabulary');
select is(public.normalize_sensitive_audit_action('payment','payment.flag_investigation'),
  'payment.investigation_flagged','payment investigation actions use the canonical vocabulary');
select is((select request_id from public.audit_events where source_id='2f000000-0000-4000-8000-000000000001'),
  'audit-http-request','HTTP request ID is captured atomically');
select is((select operation_id from public.audit_events where source_id='2f000000-0000-4000-8000-000000000001'),
  '1f000000-0000-4000-8000-000000000001'::uuid,'operation ID is captured atomically');
select is((select ip_address from public.audit_events where source_id='2f000000-0000-4000-8000-000000000001'),
  '127.0.0.1','request IP is captured');
select is((select user_agent from public.audit_events where source_id='2f000000-0000-4000-8000-000000000001'),
  'Audit test agent','user agent is captured');
select is((select previous_state->>'status' from public.audit_events where source_id='2f000000-0000-4000-8000-000000000001'),
  'pending_approval','previous state is retained');
select is((select new_state->>'status' from public.audit_events where source_id='2f000000-0000-4000-8000-000000000001'),
  'active','new state is retained');
select is((select reason from public.audit_events where source_id='2f000000-0000-4000-8000-000000000001'),
  'Evidence verified','the operator reason is retained');
select is(public.admin_list_audit_events(p_query=>'audit-http-request')->'pagination'->>'totalItems',
  '1','audit search correlates by request ID');
select is(public.admin_get_audit_event('catalogue:2f000000-0000-4000-8000-000000000001')->>'requestId',
  'audit-http-request','audit detail exposes request correlation');
select throws_ok(
  $$update public.audit_events set reason='tampered' where source_id='2f000000-0000-4000-8000-000000000001'$$,
  '23514','Audit events are append-only.','canonical events cannot be updated');
select throws_ok(
  $$delete from public.audit_events where source_id='2f000000-0000-4000-8000-000000000001'$$,
  '23514','Audit events are append-only.','canonical events cannot be deleted');
select ok(not has_function_privilege('anon',
  'public.admin_review_listing_audited(uuid,uuid,text,text,integer,uuid,jsonb)','execute'),
  'anonymous users cannot execute audited staff workflows');
select ok(not has_function_privilege('authenticated',
  'public.command_order_investigation_audited(uuid,uuid,text,jsonb,jsonb)','execute'),
  'authenticated clients cannot bypass the staff API workflow boundary');

select * from finish();
rollback;
