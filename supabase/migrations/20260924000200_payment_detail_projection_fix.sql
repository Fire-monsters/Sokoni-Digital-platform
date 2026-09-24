-- Keep the PL/pgSQL return variable distinct from reconciliation_runs.result.
create or replace function public.admin_get_payment_detail(p_payment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare detail_result jsonb;
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
  ) into detail_result from public.payment_attempts p join public.customer_checkouts c on c.id=p.checkout_id where p.id=p_payment_id;
  if detail_result is null then raise exception 'Payment not found.' using errcode='P0002'; end if;
  return detail_result;
end;
$$;
