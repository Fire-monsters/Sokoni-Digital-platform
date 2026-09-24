-- Phase 2 slices 2.6-2.7: payment reconciliation and refund read models.

create type public.refund_reason as enum (
  'cancellation',
  'vendor_rejection',
  'missing_products',
  'poor_quality',
  'failed_delivery',
  'duplicate_payment',
  'incorrect_payment',
  'partial_fulfilment',
  'other'
);

create type public.refund_status as enum (
  'requested',
  'awaiting_approval',
  'approved',
  'processing',
  'completed',
  'rejected',
  'cancelled',
  'failed'
);

create type public.refund_approval_state as enum (
  'pending',
  'approved',
  'rejected',
  'not_required'
);

create table public.refund_cases (
  id uuid primary key default extensions.gen_random_uuid(),
  checkout_id uuid not null references public.customer_checkouts(id),
  payment_attempt_id uuid references public.payment_attempts(id),
  reason public.refund_reason not null,
  requested_amount_ugx bigint not null check (requested_amount_ugx > 0),
  currency_code text not null default 'UGX' check (currency_code = 'UGX'),
  status public.refund_status not null default 'requested',
  approval_state public.refund_approval_state not null default 'pending',
  proposed_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  resolution_notes text check (
    resolution_notes is null or char_length(trim(resolution_notes)) between 1 and 2000
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refund_approval_shape check (
    (approval_state = 'approved' and approved_by is not null and approved_at is not null)
    or (approval_state <> 'approved' and approved_by is null and approved_at is null)
  )
);

create index refund_cases_status_created_idx
  on public.refund_cases (status, created_at desc, id desc);
create index refund_cases_checkout_created_idx
  on public.refund_cases (checkout_id, created_at desc, id desc);

create trigger refund_cases_set_updated_at
before update on public.refund_cases
for each row execute function public.set_updated_at();

alter table public.refund_cases enable row level security;
revoke all on table public.refund_cases from public, anon, authenticated;

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
      case
        when payment.status = 'requires_reconciliation'
          or reconciliation.last_result in (
            'amount_mismatch', 'reference_mismatch', 'provider_not_found',
            'manual_review_required'
          ) then 'needs_review'
        when reconciliation.last_result in ('matched', 'status_updated', 'no_change')
          then 'reconciled'
        when coalesce(reconciliation.attempt_count, 0) = 0 then 'not_started'
        else 'pending'
      end as reconciliation_status,
      payment.created_at
    from public.payment_attempts payment
    join public.customer_checkouts checkout on checkout.id = payment.checkout_id
    join public.checkout_fulfilments fulfilment on fulfilment.checkout_id = checkout.id
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

create or replace function public.admin_list_refunds(
  p_page integer default 1,
  p_page_size integer default 25,
  p_query text default null,
  p_status text default null,
  p_reason text default null,
  p_approval_state text default null,
  p_min_amount bigint default null,
  p_max_amount bigint default null,
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
  if p_sort_by not in ('createdAt', 'updatedAt', 'amount', 'status')
    or p_sort_order not in ('asc', 'desc') then
    raise exception 'invalid sort' using errcode = '22023';
  end if;
  if p_min_amount is not null and p_max_amount is not null and p_min_amount > p_max_amount then
    raise exception 'invalid amount range' using errcode = '22023';
  end if;

  with enriched as (
    select
      refund.*,
      checkout.reference as order_reference,
      payment.status::text as payment_status,
      payment.amount_ugx as payment_amount,
      coalesce(proposer.display_name, 'Staff member') as proposer_name,
      approver.display_name as approver_name
    from public.refund_cases refund
    join public.customer_checkouts checkout on checkout.id = refund.checkout_id
    left join public.payment_attempts payment on payment.id = refund.payment_attempt_id
    left join public.staff_members proposer on proposer.user_id = refund.proposed_by
    left join public.staff_members approver on approver.user_id = refund.approved_by
  ),
  filtered as (
    select * from enriched
    where (p_query is null or order_reference ilike '%' || p_query || '%')
      and (p_status is null or status::text = p_status)
      and (p_reason is null or reason::text = p_reason)
      and (p_approval_state is null or approval_state::text = p_approval_state)
      and (p_min_amount is null or requested_amount_ugx >= p_min_amount)
      and (p_max_amount is null or requested_amount_ugx <= p_max_amount)
      and (p_from is null or created_at >= p_from)
      and (p_to is null or created_at <= p_to)
  ),
  ordered as (
    select filtered.*, row_number() over (order by
      case when p_sort_by = 'createdAt' and p_sort_order = 'asc' then created_at end asc,
      case when p_sort_by = 'createdAt' and p_sort_order = 'desc' then created_at end desc,
      case when p_sort_by = 'updatedAt' and p_sort_order = 'asc' then updated_at end asc,
      case when p_sort_by = 'updatedAt' and p_sort_order = 'desc' then updated_at end desc,
      case when p_sort_by = 'amount' and p_sort_order = 'asc' then requested_amount_ugx end asc,
      case when p_sort_by = 'amount' and p_sort_order = 'desc' then requested_amount_ugx end desc,
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
      'id', id,
      'orderId', checkout_id,
      'orderReference', order_reference,
      'reason', reason,
      'requestedAmount', requested_amount_ugx,
      'currency', currency_code,
      'status', status,
      'approvalState', approval_state,
      'proposedBy', jsonb_build_object('id', proposed_by, 'name', proposer_name),
      'approvedBy', case when approved_by is null then null
        else jsonb_build_object('id', approved_by, 'name', approver_name) end,
      'payment', case when payment_attempt_id is null then null else jsonb_build_object(
        'id', payment_attempt_id,
        'status', case when payment_status = 'successful' then 'paid' else payment_status end,
        'amount', payment_amount
      ) end,
      'resolutionNotes', resolution_notes,
      'createdAt', created_at,
      'updatedAt', updated_at,
      'flags', to_jsonb(array_remove(array[
        case when payment_attempt_id is null then 'PAYMENT_NOT_LINKED' end,
        case when payment_amount is not null and requested_amount_ugx > payment_amount
          then 'AMOUNT_EXCEEDS_PAYMENT' end,
        case when approval_state = 'pending' and created_at < now() - interval '24 hours'
          then 'APPROVAL_DELAYED' end
      ]::text[], null))
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

revoke all on function public.admin_list_payment_reconciliation(
  integer, integer, text, text, text, text, text, text,
  timestamptz, timestamptz, text, text
) from public, anon, authenticated;
revoke all on function public.admin_list_refunds(
  integer, integer, text, text, text, text, bigint, bigint,
  timestamptz, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.admin_list_payment_reconciliation(
  integer, integer, text, text, text, text, text, text,
  timestamptz, timestamptz, text, text
) to service_role;
grant execute on function public.admin_list_refunds(
  integer, integer, text, text, text, text, bigint, bigint,
  timestamptz, timestamptz, text, text
) to service_role;
