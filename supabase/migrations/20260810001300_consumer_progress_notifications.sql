-- Phase 5 Slices 7-8: consumer progress reads and transactional notification outbox.

create type public.notification_priority as enum ('normal', 'critical');
create type public.notification_channel as enum ('push', 'sms');
create type public.notification_delivery_status as enum (
  'pending', 'processing', 'failed', 'delivered', 'dead_letter'
);

create table public.notification_events (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  title text not null,
  body text not null,
  priority public.notification_priority not null default 'normal',
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);

create index notification_events_user_created_idx
  on public.notification_events (user_id, created_at desc, id desc);

create table public.notification_devices (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notification_devices_user_active_idx
  on public.notification_devices (user_id, last_seen_at desc)
  where enabled;

create table public.notification_deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null references public.notification_events(id) on delete cascade,
  channel public.notification_channel not null,
  destination text,
  status public.notification_delivery_status not null default 'pending',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  provider_reference text,
  last_attempted_at timestamptz,
  delivered_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, channel)
);

create index notification_deliveries_retry_idx
  on public.notification_deliveries (available_at, created_at)
  where status in ('pending', 'failed', 'processing');

create table public.notification_audit_events (
  id bigint generated always as identity primary key,
  notification_event_id uuid not null references public.notification_events(id) on delete cascade,
  delivery_id uuid references public.notification_deliveries(id) on delete cascade,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index notification_audit_event_created_idx
  on public.notification_audit_events (notification_event_id, created_at, id);

create trigger notification_devices_set_updated_at
before update on public.notification_devices
for each row execute function public.set_updated_at();

create trigger notification_deliveries_set_updated_at
before update on public.notification_deliveries
for each row execute function public.set_updated_at();

alter table public.notification_events enable row level security;
alter table public.notification_devices enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_audit_events enable row level security;

revoke all on table public.notification_events from public;
revoke all on table public.notification_devices from public;
revoke all on table public.notification_deliveries from public;
revoke all on table public.notification_audit_events from public;

create or replace function public.enqueue_vendor_order_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
  event_name text;
  event_title text;
  event_body text;
  event_priority public.notification_priority := 'normal';
  inserted_event_id uuid;
begin
  if old.status = new.status then return new; end if;

  if new.status = 'awaiting_vendor_acceptance' then
    select account.user_id into recipient_id
    from public.seller_accounts account
    where account.seller_id = new.seller_id;
    event_name := 'vendor_order.created';
    event_title := 'New order';
    event_body := 'A new seller order is waiting for acceptance.';
    event_priority := 'critical';
  elsif new.status in ('accepted', 'preparing', 'quality_verified', 'ready_for_pickup', 'cancelled', 'issue_reported') then
    select checkout.consumer_id into recipient_id
    from public.customer_checkouts checkout
    where checkout.id = new.checkout_id;
    event_name := 'vendor_order.' || new.status::text;
    event_title := case new.status
      when 'accepted' then 'Order accepted'
      when 'preparing' then 'Order is being prepared'
      when 'quality_verified' then 'Order quality verified'
      when 'ready_for_pickup' then 'Order ready for pickup'
      when 'cancelled' then 'Order cancelled'
      else 'Order needs attention'
    end;
    event_body := 'Seller order ' || new.reference || ' is now ' || replace(new.status::text, '_', ' ') || '.';
    if new.status in ('ready_for_pickup', 'cancelled', 'issue_reported') then
      event_priority := 'critical';
    end if;
  end if;

  if recipient_id is null or event_name is null then return new; end if;

  insert into public.notification_events (
    user_id, event_type, entity_type, entity_id, title, body, priority, payload, dedupe_key
  ) values (
    recipient_id,
    event_name,
    'vendor_order',
    new.id,
    event_title,
    event_body,
    event_priority,
    jsonb_build_object(
      'sellerOrderId', new.id,
      'checkoutId', new.checkout_id,
      'status', new.status,
      'version', new.version
    ),
    'vendor_order:' || new.id::text || ':status:' || new.status::text || ':version:' || new.version::text
  )
  on conflict (dedupe_key) do nothing
  returning id into inserted_event_id;

  if inserted_event_id is not null then
    insert into public.notification_deliveries (event_id, channel)
    values (inserted_event_id, 'push');
    insert into public.notification_audit_events (notification_event_id, action, details)
    values (inserted_event_id, 'notification.enqueued', jsonb_build_object('channel', 'push'));
  end if;
  return new;
end;
$$;

create trigger vendor_orders_notification_outbox
after update of status on public.vendor_orders
for each row execute function public.enqueue_vendor_order_notification();

create or replace function public.claim_notification_deliveries(
  p_batch_size integer,
  p_lease_seconds integer
)
returns setof public.notification_deliveries
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select delivery.id
    from public.notification_deliveries delivery
    where (
      delivery.status in ('pending', 'failed') and delivery.available_at <= now()
    ) or (
      delivery.status = 'processing'
      and delivery.locked_at <= now() - make_interval(secs => p_lease_seconds)
    )
    order by delivery.available_at, delivery.created_at
    for update skip locked
    limit greatest(1, least(p_batch_size, 500))
  )
  update public.notification_deliveries delivery
  set status = 'processing',
      attempt_count = delivery.attempt_count + 1,
      locked_at = now(),
      last_attempted_at = now(),
      failure_reason = null
  from candidates
  where delivery.id = candidates.id
  returning delivery.*;
end;
$$;

create or replace function public.complete_notification_delivery(
  p_delivery_id uuid,
  p_destination text,
  p_provider_reference text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid;
begin
  update public.notification_deliveries
  set status = 'delivered', destination = p_destination,
      provider_reference = p_provider_reference, delivered_at = now(), locked_at = null
  where id = p_delivery_id and status = 'processing'
  returning notification_deliveries.event_id into event_id;
  if event_id is null then raise exception 'notification delivery is not processing' using errcode = '23514'; end if;
  insert into public.notification_audit_events (notification_event_id, delivery_id, action, details)
  values (event_id, p_delivery_id, 'notification.delivered', jsonb_build_object('providerReference', p_provider_reference));
end;
$$;

create or replace function public.fail_notification_delivery(
  p_delivery_id uuid,
  p_reason text,
  p_retry_seconds integer,
  p_max_attempts integer,
  p_enable_sms_fallback boolean
)
returns public.notification_delivery_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_record public.notification_deliveries;
  event_record public.notification_events;
  next_status public.notification_delivery_status;
begin
  select * into delivery_record from public.notification_deliveries
  where id = p_delivery_id for update;
  if delivery_record.id is null then raise exception 'notification delivery not found' using errcode = 'P0002'; end if;
  select * into event_record from public.notification_events where id = delivery_record.event_id;
  next_status := case when delivery_record.attempt_count >= p_max_attempts then 'dead_letter' else 'failed' end;
  update public.notification_deliveries
  set status = next_status, failure_reason = left(p_reason, 1000),
      available_at = now() + make_interval(secs => greatest(1, p_retry_seconds)), locked_at = null
  where id = p_delivery_id;
  insert into public.notification_audit_events (notification_event_id, delivery_id, action, details)
  values (
    delivery_record.event_id, p_delivery_id,
    case when next_status = 'dead_letter' then 'notification.dead_lettered' else 'notification.retry_scheduled' end,
    jsonb_build_object('reason', left(p_reason, 1000), 'attempt', delivery_record.attempt_count)
  );
  if p_enable_sms_fallback and delivery_record.channel = 'push'
    and event_record.priority = 'critical' then
    insert into public.notification_deliveries (event_id, channel)
    values (delivery_record.event_id, 'sms') on conflict (event_id, channel) do nothing;
    insert into public.notification_audit_events (notification_event_id, delivery_id, action, details)
    values (delivery_record.event_id, p_delivery_id, 'notification.sms_fallback_enqueued', '{}'::jsonb);
  end if;
  return next_status;
end;
$$;

revoke all on function public.claim_notification_deliveries(integer, integer) from public;
revoke all on function public.complete_notification_delivery(uuid, text, text) from public;
revoke all on function public.fail_notification_delivery(uuid, text, integer, integer, boolean) from public;
grant execute on function public.claim_notification_deliveries(integer, integer) to service_role;
grant execute on function public.complete_notification_delivery(uuid, text, text) to service_role;
grant execute on function public.fail_notification_delivery(uuid, text, integer, integer, boolean) to service_role;
