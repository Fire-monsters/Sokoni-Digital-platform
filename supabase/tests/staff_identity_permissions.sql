begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_table('public', 'staff_members', 'staff identity table exists');
select has_table('public', 'permissions', 'permission catalogue exists');
select has_table('public', 'role_permissions', 'role grants exist');
select has_type('public', 'staff_role', 'staff roles use a database enum');
select has_type('public', 'staff_status', 'staff statuses use a database enum');
select is(
  (select count(*) from public.role_permissions where role = 'admin'),
  (select count(*) from public.permissions),
  'administrators receive every permission'
);
select ok(
  exists (select 1 from public.role_permissions where role = 'dispatcher' and permission = 'deliveries.manage'),
  'dispatchers can manage deliveries'
);
select ok(
  not exists (select 1 from public.role_permissions where role = 'finance' and permission = 'deliveries.manage'),
  'finance cannot manage deliveries'
);
select ok(
  not exists (select 1 from public.role_permissions where role = 'viewer' and permission like '%.manage'),
  'viewers receive no manage permissions'
);
select ok(
  not exists (select 1 from public.role_permissions where role = 'viewer' and permission = 'orders.read'),
  'viewers cannot access orders'
);
select ok(
  not exists (select 1 from public.role_permissions where role = 'agent' and permission = 'deliveries.manage'),
  'agents have read-only delivery access'
);
select ok(
  exists (select 1 from public.role_permissions where role = 'finance' and permission = 'deliveries.read'),
  'finance can read delivery information'
);

select * from finish();
rollback;
