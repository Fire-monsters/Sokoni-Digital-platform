create or replace view public.admin_audit_event_projection
with (security_invoker = true) as
with audit_events as (
  select
    'catalogue:' || audit.id::text as id,
    audit.actor_user_id,
    audit.action,
    audit.entity_type,
    audit.entity_id,
    case
      when audit.entity_type = 'listing' then product.name
      else audit.entity_id::text
    end as entity_reference,
    coalesce(nullif(audit.next_state->>'reason', ''), audit.action) as reason,
    audit.previous_state,
    audit.next_state,
    nullif(audit.next_state->>'operationId', '') as operation_id,
    '{}'::jsonb as details,
    audit.created_at as occurred_at
  from public.catalogue_audit_events audit
  left join public.listings listing
    on audit.entity_type = 'listing' and listing.id = audit.entity_id
  left join public.catalog_products product on product.id = listing.catalog_product_id

  union all

  select
    'vendor_order:' || audit.id::text,
    audit.actor_user_id,
    audit.action,
    'vendor_order',
    audit.vendor_order_id,
    vendor_order.reference,
    coalesce(nullif(audit.details->>'reason', ''), audit.action),
    case when audit.previous_status is null then null
      else jsonb_build_object('status', audit.previous_status) end,
    case when audit.next_status is null then null
      else jsonb_build_object('status', audit.next_status) end,
    audit.operation_id::text,
    audit.details,
    audit.created_at
  from public.vendor_order_audit_events audit
  join public.vendor_orders vendor_order on vendor_order.id = audit.vendor_order_id

  union all

  select
    'quality_check:' || audit.id::text,
    audit.actor_user_id,
    audit.action,
    'quality_check',
    audit.quality_check_id,
    vendor_order.reference,
    coalesce(nullif(audit.details->>'reason', ''), audit.action),
    null,
    audit.details,
    audit.operation_id::text,
    audit.details,
    audit.created_at
  from public.quality_check_audit_events audit
  join public.vendor_orders vendor_order on vendor_order.id = audit.vendor_order_id

  union all

  select
    'payment:' || audit.id::text,
    audit.actor_user_id,
    audit.action,
    'payment',
    audit.payment_attempt_id,
    payment.merchant_reference,
    coalesce(nullif(audit.details->>'reason', ''), audit.action),
    case when audit.previous_status is null then null
      else jsonb_build_object('status', audit.previous_status) end,
    case when audit.next_status is null then null
      else jsonb_build_object('status', audit.next_status) end,
    nullif(audit.details->>'operationId', ''),
    audit.details,
    audit.created_at
  from public.payment_audit_events audit
  join public.payment_attempts payment on payment.id = audit.payment_attempt_id

  union all

  select
    'delivery:' || audit.id::text,
    audit.actor_user_id,
    audit.action,
    'delivery',
    audit.delivery_id,
    delivery.reference,
    coalesce(nullif(audit.details->>'reason', ''), nullif(operation.reason, ''), audit.action),
    case when audit.previous_status is null then null
      else jsonb_build_object('status', audit.previous_status) end,
    case when audit.next_status is null then null
      else jsonb_build_object('status', audit.next_status) end,
    audit.operation_id::text,
    audit.details,
    audit.created_at
  from public.delivery_audit_events audit
  join public.deliveries delivery on delivery.id = audit.delivery_id
  left join public.delivery_operations operation on operation.operation_id = audit.operation_id

  union all

  select
    'delivery_pickup:' || audit.id::text,
    audit.actor_user_id,
    audit.action,
    'delivery_pickup',
    audit.pickup_id,
    delivery.reference,
    audit.action,
    null,
    jsonb_build_object('status', operation.result_status),
    audit.operation_id::text,
    '{}'::jsonb,
    audit.created_at
  from public.delivery_pickup_audit_events audit
  join public.delivery_pickups pickup on pickup.id = audit.pickup_id
  join public.deliveries delivery on delivery.id = pickup.delivery_id
  join public.delivery_pickup_operations operation on operation.operation_id = audit.operation_id
)
select
  audit.id,
  audit.actor_user_id,
  coalesce(staff.display_name,
    nullif(trim(actor.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(actor.raw_user_meta_data->>'full_name'), ''),
    split_part(actor.email, '@', 1),
    'System') as actor_name,
  coalesce(staff.role::text, actor.raw_app_meta_data->>'role', 'system') as actor_role,
  audit.action,
  audit.entity_type,
  audit.entity_id,
  audit.entity_reference,
  audit.reason,
  audit.previous_state,
  audit.next_state,
  audit.operation_id,
  jsonb_strip_nulls(jsonb_build_object(
    'ip', coalesce(audit.details->>'ip', audit.details->>'ipAddress'),
    'device', coalesce(audit.details->>'device', audit.details->>'deviceId')
  )) as context,
  audit.details,
  audit.occurred_at
from audit_events audit
left join public.staff_members staff on staff.user_id = audit.actor_user_id
left join auth.users actor on actor.id = audit.actor_user_id;

revoke all on table public.admin_audit_event_projection from public;

create or replace function public.admin_list_audit_events(
  p_page integer default 1,
  p_page_size integer default 25,
  p_query text default null,
  p_staff_user_id uuid default null,
  p_action text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_sort_by text default 'occurredAt',
  p_sort_order text default 'desc'
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select event.*
    from public.admin_audit_event_projection event
    where (p_staff_user_id is null or event.actor_user_id = p_staff_user_id)
      and (p_action is null or event.action = p_action)
      and (p_entity_type is null or event.entity_type = p_entity_type)
      and (p_entity_id is null or event.entity_id = p_entity_id)
      and (p_from is null or event.occurred_at >= p_from)
      and (p_to is null or event.occurred_at <= p_to)
      and (
        p_query is null
        or event.operation_id ilike '%' || p_query || '%'
        or event.entity_reference ilike '%' || p_query || '%'
        or event.actor_name ilike '%' || p_query || '%'
        or event.action ilike '%' || p_query || '%'
      )
  ), page_rows as (
    select *
    from filtered
    order by
      case when p_sort_by = 'action' and p_sort_order = 'asc' then action end asc,
      case when p_sort_by = 'action' and p_sort_order = 'desc' then action end desc,
      case when p_sort_by = 'entityType' and p_sort_order = 'asc' then entity_type end asc,
      case when p_sort_by = 'entityType' and p_sort_order = 'desc' then entity_type end desc,
      case when p_sort_by = 'occurredAt' and p_sort_order = 'asc' then occurred_at end asc,
      occurred_at desc,
      id desc
    limit greatest(1, least(p_page_size, 100))
    offset (greatest(p_page, 1) - 1) * greatest(1, least(p_page_size, 100))
  ), totals as (select count(*)::integer as total_items from filtered)
  select jsonb_build_object(
    'data', coalesce((select jsonb_agg(jsonb_build_object(
      'id', row.id,
      'actor', case when row.actor_user_id is null then null else jsonb_build_object(
        'staffId', row.actor_user_id,
        'name', row.actor_name,
        'role', row.actor_role
      ) end,
      'action', row.action,
      'entity', jsonb_build_object(
        'type', row.entity_type,
        'id', row.entity_id,
        'reference', row.entity_reference
      ),
      'reason', row.reason,
      'operationId', row.operation_id,
      'context', jsonb_build_object(
        'ip', row.context->>'ip',
        'device', row.context->>'device'
      ),
      'occurredAt', row.occurred_at
    ) order by
      case when p_sort_by = 'action' and p_sort_order = 'asc' then row.action end asc,
      case when p_sort_by = 'action' and p_sort_order = 'desc' then row.action end desc,
      case when p_sort_by = 'entityType' and p_sort_order = 'asc' then row.entity_type end asc,
      case when p_sort_by = 'entityType' and p_sort_order = 'desc' then row.entity_type end desc,
      case when p_sort_by = 'occurredAt' and p_sort_order = 'asc' then row.occurred_at end asc,
      row.occurred_at desc,
      row.id desc) from page_rows row), '[]'::jsonb),
    'pagination', jsonb_build_object(
      'page', greatest(p_page, 1),
      'pageSize', greatest(1, least(p_page_size, 100)),
      'totalItems', totals.total_items,
      'totalPages', ceil(totals.total_items::numeric / greatest(1, least(p_page_size, 100)))::integer
    )
  )
  from totals;
$$;

create or replace function public.admin_get_audit_event(p_event_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  event public.admin_audit_event_projection%rowtype;
begin
  select * into event
  from public.admin_audit_event_projection projection
  where projection.id = p_event_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'audit event not found';
  end if;

  return jsonb_build_object(
    'id', event.id,
    'actor', case when event.actor_user_id is null then null else jsonb_build_object(
      'staffId', event.actor_user_id,
      'name', event.actor_name,
      'role', event.actor_role
    ) end,
    'action', event.action,
    'entity', jsonb_build_object(
      'type', event.entity_type,
      'id', event.entity_id,
      'reference', event.entity_reference
    ),
    'reason', event.reason,
    'previousState', event.previous_state,
    'newState', event.next_state,
    'operationId', event.operation_id,
    'context', jsonb_build_object(
      'ip', event.context->>'ip',
      'device', event.context->>'device'
    ),
    'details', event.details,
    'occurredAt', event.occurred_at
  );
end;
$$;

revoke all on function public.admin_list_audit_events(integer, integer, text, uuid, text, text, uuid, timestamptz, timestamptz, text, text) from public;
revoke all on function public.admin_get_audit_event(text) from public;
grant execute on function public.admin_list_audit_events(integer, integer, text, uuid, text, text, uuid, timestamptz, timestamptz, text, text) to service_role;
grant execute on function public.admin_get_audit_event(text) to service_role;

create index if not exists catalogue_audit_admin_created_idx
  on public.catalogue_audit_events (created_at desc, id);
create index if not exists catalogue_audit_admin_actor_idx
  on public.catalogue_audit_events (actor_user_id, created_at desc);
create index if not exists payment_audit_admin_created_idx
  on public.payment_audit_events (created_at desc, id);
create index if not exists payment_audit_admin_actor_idx
  on public.payment_audit_events (actor_user_id, created_at desc);
create index if not exists vendor_order_audit_admin_created_idx
  on public.vendor_order_audit_events (created_at desc, id);
create index if not exists vendor_order_audit_admin_actor_idx
  on public.vendor_order_audit_events (actor_user_id, created_at desc);
create index if not exists quality_check_audit_admin_created_idx
  on public.quality_check_audit_events (created_at desc, id);
create index if not exists quality_check_audit_admin_actor_idx
  on public.quality_check_audit_events (actor_user_id, created_at desc);
create index if not exists delivery_audit_admin_created_idx
  on public.delivery_audit_events (created_at desc, id);
create index if not exists delivery_audit_admin_actor_idx
  on public.delivery_audit_events (actor_user_id, created_at desc);
create index if not exists delivery_pickup_audit_admin_created_idx
  on public.delivery_pickup_audit_events (created_at desc, id);
create index if not exists delivery_pickup_audit_admin_actor_idx
  on public.delivery_pickup_audit_events (actor_user_id, created_at desc);
