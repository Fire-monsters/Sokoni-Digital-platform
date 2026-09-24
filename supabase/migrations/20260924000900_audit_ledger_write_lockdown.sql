-- Only the security-definer capture trigger may append canonical events. Even the
-- application service role cannot manufacture ledger rows directly.
revoke insert, update, delete, truncate on public.audit_events from service_role;
grant select on public.audit_events to service_role;
