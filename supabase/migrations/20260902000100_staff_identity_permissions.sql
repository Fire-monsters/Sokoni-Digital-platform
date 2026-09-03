create type public.staff_role as enum ('admin', 'agent', 'dispatcher', 'finance', 'viewer');
create type public.staff_status as enum ('active', 'suspended', 'disabled');

create table public.permissions (
  key text primary key check (key ~ '^[a-z]+(\.[a-z]+)+$'),
  description text not null check (length(trim(description)) > 0),
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role public.staff_role not null,
  permission text not null references public.permissions(key) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role, permission)
);

create table public.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.staff_role not null,
  status public.staff_status not null default 'active',
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index staff_members_role_status_idx on public.staff_members(role, status);

create function public.set_staff_member_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger staff_members_set_updated_at before update on public.staff_members
for each row execute function public.set_staff_member_updated_at();

insert into public.permissions (key, description) values
  ('overview.read', 'View the operations overview'),
  ('orders.read', 'View orders'), ('orders.support', 'Perform order support actions'),
  ('deliveries.read', 'View deliveries'), ('deliveries.manage', 'Manage delivery operations'),
  ('applications.read', 'View staff application queues'), ('applications.review', 'Review applications'),
  ('catalogue.read', 'View catalogue governance queues'), ('catalogue.review', 'Review listings and prices'),
  ('payments.read', 'View payments'), ('payments.reconcile', 'Reconcile payments'),
  ('refunds.read', 'View refunds'), ('refunds.manage', 'Manage refunds'),
  ('settlements.read', 'View settlements'), ('settlements.manage', 'Manage settlements'),
  ('users.read', 'View users and devices'), ('users.manage', 'Manage users and devices'),
  ('notifications.read', 'View notification operations'), ('notifications.manage', 'Manage notifications'),
  ('reports.read', 'View operational reports'), ('audit.read', 'View the audit log'),
  ('settings.manage', 'Manage operations settings');

insert into public.role_permissions (role, permission)
select 'admin'::public.staff_role, key from public.permissions;

insert into public.role_permissions (role, permission) values
  ('agent', 'overview.read'), ('agent', 'orders.read'), ('agent', 'orders.support'),
  ('agent', 'deliveries.read'), ('agent', 'deliveries.manage'), ('agent', 'applications.read'),
  ('agent', 'applications.review'), ('agent', 'catalogue.read'), ('agent', 'catalogue.review'),
  ('agent', 'payments.read'), ('agent', 'refunds.read'), ('agent', 'users.read'),
  ('agent', 'notifications.read'),
  ('dispatcher', 'overview.read'), ('dispatcher', 'orders.read'), ('dispatcher', 'deliveries.read'),
  ('dispatcher', 'deliveries.manage'), ('dispatcher', 'applications.read'),
  ('finance', 'overview.read'), ('finance', 'orders.read'), ('finance', 'payments.read'),
  ('finance', 'payments.reconcile'), ('finance', 'refunds.read'), ('finance', 'refunds.manage'),
  ('finance', 'settlements.read'), ('finance', 'settlements.manage'), ('finance', 'reports.read'),
  ('finance', 'audit.read'),
  ('viewer', 'overview.read'), ('viewer', 'orders.read'), ('viewer', 'deliveries.read'),
  ('viewer', 'applications.read'), ('viewer', 'catalogue.read'), ('viewer', 'payments.read'),
  ('viewer', 'refunds.read'), ('viewer', 'settlements.read'), ('viewer', 'users.read'),
  ('viewer', 'notifications.read'), ('viewer', 'reports.read'), ('viewer', 'audit.read');

-- Preserve access for existing metadata-based admin and agent users during migration.
insert into public.staff_members (user_id, role, display_name)
select id, (raw_app_meta_data->>'role')::public.staff_role,
       coalesce(nullif(trim(raw_user_meta_data->>'display_name'), ''), split_part(email, '@', 1), 'Staff member')
from auth.users
where raw_app_meta_data->>'role' in ('admin', 'agent')
on conflict (user_id) do nothing;

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.staff_members enable row level security;

revoke all on public.permissions, public.role_permissions, public.staff_members from anon, authenticated;
grant all on public.permissions, public.role_permissions, public.staff_members to service_role;
