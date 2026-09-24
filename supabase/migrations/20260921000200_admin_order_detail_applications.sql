-- Phase 2 slices 2.4-2.5: order investigation and application queue projections.

create or replace function public.admin_get_order_investigation(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not exists (select 1 from public.customer_checkouts where id = p_order_id) then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'order', jsonb_build_object(
      'id', checkout.id,
      'reference', checkout.reference,
      'status', checkout.status,
      'fulfilmentType', fulfilment.type,
      'market', jsonb_build_object('id', market.id, 'name', market.name),
      'pricing', jsonb_build_object(
        'itemsSubtotal', checkout.items_subtotal_ugx,
        'deliveryFee', checkout.delivery_fee_ugx,
        'serviceFee', checkout.service_fee_ugx,
        'total', checkout.total_ugx,
        'currency', checkout.currency_code
      ),
      'createdAt', checkout.created_at,
      'updatedAt', checkout.updated_at
    ),
    'consumer', jsonb_build_object(
      'id', checkout.consumer_id,
      'name', coalesce(
        nullif(trim(consumer.raw_user_meta_data->>'display_name'), ''),
        nullif(trim(consumer.raw_user_meta_data->>'full_name'), ''),
        'Customer'
      ),
      'phoneMasked', case
        when length(fulfilment.phone_number) > 7
          then left(fulfilment.phone_number, 4)
            || repeat('*', length(fulfilment.phone_number) - 7)
            || right(fulfilment.phone_number, 3)
        else repeat('*', length(fulfilment.phone_number))
      end
    ),
    'deliveryAddress', case when fulfilment.type = 'delivery' then jsonb_build_object(
      'label', fulfilment.address_label,
      'summary', fulfilment.address_summary,
      'zone', jsonb_build_object(
        'id', fulfilment.delivery_zone_id,
        'name', fulfilment.delivery_zone_name
      ),
      'scheduleType', fulfilment.schedule_type,
      'requestedFor', fulfilment.requested_for
    ) else null end,
    'payment', (
      select jsonb_build_object(
        'id', payment.id,
        'provider', payment.provider,
        'method', payment.payment_method,
        'status', case when payment.status = 'successful' then 'paid' else payment.status::text end,
        'amount', payment.amount_ugx,
        'currency', payment.currency_code,
        'merchantReference', payment.merchant_reference,
        'providerTransactionId', payment.provider_transaction_id,
        'failureCode', payment.failure_code,
        'failureMessage', payment.failure_message,
        'createdAt', payment.created_at,
        'resolvedAt', payment.resolved_at
      )
      from public.payment_attempts payment
      where payment.checkout_id = checkout.id
      order by payment.created_at desc, payment.id desc
      limit 1
    ),
    'vendors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'vendor', jsonb_build_object(
          'id', seller.id,
          'name', seller.business_name,
          'market', jsonb_build_object('id', seller.market_id, 'name', seller_market.name)
        ),
        'sellerOrder', jsonb_build_object(
          'id', vendor_order.id,
          'reference', vendor_order.reference,
          'status', vendor_order.status,
          'version', vendor_order.version,
          'subtotal', vendor_order.subtotal_ugx,
          'commission', vendor_order.commission_ugx,
          'createdAt', vendor_order.created_at,
          'updatedAt', vendor_order.updated_at
        ),
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', item.id,
            'listingId', item.listing_id,
            'productName', item.product_name,
            'packageQuantity', item.package_quantity,
            'packageUnit', item.package_unit,
            'unitPrice', item.unit_price_ugx,
            'quantity', item.quantity,
            'lineTotal', item.line_total_ugx
          ) order by item.created_at, item.id)
          from public.vendor_order_items item
          where item.vendor_order_id = vendor_order.id
        ), '[]'::jsonb),
        'evidence', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', image.id,
            'storageBucket', image.storage_bucket,
            'storagePath', image.storage_path,
            'thumbnailPath', image.thumbnail_path,
            'isPackingProof', image.is_packing_proof,
            'mimeType', image.mime_type,
            'capturedAt', image.created_at
          ) order by image.created_at, image.id)
          from public.quality_check_images image
          where image.vendor_order_id = vendor_order.id and image.upload_status = 'ready'
        ), '[]'::jsonb)
      ) order by vendor_order.created_at, vendor_order.id)
      from public.vendor_orders vendor_order
      join public.sellers seller on seller.id = vendor_order.seller_id
      left join public.markets seller_market on seller_market.id = seller.market_id
      where vendor_order.checkout_id = checkout.id
    ), '[]'::jsonb),
    'delivery', (
      select jsonb_build_object(
        'id', delivery.id,
        'reference', delivery.reference,
        'status', case
          when delivery.status in ('unassigned', 'offering') then 'waiting_for_rider'
          else delivery.status::text
        end,
        'version', delivery.version,
        'fee', delivery.fee_ugx,
        'assignedAt', delivery.assigned_at,
        'completedAt', delivery.completed_at,
        'assignment', case when delivery.assigned_transporter_id is null then null
          else jsonb_build_object('transporterId', delivery.assigned_transporter_id)
        end,
        'rider', case when transporter.id is null then null else jsonb_build_object(
          'id', transporter.id,
          'name', transporter.display_name,
          'availability', transporter.availability,
          'phoneMasked', case
            when length(rider_user.phone) > 7
              then left(rider_user.phone, 4) || repeat('*', length(rider_user.phone) - 7)
                || right(rider_user.phone, 3)
            when rider_user.phone is null then null
            else repeat('*', length(rider_user.phone))
          end
        ) end,
        'issues', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', issue.id,
            'reason', issue.reason,
            'note', issue.note,
            'status', issue.status,
            'reportedAt', issue.created_at,
            'resolvedAt', issue.resolved_at,
            'resolutionCode', issue.resolution_code
          ) order by issue.created_at, issue.id)
          from public.delivery_issues issue where issue.delivery_id = delivery.id
        ), '[]'::jsonb),
        'evidence', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', image.id,
            'storageBucket', 'delivery-proof-images',
            'storagePath', image.storage_path,
            'thumbnailPath', image.thumbnail_path,
            'capturedAt', image.captured_at,
            'location', case when image.latitude is null then null else jsonb_build_object(
              'latitude', image.latitude,
              'longitude', image.longitude,
              'accuracyMeters', image.accuracy_meters
            ) end
          ) order by image.captured_at, image.id)
          from public.delivery_proof_images image
          where image.delivery_id = delivery.id and image.upload_status = 'ready'
        ), '[]'::jsonb)
      )
      from public.delivery_groups delivery_group
      join public.deliveries delivery on delivery.delivery_group_id = delivery_group.id
      left join public.transporter_profiles transporter
        on transporter.id = delivery.assigned_transporter_id
      left join auth.users rider_user on rider_user.id = transporter.user_id
      where delivery_group.checkout_id = checkout.id
    ),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', event_type,
        'entityId', entity_id,
        'fromStatus', from_status,
        'toStatus', to_status,
        'actorId', actor_id,
        'details', details,
        'occurredAt', occurred_at
      ) order by occurred_at, event_type, entity_id)
      from (
        select 'order'::text event_type, history.checkout_id entity_id,
          history.from_status::text from_status, history.to_status::text to_status,
          null::uuid actor_id,
          jsonb_strip_nulls(jsonb_build_object('reason', history.reason)) details,
          history.created_at occurred_at
        from public.checkout_status_history history
        where history.checkout_id = checkout.id

        union all

        select 'seller_order', history.vendor_order_id, history.from_status::text,
          history.to_status::text, history.actor_user_id, '{}'::jsonb, history.created_at
        from public.vendor_order_status_history history
        join public.vendor_orders vendor_order on vendor_order.id = history.vendor_order_id
        where vendor_order.checkout_id = checkout.id

        union all

        select 'payment', audit.payment_attempt_id, audit.previous_status::text,
          audit.next_status::text, audit.actor_user_id, audit.details, audit.created_at
        from public.payment_audit_events audit
        join public.payment_attempts payment on payment.id = audit.payment_attempt_id
        where payment.checkout_id = checkout.id

        union all

        select 'delivery', history.delivery_id, history.from_status::text,
          history.to_status::text, history.actor_user_id,
          jsonb_strip_nulls(jsonb_build_object('reason', history.reason)), history.created_at
        from public.delivery_status_history history
        join public.deliveries delivery on delivery.id = history.delivery_id
        join public.delivery_groups delivery_group on delivery_group.id = delivery.delivery_group_id
        where delivery_group.checkout_id = checkout.id
      ) timeline_events
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event.id,
        'type', event.event_type,
        'entityType', event.entity_type,
        'entityId', event.entity_id,
        'title', event.title,
        'body', event.body,
        'priority', event.priority,
        'createdAt', event.created_at,
        'deliveries', coalesce((
          select jsonb_agg(jsonb_build_object(
            'channel', notification_delivery.channel,
            'status', notification_delivery.status,
            'attemptCount', notification_delivery.attempt_count,
            'deliveredAt', notification_delivery.delivered_at,
            'failureReason', notification_delivery.failure_reason
          ) order by notification_delivery.channel)
          from public.notification_deliveries notification_delivery
          where notification_delivery.event_id = event.id
        ), '[]'::jsonb)
      ) order by event.created_at, event.id)
      from public.notification_events event
      where event.user_id = checkout.consumer_id and (
        event.entity_id = checkout.id
        or exists (
          select 1 from public.vendor_orders vendor_order
          where vendor_order.checkout_id = checkout.id and vendor_order.id = event.entity_id
        )
        or exists (
          select 1 from public.delivery_groups delivery_group
          join public.deliveries delivery on delivery.delivery_group_id = delivery_group.id
          where delivery_group.checkout_id = checkout.id and delivery.id = event.entity_id
        )
      )
    ), '[]'::jsonb),
    'refunds', '[]'::jsonb,
    'supportNotes', '[]'::jsonb
  ) into result
  from public.customer_checkouts checkout
  join public.checkout_fulfilments fulfilment on fulfilment.checkout_id = checkout.id
  join public.markets market on market.id = checkout.market_id
  join auth.users consumer on consumer.id = checkout.consumer_id
  where checkout.id = p_order_id;

  return result;
end;
$$;

create or replace function public.admin_list_applications(
  p_page integer default 1,
  p_page_size integer default 25,
  p_query text default null,
  p_type text default null,
  p_status text default null,
  p_market_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_sort_by text default 'submittedAt',
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
  if p_sort_by not in ('submittedAt', 'status', 'type')
    or p_sort_order not in ('asc', 'desc') then
    raise exception 'invalid sort' using errcode = '22023';
  end if;

  with applications as (
    select
      seller.id,
      'vendor'::text as type,
      coalesce(
        nullif(trim(applicant.raw_user_meta_data->>'display_name'), ''),
        seller.business_name
      ) as applicant_name,
      applicant.phone,
      market.id as market_id,
      market.name as market_name,
      case when seller.verification_status = 'pending' then 'pending_review'
        else seller.verification_status::text end as status,
      seller.created_at as submitted_at,
      null::timestamptz as review_started_at,
      null::uuid as reviewer_id,
      null::text as reviewer_name,
      '[]'::jsonb as flags
    from public.sellers seller
    left join public.seller_accounts account on account.seller_id = seller.id
    left join auth.users applicant on applicant.id = account.user_id
    left join public.markets market on market.id = seller.market_id

    union all

    select
      transporter.id,
      'rider',
      transporter.display_name,
      applicant.phone,
      null::uuid,
      null::text,
      case when transporter.verification_status = 'pending' then 'pending_review'
        else transporter.verification_status::text end,
      transporter.created_at,
      null::timestamptz,
      null::uuid,
      null::text,
      '[]'::jsonb
    from public.transporter_profiles transporter
    join auth.users applicant on applicant.id = transporter.user_id
  ),
  filtered as (
    select * from applications
    where (p_query is null or (
      applicant_name ilike '%' || p_query || '%'
      or phone ilike '%' || p_query || '%'
    ))
      and (p_type is null or type = p_type)
      and (p_status is null or status = p_status)
      and (p_market_id is null or market_id = p_market_id)
      and (p_from is null or submitted_at >= p_from)
      and (p_to is null or submitted_at <= p_to)
  ),
  ordered as (
    select filtered.*, row_number() over (order by
      case when p_sort_by = 'submittedAt' and p_sort_order = 'asc' then submitted_at end asc,
      case when p_sort_by = 'submittedAt' and p_sort_order = 'desc' then submitted_at end desc,
      case when p_sort_by = 'status' and p_sort_order = 'asc' then status end asc,
      case when p_sort_by = 'status' and p_sort_order = 'desc' then status end desc,
      case when p_sort_by = 'type' and p_sort_order = 'asc' then type end asc,
      case when p_sort_by = 'type' and p_sort_order = 'desc' then type end desc,
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
      'type', type,
      'applicant', jsonb_build_object(
        'name', applicant_name,
        'phoneMasked', case
          when length(phone) > 7
            then left(phone, 4) || repeat('*', length(phone) - 7) || right(phone, 3)
          when phone is null then ''
          else repeat('*', length(phone))
        end
      ),
      'market', case when market_id is null then null
        else jsonb_build_object('id', market_id, 'name', market_name) end,
      'status', status,
      'submittedAt', submitted_at,
      'reviewStartedAt', review_started_at,
      'reviewer', case when reviewer_id is null then null
        else jsonb_build_object('id', reviewer_id, 'name', reviewer_name) end,
      'flags', flags
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

revoke all on function public.admin_get_order_investigation(uuid)
  from public, anon, authenticated;
revoke all on function public.admin_list_applications(
  integer, integer, text, text, text, uuid, timestamptz, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.admin_get_order_investigation(uuid) to service_role;
grant execute on function public.admin_list_applications(
  integer, integer, text, text, text, uuid, timestamptz, timestamptz, text, text
) to service_role;

create index if not exists sellers_admin_verification_created_idx
  on public.sellers (verification_status, created_at desc, id desc);
