-- Phase 4 Pesapal lifecycle: authoritative attempt creation and transactional finalization.

create or replace function public.create_pesapal_payment_attempt(
  p_consumer_id uuid,
  p_checkout_id uuid,
  p_payer_phone_e164 text default null,
  p_max_attempts integer default 3,
  p_pending_minutes integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  checkout_record public.customer_checkouts;
  attempt_record public.payment_attempts;
begin
  if p_max_attempts < 1 or p_max_attempts > 10 then
    raise exception 'payment attempt limit must be between 1 and 10' using errcode = '22023';
  end if;
  if p_pending_minutes < 1 or p_pending_minutes > 60 then
    raise exception 'payment pending duration must be between 1 and 60 minutes' using errcode = '22023';
  end if;
  if p_payer_phone_e164 is not null
    and p_payer_phone_e164 !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'payer phone must use E.164 format' using errcode = '22023';
  end if;

  select * into checkout_record
  from public.customer_checkouts
  where id = p_checkout_id and consumer_id = p_consumer_id
  for update;

  if checkout_record.id is null then
    raise exception 'checkout not found' using errcode = 'P0002';
  end if;
  if checkout_record.status <> 'awaiting_payment' then
    raise exception 'checkout is not payable' using errcode = '23514';
  end if;
  if checkout_record.currency_code <> 'UGX' or checkout_record.total_ugx <= 0 then
    raise exception 'checkout amount or currency is invalid' using errcode = '23514';
  end if;
  if checkout_record.reservation_expires_at <= now()
    or not exists (
      select 1 from public.inventory_reservations r
      where r.checkout_id = checkout_record.id and r.status = 'active' and r.expires_at > now()
    ) then
    raise exception 'checkout reservation has expired' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.payment_attempts p
    where p.checkout_id = checkout_record.id and p.status = 'successful'
  ) then
    raise exception 'checkout has already been paid' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.payment_attempts p
    where p.checkout_id = checkout_record.id
      and p.status in ('created', 'initiating', 'pending', 'requires_reconciliation')
  ) then
    raise exception 'checkout already has an unresolved payment' using errcode = '55000';
  end if;
  if (
    select count(*) from public.payment_attempts p where p.checkout_id = checkout_record.id
  ) >= p_max_attempts then
    raise exception 'payment retry limit reached' using errcode = '54000';
  end if;

  insert into public.payment_attempts (
    checkout_id, consumer_id, provider, status, amount_ugx, currency_code,
    payer_phone_e164, merchant_reference, expires_at
  ) values (
    checkout_record.id, p_consumer_id, 'pesapal', 'initiating',
    checkout_record.total_ugx, checkout_record.currency_code, p_payer_phone_e164,
    'EK-P-' || lpad(nextval('public.payment_reference_sequence')::text, 9, '0'),
    now() + make_interval(mins => p_pending_minutes)
  ) returning * into attempt_record;

  insert into public.payment_audit_events (
    payment_attempt_id, actor_user_id, action, next_status, details
  ) values (
    attempt_record.id, p_consumer_id, 'payment.initiating', attempt_record.status,
    jsonb_build_object('checkoutId', checkout_record.id)
  );

  return jsonb_build_object(
    'id', attempt_record.id,
    'checkoutId', attempt_record.checkout_id,
    'provider', attempt_record.provider,
    'status', attempt_record.status,
    'amount', attempt_record.amount_ugx,
    'currency', attempt_record.currency_code,
    'payerPhoneE164', attempt_record.payer_phone_e164,
    'merchantReference', attempt_record.merchant_reference,
    'expiresAt', attempt_record.expires_at
  );
end;
$$;

create or replace function public.mark_payment_attempt_pending(
  p_payment_attempt_id uuid,
  p_provider_transaction_id text,
  p_provider_request_reference text,
  p_provider_redirect_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare previous public.payment_status;
begin
  if coalesce(length(p_provider_transaction_id), 0) = 0
    or coalesce(length(p_provider_redirect_url), 0) = 0 then
    raise exception 'provider transaction and redirect URL are required' using errcode = '22023';
  end if;

  update public.payment_attempts
  set status = 'pending',
      provider_transaction_id = p_provider_transaction_id,
      provider_request_reference = p_provider_request_reference,
      provider_redirect_url = p_provider_redirect_url,
      initiated_at = now(),
      next_reconciliation_at = now() + interval '5 seconds',
      version = version + 1
  where id = p_payment_attempt_id and status = 'initiating'
  returning 'initiating'::public.payment_status into previous;

  if previous is null then
    raise exception 'payment attempt is not initiating' using errcode = '55000';
  end if;

  insert into public.payment_audit_events (
    payment_attempt_id, action, previous_status, next_status,
    details
  ) values (
    p_payment_attempt_id, 'payment.pending', previous, 'pending',
    jsonb_build_object('providerTransactionId', p_provider_transaction_id)
  );
end;
$$;

create or replace function public.claim_payment_reconciliation_batch(
  p_batch_size integer default 100,
  p_claim_seconds integer default 55
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if p_batch_size < 1 or p_batch_size > 500
    or p_claim_seconds < 10 or p_claim_seconds > 300 then
    raise exception 'invalid reconciliation claim limits' using errcode = '22023';
  end if;
  with candidates as (
    select p.id
    from public.payment_attempts p
    where p.status in ('pending', 'requires_reconciliation')
      and p.provider_transaction_id is not null
      and coalesce(p.next_reconciliation_at, p.updated_at) <= now()
      and (p.reconciliation_claimed_until is null or p.reconciliation_claimed_until <= now())
    order by coalesce(p.next_reconciliation_at, p.updated_at), p.id
    for update skip locked
    limit p_batch_size
  ), claimed as (
    update public.payment_attempts p
    set reconciliation_claimed_until = now() + make_interval(secs => p_claim_seconds)
    from candidates c
    where p.id = c.id
    returning p.*
  )
  select coalesce(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb) into result from claimed;
  return result;
end;
$$;

create or replace function public.release_payment_reconciliation_claim(
  p_payment_attempt_id uuid,
  p_next_seconds integer default 60
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payment_attempts
  set reconciliation_claimed_until = null,
      next_reconciliation_at = case
        when status in ('pending', 'requires_reconciliation')
          then now() + make_interval(secs => greatest(p_next_seconds, 5))
        else null
      end
  where id = p_payment_attempt_id;
$$;

create or replace function public.mark_payment_attempt_uncertain(
  p_payment_attempt_id uuid,
  p_failure_code text,
  p_failure_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare previous public.payment_status;
begin
  select status into previous
  from public.payment_attempts
  where id = p_payment_attempt_id
  for update;

  update public.payment_attempts
  set status = 'requires_reconciliation',
      version = version + 1
  where id = p_payment_attempt_id
    and status in ('created', 'initiating', 'pending');

  if found then
    insert into public.payment_audit_events (
      payment_attempt_id, action, previous_status, next_status, details
    ) values (
      p_payment_attempt_id, 'payment.initiation_uncertain',
      coalesce(previous, 'initiating'), 'requires_reconciliation',
      jsonb_build_object('code', p_failure_code, 'message', p_failure_message)
    );
  end if;
end;
$$;

create or replace function public.mark_payment_initiation_failed(
  p_payment_attempt_id uuid,
  p_failure_code text,
  p_failure_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare previous public.payment_status;
begin
  select status into previous
  from public.payment_attempts
  where id = p_payment_attempt_id
  for update;

  update public.payment_attempts
  set status = 'failed', failure_code = p_failure_code,
      failure_message = p_failure_message, resolved_at = now(), version = version + 1
  where id = p_payment_attempt_id and status = 'initiating';

  if found then
    insert into public.payment_audit_events (
      payment_attempt_id, action, previous_status, next_status, details
    ) values (
      p_payment_attempt_id, 'payment.initiation_failed', previous, 'failed',
      jsonb_build_object('code', p_failure_code, 'message', p_failure_message)
    );
  end if;
end;
$$;

create or replace function public.process_payment_result(
  p_provider public.payment_provider,
  p_provider_transaction_id text,
  p_merchant_reference text,
  p_normalized_status text,
  p_amount_ugx bigint,
  p_currency text,
  p_payment_method public.payment_method default null,
  p_provider_event_id uuid default null,
  p_confirmation_code text default null,
  p_provider_reason_code text default null,
  p_provider_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.payment_attempts;
  checkout_record public.customer_checkouts;
  previous public.payment_status;
begin
  if p_normalized_status not in ('pending', 'successful', 'failed', 'unknown') then
    raise exception 'invalid normalized payment status' using errcode = '22023';
  end if;

  select * into attempt
  from public.payment_attempts
  where merchant_reference = p_merchant_reference
  for update;

  if attempt.id is null then
    raise exception 'payment attempt not found' using errcode = 'P0002';
  end if;
  if attempt.provider <> p_provider then
    raise exception 'payment provider mismatch' using errcode = '23514';
  end if;
  if attempt.provider_transaction_id is not null
    and attempt.provider_transaction_id <> p_provider_transaction_id then
    update public.payment_attempts
    set status = 'requires_reconciliation', version = version + 1
    where id = attempt.id and status <> 'successful';
    insert into public.payment_audit_events (
      payment_attempt_id, provider_event_id, action, previous_status, next_status, details
    ) values (
      attempt.id, p_provider_event_id, 'payment.reference_mismatch', attempt.status,
      case when attempt.status = 'successful' then attempt.status else 'requires_reconciliation' end,
      jsonb_build_object('receivedProviderTransactionId', p_provider_transaction_id)
    );
    return jsonb_build_object('paymentAttemptId', attempt.id, 'status', 'requires_reconciliation');
  end if;
  if p_currency <> attempt.currency_code or p_amount_ugx <> attempt.amount_ugx then
    update public.payment_attempts
    set status = 'requires_reconciliation', version = version + 1
    where id = attempt.id and status <> 'successful';
    insert into public.payment_audit_events (
      payment_attempt_id, provider_event_id, action, previous_status, next_status, details
    ) values (
      attempt.id, p_provider_event_id, 'payment.value_mismatch', attempt.status,
      case when attempt.status = 'successful' then attempt.status else 'requires_reconciliation' end,
      jsonb_build_object('receivedAmount', p_amount_ugx, 'receivedCurrency', p_currency)
    );
    return jsonb_build_object('paymentAttemptId', attempt.id, 'status', 'requires_reconciliation');
  end if;

  if attempt.status = 'successful' then
    if p_normalized_status <> 'successful' then
      insert into public.payment_audit_events (
        payment_attempt_id, provider_event_id, action, previous_status, next_status, details
      ) values (
        attempt.id, p_provider_event_id, 'payment.conflicting_final_event',
        attempt.status, attempt.status, jsonb_build_object('receivedStatus', p_normalized_status)
      );
    end if;
    return jsonb_build_object('paymentAttemptId', attempt.id, 'status', attempt.status, 'duplicate', true);
  end if;

  if p_normalized_status = 'pending' then
    if attempt.status in ('initiating', 'requires_reconciliation') then
      previous := attempt.status;
      update public.payment_attempts
      set status = 'pending',
          provider_transaction_id = coalesce(provider_transaction_id, p_provider_transaction_id),
          payment_method = coalesce(p_payment_method, payment_method),
          version = version + 1
      where id = attempt.id;
      insert into public.payment_audit_events (
        payment_attempt_id, provider_event_id, action, previous_status, next_status
      ) values (attempt.id, p_provider_event_id, 'payment.still_pending', previous, 'pending');
    end if;
    return jsonb_build_object('paymentAttemptId', attempt.id, 'status', 'pending');
  end if;

  if p_normalized_status = 'unknown' then
    previous := attempt.status;
    update public.payment_attempts
    set status = 'requires_reconciliation', version = version + 1
    where id = attempt.id and status not in ('failed', 'cancelled', 'expired');
    insert into public.payment_audit_events (
      payment_attempt_id, provider_event_id, action, previous_status, next_status, details
    ) values (
      attempt.id, p_provider_event_id, 'payment.status_unknown', previous,
      'requires_reconciliation', jsonb_build_object('message', p_provider_message)
    );
    return jsonb_build_object('paymentAttemptId', attempt.id, 'status', 'requires_reconciliation');
  end if;

  select * into checkout_record
  from public.customer_checkouts
  where id = attempt.checkout_id
  for update;
  previous := attempt.status;

  if p_normalized_status = 'successful' then
    perform l.id
    from public.listings l
    where l.id in (
      select r.listing_id from public.inventory_reservations r
      where r.checkout_id = attempt.checkout_id and r.status = 'active'
    )
    order by l.id for update;

    if not exists (
      select 1 from public.inventory_reservations r
      where r.checkout_id = attempt.checkout_id and r.status = 'active'
    ) or exists (
      select 1
      from public.listings l
      join public.inventory_reservations r on r.listing_id = l.id
      where r.checkout_id = attempt.checkout_id and r.status = 'active'
        and (l.stock_reserved < r.quantity or l.stock_on_hand < r.quantity)
    ) then
      update public.payment_attempts
      set status = 'requires_reconciliation', version = version + 1
      where id = attempt.id;
      insert into public.payment_audit_events (
        payment_attempt_id, provider_event_id, action, previous_status, next_status
      ) values (
        attempt.id, p_provider_event_id, 'payment.inventory_invariant_violation',
        previous, 'requires_reconciliation'
      );
      return jsonb_build_object('paymentAttemptId', attempt.id, 'status', 'requires_reconciliation');
    end if;

    update public.listings l
    set stock_on_hand = l.stock_on_hand - committed.quantity,
        stock_reserved = l.stock_reserved - committed.quantity,
        version = l.version + 1
    from (
      select r.listing_id, sum(r.quantity)::integer as quantity
      from public.inventory_reservations r
      where r.checkout_id = attempt.checkout_id and r.status = 'active'
      group by r.listing_id
    ) committed
    where l.id = committed.listing_id;

    update public.inventory_reservations
    set status = 'committed', committed_at = now()
    where checkout_id = attempt.checkout_id and status = 'active';
    update public.vendor_orders set status = 'confirmed'
    where checkout_id = attempt.checkout_id and status = 'awaiting_payment';
    update public.customer_checkouts set status = 'paid'
    where id = attempt.checkout_id and status = 'awaiting_payment';
    if found then
      insert into public.checkout_status_history (checkout_id, from_status, to_status, reason)
      values (attempt.checkout_id, 'awaiting_payment', 'paid', 'payment_successful');
    end if;
    update public.payment_attempts
    set status = 'successful',
        provider_transaction_id = coalesce(provider_transaction_id, p_provider_transaction_id),
        payment_method = coalesce(p_payment_method, payment_method, 'unknown'),
        provider_confirmation_code = p_confirmation_code,
        resolved_at = now(), failure_code = null, failure_message = null,
        version = version + 1
    where id = attempt.id;
    insert into public.payment_audit_events (
      payment_attempt_id, provider_event_id, action, previous_status, next_status,
      details
    ) values (
      attempt.id, p_provider_event_id, 'payment.succeeded', previous, 'successful',
      jsonb_build_object('confirmationCode', p_confirmation_code)
    );
    return jsonb_build_object('paymentAttemptId', attempt.id, 'status', 'successful');
  end if;

  if attempt.status in ('failed', 'cancelled', 'expired') then
    return jsonb_build_object('paymentAttemptId', attempt.id, 'status', attempt.status, 'duplicate', true);
  end if;

  perform l.id
  from public.listings l
  where l.id in (
    select r.listing_id from public.inventory_reservations r
    where r.checkout_id = attempt.checkout_id and r.status = 'active'
  )
  order by l.id for update;
  update public.listings l
  set stock_reserved = l.stock_reserved - released.quantity,
      version = l.version + 1
  from (
    select r.listing_id, sum(r.quantity)::integer as quantity
    from public.inventory_reservations r
    where r.checkout_id = attempt.checkout_id and r.status = 'active'
    group by r.listing_id
  ) released
  where l.id = released.listing_id and l.stock_reserved >= released.quantity;
  update public.inventory_reservations
  set status = 'released', released_at = now(), release_reason = 'payment_failed'
  where checkout_id = attempt.checkout_id and status = 'active';
  update public.vendor_orders set status = 'cancelled'
  where checkout_id = attempt.checkout_id and status = 'awaiting_payment';
  update public.customer_checkouts set status = 'payment_failed'
  where id = attempt.checkout_id and status = 'awaiting_payment';
  if found then
    insert into public.checkout_status_history (checkout_id, from_status, to_status, reason)
    values (attempt.checkout_id, 'awaiting_payment', 'payment_failed', 'payment_failed');
  end if;
  update public.payment_attempts
  set status = 'failed',
      provider_transaction_id = coalesce(provider_transaction_id, p_provider_transaction_id),
      payment_method = coalesce(p_payment_method, payment_method),
      provider_confirmation_code = p_confirmation_code,
      failure_code = p_provider_reason_code,
      failure_message = p_provider_message,
      resolved_at = now(), version = version + 1
  where id = attempt.id;
  insert into public.payment_audit_events (
    payment_attempt_id, provider_event_id, action, previous_status, next_status, details
  ) values (
    attempt.id, p_provider_event_id, 'payment.failed', previous, 'failed',
    jsonb_build_object('code', p_provider_reason_code, 'message', p_provider_message)
  );
  return jsonb_build_object('paymentAttemptId', attempt.id, 'status', 'failed');
end;
$$;

revoke all on function public.create_pesapal_payment_attempt(uuid, uuid, text, integer, integer) from public;
revoke all on function public.mark_payment_attempt_pending(uuid, text, text, text) from public;
revoke all on function public.mark_payment_attempt_uncertain(uuid, text, text) from public;
revoke all on function public.mark_payment_initiation_failed(uuid, text, text) from public;
revoke all on function public.process_payment_result(public.payment_provider, text, text, text, bigint, text, public.payment_method, uuid, text, text, text) from public;
revoke all on function public.claim_payment_reconciliation_batch(integer, integer) from public;
revoke all on function public.release_payment_reconciliation_claim(uuid, integer) from public;
grant execute on function public.create_pesapal_payment_attempt(uuid, uuid, text, integer, integer) to service_role;
grant execute on function public.mark_payment_attempt_pending(uuid, text, text, text) to service_role;
grant execute on function public.mark_payment_attempt_uncertain(uuid, text, text) to service_role;
grant execute on function public.mark_payment_initiation_failed(uuid, text, text) to service_role;
grant execute on function public.process_payment_result(public.payment_provider, text, text, text, bigint, text, public.payment_method, uuid, text, text, text) to service_role;
grant execute on function public.claim_payment_reconciliation_batch(integer, integer) to service_role;
grant execute on function public.release_payment_reconciliation_claim(uuid, integer) to service_role;
