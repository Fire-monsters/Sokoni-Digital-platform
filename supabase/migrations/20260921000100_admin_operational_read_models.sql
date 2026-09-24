-- Phase 2 slices 2.2-2.3: purpose-built operational overview and order queue.

create or replace function public.admin_get_operational_overview(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_now timestamptz default now()
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select
      coalesce(
        p_from,
        date_trunc('day', p_now at time zone 'UTC') at time zone 'UTC'
      ) as range_from,
      coalesce(
        p_to,
        (date_trunc('day', p_now at time zone 'UTC') + interval '1 day') at time zone 'UTC'
          - interval '1 millisecond'
      ) as range_to
  ),
  period_orders as (
    select checkout.*
    from public.customer_checkouts checkout
    cross join bounds
    where checkout.created_at >= bounds.range_from
      and checkout.created_at <= bounds.range_to
  ),
  latest_payments as (
    select distinct on (attempt.checkout_id)
      attempt.checkout_id,
      attempt.status
    from public.payment_attempts attempt
    join period_orders checkout on checkout.id = attempt.checkout_id
    order by attempt.checkout_id, attempt.created_at desc, attempt.id desc
  ),
  delivery_snapshot as (
    select
      delivery.id,
      delivery.status,
      delivery.created_at,
      delivery.updated_at,
      delivery_group.checkout_id,
      checkout.reference as order_reference,
      exists (
        select 1 from public.delivery_issues issue
        where issue.delivery_id = delivery.id and issue.status = 'open'
      ) as has_issue
    from public.deliveries delivery
    join public.delivery_groups delivery_group on delivery_group.id = delivery.delivery_group_id
    join public.customer_checkouts checkout on checkout.id = delivery_group.checkout_id
  ),
  attention as (
    select * from (
      select
        'DELIVERY_WITHOUT_RIDER'::text as type,
        'high'::text as severity,
        'delivery'::text as entity_type,
        delivery.id as entity_id,
        delivery.order_reference,
        greatest(0, extract(epoch from (p_now - delivery.created_at))::bigint) as age_seconds,
        'Delivery has no rider'::text as message,
        'Open delivery'::text as action_label,
        '/deliveries?deliveryId=' || delivery.id::text as action_href
      from delivery_snapshot delivery
      where delivery.status in ('unassigned', 'offering')
        and delivery.created_at <= p_now - interval '10 minutes'

      union all

      select
        'DELIVERY_ISSUE', 'high', 'delivery', delivery.id, delivery.order_reference,
        greatest(0, extract(epoch from (p_now - delivery.updated_at))::bigint),
        'Delivery has an unresolved issue', 'Open delivery',
        '/deliveries?deliveryId=' || delivery.id::text
      from delivery_snapshot delivery
      where delivery.has_issue

      union all

      select
        case
          when vendor_order.status = 'awaiting_vendor_acceptance'
            then 'VENDOR_ACCEPTANCE_DELAY'
          else 'VENDOR_PREPARATION_DELAY'
        end,
        'medium', 'order', checkout.id, checkout.reference,
        greatest(0, extract(epoch from (p_now - vendor_order.updated_at))::bigint),
        case
          when vendor_order.status = 'awaiting_vendor_acceptance'
            then 'Vendor acceptance is delayed'
          else 'Vendor preparation is delayed'
        end,
        'Open order', '/orders/' || checkout.id::text
      from public.vendor_orders vendor_order
      join public.customer_checkouts checkout on checkout.id = vendor_order.checkout_id
      where (
        vendor_order.status = 'awaiting_vendor_acceptance'
        and vendor_order.updated_at <= p_now - interval '10 minutes'
      ) or (
        vendor_order.status = 'preparing'
        and vendor_order.updated_at <= p_now - interval '30 minutes'
      )
    ) attention_items
    order by case severity when 'high' then 1 when 'medium' then 2 else 3 end, age_seconds desc
    limit 50
  )
  select jsonb_build_object(
    'period', jsonb_build_object(
      'from', bounds.range_from,
      'to', bounds.range_to
    ),
    'orders', jsonb_build_object(
      'receivedToday', (select count(*) from period_orders),
      'grossOrderValue', coalesce((
        select sum(total_ugx) from period_orders
        where status not in ('expired', 'cancelled')
      ), 0),
      'waitingForVendorAcceptance', (
        select count(*) from public.vendor_orders
        where status = 'awaiting_vendor_acceptance'
      ),
      'delayedInPreparation', (
        select count(*) from public.vendor_orders
        where status = 'preparing' and updated_at <= p_now - interval '30 minutes'
      )
    ),
    'payments', jsonb_build_object(
      'paid', (select count(*) from latest_payments where status = 'successful'),
      'pending', (select count(*) from latest_payments where status in ('created', 'initiating', 'pending')),
      'failed', (select count(*) from latest_payments where status = 'failed'),
      'awaitingReconciliation', (
        select count(*) from latest_payments where status = 'requires_reconciliation'
      )
    ),
    'deliveries', jsonb_build_object(
      'waitingForRider', (
        select count(*) from delivery_snapshot where status in ('unassigned', 'offering')
      ),
      'active', (
        select count(*) from delivery_snapshot
        where status in (
          'assigned', 'arrived_at_market', 'picked_up', 'in_transit', 'arrived_at_customer'
        )
      ),
      'issues', (select count(*) from delivery_snapshot where has_issue)
    ),
    'approvals', jsonb_build_object(
      'vendors', (select count(*) from public.sellers where verification_status = 'pending'),
      'riders', (
        select count(*) from public.transporter_profiles where verification_status = 'pending'
      ),
      'listings', (select count(*) from public.listings where status = 'pending_approval'),
      'priceChanges', (
        select count(*) from public.listing_price_requests where status = 'pending'
      )
    ),
    'operations', jsonb_build_object(
      'activeVendors', (
        select count(*) from public.sellers where verification_status = 'approved'
      ),
      'availableRiders', (
        select count(*) from public.transporter_profiles
        where verification_status = 'approved' and availability = 'available'
      )
    ),
    'attentionRequired', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', type,
        'severity', severity,
        'entityType', entity_type,
        'entityId', entity_id,
        'orderReference', order_reference,
        'ageSeconds', age_seconds,
        'message', message,
        'action', jsonb_build_object('label', action_label, 'href', action_href)
      )) from attention
    ), '[]'::jsonb)
  )
  from bounds;
$$;

create or replace function public.admin_list_orders(
  p_page integer default 1,
  p_page_size integer default 25,
  p_query text default null,
  p_market_id uuid default null,
  p_vendor_id uuid default null,
  p_fulfilment_type text default null,
  p_payment_status text default null,
  p_seller_order_status text default null,
  p_delivery_status text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_delayed_only boolean default null,
  p_issues_only boolean default null,
  p_sort_by text default 'createdAt',
  p_sort_order text default 'desc',
  p_now timestamptz default now()
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
  if p_sort_by not in ('createdAt', 'updatedAt', 'total', 'status')
    or p_sort_order not in ('asc', 'desc') then
    raise exception 'invalid sort' using errcode = '22023';
  end if;

  with latest_payment as (
    select distinct on (attempt.checkout_id)
      attempt.checkout_id,
      case when attempt.status = 'successful' then 'paid' else attempt.status::text end as status,
      attempt.amount_ugx
    from public.payment_attempts attempt
    order by attempt.checkout_id, attempt.created_at desc, attempt.id desc
  ),
  seller_summary as (
    select
      vendor_order.checkout_id,
      count(*)::integer as total,
      count(*) filter (where vendor_order.status = 'accepted')::integer as accepted,
      count(*) filter (where vendor_order.status = 'preparing')::integer as preparing,
      count(*) filter (where vendor_order.status in ('quality_verified', 'ready_for_pickup'))::integer as ready,
      bool_or(
        (vendor_order.status = 'awaiting_vendor_acceptance'
          and vendor_order.updated_at <= p_now - interval '10 minutes')
        or (vendor_order.status = 'preparing'
          and vendor_order.updated_at <= p_now - interval '30 minutes')
      ) as delayed
    from public.vendor_orders vendor_order
    group by vendor_order.checkout_id
  ),
  delivery_summary as (
    select
      delivery_group.checkout_id,
      delivery.id,
      case
        when delivery.status in ('unassigned', 'offering') then 'waiting_for_rider'
        else delivery.status::text
      end as status,
      exists (
        select 1 from public.delivery_issues issue
        where issue.delivery_id = delivery.id and issue.status = 'open'
      ) as has_issue,
      delivery.updated_at
    from public.deliveries delivery
    join public.delivery_groups delivery_group on delivery_group.id = delivery.delivery_group_id
  ),
  enriched as (
    select
      checkout.id,
      checkout.reference,
      checkout.status::text as checkout_status,
      checkout.total_ugx,
      checkout.created_at,
      greatest(
        checkout.updated_at,
        coalesce(delivery.updated_at, checkout.updated_at)
      ) as updated_at,
      checkout.market_id,
      market.name as market_name,
      fulfilment.type::text as fulfilment_type,
      fulfilment.phone_number,
      coalesce(
        nullif(trim(consumer.raw_user_meta_data->>'display_name'), ''),
        nullif(trim(consumer.raw_user_meta_data->>'full_name'), ''),
        'Customer'
      ) as consumer_name,
      case
        when length(fulfilment.phone_number) > 7
          then left(fulfilment.phone_number, 4)
            || repeat('*', length(fulfilment.phone_number) - 7)
            || right(fulfilment.phone_number, 3)
        else repeat('*', length(fulfilment.phone_number))
      end as phone_masked,
      payment.status as payment_status,
      payment.amount_ugx as payment_amount,
      coalesce(sellers.total, 0) as seller_total,
      coalesce(sellers.accepted, 0) as seller_accepted,
      coalesce(sellers.preparing, 0) as seller_preparing,
      coalesce(sellers.ready, 0) as seller_ready,
      coalesce(sellers.delayed, false) as delayed,
      delivery.id as delivery_id,
      delivery.status as delivery_status,
      coalesce(delivery.has_issue, false) as has_issue
    from public.customer_checkouts checkout
    join public.markets market on market.id = checkout.market_id
    join public.checkout_fulfilments fulfilment on fulfilment.checkout_id = checkout.id
    join auth.users consumer on consumer.id = checkout.consumer_id
    left join latest_payment payment on payment.checkout_id = checkout.id
    left join seller_summary sellers on sellers.checkout_id = checkout.id
    left join delivery_summary delivery on delivery.checkout_id = checkout.id
  ),
  filtered as (
    select enriched.*
    from enriched
    where (p_query is null or (
      enriched.reference ilike '%' || p_query || '%'
      or enriched.phone_number ilike '%' || p_query || '%'
      or enriched.consumer_name ilike '%' || p_query || '%'
    ))
      and (p_market_id is null or enriched.market_id = p_market_id)
      and (p_fulfilment_type is null or enriched.fulfilment_type = p_fulfilment_type)
      and (p_payment_status is null or enriched.payment_status = p_payment_status)
      and (p_delivery_status is null or enriched.delivery_status = p_delivery_status)
      and (p_from is null or enriched.created_at >= p_from)
      and (p_to is null or enriched.created_at <= p_to)
      and (p_delayed_only is not true or enriched.delayed)
      and (p_issues_only is not true or enriched.has_issue)
      and (p_vendor_id is null or exists (
        select 1 from public.vendor_orders vendor_order
        where vendor_order.checkout_id = enriched.id and vendor_order.seller_id = p_vendor_id
      ))
      and (p_seller_order_status is null or exists (
        select 1 from public.vendor_orders vendor_order
        where vendor_order.checkout_id = enriched.id
          and vendor_order.status::text = p_seller_order_status
      ))
  ),
  ordered as (
    select filtered.*, row_number() over (order by
      case when p_sort_by = 'createdAt' and p_sort_order = 'asc' then created_at end asc,
      case when p_sort_by = 'createdAt' and p_sort_order = 'desc' then created_at end desc,
      case when p_sort_by = 'updatedAt' and p_sort_order = 'asc' then updated_at end asc,
      case when p_sort_by = 'updatedAt' and p_sort_order = 'desc' then updated_at end desc,
      case when p_sort_by = 'total' and p_sort_order = 'asc' then total_ugx end asc,
      case when p_sort_by = 'total' and p_sort_order = 'desc' then total_ugx end desc,
      case when p_sort_by = 'status' and p_sort_order = 'asc' then checkout_status end asc,
      case when p_sort_by = 'status' and p_sort_order = 'desc' then checkout_status end desc,
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
      'reference', reference,
      'consumer', jsonb_build_object('name', consumer_name, 'phoneMasked', phone_masked),
      'market', jsonb_build_object('id', market_id, 'name', market_name),
      'fulfilmentType', fulfilment_type,
      'payment', case when payment_status is null then null else jsonb_build_object(
        'status', payment_status, 'amount', payment_amount
      ) end,
      'sellerOrders', jsonb_build_object(
        'total', seller_total,
        'accepted', seller_accepted,
        'preparing', seller_preparing,
        'ready', seller_ready
      ),
      'delivery', case when delivery_id is null then null else jsonb_build_object(
        'status', delivery_status, 'hasIssue', has_issue
      ) end,
      'createdAt', created_at,
      'updatedAt', updated_at,
      'flags', jsonb_build_object('delayed', delayed, 'hasIssue', has_issue)
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

revoke all on function public.admin_get_operational_overview(timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.admin_list_orders(
  integer, integer, text, uuid, uuid, text, text, text, text,
  timestamptz, timestamptz, boolean, boolean, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.admin_get_operational_overview(timestamptz, timestamptz, timestamptz)
  to service_role;
grant execute on function public.admin_list_orders(
  integer, integer, text, uuid, uuid, text, text, text, text,
  timestamptz, timestamptz, boolean, boolean, text, text, timestamptz
) to service_role;

create index if not exists customer_checkouts_admin_created_idx
  on public.customer_checkouts (created_at desc, id desc);
create index if not exists customer_checkouts_admin_market_created_idx
  on public.customer_checkouts (market_id, created_at desc, id desc);
create index if not exists vendor_orders_admin_status_updated_idx
  on public.vendor_orders (status, updated_at, checkout_id);
create index if not exists deliveries_admin_status_created_idx
  on public.deliveries (status, created_at, delivery_group_id);
