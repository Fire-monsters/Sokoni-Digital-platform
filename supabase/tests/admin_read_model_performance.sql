begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select lives_ok(
  $$explain (analyze, buffers, format json) select public.admin_get_operational_overview()$$,
  'overview read model has an executable query plan'
);
select lives_ok(
  $$explain (analyze, buffers, format json) select public.admin_list_orders()$$,
  'order queue has an executable query plan'
);
select lives_ok(
  $$explain (analyze, buffers, format json) select public.admin_list_applications()$$,
  'application queue has an executable query plan'
);
select lives_ok(
  $$explain (analyze, buffers, format json) select public.admin_list_payment_reconciliation()$$,
  'payment reconciliation has an executable query plan'
);
select lives_ok(
  $$explain (analyze, buffers, format json) select public.admin_list_refunds()$$,
  'refund queue has an executable query plan'
);
select lives_ok(
  $$explain (analyze, buffers, format json) select public.admin_list_audit_events()$$,
  'audit queue has an executable query plan'
);

select ok(exists (
  select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'catalogue_audit_admin_created_idx'
), 'catalogue audit events have an admin timeline index');
select ok(exists (
  select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'payment_audit_admin_created_idx'
), 'payment audit events have an admin timeline index');
select ok(exists (
  select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'vendor_order_audit_admin_created_idx'
), 'vendor order audit events have an admin timeline index');
select ok(exists (
  select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'quality_check_audit_admin_created_idx'
), 'quality audit events have an admin timeline index');
select ok(exists (
  select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'delivery_audit_admin_created_idx'
), 'delivery audit events have an admin timeline index');
select ok(exists (
  select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'delivery_pickup_audit_admin_created_idx'
), 'pickup audit events have an admin timeline index');

select * from finish();
rollback;
