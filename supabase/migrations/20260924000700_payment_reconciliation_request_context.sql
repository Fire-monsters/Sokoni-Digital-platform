create function public.apply_payment_reconciliation_audited(
  p_payment_id uuid, p_evidence jsonb, p_source text, p_actor uuid,
  p_operation_id uuid, p_audit_context jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.set_sensitive_audit_context(p_audit_context, p_operation_id);
  return public.apply_payment_reconciliation(
    p_payment_id, p_evidence, p_source, p_actor, p_operation_id
  );
end;
$$;

revoke all on function public.apply_payment_reconciliation_audited(uuid,jsonb,text,uuid,uuid,jsonb) from public;
grant execute on function public.apply_payment_reconciliation_audited(uuid,jsonb,text,uuid,uuid,jsonb) to service_role;
