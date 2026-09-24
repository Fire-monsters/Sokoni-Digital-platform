-- Provider evidence, payment transitions and reconciliation audit commit together.
alter table public.payment_reconciliation_runs
  add column local_status_after public.payment_status,
  add column error_code text,
  add column operation_id uuid,
  add column request_reference text,
  add column response jsonb;
create unique index payment_reconciliation_operation_idx
  on public.payment_reconciliation_runs(payment_attempt_id, operation_id) where operation_id is not null;

create table public.payment_investigations (
  id uuid primary key default extensions.gen_random_uuid(),
  payment_attempt_id uuid not null references public.payment_attempts(id),
  reason_code text not null check (reason_code in ('provider_mismatch', 'duplicate_provider_event',
    'unmatched_provider_reference', 'incorrect_amount', 'callback_missing', 'suspected_duplicate_payment')),
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index payment_investigations_queue_idx on public.payment_investigations(status, created_at desc);
create table public.payment_finance_operations (
  operation_id uuid primary key,
  actor_id uuid not null references auth.users(id),
  payment_attempt_id uuid not null references public.payment_attempts(id),
  action text not null,
  input jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);
create table public.payment_reconciliation_batches (
  operation_id uuid primary key,
  actor_id uuid not null references auth.users(id),
  payment_ids uuid[] not null,
  created_at timestamptz not null default now()
);
alter table public.payment_investigations enable row level security;
alter table public.payment_finance_operations enable row level security;
alter table public.payment_reconciliation_batches enable row level security;
revoke all on public.payment_investigations, public.payment_finance_operations, public.payment_reconciliation_batches from public, anon, authenticated;
grant all on public.payment_investigations, public.payment_finance_operations, public.payment_reconciliation_batches to service_role;

create function public.apply_payment_reconciliation(
  p_payment_id uuid, p_evidence jsonb, p_source text,
  p_actor uuid default null, p_operation_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  payment public.payment_attempts;
  prior public.payment_reconciliation_runs;
  final_status public.payment_status;
  outcome public.reconciliation_result;
  result jsonb;
  run_id uuid;
begin
  if p_source = 'admin_request' and (p_actor is null or not exists (
    select 1 from public.staff_members s join public.role_permissions r on r.role=s.role
    where s.user_id=p_actor and s.status='active' and r.permission='payments.reconcile'
  )) then raise exception 'Payment reconciliation permission required.' using errcode='42501'; end if;
  select * into payment from public.payment_attempts where id=p_payment_id for update;
  if not found then raise exception 'Payment not found.' using errcode='P0002'; end if;
  if payment.provider <> 'pesapal' then raise exception 'Only digital payments can be rechecked with a provider.' using errcode='22023'; end if;
  if p_operation_id is not null then
    select * into prior from public.payment_reconciliation_runs where payment_attempt_id=p_payment_id and operation_id=p_operation_id;
    if found then
      if prior.requested_by is distinct from p_actor or prior.run_source <> p_source then
        raise exception 'Operation belongs to another request.' using errcode='55000'; end if;
      return prior.response || jsonb_build_object('duplicate', true);
    end if;
  end if;
  if p_evidence->>'errorCode' is not null then
    outcome := case when p_evidence->>'errorCode'='REFERENCE_MISMATCH' then 'reference_mismatch'::public.reconciliation_result else 'manual_review_required'::public.reconciliation_result end;
  else
    -- The normalized evidence comes only from the server-side provider adapter.
    if coalesce(p_evidence->>'status','') not in ('pending','successful','failed','unknown')
      or nullif(p_evidence->>'transactionId','') is null
      or (p_evidence->>'amount') is null or (p_evidence->>'amount')::bigint < 0
      or nullif(p_evidence->>'currency','') is null then
      raise exception 'Incomplete provider evidence.' using errcode='22023'; end if;
    perform public.process_payment_result(payment.provider, p_evidence->>'transactionId',
      payment.merchant_reference, p_evidence->>'status', (p_evidence->>'amount')::bigint,
      p_evidence->>'currency', (p_evidence->>'paymentMethod')::public.payment_method,
      (p_evidence->>'providerEventId')::uuid, p_evidence->>'confirmationCode',
      p_evidence->>'reasonCode', p_evidence->>'message');
    select status into final_status from public.payment_attempts where id=p_payment_id;
    outcome := case
      when payment.provider_transaction_id is not null and payment.provider_transaction_id is distinct from p_evidence->>'transactionId' then 'reference_mismatch'
      when payment.amount_ugx is distinct from (p_evidence->>'amount')::bigint or payment.currency_code is distinct from p_evidence->>'currency' then 'amount_mismatch'
      when p_evidence->>'status'='unknown' or final_status='requires_reconciliation'
        or (payment.status='successful' and p_evidence->>'status'<>'successful')
        or (final_status in ('failed','cancelled','expired') and p_evidence->>'status'<>'failed') then 'manual_review_required'
      when final_status <> payment.status then 'status_updated'
      when final_status='successful' then 'matched'
      else 'no_change' end;
  end if;
  select status into final_status from public.payment_attempts where id=p_payment_id;
  run_id := extensions.gen_random_uuid();
  result := jsonb_build_object('paymentAttemptId', p_payment_id, 'status', final_status,
    'outcome', outcome, 'reconciliationId', run_id, 'duplicate', false);
  insert into public.payment_reconciliation_runs(id, payment_attempt_id, provider, previous_status,
    provider_status, result, provider_amount_ugx, provider_currency, provider_response, run_source,
    requested_by, local_status_after, error_code, operation_id, request_reference, response)
  values (run_id, p_payment_id, payment.provider, payment.status, coalesce(p_evidence->>'status','unknown'),
    outcome, (p_evidence->>'amount')::bigint, p_evidence->>'currency', p_evidence,
    p_source, p_actor, final_status, p_evidence->>'errorCode', p_operation_id,
    payment.provider_transaction_id, result);
  insert into public.payment_audit_events(payment_attempt_id, provider_event_id, actor_user_id, action, previous_status, next_status, details)
  values(p_payment_id, (p_evidence->>'providerEventId')::uuid, p_actor, 'payment.reconciled', payment.status, final_status,
    jsonb_build_object('operationId', p_operation_id, 'reconciliationId', run_id,
      'result', outcome, 'source', p_source, 'errorCode', p_evidence->>'errorCode'));
  return result;
end;
$$;

-- Replays keep the original bounded batch, rather than consuming the next page.
create function public.claim_admin_payment_batch(p_actor uuid, p_operation_id uuid, p_limit integer)
returns setof public.payment_attempts language plpgsql security definer set search_path = '' as $$
declare prior public.payment_reconciliation_batches; ids uuid[];
begin
  if p_actor is null or p_operation_id is null or not exists (
    select 1 from public.staff_members s join public.role_permissions r on r.role=s.role
    where s.user_id=p_actor and s.status='active' and r.permission='payments.reconcile'
  ) then raise exception 'Payment reconciliation permission required.' using errcode='42501'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception 'Admin batches must contain between 1 and 10 payments.' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text, 34));
  select * into prior from public.payment_reconciliation_batches where operation_id=p_operation_id;
  if found then
    if prior.actor_id<>p_actor then raise exception 'Operation belongs to another request.' using errcode='55000'; end if;
    ids:=prior.payment_ids;
  else
    select coalesce(array_agg((entry->>'id')::uuid), '{}'::uuid[]) into ids
      from jsonb_array_elements(public.claim_payment_reconciliation_batch(p_limit, 55)) entry;
    insert into public.payment_reconciliation_batches values(p_operation_id, p_actor, ids, now());
  end if;
  return query select * from public.payment_attempts where id=any(ids) order by id;
end;
$$;

create function public.command_payment_finance(p_actor uuid, p_payment_id uuid, p_action text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payment public.payment_attempts; prior public.payment_finance_operations;
  operation uuid := (p_input->>'operationId')::uuid; case_id uuid; result jsonb; reserved bigint;
begin
  if p_action not in ('flag-investigation', 'request-refund') or operation is null then
    raise exception 'Invalid finance command.' using errcode='22023'; end if;
  if not exists (select 1 from public.staff_members s join public.role_permissions r on r.role=s.role
    where s.user_id=p_actor and s.status='active' and r.permission=case when p_action='request-refund' then 'refunds.manage' else 'payments.reconcile' end
  ) then raise exception 'Finance permission required.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(operation::text, 35));
  select * into prior from public.payment_finance_operations where operation_id=operation;
  if found then
    if prior.actor_id<>p_actor or prior.payment_attempt_id<>p_payment_id or prior.action<>p_action or prior.input<>p_input then
      raise exception 'Operation was reused with a different command.' using errcode='55000'; end if;
    return prior.response || jsonb_build_object('duplicate', true);
  end if;
  select * into payment from public.payment_attempts where id=p_payment_id for update;
  if not found then raise exception 'Payment not found.' using errcode='P0002'; end if;
  if coalesce(char_length(trim(p_input->>'reason')),0) not between 3 and 1000 then
    raise exception 'A reason is required.' using errcode='22023'; end if;
  if p_action='flag-investigation' then
    insert into public.payment_investigations(payment_attempt_id, reason_code, reason, created_by)
    values(p_payment_id, p_input->>'reasonCode', trim(p_input->>'reason'), p_actor) returning id into case_id;
  else
    if payment.status <> 'successful' then raise exception 'Only successful payments can be refunded.' using errcode='55000'; end if;
    select coalesce(sum(requested_amount_ugx),0) into reserved from public.refund_cases
      where payment_attempt_id=p_payment_id and status not in ('cancelled','rejected');
    if (p_input->>'amount') is null or (p_input->>'amount')::bigint <= 0 or
      (p_input->>'amount')::bigint > payment.amount_ugx-reserved then
      raise exception 'Refund exceeds the unreserved payment amount.' using errcode='22023'; end if;
    insert into public.refund_cases(checkout_id, payment_attempt_id, reason, requested_amount_ugx,
      currency_code, status, approval_state, proposed_by, resolution_notes)
    values(payment.checkout_id, p_payment_id, (p_input->>'reasonCode')::public.refund_reason,
      (p_input->>'amount')::bigint, payment.currency_code, 'awaiting_approval', 'pending', p_actor, trim(p_input->>'reason'))
    returning id into case_id;
  end if;
  result:=jsonb_build_object('id', case_id, 'paymentAttemptId', p_payment_id,
    'status', case when p_action='request-refund' then 'awaiting_approval' else 'open' end, 'duplicate', false);
  insert into public.payment_audit_events(payment_attempt_id, actor_user_id, action, previous_status, next_status, details)
  values(p_payment_id,p_actor,'payment.'||replace(p_action,'-','_'),payment.status,payment.status,
    jsonb_build_object('operationId',operation,'caseId',case_id,'reason',p_input->>'reason','reasonCode',p_input->>'reasonCode','amount',p_input->'amount'));
  insert into public.payment_finance_operations values(operation,p_actor,p_payment_id,p_action,p_input,result,now());
  return result;
end;
$$;

create function public.admin_get_payment_detail(p_payment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  select jsonb_build_object('id',p.id,'checkoutId',p.checkout_id,'reference',c.reference,
    'provider',p.provider,'status',p.status,'amount',p.amount_ugx,'currency',p.currency_code,
    'merchantReference',p.merchant_reference,'providerReference',p.provider_transaction_id,
    'createdAt',p.created_at,
    'reconciliations',coalesce((select jsonb_agg(x order by x.created_at desc,x.id desc) from (
      select id, previous_status, local_status_after, provider_status, result, error_code, requested_by,
        run_source, request_reference, provider_amount_ugx, provider_currency, created_at
      from public.payment_reconciliation_runs where payment_attempt_id=p.id order by created_at desc,id desc limit 100
    ) x),'[]'::jsonb),
    'providerEvents',coalesce((select jsonb_agg(x order by x.received_at desc,x.id desc) from (
      select id, provider_transaction_id, processing_status, received_at, processed_at, verification_method
      from public.payment_provider_events where merchant_reference=p.merchant_reference and provider=p.provider
      order by received_at desc,id desc limit 100
    ) x),'[]'::jsonb),
    'investigations',coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select id,reason_code,reason,status,created_by,created_at from public.payment_investigations
      where payment_attempt_id=p.id order by created_at desc,id desc limit 100) x),'[]'::jsonb),
    'refunds',coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select id,reason,requested_amount_ugx,status,approval_state,created_at from public.refund_cases
      where payment_attempt_id=p.id order by created_at desc,id desc limit 100) x),'[]'::jsonb)
  ) into result from public.payment_attempts p join public.customer_checkouts c on c.id=p.checkout_id where p.id=p_payment_id;
  if result is null then raise exception 'Payment not found.' using errcode='P0002'; end if;
  return result;
end;
$$;

revoke all on function public.apply_payment_reconciliation(uuid,jsonb,text,uuid,uuid),
  public.claim_admin_payment_batch(uuid,uuid,integer), public.command_payment_finance(uuid,uuid,text,jsonb),
  public.admin_get_payment_detail(uuid) from public, anon, authenticated;
grant execute on function public.apply_payment_reconciliation(uuid,jsonb,text,uuid,uuid),
  public.claim_admin_payment_batch(uuid,uuid,integer), public.command_payment_finance(uuid,uuid,text,jsonb),
  public.admin_get_payment_detail(uuid) to service_role;
 
create or replace function public.admin_list_payment_reconciliation(
  p_page integer default 1,
  p_page_size integer default 25,
  p_query text default null,
  p_provider text default null,
  p_payment_method text default null,
  p_status text default null,
  p_reconciliation_status text default null,
  p_callback_status text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_sort_by text default 'createdAt',
  p_sort_order text default 'desc'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_page < 1 or p_page_size < 1 or p_page_size > 100 then
    raise exception 'invalid pagination' using errcode = '22023';
  end if;
  if p_sort_by not in ('createdAt', 'amount', 'status')
    or p_sort_order not in ('asc', 'desc') then
    raise exception 'invalid sort' using errcode = '22023';
  end if;

  with callback_summary as (
    select distinct on (attempt.id)
      attempt.id as payment_id,
      event.processing_status::text as callback_status,
      event.received_at
    from public.payment_attempts attempt
    join public.payment_provider_events event on event.provider = attempt.provider and (
      event.merchant_reference = attempt.merchant_reference
      or (
        event.provider_transaction_id is not null
        and event.provider_transaction_id = attempt.provider_transaction_id
      )
    )
    order by attempt.id, event.received_at desc, event.id desc
  ),
  reconciliation_summary as (
    select
      run.payment_attempt_id,
      count(*)::integer as attempt_count,
      max(run.created_at) as last_attempt_at,
      (array_agg(run.result::text order by run.created_at desc, run.id desc))[1] as last_result
    from public.payment_reconciliation_runs run
    group by run.payment_attempt_id
  ),
  enriched as (
    select
      payment.id,
      checkout.reference as checkout_reference,
      payment.provider::text as provider,
      payment.payment_method::text as payment_method,
      coalesce(payment.provider_transaction_id, payment.merchant_reference) as provider_reference,
      payment.merchant_reference,
      payment.amount_ugx,
      payment.currency_code,
      case when payment.status = 'successful' then 'paid' else payment.status::text end as status,
      fulfilment.phone_number,
      callback.callback_status,
      callback.received_at as callback_received_at,
      coalesce(reconciliation.attempt_count, 0) as reconciliation_attempt_count,
      reconciliation.last_attempt_at,
      reconciliation.last_result,
      exists(select 1 from public.payment_investigations i where i.payment_attempt_id=payment.id and i.status='open') as has_investigation,
      case
        when exists(select 1 from public.payment_investigations i where i.payment_attempt_id=payment.id and i.status='open') or payment.status = 'requires_reconciliation'
          or reconciliation.last_result in (
            'amount_mismatch', 'reference_mismatch', 'provider_not_found',
            'manual_review_required'
          ) then 'needs_review'
        when payment.status in ('successful', 'failed', 'cancelled', 'expired') and reconciliation.last_result in ('matched', 'status_updated', 'no_change')
          then 'reconciled'
        when coalesce(reconciliation.attempt_count, 0) = 0 then 'not_started'
        else 'pending'
      end as reconciliation_status,
      payment.created_at
    from public.payment_attempts payment
    join public.customer_checkouts checkout on checkout.id = payment.checkout_id
    left join public.checkout_fulfilments fulfilment on fulfilment.checkout_id = checkout.id
    left join callback_summary callback on callback.payment_id = payment.id
    left join reconciliation_summary reconciliation on reconciliation.payment_attempt_id = payment.id
  ),
  filtered as (
    select * from enriched
    where (p_query is null or (
      merchant_reference ilike '%' || p_query || '%'
      or provider_reference ilike '%' || p_query || '%'
      or checkout_reference ilike '%' || p_query || '%'
      or phone_number ilike '%' || p_query || '%'
    ))
      and (p_provider is null or provider = p_provider)
      and (p_payment_method is null or payment_method = p_payment_method)
      and (p_status is null or status = p_status)
      and (p_reconciliation_status is null or reconciliation_status = p_reconciliation_status)
      and (
        p_callback_status is null
        or (p_callback_status = 'missing' and callback_status is null)
        or callback_status = p_callback_status
      )
      and (p_from is null or created_at >= p_from)
      and (p_to is null or created_at <= p_to)
  ),
  ordered as (
    select filtered.*, row_number() over (order by
      case when p_sort_by = 'createdAt' and p_sort_order = 'asc' then created_at end asc,
      case when p_sort_by = 'createdAt' and p_sort_order = 'desc' then created_at end desc,
      case when p_sort_by = 'amount' and p_sort_order = 'asc' then amount_ugx end asc,
      case when p_sort_by = 'amount' and p_sort_order = 'desc' then amount_ugx end desc,
      case when p_sort_by = 'status' and p_sort_order = 'asc' then status end asc,
      case when p_sort_by = 'status' and p_sort_order = 'desc' then status end desc,
      id desc
    ) as position
    from filtered
  ),
  page_rows as (
    select * from ordered
    where position > (p_page - 1) * p_page_size
      and position <= p_page * p_page_size
  )
  select jsonb_build_object(
    'data', coalesce((select jsonb_agg(jsonb_build_object(
      'paymentId', id,
      'checkoutReference', checkout_reference,
      'orderReference', checkout_reference,
      'provider', provider,
      'paymentMethod', payment_method,
      'providerReference', provider_reference,
      'amount', amount_ugx,
      'currency', currency_code,
      'status', status,
      'callback', jsonb_build_object(
        'received', callback_status is not null,
        'status', callback_status,
        'receivedAt', callback_received_at
      ),
      'reconciliation', jsonb_build_object(
        'status', reconciliation_status,
        'attemptCount', reconciliation_attempt_count,
        'lastAttemptAt', last_attempt_at
      ),
      'flags', to_jsonb(array_remove(array[
        case when has_investigation then 'OPEN_INVESTIGATION' end,
        case when status = 'requires_reconciliation' then 'REQUIRES_RECONCILIATION' end,
        case when callback_status in ('rejected', 'failed') then 'CALLBACK_' || upper(callback_status) end,
        case when last_result in (
          'amount_mismatch', 'reference_mismatch', 'provider_not_found', 'manual_review_required'
        ) then upper(last_result) end
      ]::text[], null)),
      'createdAt', created_at
    ) order by position) from page_rows), '[]'::jsonb),
    'pagination', jsonb_build_object(
      'page', p_page,
      'pageSize', p_page_size,
      'totalItems', (select count(*) from filtered),
      'totalPages', ceil((select count(*) from filtered)::numeric / p_page_size)::integer
    )
  ) into result;

  return result;
end;
$$;
