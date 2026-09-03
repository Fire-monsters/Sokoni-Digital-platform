-- Align the initial grants with the Phase 1 least-privilege role matrix.
delete from public.role_permissions where role <> 'admin';

insert into public.role_permissions (role, permission) values
  ('agent', 'overview.read'), ('agent', 'orders.read'), ('agent', 'orders.support'),
  ('agent', 'deliveries.read'), ('agent', 'applications.read'), ('agent', 'applications.review'),
  ('agent', 'catalogue.read'), ('agent', 'catalogue.review'), ('agent', 'payments.read'),
  ('agent', 'refunds.read'), ('agent', 'users.read'), ('agent', 'notifications.read'),
  ('agent', 'notifications.manage'), ('agent', 'reports.read'), ('agent', 'audit.read'),
  ('dispatcher', 'overview.read'), ('dispatcher', 'orders.read'),
  ('dispatcher', 'deliveries.read'), ('dispatcher', 'deliveries.manage'),
  ('dispatcher', 'reports.read'),
  ('finance', 'overview.read'), ('finance', 'orders.read'), ('finance', 'deliveries.read'),
  ('finance', 'payments.read'), ('finance', 'payments.reconcile'), ('finance', 'refunds.read'),
  ('finance', 'refunds.manage'), ('finance', 'settlements.read'),
  ('finance', 'settlements.manage'), ('finance', 'reports.read'), ('finance', 'audit.read'),
  ('viewer', 'overview.read'), ('viewer', 'reports.read'), ('viewer', 'audit.read');
