begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select has_table('public', 'admin_operations', 'durable admin operation table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.admin_operations'::regclass),
  'admin operations have RLS enabled'
);
select ok(not has_table_privilege('authenticated', 'public.admin_operations', 'select'),
  'authenticated clients cannot read operation results directly');
select ok(not has_table_privilege('authenticated', 'public.admin_operations', 'insert'),
  'authenticated clients cannot forge operation results');
select ok(has_table_privilege('service_role', 'public.admin_operations', 'select'),
  'the trusted API can read operation results');
select ok(not has_function_privilege(
  'authenticated',
  'public.claim_admin_operation(uuid,uuid,text,text,text,text,text,bigint,integer,integer)',
  'execute'
), 'clients cannot bypass the controlled mutation boundary');

insert into auth.users(id,aud,role,email) values
  ('4a100000-0000-4000-8000-000000000001','authenticated','authenticated','phase4-operator@example.test');
insert into public.staff_members(user_id,display_name,role) values
  ('4a100000-0000-4000-8000-000000000001','Phase 4 Operator','admin');

select is(
  public.claim_admin_operation(
    '4a100000-0000-4000-8000-000000000010',
    '4a100000-0000-4000-8000-000000000001',
    'orders.cancel','order','4a100000-0000-4000-8000-000000000020',
    repeat('a',64),'Customer requested cancellation',4
  )->>'action',
  'proceed',
  'a new operation is claimed once'
);
select is(
  (select reason from public.admin_operations where operation_id='4a100000-0000-4000-8000-000000000010'),
  'Customer requested cancellation',
  'control metadata is persisted'
);
select is(
  public.claim_admin_operation(
    '4a100000-0000-4000-8000-000000000010',
    '4a100000-0000-4000-8000-000000000001',
    'orders.cancel','order','4a100000-0000-4000-8000-000000000020',
    repeat('a',64),'Customer requested cancellation',4
  )->>'action',
  'in_progress',
  'a concurrent retry cannot execute'
);
select is(
  public.claim_admin_operation(
    '4a100000-0000-4000-8000-000000000010',
    '4a100000-0000-4000-8000-000000000001',
    'orders.cancel','order','4a100000-0000-4000-8000-000000000020',
    repeat('b',64),'Customer requested cancellation',4
  )->>'action',
  'conflict',
  'an operation ID cannot be reused with another payload'
);

select lives_ok(
  $$select public.complete_admin_operation(
    '4a100000-0000-4000-8000-000000000010',200,'{"status":"cancelled"}'::jsonb
  )$$,
  'the result is durably completed'
);
select is(
  (select status::text from public.admin_operations where operation_id='4a100000-0000-4000-8000-000000000010'),
  'completed',
  'completed status is persisted'
);
select is(
  public.claim_admin_operation(
    '4a100000-0000-4000-8000-000000000010',
    '4a100000-0000-4000-8000-000000000001',
    'orders.cancel','order','4a100000-0000-4000-8000-000000000020',
    repeat('a',64),'Customer requested cancellation',4
  )->>'outcome',
  'success',
  'a completed retry replays success'
);
select is(
  public.claim_admin_operation(
    '4a100000-0000-4000-8000-000000000010',
    '4a100000-0000-4000-8000-000000000001',
    'orders.cancel','order','4a100000-0000-4000-8000-000000000020',
    repeat('a',64),'Customer requested cancellation',4
  )->'responseBody'->>'status',
  'cancelled',
  'the original result is returned without re-execution'
);

select is(
  public.claim_admin_operation(
    '4a100000-0000-4000-8000-000000000011',
    '4a100000-0000-4000-8000-000000000001',
    'catalogue.listing.approve','listing','4a100000-0000-4000-8000-000000000021',
    repeat('c',64),'Evidence is no longer current',7
  )->>'action',
  'proceed',
  'a second operation can be claimed'
);
select lives_ok(
  $$select public.fail_admin_operation(
    '4a100000-0000-4000-8000-000000000011',409,'VERSION_CONFLICT',
    'Refresh before continuing.',8
  )$$,
  'a deterministic failure is persisted'
);
select is(
  public.claim_admin_operation(
    '4a100000-0000-4000-8000-000000000011',
    '4a100000-0000-4000-8000-000000000001',
    'catalogue.listing.approve','listing','4a100000-0000-4000-8000-000000000021',
    repeat('c',64),'Evidence is no longer current',7
  )->>'errorCode',
  'VERSION_CONFLICT',
  'failed retries replay the standard error'
);

select * from finish();
rollback;
