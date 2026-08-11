-- Phase 4 slice 10 and slice 11: pay-at-pickup lifecycle and expiry lock ordering.

create type public.market_pickup_collection_method as enum (
  'cash', 'mobile_money', 'card', 'other'
);

create table public.market_pickup_payment_records (
  id uuid primary key default extensions.gen_random_uuid(),
  payment_attempt_id uuid not null unique references public.payment_attempts(id),
  checkout_id uuid not null unique references public.customer_checkouts(id),
  operation_id uuid not null unique,
  amount_received_ugx bigint not null check (amount_received_ugx > 0),
  currency_code text not null check (currency_code = 'UGX'),
  collection_method public.market_pickup_collection_method not null,
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now()
);

alter table public.market_pickup_payment_records enable row level security;
comment on table public.market_pickup_payment_records is
  'Operational evidence for physical payment collected against a market-pickup checkout.';

create or replace function public.create_market_pickup_payment_attempt(
  p_consumer_id uuid,
  p_checkout_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  checkout_record public.customer_checkouts;
  attempt_record public.payment_attempts;
  previous_checkout_status public.checkout_status;
begin
  select c.* into checkout_record
  from public.customer_checkouts c
  join public.checkout_fulfilments f on f.checkout_id = c.id
  where c.id = p_checkout_id
    and c.consumer_id = p_consumer_id
    and f.type = 'market_pickup'
  for update of c;

  if checkout_record.id is null then
    raise exception 'pay at pickup is unavailable for this checkout' using errcode = 'P0002';
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
    where p.checkout_id = checkout_record.id
      and p.status in ('created', 'initiating', 'pending', 'successful', 'requires_reconciliation')
  ) then
    raise exception 'checkout already has a payment selection' using errcode = '55000';
  end if;

  perform l.id
  from public.listings l
  where l.id in (
    select r.listing_id from public.inventory_reservations r
    where r.checkout_id = checkout_record.id and r.status = 'active'
  )
  order by l.id
  for update;

  if exists (
    select 1
    from public.listings l
    join public.inventory_reservations r on r.listing_id = l.id
    where r.checkout_id = checkout_record.id and r.status = 'active'
      and (l.stock_reserved < r.quantity or l.stock_on_hand < r.quantity)
  ) then
    raise exception 'reserved stock invariant violated' using errcode = '23514';
  end if;

  insert into public.payment_attempts (
    checkout_id, consumer_id, provider, payment_method, status,
    amount_ugx, currency_code, merchant_reference, initiated_at
  ) values (
    checkout_record.id, p_consumer_id, 'market_pickup', 'market_pickup', 'pending',
    checkout_record.total_ugx, checkout_record.currency_code,
    'EK-P-' || lpad(nextval('public.payment_reference_sequence')::text, 9, '0'), now()
  ) returning * into attempt_record;

  update public.listings l
  set stock_on_hand = l.stock_on_hand - committed.quantity,
      stock_reserved = l.stock_reserved - committed.quantity,
      version = l.version + 1
  from (
    select r.listing_id, sum(r.quantity)::integer as quantity
    from public.inventory_reservations r
    where r.checkout_id = checkout_record.id and r.status = 'active'
    group by r.listing_id
  ) committed
  where l.id = committed.listing_id;

  update public.inventory_reservations
  set status = 'committed', committed_at = now()
  where checkout_id = checkout_record.id and status = 'active';
  update public.vendor_orders
  set status = 'confirmed'
  where checkout_id = checkout_record.id and status = 'awaiting_payment';
  previous_checkout_status := checkout_record.status;
  update public.customer_checkouts
  set status = 'confirmed_unpaid'
  where id = checkout_record.id;
  insert into public.checkout_status_history (checkout_id, from_status, to_status, reason)
  values (checkout_record.id, previous_checkout_status, 'confirmed_unpaid', 'pay_at_pickup_selected');
  insert into public.payment_audit_events (
    payment_attempt_id, actor_user_id, action, next_status, details
  ) values (
    attempt_record.id, p_consumer_id, 'market_pickup.selected', 'pending',
    jsonb_build_object('checkoutId', checkout_record.id, 'inventoryCommitted', true)
  );

  return jsonb_build_object(
    'id', attempt_record.id,
    'checkoutId', attempt_record.checkout_id,
    'consumerId', attempt_record.consumer_id,
    'provider', attempt_record.provider,
    'paymentMethod', attempt_record.payment_method,
    'status', attempt_record.status,
    'amount', attempt_record.amount_ugx,
    'currency', attempt_record.currency_code,
    'merchantReference', attempt_record.merchant_reference,
    'createdAt', attempt_record.created_at,
    'updatedAt', attempt_record.updated_at
  );
end;
$$;

create or replace function public.record_market_pickup_payment(
  p_actor_id uuid,
  p_actor_is_operations boolean,
  p_checkout_id uuid,
  p_amount_received_ugx bigint,
  p_currency text,
  p_collection_method public.market_pickup_collection_method,
  p_pickup_code text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  checkout_record public.customer_checkouts;
  attempt_record public.payment_attempts;
  existing_record public.market_pickup_payment_records;
  expected_code_hash text;
begin
  select * into existing_record
  from public.market_pickup_payment_records
  where operation_id = p_operation_id;
  if existing_record.id is not null then
    if existing_record.checkout_id <> p_checkout_id
      or existing_record.recorded_by <> p_actor_id
      or existing_record.amount_received_ugx <> p_amount_received_ugx
      or existing_record.currency_code <> p_currency
      or existing_record.collection_method <> p_collection_method then
      raise exception 'operation id was already used for another payment record' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'paymentAttemptId', existing_record.payment_attempt_id,
      'checkoutId', existing_record.checkout_id,
      'status', 'successful',
      'duplicate', true,
      'recordedAt', existing_record.recorded_at
    );
  end if;

  select * into checkout_record
  from public.customer_checkouts
  where id = p_checkout_id
  for update;
  if checkout_record.id is null then
    raise exception 'checkout not found' using errcode = 'P0002';
  end if;
  if checkout_record.status <> 'confirmed_unpaid' then
    raise exception 'checkout is not awaiting pickup payment' using errcode = '23514';
  end if;

  select * into attempt_record
  from public.payment_attempts
  where checkout_id = p_checkout_id and provider = 'market_pickup'
  for update;
  if attempt_record.id is null or attempt_record.status <> 'pending' then
    raise exception 'pending market-pickup payment was not found' using errcode = 'P0002';
  end if;

  if not p_actor_is_operations and not (
    (select count(*) from public.vendor_orders where checkout_id = p_checkout_id) = 1
    and exists (
      select 1
      from public.vendor_orders vo
      join public.seller_accounts sa on sa.seller_id = vo.seller_id
      where vo.checkout_id = p_checkout_id and sa.user_id = p_actor_id
    )
  ) then
    raise exception 'actor cannot record payment for this checkout' using errcode = '42501';
  end if;
  if p_amount_received_ugx <> attempt_record.amount_ugx or p_currency <> attempt_record.currency_code then
    raise exception 'received amount or currency does not match checkout' using errcode = '23514';
  end if;
  if p_pickup_code !~ '^[0-9]{6}$' then
    raise exception 'pickup code must contain six digits' using errcode = '22023';
  end if;
  expected_code_hash := encode(extensions.digest(p_pickup_code, 'sha256'), 'hex');
  if not exists (
    select 1 from public.checkout_fulfilments
    where checkout_id = p_checkout_id
      and type = 'market_pickup'
      and pickup_code_hash = expected_code_hash
  ) then
    raise exception 'pickup code is invalid' using errcode = '22023';
  end if;

  insert into public.market_pickup_payment_records (
    payment_attempt_id, checkout_id, operation_id, amount_received_ugx,
    currency_code, collection_method, recorded_by
  ) values (
    attempt_record.id, p_checkout_id, p_operation_id, p_amount_received_ugx,
    p_currency, p_collection_method, p_actor_id
  ) returning * into existing_record;

  update public.payment_attempts
  set status = 'successful', resolved_at = now(),
      provider_confirmation_code = p_operation_id::text, version = version + 1
  where id = attempt_record.id;
  update public.customer_checkouts set status = 'paid' where id = p_checkout_id;
  insert into public.checkout_status_history (checkout_id, from_status, to_status, reason)
  values (p_checkout_id, 'confirmed_unpaid', 'paid', 'market_pickup_payment_recorded');
  insert into public.payment_audit_events (
    payment_attempt_id, actor_user_id, action, previous_status, next_status, details
  ) values (
    attempt_record.id, p_actor_id, 'market_pickup.payment_recorded', 'pending', 'successful',
    jsonb_build_object(
      'operationId', p_operation_id,
      'collectionMethod', p_collection_method,
      'amountReceived', p_amount_received_ugx,
      'currency', p_currency
    )
  );

  return jsonb_build_object(
    'paymentAttemptId', attempt_record.id,
    'checkoutId', p_checkout_id,
    'status', 'successful',
    'duplicate', false,
    'recordedAt', existing_record.recorded_at
  );
end;
$$;

-- Expiry and payment finalization lock the checkout before listings/reservations.
-- This removes the reservation->listing versus listing->reservation deadlock cycle.
create or replace function public.expire_inventory_reservations(p_batch_size integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  checkout_ids uuid[];
  expired_count integer := 0;
begin
  if p_batch_size < 1 or p_batch_size > 1000 then
    raise exception 'batch size must be between 1 and 1000' using errcode = '22023';
  end if;

  select array_agg(id) into checkout_ids from (
    select c.id
    from public.customer_checkouts c
    where c.status = 'awaiting_payment'
      and exists (
        select 1 from public.inventory_reservations r
        where r.checkout_id = c.id and r.status = 'active' and r.expires_at <= now()
      )
    order by c.reservation_expires_at, c.id
    for update skip locked
    limit p_batch_size
  ) selected;
  if checkout_ids is null then return 0; end if;

  perform l.id
  from public.listings l
  where l.id in (
    select distinct r.listing_id from public.inventory_reservations r
    where r.checkout_id = any(checkout_ids) and r.status = 'active' and r.expires_at <= now()
  )
  order by l.id
  for update;

  if exists (
    select 1 from public.listings l join (
      select listing_id, sum(quantity)::integer quantity
      from public.inventory_reservations
      where checkout_id = any(checkout_ids) and status = 'active' and expires_at <= now()
      group by listing_id
    ) release on release.listing_id = l.id
    where l.stock_reserved < release.quantity
  ) then
    raise exception 'reserved stock invariant violated' using errcode = '23514';
  end if;

  update public.listings l
  set stock_reserved = l.stock_reserved - release.quantity, version = l.version + 1
  from (
    select listing_id, sum(quantity)::integer quantity
    from public.inventory_reservations
    where checkout_id = any(checkout_ids) and status = 'active' and expires_at <= now()
    group by listing_id
  ) release
  where l.id = release.listing_id;
  update public.inventory_reservations
  set status = 'expired', released_at = now(), release_reason = 'payment_window_expired'
  where checkout_id = any(checkout_ids) and status = 'active' and expires_at <= now();
  get diagnostics expired_count = row_count;
  update public.vendor_orders set status = 'expired'
  where checkout_id = any(checkout_ids) and status = 'awaiting_payment';
  update public.customer_checkouts set status = 'expired'
  where id = any(checkout_ids) and status = 'awaiting_payment';
  insert into public.checkout_status_history (checkout_id, from_status, to_status, reason)
  select id, 'awaiting_payment', 'expired', 'reservation_expired'
  from unnest(checkout_ids) as id;
  return expired_count;
end;
$$;

revoke all on table public.market_pickup_payment_records from public;
revoke all on function public.create_market_pickup_payment_attempt(uuid, uuid) from public;
revoke all on function public.record_market_pickup_payment(uuid, boolean, uuid, bigint, text, public.market_pickup_collection_method, text, uuid) from public;
grant execute on function public.create_market_pickup_payment_attempt(uuid, uuid) to service_role;
grant execute on function public.record_market_pickup_payment(uuid, boolean, uuid, bigint, text, public.market_pickup_collection_method, text, uuid) to service_role;
