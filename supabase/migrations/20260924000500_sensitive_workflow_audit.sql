-- One immutable, queryable ledger for every sensitive workflow. Domain audit tables
-- remain the transaction-local source of truth; triggers copy their rows here in the
-- same transaction so an operation cannot commit without its canonical audit record.
create table public.audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  source_type text not null,
  source_id text not null,
  actor_staff_id uuid references auth.users(id),
  action text not null check (char_length(action) between 3 and 120),
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id uuid not null,
  entity_reference text,
  previous_state jsonb,
  new_state jsonb,
  reason text not null,
  operation_id uuid,
  request_id text,
  ip_address text,
  user_agent text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index audit_events_created_idx on public.audit_events(created_at desc, id);
create index audit_events_actor_idx on public.audit_events(actor_staff_id, created_at desc);
create index audit_events_action_idx on public.audit_events(action, created_at desc);
create index audit_events_entity_idx on public.audit_events(entity_type, entity_id, created_at desc);
create index audit_events_operation_idx on public.audit_events(operation_id) where operation_id is not null;
create index audit_events_request_idx on public.audit_events(request_id) where request_id is not null;

alter table public.audit_events enable row level security;
revoke all on public.audit_events from public, anon, authenticated;
grant select on public.audit_events to service_role;

comment on table public.audit_events is
  'Append-only canonical staff audit ledger populated atomically from domain audit events.';

create function public.prevent_audit_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Audit events are append-only.' using errcode = '23514';
end;
$$;

create trigger audit_events_immutable
before update or delete on public.audit_events
for each row execute function public.prevent_audit_event_mutation();

create function public.normalize_sensitive_audit_action(p_source text, p_action text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_source = 'catalogue' and p_action = 'listing.approve' then 'catalogue.listing_approved'
    when p_source = 'catalogue' and p_action = 'listing.request_changes' then 'catalogue.listing_changes_requested'
    when p_source = 'catalogue' and p_action = 'price_request.approve' then 'catalogue.price_change_approved'
    when p_source = 'catalogue' and p_action = 'price_request.reject' then 'catalogue.price_change_rejected'
    when p_source = 'delivery' and p_action = 'delivery.manually_assigned' then 'delivery.rider_assigned'
    when p_source = 'delivery' and p_action = 'delivery.reassigned' then 'delivery.rider_reassigned'
    when p_source = 'application' and p_action in ('start-review','application.start-review','application.start_review','application.application.start-review','application.application.start_review') then 'application.review_started'
    when p_source = 'application' and p_action in ('approve','application.approve','application.application.approve') then 'application.approved'
    when p_source = 'application' and p_action in ('reject','application.reject','application.application.reject') then 'application.rejected'
    when p_source = 'application' and p_action in ('request-changes','application.request-changes','application.request_changes','application.application.request_changes') then 'application.changes_requested'
    when p_source = 'application' and p_action in ('suspend','application.suspend','application.application.suspend') then 'application.suspended'
    when p_source = 'application' and p_action in ('notes','application.notes','application.application.notes') then 'application.support_note_added'
    when p_source = 'application' and p_action like 'application.%' then replace(p_action, '-', '_')
    when p_source = 'application' then 'application.' || replace(p_action, '-', '_')
    when p_source = 'payment' and p_action = 'payment.flag_investigation' then 'payment.investigation_flagged'
    when p_source = 'payment' and p_action = 'payment.request_refund' then 'payment.refund_requested'
    when p_source = 'order_support' and p_action = 'notes' then 'order.support_note_added'
    when p_source = 'order_support' and p_action = 'resend-notification' then 'order.notification_resent'
    when p_source = 'order_support' and p_action = 'reveal-contact' then 'order.contact_revealed'
    when p_source = 'order_support' and p_action = 'escalate-dispatch' then 'order.dispatch_escalated'
    when p_source = 'order_support' and p_action = 'cancel' then 'order.cancelled'
    else p_action
  end;
$$;

-- Preserve the complete historical log before replacing the former union view.
insert into public.audit_events(
  source_type, source_id, actor_staff_id, action, entity_type, entity_id,
  entity_reference, previous_state, new_state, reason, operation_id, request_id,
  ip_address, user_agent, details, created_at
)
select
  split_part(event.id, ':', 1), substring(event.id from position(':' in event.id) + 1),
  event.actor_user_id,
  public.normalize_sensitive_audit_action(split_part(event.id, ':', 1), event.action),
  event.entity_type, event.entity_id, event.entity_reference,
  event.previous_state, event.next_state, coalesce(nullif(event.reason, ''), event.action),
  case when event.operation_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then event.operation_id::uuid else null end,
  coalesce(nullif(event.operation_id, ''), event.id),
  event.context->>'ip', null, event.details, event.occurred_at
from public.admin_audit_event_projection event
on conflict (source_type, source_id) do nothing;

insert into public.audit_events(
  source_type, source_id, actor_staff_id, action, entity_type, entity_id,
  entity_reference, previous_state, new_state, reason, operation_id, request_id,
  details, created_at
)
select 'order_support', audit.id::text, audit.actor_id,
  public.normalize_sensitive_audit_action('order_support', audit.action),
  'order', audit.checkout_id, checkout.reference,
  case when audit.previous_status is null then null else jsonb_build_object('status', audit.previous_status) end,
  case when audit.next_status is null then null else jsonb_build_object('status', audit.next_status) end,
  coalesce(nullif(audit.reason, ''), audit.action), audit.operation_id, audit.operation_id::text,
  audit.details, audit.created_at
from public.order_support_audit_events audit
join public.customer_checkouts checkout on checkout.id = audit.checkout_id
on conflict (source_type, source_id) do nothing;

create function public.capture_sensitive_audit_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  row_data jsonb := to_jsonb(new);
  context_data jsonb := '{}';
  source text := tg_argv[0];
  actor_id uuid;
  event_action text;
  entity_kind text;
  entity_uuid uuid;
  entity_ref text;
  before_state jsonb;
  after_state jsonb;
  event_reason text;
  operation_uuid uuid;
  safe_details jsonb := '{}';
begin
  begin
    context_data := coalesce(nullif(current_setting('app.audit_context', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    context_data := '{}';
  end;

  actor_id := nullif(row_data->>'actor_user_id', '')::uuid;
  if source = 'catalogue' then
    event_action := row_data->>'action';
    entity_kind := row_data->>'entity_type';
    entity_uuid := (row_data->>'entity_id')::uuid;
    before_state := row_data->'previous_state';
    after_state := row_data->'next_state';
    event_reason := coalesce(nullif(after_state->>'reviewNote', ''), nullif(after_state->>'reason', ''), event_action);
    safe_details := '{}'::jsonb;
    if entity_kind = 'listing' then
      select product.name into entity_ref from public.listings listing
      join public.catalog_products product on product.id = listing.catalog_product_id
      where listing.id = entity_uuid;
    elsif entity_kind = 'price_request' then
      select product.name into entity_ref from public.listing_price_requests request
      join public.listings listing on listing.id = request.listing_id
      join public.catalog_products product on product.id = listing.catalog_product_id
      where request.id = entity_uuid;
    end if;
  elsif source = 'vendor_order' then
    event_action := row_data->>'action'; entity_kind := 'vendor_order';
    entity_uuid := (row_data->>'vendor_order_id')::uuid;
    before_state := case when row_data->>'previous_status' is null then null else jsonb_build_object('status', row_data->>'previous_status') end;
    after_state := case when row_data->>'next_status' is null then null else jsonb_build_object('status', row_data->>'next_status') end;
    operation_uuid := nullif(row_data->>'operation_id', '')::uuid;
    safe_details := coalesce(row_data->'details', '{}'::jsonb);
    event_reason := coalesce(nullif(safe_details->>'reason', ''), event_action);
    select reference into entity_ref from public.vendor_orders where id = entity_uuid;
  elsif source = 'quality_check' then
    event_action := row_data->>'action'; entity_kind := 'quality_check';
    entity_uuid := (row_data->>'quality_check_id')::uuid;
    operation_uuid := nullif(row_data->>'operation_id', '')::uuid;
    safe_details := coalesce(row_data->'details', '{}'::jsonb);
    after_state := safe_details; event_reason := coalesce(nullif(safe_details->>'reason', ''), event_action);
    select orders.reference into entity_ref from public.vendor_orders orders
      where orders.id = (row_data->>'vendor_order_id')::uuid;
  elsif source = 'payment' then
    event_action := row_data->>'action'; entity_kind := 'payment';
    entity_uuid := (row_data->>'payment_attempt_id')::uuid;
    before_state := case when row_data->>'previous_status' is null then null else jsonb_build_object('status', row_data->>'previous_status') end;
    after_state := case when row_data->>'next_status' is null then null else jsonb_build_object('status', row_data->>'next_status') end;
    safe_details := coalesce(row_data->'details', '{}'::jsonb);
    operation_uuid := coalesce(nullif(safe_details->>'operationId', '')::uuid, nullif(context_data->>'operationId', '')::uuid);
    event_reason := coalesce(nullif(safe_details->>'reason', ''), event_action);
    select merchant_reference into entity_ref from public.payment_attempts where id = entity_uuid;
  elsif source = 'delivery' then
    event_action := row_data->>'action'; entity_kind := 'delivery';
    entity_uuid := (row_data->>'delivery_id')::uuid;
    before_state := case when row_data->>'previous_status' is null then null else jsonb_build_object('status', row_data->>'previous_status') end;
    after_state := case when row_data->>'next_status' is null then null else jsonb_build_object('status', row_data->>'next_status') end;
    operation_uuid := nullif(row_data->>'operation_id', '')::uuid;
    safe_details := coalesce(row_data->'details', '{}'::jsonb);
    event_reason := coalesce(nullif(safe_details->>'reason', ''), event_action);
    select reference into entity_ref from public.deliveries where id = entity_uuid;
  elsif source = 'delivery_pickup' then
    event_action := row_data->>'action'; entity_kind := 'delivery_pickup';
    entity_uuid := (row_data->>'pickup_id')::uuid;
    operation_uuid := nullif(row_data->>'operation_id', '')::uuid;
    event_reason := event_action;
    select delivery.reference into entity_ref from public.delivery_pickups pickup
      join public.deliveries delivery on delivery.id = pickup.delivery_id where pickup.id = entity_uuid;
  elsif source = 'application' then
    actor_id := nullif(row_data->>'actor_user_id', '')::uuid;
    event_action := row_data->>'action'; entity_kind := 'application';
    entity_uuid := (row_data->>'application_id')::uuid;
    before_state := jsonb_build_object('status', row_data->>'from_status');
    after_state := jsonb_build_object('status', row_data->>'to_status');
    event_reason := coalesce(nullif(row_data->>'reason', ''), event_action);
    safe_details := jsonb_build_object('issues', coalesce(row_data->'issues', '[]'::jsonb));
    select type || ' application' into entity_ref from public.account_applications where id = entity_uuid;
  elsif source = 'order_support' then
    actor_id := nullif(row_data->>'actor_id', '')::uuid;
    event_action := row_data->>'action'; entity_kind := 'order';
    entity_uuid := (row_data->>'checkout_id')::uuid;
    before_state := case when row_data->>'previous_status' is null then null else jsonb_build_object('status', row_data->>'previous_status') end;
    after_state := case when row_data->>'next_status' is null then null else jsonb_build_object('status', row_data->>'next_status') end;
    operation_uuid := nullif(row_data->>'operation_id', '')::uuid;
    safe_details := coalesce(row_data->'details', '{}'::jsonb);
    event_reason := coalesce(nullif(row_data->>'reason', ''), event_action);
    select reference into entity_ref from public.customer_checkouts where id = entity_uuid;
  else
    raise exception 'Unsupported audit source %', source;
  end if;

  operation_uuid := coalesce(operation_uuid, nullif(context_data->>'operationId', '')::uuid);
  insert into public.audit_events(
    source_type, source_id, actor_staff_id, action, entity_type, entity_id,
    entity_reference, previous_state, new_state, reason, operation_id, request_id,
    ip_address, user_agent, details, created_at
  ) values (
    source, row_data->>'id', actor_id,
    public.normalize_sensitive_audit_action(source, event_action), entity_kind, entity_uuid,
    entity_ref, before_state, after_state, coalesce(nullif(event_reason, ''), event_action),
    operation_uuid, coalesce(nullif(context_data->>'requestId', ''), operation_uuid::text),
    nullif(context_data->>'ipAddress', ''), left(nullif(context_data->>'userAgent', ''), 1000),
    safe_details, coalesce((row_data->>'created_at')::timestamptz, now())
  ) on conflict (source_type, source_id) do nothing;
  return new;
end;
$$;

create trigger catalogue_capture_sensitive_audit after insert on public.catalogue_audit_events
for each row execute function public.capture_sensitive_audit_event('catalogue');
create trigger vendor_order_capture_sensitive_audit after insert on public.vendor_order_audit_events
for each row execute function public.capture_sensitive_audit_event('vendor_order');
create trigger quality_check_capture_sensitive_audit after insert on public.quality_check_audit_events
for each row execute function public.capture_sensitive_audit_event('quality_check');
create trigger payment_capture_sensitive_audit after insert on public.payment_audit_events
for each row execute function public.capture_sensitive_audit_event('payment');
create trigger delivery_capture_sensitive_audit after insert on public.delivery_audit_events
for each row execute function public.capture_sensitive_audit_event('delivery');
create trigger delivery_pickup_capture_sensitive_audit after insert on public.delivery_pickup_audit_events
for each row execute function public.capture_sensitive_audit_event('delivery_pickup');
create trigger application_capture_sensitive_audit after insert on public.application_review_events
for each row execute function public.capture_sensitive_audit_event('application');
create trigger order_support_capture_sensitive_audit after insert on public.order_support_audit_events
for each row execute function public.capture_sensitive_audit_event('order_support');

create or replace view public.admin_audit_event_projection
with (security_invoker = true) as
select
  audit.source_type || ':' || audit.source_id as id,
  audit.actor_staff_id as actor_user_id,
  coalesce(staff.display_name,
    nullif(trim(actor.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(actor.raw_user_meta_data->>'full_name'), ''),
    split_part(actor.email, '@', 1), 'System') as actor_name,
  coalesce(staff.role::text, actor.raw_app_meta_data->>'role', 'system') as actor_role,
  audit.action, audit.entity_type, audit.entity_id, audit.entity_reference,
  audit.reason, audit.previous_state, audit.new_state as next_state,
  audit.operation_id::text as operation_id,
  jsonb_strip_nulls(jsonb_build_object(
    'ip', audit.ip_address,
    'device', audit.details->>'deviceId',
    'userAgent', audit.user_agent
  )) as context,
  audit.details, audit.created_at as occurred_at, audit.request_id
from public.audit_events audit
left join public.staff_members staff on staff.user_id = audit.actor_staff_id
left join auth.users actor on actor.id = audit.actor_staff_id;

revoke all on table public.admin_audit_event_projection from public;

create or replace function public.admin_list_audit_events(
  p_page integer default 1, p_page_size integer default 25, p_query text default null,
  p_staff_user_id uuid default null, p_action text default null, p_entity_type text default null,
  p_entity_id uuid default null, p_from timestamptz default null, p_to timestamptz default null,
  p_sort_by text default 'occurredAt', p_sort_order text default 'desc'
) returns jsonb language sql stable security definer set search_path = '' as $$
  with filtered as (
    select event.* from public.admin_audit_event_projection event
    where (p_staff_user_id is null or event.actor_user_id = p_staff_user_id)
      and (p_action is null or event.action = p_action)
      and (p_entity_type is null or event.entity_type = p_entity_type)
      and (p_entity_id is null or event.entity_id = p_entity_id)
      and (p_from is null or event.occurred_at >= p_from)
      and (p_to is null or event.occurred_at <= p_to)
      and (p_query is null or event.operation_id ilike '%'||p_query||'%'
        or event.request_id ilike '%'||p_query||'%' or event.entity_reference ilike '%'||p_query||'%'
        or event.actor_name ilike '%'||p_query||'%' or event.action ilike '%'||p_query||'%')
  ), page_rows as (
    select * from filtered order by
      case when p_sort_by='action' and p_sort_order='asc' then action end asc,
      case when p_sort_by='action' and p_sort_order='desc' then action end desc,
      case when p_sort_by='entityType' and p_sort_order='asc' then entity_type end asc,
      case when p_sort_by='entityType' and p_sort_order='desc' then entity_type end desc,
      case when p_sort_by='occurredAt' and p_sort_order='asc' then occurred_at end asc,
      occurred_at desc, id desc
    limit greatest(1,least(p_page_size,100))
    offset (greatest(p_page,1)-1)*greatest(1,least(p_page_size,100))
  ), totals as (select count(*)::integer total_items from filtered)
  select jsonb_build_object(
    'data',coalesce((select jsonb_agg(jsonb_build_object(
      'id',row.id,
      'actor',case when row.actor_user_id is null then null else jsonb_build_object(
        'staffId',row.actor_user_id,'name',row.actor_name,'role',row.actor_role) end,
      'action',row.action,
      'entity',jsonb_build_object('type',row.entity_type,'id',row.entity_id,'reference',row.entity_reference),
      'reason',row.reason,'operationId',row.operation_id,'requestId',row.request_id,
      'context',jsonb_build_object('ip',row.context->>'ip','device',row.context->>'device','userAgent',row.context->>'userAgent'),
      'occurredAt',row.occurred_at
    ) order by
      case when p_sort_by='action' and p_sort_order='asc' then row.action end asc,
      case when p_sort_by='action' and p_sort_order='desc' then row.action end desc,
      case when p_sort_by='entityType' and p_sort_order='asc' then row.entity_type end asc,
      case when p_sort_by='entityType' and p_sort_order='desc' then row.entity_type end desc,
      case when p_sort_by='occurredAt' and p_sort_order='asc' then row.occurred_at end asc,
      row.occurred_at desc,row.id desc) from page_rows row),'[]'::jsonb),
    'pagination',jsonb_build_object('page',greatest(p_page,1),'pageSize',greatest(1,least(p_page_size,100)),
      'totalItems',totals.total_items,'totalPages',ceil(totals.total_items::numeric/greatest(1,least(p_page_size,100)))::integer)
  ) from totals;
$$;

create or replace function public.admin_get_audit_event(p_event_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare event public.admin_audit_event_projection%rowtype;
begin
  select * into event from public.admin_audit_event_projection projection where projection.id=p_event_id;
  if not found then raise exception using errcode='P0002',message='audit event not found'; end if;
  return jsonb_build_object(
    'id',event.id,
    'actor',case when event.actor_user_id is null then null else jsonb_build_object(
      'staffId',event.actor_user_id,'name',event.actor_name,'role',event.actor_role) end,
    'action',event.action,
    'entity',jsonb_build_object('type',event.entity_type,'id',event.entity_id,'reference',event.entity_reference),
    'reason',event.reason,'previousState',event.previous_state,'newState',event.next_state,
    'operationId',event.operation_id,'requestId',event.request_id,
    'context',jsonb_build_object('ip',event.context->>'ip','device',event.context->>'device','userAgent',event.context->>'userAgent'),
    'details',event.details,'occurredAt',event.occurred_at);
end;
$$;

revoke all on function public.admin_list_audit_events(integer,integer,text,uuid,text,text,uuid,timestamptz,timestamptz,text,text) from public;
revoke all on function public.admin_get_audit_event(text) from public;
grant execute on function public.admin_list_audit_events(integer,integer,text,uuid,text,text,uuid,timestamptz,timestamptz,text,text) to service_role;
grant execute on function public.admin_get_audit_event(text) to service_role;
