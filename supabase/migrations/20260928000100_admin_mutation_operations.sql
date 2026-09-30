-- Durable control plane for sensitive administrative mutations. Redis may cache
-- these results, but this table remains the source of truth across restarts.
create table public.admin_operations (
  operation_id uuid primary key,
  actor_staff_id uuid not null references public.staff_members(user_id),
  operation_type text not null check (operation_type ~ '^[a-z][a-z0-9_.-]{2,119}$'),
  entity_type text not null check (entity_type ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  entity_id text,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check (length(trim(reason)) between 5 and 500),
  expected_version bigint not null check (expected_version >= 0),
  status public.idempotency_status not null default 'processing',
  response_status integer check (response_status between 100 and 599),
  response_body jsonb,
  error_code text,
  error_message text,
  current_version bigint check (current_version is null or current_version >= 0),
  locked_until timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint admin_operations_result_shape check (
    (status = 'processing' and completed_at is null)
    or (status = 'completed' and response_status is not null and response_body is not null and completed_at is not null)
    or (status = 'failed' and response_status is not null and error_code is not null and error_message is not null and completed_at is not null)
  )
);

create index admin_operations_actor_created_idx
  on public.admin_operations(actor_staff_id, created_at desc);
create index admin_operations_entity_created_idx
  on public.admin_operations(entity_type, entity_id, created_at desc);
create index admin_operations_expiry_idx on public.admin_operations(expires_at);

alter table public.admin_operations enable row level security;
revoke all on public.admin_operations from anon, authenticated;
grant all on public.admin_operations to service_role;

create function public.claim_admin_operation(
  p_operation_id uuid,
  p_actor_staff_id uuid,
  p_operation_type text,
  p_entity_type text,
  p_entity_id text,
  p_request_hash text,
  p_reason text,
  p_expected_version bigint,
  p_lock_seconds integer default 30,
  p_ttl_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_record public.admin_operations;
  inserted_count integer;
begin
  insert into public.admin_operations (
    operation_id, actor_staff_id, operation_type, entity_type, entity_id,
    request_hash, reason, expected_version, locked_until, expires_at
  ) values (
    p_operation_id, p_actor_staff_id, p_operation_type, p_entity_type, p_entity_id,
    p_request_hash, trim(p_reason), p_expected_version,
    now() + make_interval(secs => p_lock_seconds),
    now() + make_interval(days => p_ttl_days)
  ) on conflict (operation_id) do nothing;
  get diagnostics inserted_count = row_count;

  select * into strict operation_record
  from public.admin_operations
  where operation_id = p_operation_id
  for update;

  if operation_record.actor_staff_id <> p_actor_staff_id
     or operation_record.operation_type <> p_operation_type
     or operation_record.entity_type <> p_entity_type
     or operation_record.entity_id is distinct from p_entity_id
     or operation_record.request_hash <> p_request_hash then
    return jsonb_build_object('action', 'conflict');
  end if;

  if inserted_count = 1 then
    return jsonb_build_object('action', 'proceed', 'operationId', operation_record.operation_id);
  end if;

  if operation_record.status = 'completed' then
    return jsonb_build_object(
      'action', 'replay', 'outcome', 'success',
      'responseStatus', operation_record.response_status,
      'responseBody', operation_record.response_body
    );
  end if;

  if operation_record.status = 'failed' then
    return jsonb_build_object(
      'action', 'replay', 'outcome', 'error',
      'responseStatus', operation_record.response_status,
      'errorCode', operation_record.error_code,
      'errorMessage', operation_record.error_message,
      'currentVersion', operation_record.current_version
    );
  end if;

  if operation_record.locked_until > now() then
    return jsonb_build_object('action', 'in_progress');
  end if;

  update public.admin_operations
  set locked_until = now() + make_interval(secs => p_lock_seconds),
      expires_at = greatest(expires_at, now() + make_interval(days => p_ttl_days))
  where operation_id = p_operation_id;

  return jsonb_build_object('action', 'proceed', 'operationId', operation_record.operation_id);
end;
$$;

create function public.complete_admin_operation(
  p_operation_id uuid,
  p_response_status integer,
  p_response_body jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.admin_operations
  set status = 'completed', response_status = p_response_status,
      response_body = p_response_body, error_code = null, error_message = null,
      current_version = null, locked_until = null, completed_at = now()
  where operation_id = p_operation_id and status = 'processing';
  if not found then
    raise exception using errcode = '55000', message = 'ADMIN_OPERATION_NOT_PROCESSING';
  end if;
end;
$$;

create function public.fail_admin_operation(
  p_operation_id uuid,
  p_response_status integer,
  p_error_code text,
  p_error_message text,
  p_current_version bigint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.admin_operations
  set status = 'failed', response_status = p_response_status,
      response_body = null, error_code = p_error_code,
      error_message = p_error_message, current_version = p_current_version,
      locked_until = null, completed_at = now()
  where operation_id = p_operation_id and status = 'processing';
end;
$$;

create function public.cleanup_admin_operations(p_batch_size integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare deleted_count integer;
begin
  with targets as (
    select operation_id from public.admin_operations
    where expires_at <= now()
    order by expires_at
    for update skip locked
    limit greatest(1, least(p_batch_size, 5000))
  )
  delete from public.admin_operations operation
  using targets
  where operation.operation_id = targets.operation_id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.claim_admin_operation(uuid,uuid,text,text,text,text,text,bigint,integer,integer) from public;
revoke all on function public.complete_admin_operation(uuid,integer,jsonb) from public;
revoke all on function public.fail_admin_operation(uuid,integer,text,text,bigint) from public;
revoke all on function public.cleanup_admin_operations(integer) from public;
grant execute on function public.claim_admin_operation(uuid,uuid,text,text,text,text,text,bigint,integer,integer) to service_role;
grant execute on function public.complete_admin_operation(uuid,integer,jsonb) to service_role;
grant execute on function public.fail_admin_operation(uuid,integer,text,text,bigint) to service_role;
grant execute on function public.cleanup_admin_operations(integer) to service_role;

-- Expose the version used by finance commands and enforce it inside the same
-- transaction that performs a refund/investigation mutation.
alter function public.admin_get_payment_detail(uuid)
  rename to admin_get_payment_detail_without_version;

create function public.admin_get_payment_detail(p_payment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  detail jsonb;
  current_version bigint;
begin
  detail := public.admin_get_payment_detail_without_version(p_payment_id);
  select version into strict current_version
  from public.payment_attempts
  where id = p_payment_id;
  return detail || jsonb_build_object('version', current_version);
end;
$$;

alter function public.command_payment_finance(uuid,uuid,text,jsonb)
  rename to command_payment_finance_without_version_check;

create function public.command_payment_finance(
  p_actor uuid,
  p_payment_id uuid,
  p_action text,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_version bigint;
  expected_version bigint;
  requested_operation_id uuid := (p_input->>'operationId')::uuid;
  result jsonb;
begin
  if exists (
    select 1 from public.payment_finance_operations
    where operation_id = requested_operation_id
  ) then
    result := public.command_payment_finance_without_version_check(
      p_actor, p_payment_id, p_action, p_input
    );
    select version into current_version from public.payment_attempts where id = p_payment_id;
    return result || jsonb_build_object('version', current_version);
  end if;

  begin
    expected_version := (p_input->>'expectedVersion')::bigint;
  exception when invalid_text_representation then
    raise exception 'Expected version must be a non-negative integer.' using errcode = '22023';
  end;
  if expected_version is null or expected_version < 0 then
    raise exception 'Expected version must be a non-negative integer.' using errcode = '22023';
  end if;

  select version into current_version
  from public.payment_attempts
  where id = p_payment_id
  for update;
  if not found then
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;
  if current_version <> expected_version then
    raise exception using
      errcode = '40001',
      message = 'Payment changed. Refresh before continuing.',
      detail = 'currentVersion=' || current_version::text;
  end if;

  result := public.command_payment_finance_without_version_check(
    p_actor, p_payment_id, p_action, p_input
  );
  update public.payment_attempts
  set version = version + 1
  where id = p_payment_id
  returning version into current_version;
  return result || jsonb_build_object('version', current_version);
end;
$$;

revoke all on function public.admin_get_payment_detail_without_version(uuid) from public,anon,authenticated;
revoke all on function public.admin_get_payment_detail(uuid) from public,anon,authenticated;
revoke all on function public.command_payment_finance_without_version_check(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.command_payment_finance(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_get_payment_detail_without_version(uuid) to service_role;
grant execute on function public.admin_get_payment_detail(uuid) to service_role;
grant execute on function public.command_payment_finance_without_version_check(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.command_payment_finance(uuid,uuid,text,jsonb) to service_role;

-- The order investigation screen can initiate finance mutations, so include
-- the same payment version in its nested payment projection.
alter function public.admin_get_order_investigation(uuid)
  rename to admin_get_order_investigation_without_payment_version;

create function public.admin_get_order_investigation(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  detail jsonb;
  payment_version bigint;
begin
  detail := public.admin_get_order_investigation_without_payment_version(p_order_id);
  if detail->'payment' is not null and detail->'payment' <> 'null'::jsonb then
    select version into payment_version
    from public.payment_attempts
    where id = (detail->'payment'->>'id')::uuid;
    detail := jsonb_set(detail, '{payment,version}', to_jsonb(payment_version), true);
  end if;
  return detail;
end;
$$;

revoke all on function public.admin_get_order_investigation_without_payment_version(uuid) from public,anon,authenticated;
revoke all on function public.admin_get_order_investigation(uuid) from public,anon,authenticated;
grant execute on function public.admin_get_order_investigation_without_payment_version(uuid) to service_role;
grant execute on function public.admin_get_order_investigation(uuid) to service_role;

select cron.schedule(
  'cleanup-admin-operations',
  '17 2 * * *',
  $$select public.cleanup_admin_operations(1000)$$
);
