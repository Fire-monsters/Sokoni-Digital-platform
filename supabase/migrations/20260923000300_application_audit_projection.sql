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
  union all
  select 'application:' || e.id::text,e.actor_user_id,'application.'||e.action,'application',e.application_id,
    e.application_id::text,coalesce(e.reason,e.action),
    jsonb_build_object('status',e.from_status),jsonb_build_object('status',e.to_status),
    null::text,jsonb_build_object('issues',e.issues),e.created_at
  from public.application_review_events e
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
