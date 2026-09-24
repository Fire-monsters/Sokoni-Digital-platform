-- Audited wrappers bind transport request metadata to the same transaction as the
-- authoritative workflow and its domain/canonical audit rows.
create function public.set_sensitive_audit_context(p_context jsonb, p_operation_id uuid)
returns void language plpgsql set search_path = '' as $$
declare normalized jsonb;
begin
  if p_context is null or jsonb_typeof(p_context) <> 'object' then
    raise exception 'Audit context must be an object.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_context->>'requestId', '')) not between 1 and 128
    or char_length(coalesce(p_context->>'ipAddress', '')) > 128
    or char_length(coalesce(p_context->>'userAgent', '')) > 1000 then
    raise exception 'Audit context is invalid.' using errcode = '22023';
  end if;
  normalized := jsonb_strip_nulls(jsonb_build_object(
    'requestId', p_context->>'requestId',
    'ipAddress', nullif(p_context->>'ipAddress', ''),
    'userAgent', nullif(p_context->>'userAgent', ''),
    'operationId', p_operation_id
  ));
  perform set_config('app.audit_context', normalized::text, true);
end;
$$;

create function public.admin_review_listing_audited(
  p_listing_id uuid, p_admin_id uuid, p_decision text, p_review_note text,
  p_expected_version integer, p_operation_id uuid, p_audit_context jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.set_sensitive_audit_context(p_audit_context, p_operation_id);
  return public.admin_review_listing(p_listing_id,p_admin_id,p_decision,p_review_note,p_expected_version,p_operation_id);
end;
$$;

create function public.admin_review_price_request_audited(
  p_request_id uuid, p_admin_id uuid, p_decision text, p_review_note text,
  p_operation_id uuid, p_audit_context jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.set_sensitive_audit_context(p_audit_context, p_operation_id);
  return public.admin_review_price_request(p_request_id,p_admin_id,p_decision,p_review_note,p_operation_id);
end;
$$;

create function public.review_account_application_audited(
  p_id uuid, p_actor uuid, p_action text, p_version integer, p_operation_id uuid,
  p_reason text, p_notes text, p_issues text[], p_audit_context jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.set_sensitive_audit_context(p_audit_context, p_operation_id);
  return public.review_account_application(p_id,p_actor,p_action,p_version,p_operation_id,p_reason,p_notes,p_issues);
end;
$$;

create function public.dispatcher_assign_delivery_audited(
  p_delivery_id uuid, p_transporter_id uuid, p_dispatcher_user_id uuid, p_reason text,
  p_expected_version integer, p_operation_id uuid, p_reassign boolean, p_audit_context jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.set_sensitive_audit_context(p_audit_context, p_operation_id);
  return public.dispatcher_assign_delivery(p_delivery_id,p_transporter_id,p_dispatcher_user_id,
    p_reason,p_expected_version,p_operation_id,p_reassign);
end;
$$;

create function public.resolve_delivery_issue_audited(
  p_issue_id uuid, p_dispatcher_user_id uuid, p_resolution_code text,
  p_resolution_note text, p_operation_id uuid, p_audit_context jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.set_sensitive_audit_context(p_audit_context, p_operation_id);
  return public.resolve_delivery_issue(p_issue_id,p_dispatcher_user_id,p_resolution_code,p_resolution_note,p_operation_id);
end;
$$;

create function public.dispatcher_delivery_action_audited(
  p_delivery_id uuid, p_dispatcher_user_id uuid, p_action text, p_reason text,
  p_expected_version integer, p_operation_id uuid, p_audit_context jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.set_sensitive_audit_context(p_audit_context, p_operation_id);
  return public.dispatcher_delivery_action(p_delivery_id,p_dispatcher_user_id,p_action,p_reason,
    p_expected_version,p_operation_id);
end;
$$;

create function public.command_payment_finance_audited(
  p_actor uuid, p_payment_id uuid, p_action text, p_input jsonb, p_audit_context jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.set_sensitive_audit_context(p_audit_context, (p_input->>'operationId')::uuid);
  return public.command_payment_finance(p_actor,p_payment_id,p_action,p_input);
end;
$$;

create function public.command_order_investigation_audited(
  p_order_id uuid, p_actor uuid, p_action text, p_input jsonb, p_audit_context jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.set_sensitive_audit_context(p_audit_context, (p_input->>'operationId')::uuid);
  return public.command_order_investigation(p_order_id,p_actor,p_action,p_input);
end;
$$;

revoke all on function public.set_sensitive_audit_context(jsonb,uuid) from public;
revoke all on function public.admin_review_listing_audited(uuid,uuid,text,text,integer,uuid,jsonb) from public;
revoke all on function public.admin_review_price_request_audited(uuid,uuid,text,text,uuid,jsonb) from public;
revoke all on function public.review_account_application_audited(uuid,uuid,text,integer,uuid,text,text,text[],jsonb) from public;
revoke all on function public.dispatcher_assign_delivery_audited(uuid,uuid,uuid,text,integer,uuid,boolean,jsonb) from public;
revoke all on function public.resolve_delivery_issue_audited(uuid,uuid,text,text,uuid,jsonb) from public;
revoke all on function public.dispatcher_delivery_action_audited(uuid,uuid,text,text,integer,uuid,jsonb) from public;
revoke all on function public.command_payment_finance_audited(uuid,uuid,text,jsonb,jsonb) from public;
revoke all on function public.command_order_investigation_audited(uuid,uuid,text,jsonb,jsonb) from public;

grant execute on function public.admin_review_listing_audited(uuid,uuid,text,text,integer,uuid,jsonb) to service_role;
grant execute on function public.admin_review_price_request_audited(uuid,uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.review_account_application_audited(uuid,uuid,text,integer,uuid,text,text,text[],jsonb) to service_role;
grant execute on function public.dispatcher_assign_delivery_audited(uuid,uuid,uuid,text,integer,uuid,boolean,jsonb) to service_role;
grant execute on function public.resolve_delivery_issue_audited(uuid,uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.dispatcher_delivery_action_audited(uuid,uuid,text,text,integer,uuid,jsonb) to service_role;
grant execute on function public.command_payment_finance_audited(uuid,uuid,text,jsonb,jsonb) to service_role;
grant execute on function public.command_order_investigation_audited(uuid,uuid,text,jsonb,jsonb) to service_role;
