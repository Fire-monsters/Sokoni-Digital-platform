-- Align market filters and overview counts with persisted review state.
alter table public.account_applications add constraint application_profile_required check (
  (type='vendor' and seller_id is not null) or (type='rider' and transporter_id is not null)
);
update storage.buckets set public=false where id='verification-documents';
create or replace function public.application_missing_requirements(p_id uuid) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare a public.account_applications; missing text[] := '{}'; required_path text; kind text;
begin
  select * into a from public.account_applications where id=p_id;
  if not found then raise exception 'Application not found.' using errcode='P0002'; end if;
  if not exists(select 1 from auth.users where id=a.user_id and phone_confirmed_at is not null and phone is not null) then
    missing := array_append(missing,'Verified phone');
  end if;
  foreach required_path in array array['personalDetails.fullName','personalDetails.nationalIdNumber'] ||
    case when a.type='vendor' then array['stallDetails.businessName','stallDetails.stallNumber','stallDetails.marketIdentificationNumber','stallDetails.marketId']
    else array['motorcycleDetails.motorcycleNumberPlate','motorcycleDetails.vehicleType','motorcycleDetails.primaryOperatingArea',
      'associationAndNextOfKin.riderAssociation','associationAndNextOfKin.associationIdentifier','associationAndNextOfKin.nextOfKinName',
      'associationAndNextOfKin.nextOfKinPhone','associationAndNextOfKin.nextOfKinRelationship'] end
  loop
    if nullif(trim(a.details #>> string_to_array(required_path,'.')),'') is null then missing:=array_append(missing,required_path); end if;
  end loop;
  foreach required_path in array array['hasAcceptedPlatformTerms'] || case when a.type='vendor'
    then array['hasAcceptedCommissionTerms','hasMarketLeadershipApproval'] else array['hasAcceptedSafetyTerms','hasAssociationConfirmation'] end
  loop
    if a.details->'verification'->required_path is distinct from 'true'::jsonb then missing:=array_append(missing,required_path); end if;
  end loop;
  if a.type='vendor' and (jsonb_typeof(a.details#>'{stallDetails,productCategories}') is distinct from 'array'
    or a.details#>'{stallDetails,productCategories}' = '[]'::jsonb) then missing:=array_append(missing,'Product categories'); end if;
  if a.type='vendor' and not exists(select 1 from public.markets where id::text=a.details#>>'{stallDetails,marketId}' and is_active) then
    missing:=array_append(missing,'Active market');
  end if;
  foreach kind in array case when a.type='vendor' then array['national_id','stall_photo','market_confirmation']
    else array['national_id','motorcycle_photo','association_proof'] end
  loop
    if not exists(select 1 from public.application_documents where application_id=a.id and document_type=kind and status='ready') then
      missing:=array_append(missing,kind);
    end if;
  end loop;
  return missing;
end;
$$;

create or replace function public.get_application_review(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',a.id,'type',a.type,'status',a.status,'version',a.version,'userId',a.user_id,
    'applicantName',coalesce(a.details#>>'{personalDetails,fullName}',s.business_name,t.display_name),
    'phone',u.phone,'phoneVerified',u.phone_confirmed_at is not null,'details',a.details,
    'market',case when m.id is null then null else jsonb_build_object('id',m.id,'name',m.name) end,
    'submittedAt',a.submitted_at,'reviewStartedAt',a.review_started_at,'reviewerId',a.reviewer_id,
    'reviewerName',sm.display_name,'reason',a.reason,'issues',a.issues,
    'missingRequirements',public.application_missing_requirements(a.id),
    'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'type',d.document_type,
      'storagePath',d.storage_path,'contentType',d.content_type) order by d.created_at,d.id)
      from public.application_documents d where d.application_id=a.id and d.status='ready'),'[]'),
    'timeline',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'actorUserId',e.actor_user_id,
      'fromStatus',e.from_status,'toStatus',e.to_status,'reason',e.reason,'issues',e.issues,
      'internalNotes',e.internal_notes,'createdAt',e.created_at) order by e.created_at,e.id)
      from public.application_review_events e where e.application_id=a.id),'[]'))
  from public.account_applications a left join auth.users u on u.id=a.user_id
  left join public.sellers s on s.id=a.seller_id left join public.markets m on m.id=coalesce(nullif(a.details#>>'{stallDetails,marketId}','')::uuid,s.market_id)
  left join public.transporter_profiles t on t.id=a.transporter_id
  left join public.staff_members sm on sm.user_id=a.reviewer_id where a.id=p_id;
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
    select a.id,a.type,coalesce(a.details#>>'{personalDetails,fullName}',s.business_name,t.display_name) applicant_name,
      u.phone,m.id market_id,m.name market_name,a.status,a.submitted_at,a.review_started_at,
      a.reviewer_id,sm.display_name reviewer_name,'[]'::jsonb flags
    from public.account_applications a
    left join auth.users u on u.id=a.user_id
    left join public.sellers s on s.id=a.seller_id
    left join public.markets m on m.id=coalesce(nullif(a.details#>>'{stallDetails,marketId}','')::uuid,s.market_id)
    left join public.transporter_profiles t on t.id=a.transporter_id
    left join public.staff_members sm on sm.user_id=a.reviewer_id
    where a.status<>'draft'
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
      'vendors', (select count(*) from public.account_applications where type='vendor' and status in ('pending_review','in_review')),
      'riders', (
        select count(*) from public.account_applications where type='rider' and status in ('pending_review','in_review')
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
