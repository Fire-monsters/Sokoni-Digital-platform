-- Phase 3, Slice 3.1: complete the delivery control room.

create index if not exists delivery_operations_delivery_created_idx
  on public.delivery_operations (delivery_id, created_at, operation_id);

create or replace function public.audit_delivery_issue_operation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  issue_record public.delivery_issues;
  delivery_record public.deliveries;
  operation_reason text;
  operation_actor_type public.delivery_actor_type;
begin
  select * into strict issue_record
  from public.delivery_issues where id = new.delivery_issue_id;
  select * into strict delivery_record
  from public.deliveries where id = issue_record.delivery_id;

  operation_reason := case
    when new.action = 'reported' then coalesce(issue_record.note, issue_record.reason::text)
    else issue_record.resolution_note
  end;
  operation_actor_type := case
    when new.action = 'reported' then 'rider'::public.delivery_actor_type
    else 'dispatcher'::public.delivery_actor_type
  end;

  insert into public.delivery_operations (
    operation_id, delivery_id, actor_user_id, actor_type, requested_status,
    expected_version, result_status, result_version, reason, metadata
  ) values (
    new.operation_id, delivery_record.id, new.actor_user_id, operation_actor_type,
    delivery_record.status, delivery_record.version, delivery_record.status,
    delivery_record.version, operation_reason,
    jsonb_strip_nulls(jsonb_build_object(
      'issueId', issue_record.id,
      'issueAction', new.action,
      'issueReason', issue_record.reason,
      'resolutionCode', issue_record.resolution_code
    ))
  );

  insert into public.delivery_audit_events (
    delivery_id, operation_id, actor_user_id, actor_type, action,
    previous_status, next_status, details
  ) values (
    delivery_record.id, new.operation_id, new.actor_user_id, operation_actor_type,
    'delivery.issue_' || new.action, delivery_record.status, delivery_record.status,
    jsonb_strip_nulls(jsonb_build_object(
      'issueId', issue_record.id,
      'reason', operation_reason,
      'issueReason', issue_record.reason,
      'resolutionCode', issue_record.resolution_code
    ))
  );

  return new;
end;
$$;

drop trigger if exists delivery_issue_operations_write_audit
  on public.delivery_issue_operations;
create trigger delivery_issue_operations_write_audit
after insert on public.delivery_issue_operations
for each row execute function public.audit_delivery_issue_operation();

create or replace function public.get_dispatcher_delivery_board()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'deliveries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', delivery.id,
        'reference', delivery.reference,
        'status', delivery.status,
        'version', delivery.version,
        'feeUgx', delivery.fee_ugx,
        'updatedAt', delivery.updated_at,
        'assignedAt', delivery.assigned_at,
        'marketName', market.name,
        'zoneName', delivery_group.delivery_zone_name,
        'destinationSummary', delivery_group.address_summary,
        'transporter', case when transporter.id is null then null else jsonb_build_object(
          'id', transporter.id,
          'displayName', transporter.display_name,
          'availability', transporter.availability
        ) end,
        'openIssueCount', (
          select count(*) from public.delivery_issues issue
          where issue.delivery_id = delivery.id and issue.status = 'open'
        )
      ) order by
        case when exists (
          select 1 from public.delivery_issues issue
          where issue.delivery_id = delivery.id and issue.status = 'open'
        ) then 0 else 1 end,
        delivery.updated_at desc, delivery.id)
      from public.deliveries delivery
      join public.delivery_groups delivery_group on delivery_group.id = delivery.delivery_group_id
      join public.markets market on market.id = delivery_group.market_id
      left join public.transporter_profiles transporter
        on transporter.id = delivery.assigned_transporter_id
      where delivery.created_at >= now() - interval '30 days'
    ), '[]'::jsonb),
    'issues', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', issue.id,
        'deliveryId', issue.delivery_id,
        'deliveryReference', delivery.reference,
        'reason', issue.reason,
        'note', issue.note,
        'reportedStatus', issue.reported_delivery_status,
        'reportedVersion', issue.reported_delivery_version,
        'createdAt', issue.created_at
      ) order by issue.created_at, issue.id)
      from public.delivery_issues issue
      join public.deliveries delivery on delivery.id = issue.delivery_id
      where issue.status = 'open'
    ), '[]'::jsonb)
  );
$$;

create or replace function public.get_dispatcher_riders()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', transporter.id,
    'displayName', transporter.display_name,
    'availability', transporter.availability,
    'locationIsFresh', coalesce(location.received_at >= now() - interval '10 minutes', false),
    'locationReceivedAt', location.received_at,
    'lastLocation', case when location.transporter_id is null then null else jsonb_build_object(
      'latitude', location.latitude,
      'longitude', location.longitude,
      'accuracyMeters', location.accuracy_meters,
      'capturedAt', location.captured_at,
      'receivedAt', location.received_at
    ) end
  ) order by
    case transporter.availability when 'available' then 0 when 'offline' then 1 else 2 end,
    transporter.display_name, transporter.id), '[]'::jsonb)
  from public.transporter_profiles transporter
  left join public.transporter_locations_current location
    on location.transporter_id = transporter.id
  where transporter.verification_status = 'approved';
$$;

create or replace function public.get_dispatcher_nearby_riders(
  p_delivery_id uuid,
  p_radius_km numeric default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  delivery_record record;
  result jsonb;
begin
  if p_radius_km <= 0 or p_radius_km > 50 then
    raise exception 'search radius must be between 0 and 50 kilometres' using errcode = '22023';
  end if;

  select delivery.status, delivery.assigned_transporter_id,
    market.latitude, market.longitude
  into delivery_record
  from public.deliveries delivery
  join public.delivery_groups delivery_group on delivery_group.id = delivery.delivery_group_id
  join public.markets market on market.id = delivery_group.market_id
  where delivery.id = p_delivery_id;

  if not found then
    raise exception 'delivery not found' using errcode = 'P0002';
  end if;
  if delivery_record.status not in ('unassigned', 'offering', 'assigned', 'arrived_at_market') then
    raise exception 'nearby riders are not available for this delivery state' using errcode = '23514';
  end if;
  if delivery_record.latitude is null or delivery_record.longitude is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', candidate.id,
    'displayName', candidate.display_name,
    'availability', candidate.availability,
    'distanceKm', round(candidate.distance_km::numeric, 3),
    'locationIsFresh', true,
    'locationReceivedAt', candidate.received_at,
    'lastLocation', jsonb_build_object(
      'latitude', candidate.latitude,
      'longitude', candidate.longitude,
      'accuracyMeters', candidate.accuracy_meters,
      'capturedAt', candidate.captured_at,
      'receivedAt', candidate.received_at
    )
  ) order by candidate.distance_km, candidate.availability_updated_at, candidate.id), '[]'::jsonb)
  into result
  from (
    select transporter.id, transporter.display_name, transporter.availability,
      transporter.availability_updated_at, location.latitude, location.longitude,
      location.accuracy_meters, location.captured_at, location.received_at,
      public.haversine_distance_km(
        location.latitude::double precision,
        location.longitude::double precision,
        delivery_record.latitude::double precision,
        delivery_record.longitude::double precision
      ) as distance_km
    from public.transporter_profiles transporter
    join public.transporter_locations_current location
      on location.transporter_id = transporter.id
    where transporter.verification_status = 'approved'
      and transporter.availability = 'available'
      and location.received_at >= now() - interval '10 minutes'
      and transporter.id is distinct from delivery_record.assigned_transporter_id
  ) candidate
  where candidate.distance_km <= p_radius_km;

  return result;
end;
$$;

create or replace function public.dispatcher_assign_delivery(
  p_delivery_id uuid,
  p_transporter_id uuid,
  p_dispatcher_user_id uuid,
  p_reason text,
  p_expected_version integer,
  p_operation_id uuid,
  p_reassign boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_record public.deliveries;
  transporter_record public.transporter_profiles;
  existing_operation public.delivery_operations;
  previous_transporter_id uuid;
  next_version integer;
begin
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'dispatcher assignment reason is required' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_delivery_id::text, 0));
  select * into delivery_record from public.deliveries where id = p_delivery_id for update;
  if delivery_record.id is null then
    raise exception 'delivery not found' using errcode = 'P0002';
  end if;

  select * into existing_operation
  from public.delivery_operations where operation_id = p_operation_id;
  if existing_operation.operation_id is not null then
    if existing_operation.delivery_id <> p_delivery_id
      or existing_operation.actor_user_id is distinct from p_dispatcher_user_id
      or existing_operation.expected_version <> p_expected_version
      or existing_operation.reason is distinct from p_reason
      or existing_operation.metadata->>'transporterId' is distinct from p_transporter_id::text
      or (existing_operation.metadata->>'reassignment')::boolean is distinct from p_reassign then
      raise exception 'operation id was already used for another dispatcher assignment'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'deliveryId', p_delivery_id,
      'transporterId', existing_operation.metadata->>'transporterId',
      'previousTransporterId', existing_operation.metadata->>'previousTransporterId',
      'status', existing_operation.result_status,
      'version', existing_operation.result_version,
      'operationId', p_operation_id,
      'duplicate', true
    );
  end if;

  if delivery_record.version <> p_expected_version then
    raise exception 'delivery version conflict' using errcode = '40001';
  end if;
  if (not p_reassign and delivery_record.status not in ('unassigned', 'offering'))
    or (p_reassign and delivery_record.status not in ('assigned', 'arrived_at_market')) then
    raise exception 'delivery cannot be assigned in this status' using errcode = '23514';
  end if;
  if p_reassign and exists (
    select 1 from public.delivery_pickups pickup
    where pickup.delivery_id = p_delivery_id and pickup.status = 'collected'
  ) then
    raise exception 'collected deliveries cannot be reassigned' using errcode = '23514';
  end if;

  select * into transporter_record
  from public.transporter_profiles where id = p_transporter_id for update;
  if transporter_record.id is null
    or transporter_record.verification_status <> 'approved'
    or transporter_record.availability <> 'available' then
    raise exception 'selected rider is not available and approved' using errcode = '23514';
  end if;

  previous_transporter_id := delivery_record.assigned_transporter_id;
  next_version := delivery_record.version + 1;

  with withdrawn as (
    update public.delivery_offers set status = 'withdrawn', withdrawn_at = now()
    where delivery_id = p_delivery_id and status = 'pending'
    returning transporter_id
  )
  update public.transporter_profiles transporter
  set availability = 'available', availability_updated_at = now()
  where transporter.id in (select transporter_id from withdrawn)
    and transporter.availability = 'offer_pending';

  if previous_transporter_id is not null and previous_transporter_id <> p_transporter_id then
    update public.transporter_profiles
    set availability = 'available', availability_updated_at = now()
    where id = previous_transporter_id;
  end if;

  update public.deliveries
  set assigned_transporter_id = p_transporter_id,
      status = 'assigned',
      assigned_at = now(),
      version = next_version
  where id = p_delivery_id;
  update public.transporter_profiles
  set availability = 'assigned', availability_updated_at = now()
  where id = p_transporter_id;

  insert into public.delivery_operations (
    operation_id, delivery_id, actor_user_id, actor_type, requested_status,
    expected_version, result_status, result_version, reason, metadata
  ) values (
    p_operation_id, p_delivery_id, p_dispatcher_user_id, 'dispatcher', 'assigned',
    p_expected_version, 'assigned', next_version, p_reason,
    jsonb_build_object(
      'transporterId', p_transporter_id,
      'previousTransporterId', previous_transporter_id,
      'reassignment', p_reassign
    )
  );
  insert into public.delivery_status_history (
    delivery_id, operation_id, actor_user_id, actor_type, from_status, to_status,
    from_version, to_version, reason
  ) values (
    p_delivery_id, p_operation_id, p_dispatcher_user_id, 'dispatcher', delivery_record.status,
    'assigned', delivery_record.version, next_version, p_reason
  );
  insert into public.delivery_audit_events (
    delivery_id, operation_id, actor_user_id, actor_type, action,
    previous_status, next_status, details
  ) values (
    p_delivery_id, p_operation_id, p_dispatcher_user_id, 'dispatcher',
    case when p_reassign then 'delivery.reassigned' else 'delivery.manually_assigned' end,
    delivery_record.status, 'assigned',
    jsonb_build_object(
      'transporterId', p_transporter_id,
      'previousTransporterId', previous_transporter_id,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'deliveryId', p_delivery_id,
    'transporterId', p_transporter_id,
    'previousTransporterId', previous_transporter_id,
    'status', 'assigned',
    'version', next_version,
    'operationId', p_operation_id,
    'duplicate', false
  );
end;
$$;

create or replace function public.resolve_delivery_issue(
  p_issue_id uuid,
  p_dispatcher_user_id uuid,
  p_resolution_code text,
  p_resolution_note text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  issue_record public.delivery_issues;
  existing_operation public.delivery_issue_operations;
begin
  if p_resolution_code not in (
    'RESUME_DELIVERY', 'CUSTOMER_CONTACTED', 'RIDER_REASSIGNED',
    'RETURN_AUTHORIZED', 'CLOSED_NO_ACTION'
  )
    or char_length(trim(coalesce(p_resolution_note, ''))) < 3
    or char_length(p_resolution_note) > 500 then
    raise exception 'valid issue resolution and note are required' using errcode = '22023';
  end if;

  select * into existing_operation
  from public.delivery_issue_operations where operation_id = p_operation_id;
  if existing_operation.operation_id is not null then
    select * into issue_record
    from public.delivery_issues where id = existing_operation.delivery_issue_id;
    if existing_operation.delivery_issue_id <> p_issue_id
      or existing_operation.actor_user_id <> p_dispatcher_user_id
      or existing_operation.action <> 'resolved'
      or issue_record.resolution_code is distinct from p_resolution_code
      or issue_record.resolution_note is distinct from p_resolution_note then
      raise exception 'operation id was already used for another issue resolution'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'issueId', issue_record.id,
      'deliveryId', issue_record.delivery_id,
      'status', 'resolved',
      'duplicate', true
    );
  end if;

  select * into issue_record from public.delivery_issues where id = p_issue_id for update;
  if issue_record.id is null then
    raise exception 'delivery issue not found' using errcode = 'P0002';
  end if;
  if issue_record.status <> 'open' then
    raise exception 'delivery issue is already resolved' using errcode = '23514';
  end if;

  update public.delivery_issues
  set status = 'resolved',
      resolved_by_user_id = p_dispatcher_user_id,
      resolution_code = p_resolution_code,
      resolution_note = p_resolution_note,
      resolved_at = now()
  where id = p_issue_id;
  insert into public.delivery_issue_operations (
    operation_id, delivery_issue_id, actor_user_id, action
  ) values (
    p_operation_id, p_issue_id, p_dispatcher_user_id, 'resolved'
  );

  return jsonb_build_object(
    'issueId', p_issue_id,
    'deliveryId', issue_record.delivery_id,
    'status', 'resolved',
    'duplicate', false
  );
end;
$$;

create or replace function public.dispatcher_delivery_action(
  p_delivery_id uuid,
  p_dispatcher_user_id uuid,
  p_action text,
  p_reason text,
  p_expected_version integer,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_record public.deliveries;
  existing_operation public.delivery_operations;
  next_status public.delivery_status;
  next_version integer;
  contact_phone text;
  transporter_record public.transporter_profiles;
begin
  if p_action not in (
    'CANCEL_ASSIGNMENT', 'MARK_CUSTOMER_UNAVAILABLE', 'RETURN_TO_MARKET',
    'CONTACT_RIDER', 'CONTACT_CONSUMER'
  )
    or char_length(trim(coalesce(p_reason, ''))) < 3
    or char_length(p_reason) > 500 then
    raise exception 'valid dispatcher action and reason are required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_delivery_id::text, 0));
  select * into delivery_record from public.deliveries where id = p_delivery_id for update;
  if delivery_record.id is null then
    raise exception 'delivery not found' using errcode = 'P0002';
  end if;

  select * into existing_operation
  from public.delivery_operations where operation_id = p_operation_id;
  if existing_operation.operation_id is not null then
    if existing_operation.delivery_id <> p_delivery_id
      or existing_operation.actor_user_id is distinct from p_dispatcher_user_id
      or existing_operation.expected_version <> p_expected_version
      or existing_operation.reason is distinct from p_reason
      or existing_operation.metadata->>'dispatcherAction' is distinct from p_action then
      raise exception 'operation id was already used for another dispatcher action'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'deliveryId', p_delivery_id,
      'action', p_action,
      'status', existing_operation.result_status,
      'version', existing_operation.result_version,
      'operationId', p_operation_id,
      'contactPhoneNumber', existing_operation.metadata->>'contactPhoneNumber',
      'duplicate', true
    );
  end if;

  if delivery_record.version <> p_expected_version then
    raise exception 'delivery version conflict' using errcode = '40001';
  end if;
  next_status := delivery_record.status;
  next_version := delivery_record.version;

  if p_action = 'CANCEL_ASSIGNMENT' then
    if delivery_record.status not in ('assigned', 'arrived_at_market') or exists (
      select 1 from public.delivery_pickups pickup
      where pickup.delivery_id = p_delivery_id and pickup.status = 'collected'
    ) then
      raise exception 'assignment cannot be cancelled in this state' using errcode = '23514';
    end if;
    next_status := 'unassigned';
    next_version := delivery_record.version + 1;
  elsif p_action = 'MARK_CUSTOMER_UNAVAILABLE' then
    if delivery_record.status not in ('in_transit', 'arrived_at_customer') then
      raise exception 'customer unavailable is invalid in this state' using errcode = '23514';
    end if;
    next_status := 'customer_unavailable';
    next_version := delivery_record.version + 1;
  elsif p_action = 'RETURN_TO_MARKET' then
    if delivery_record.status not in (
      'picked_up', 'in_transit', 'arrived_at_customer', 'customer_unavailable'
    ) then
      raise exception 'return is invalid in this state' using errcode = '23514';
    end if;
    next_status := 'returned';
    next_version := delivery_record.version + 1;
  elsif p_action = 'CONTACT_CONSUMER' then
    select delivery_group.phone_number into contact_phone
    from public.delivery_groups delivery_group
    where delivery_group.id = delivery_record.delivery_group_id;
  elsif p_action = 'CONTACT_RIDER' then
    if delivery_record.assigned_transporter_id is null then
      raise exception 'delivery has no assigned rider' using errcode = '23514';
    end if;
    select * into transporter_record
    from public.transporter_profiles transporter
    where transporter.id = delivery_record.assigned_transporter_id;
    select rider_user.phone into contact_phone
    from auth.users rider_user where rider_user.id = transporter_record.user_id;
  end if;

  insert into public.delivery_operations (
    operation_id, delivery_id, actor_user_id, actor_type, requested_status, expected_version,
    result_status, result_version, reason, metadata
  ) values (
    p_operation_id, p_delivery_id, p_dispatcher_user_id, 'dispatcher', next_status,
    p_expected_version, next_status, next_version, p_reason,
    jsonb_strip_nulls(jsonb_build_object(
      'dispatcherAction', p_action,
      'contactPhoneNumber', contact_phone,
      'transporterId', delivery_record.assigned_transporter_id
    ))
  );

  if next_version > delivery_record.version then
    if p_action = 'CANCEL_ASSIGNMENT' then
      update public.deliveries
      set status = next_status,
          version = next_version,
          assigned_transporter_id = null,
          assigned_at = null
      where id = p_delivery_id;
    else
      update public.deliveries
      set status = next_status, version = next_version
      where id = p_delivery_id;
    end if;
    if delivery_record.assigned_transporter_id is not null then
      update public.transporter_profiles
      set availability = 'available', availability_updated_at = now()
      where id = delivery_record.assigned_transporter_id;
    end if;
    insert into public.delivery_status_history (
      delivery_id, operation_id, actor_user_id, actor_type, from_status, to_status,
      from_version, to_version, reason
    ) values (
      p_delivery_id, p_operation_id, p_dispatcher_user_id, 'dispatcher',
      delivery_record.status, next_status, delivery_record.version, next_version, p_reason
    );
  end if;

  insert into public.delivery_audit_events (
    delivery_id, operation_id, actor_user_id, actor_type, action,
    previous_status, next_status, details
  ) values (
    p_delivery_id, p_operation_id, p_dispatcher_user_id, 'dispatcher',
    'delivery.' || lower(p_action), delivery_record.status, next_status,
    jsonb_strip_nulls(jsonb_build_object(
      'reason', p_reason,
      'contactPhoneNumber', contact_phone
    ))
  );

  return jsonb_build_object(
    'deliveryId', p_delivery_id,
    'action', p_action,
    'status', next_status,
    'version', next_version,
    'operationId', p_operation_id,
    'contactPhoneNumber', contact_phone,
    'duplicate', false
  );
end;
$$;

create or replace function public.get_dispatcher_delivery_detail(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not exists (select 1 from public.deliveries where id = p_delivery_id) then
    raise exception 'delivery not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'delivery', jsonb_build_object(
      'id', delivery.id,
      'reference', delivery.reference,
      'status', delivery.status,
      'version', delivery.version,
      'feeUgx', delivery.fee_ugx,
      'assignedAt', delivery.assigned_at,
      'completedAt', delivery.completed_at,
      'scheduledFor', delivery_group.scheduled_for,
      'createdAt', delivery.created_at,
      'updatedAt', delivery.updated_at,
      'market', jsonb_build_object('id', market.id, 'name', market.name),
      'destination', jsonb_build_object(
        'label', delivery_group.address_label,
        'summary', delivery_group.address_summary,
        'zoneName', delivery_group.delivery_zone_name
      )
    ),
    'order', jsonb_build_object(
      'id', checkout.id,
      'reference', checkout.reference,
      'status', checkout.status,
      'currency', checkout.currency_code,
      'itemsSubtotal', checkout.items_subtotal_ugx,
      'deliveryFee', checkout.delivery_fee_ugx,
      'serviceFee', checkout.service_fee_ugx,
      'total', checkout.total_ugx,
      'createdAt', checkout.created_at,
      'updatedAt', checkout.updated_at
    ),
    'vendors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'vendor', jsonb_build_object('id', seller.id, 'name', seller.business_name),
        'sellerOrder', jsonb_build_object(
          'id', seller_order.id,
          'reference', seller_order.reference,
          'status', seller_order.status,
          'version', seller_order.version,
          'subtotal', seller_order.subtotal_ugx
        ),
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', item.id,
            'productName', item.product_name,
            'packageQuantity', item.package_quantity,
            'packageUnit', item.package_unit,
            'unitPrice', item.unit_price_ugx,
            'quantity', item.quantity,
            'lineTotal', item.line_total_ugx
          ) order by item.created_at, item.id)
          from public.vendor_order_items item
          where item.vendor_order_id = seller_order.id
        ), '[]'::jsonb)
      ) order by seller_order.created_at, seller_order.id)
      from public.delivery_group_orders group_order
      join public.vendor_orders seller_order on seller_order.id = group_order.seller_order_id
      join public.sellers seller on seller.id = seller_order.seller_id
      where group_order.delivery_group_id = delivery_group.id
    ), '[]'::jsonb),
    'pickups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pickup.id,
        'sellerOrderId', seller_order.id,
        'sellerOrderReference', seller_order.reference,
        'vendorName', seller.business_name,
        'status', pickup.status,
        'vendorConfirmedAt', pickup.vendor_confirmed_at,
        'riderConfirmedAt', pickup.rider_confirmed_at,
        'collectedAt', pickup.collected_at
      ) order by seller_order.created_at, pickup.id)
      from public.delivery_pickups pickup
      join public.vendor_orders seller_order on seller_order.id = pickup.seller_order_id
      join public.sellers seller on seller.id = seller_order.seller_id
      where pickup.delivery_id = delivery.id
    ), '[]'::jsonb),
    'assignedRider', case when transporter.id is null then null else jsonb_build_object(
      'id', transporter.id,
      'displayName', transporter.display_name,
      'availability', transporter.availability,
      'locationIsFresh', coalesce(location.received_at >= now() - interval '10 minutes', false),
      'lastLocation', case when location.transporter_id is null then null else jsonb_build_object(
        'latitude', location.latitude,
        'longitude', location.longitude,
        'accuracyMeters', location.accuracy_meters,
        'capturedAt', location.captured_at,
        'receivedAt', location.received_at
      ) end
    ) end,
    'customerPin', jsonb_build_object(
      'configured', confirmation.delivery_id is not null,
      'confirmedAt', confirmation.confirmed_at,
      'expiresAt', confirmation.expires_at,
      'failedAttempts', coalesce(confirmation.failed_attempts, 0),
      'lockedAt', confirmation.locked_at
    ),
    'issues', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', issue.id,
        'reason', issue.reason,
        'note', issue.note,
        'status', issue.status,
        'reportedStatus', issue.reported_delivery_status,
        'reportedVersion', issue.reported_delivery_version,
        'resolutionCode', issue.resolution_code,
        'resolutionNote', issue.resolution_note,
        'createdAt', issue.created_at,
        'resolvedAt', issue.resolved_at
      ) order by issue.created_at, issue.id)
      from public.delivery_issues issue where issue.delivery_id = delivery.id
    ), '[]'::jsonb),
    'assignmentHistory', coalesce((
      select jsonb_agg(jsonb_build_object(
        'operationId', operation.operation_id,
        'riderId', assigned_rider.id,
        'riderName', assigned_rider.display_name,
        'previousRiderId', nullif(operation.metadata->>'previousTransporterId', ''),
        'reason', operation.reason,
        'assignedBy', case when operation.actor_user_id is null then null else jsonb_build_object(
          'id', operation.actor_user_id,
          'name', coalesce(staff.display_name, split_part(actor.email, '@', 1), 'Staff member')
        ) end,
        'assignedAt', operation.created_at,
        'reassignment', coalesce((operation.metadata->>'reassignment')::boolean, false)
      ) order by operation.created_at, operation.operation_id)
      from public.delivery_operations operation
      join public.transporter_profiles assigned_rider
        on assigned_rider.id = (operation.metadata->>'transporterId')::uuid
      left join public.staff_members staff on staff.user_id = operation.actor_user_id
      left join auth.users actor on actor.id = operation.actor_user_id
      where operation.delivery_id = delivery.id
        and operation.actor_type = 'dispatcher'
        and operation.metadata ? 'transporterId'
    ), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', timeline.id,
        'type', timeline.type,
        'title', timeline.title,
        'fromStatus', timeline.from_status,
        'toStatus', timeline.to_status,
        'actor', case when timeline.actor_id is null then null else jsonb_build_object(
          'id', timeline.actor_id,
          'name', coalesce(timeline.actor_name, 'User')
        ) end,
        'reason', timeline.reason,
        'occurredAt', timeline.occurred_at
      ) order by timeline.occurred_at, timeline.id)
      from (
        select 'status:' || history.id::text as id, 'status'::text as type,
          'Delivery status changed'::text as title,
          history.from_status::text as from_status, history.to_status::text as to_status,
          history.actor_user_id as actor_id,
          coalesce(staff.display_name, rider.display_name, split_part(actor.email, '@', 1)) as actor_name,
          history.reason, history.created_at as occurred_at
        from public.delivery_status_history history
        left join public.staff_members staff on staff.user_id = history.actor_user_id
        left join public.transporter_profiles rider on rider.user_id = history.actor_user_id
        left join auth.users actor on actor.id = history.actor_user_id
        where history.delivery_id = delivery.id

        union all

        select 'issue-opened:' || issue.id::text, 'issue', 'Issue reported',
          issue.reported_delivery_status::text, issue.reported_delivery_status::text,
          issue.reported_by_user_id,
          coalesce(rider.display_name, split_part(actor.email, '@', 1)),
          coalesce(issue.note, issue.reason::text), issue.created_at
        from public.delivery_issues issue
        left join public.transporter_profiles rider on rider.user_id = issue.reported_by_user_id
        left join auth.users actor on actor.id = issue.reported_by_user_id
        where issue.delivery_id = delivery.id

        union all

        select 'issue-resolved:' || issue.id::text, 'issue', 'Issue resolved',
          'open', issue.status::text, issue.resolved_by_user_id,
          coalesce(staff.display_name, split_part(actor.email, '@', 1)),
          issue.resolution_note, issue.resolved_at
        from public.delivery_issues issue
        left join public.staff_members staff on staff.user_id = issue.resolved_by_user_id
        left join auth.users actor on actor.id = issue.resolved_by_user_id
        where issue.delivery_id = delivery.id and issue.resolved_at is not null

        union all

        select 'pickup:' || pickup.id::text, 'pickup', 'Vendor pickup completed',
          'pending', pickup.status::text, pickup.rider_confirmed_by,
          coalesce(rider.display_name, split_part(actor.email, '@', 1)),
          seller.business_name, pickup.collected_at
        from public.delivery_pickups pickup
        join public.vendor_orders seller_order on seller_order.id = pickup.seller_order_id
        join public.sellers seller on seller.id = seller_order.seller_id
        left join public.transporter_profiles rider on rider.user_id = pickup.rider_confirmed_by
        left join auth.users actor on actor.id = pickup.rider_confirmed_by
        where pickup.delivery_id = delivery.id and pickup.collected_at is not null

        union all

        select 'pin:' || pin_operation.operation_id::text, 'pin', 'Customer PIN confirmed',
          null, 'confirmed', pin_operation.actor_user_id,
          coalesce(rider.display_name, split_part(actor.email, '@', 1)),
          null, pin_operation.created_at
        from public.delivery_pin_confirmation_operations pin_operation
        left join public.transporter_profiles rider on rider.user_id = pin_operation.actor_user_id
        left join auth.users actor on actor.id = pin_operation.actor_user_id
        where pin_operation.delivery_id = delivery.id and pin_operation.confirmed

        union all

        select 'evidence:' || image.id::text, 'evidence', 'Delivery evidence uploaded',
          null, 'ready', null::uuid, null::text, null::text, image.finalized_at
        from public.delivery_proof_images image
        where image.delivery_id = delivery.id and image.upload_status = 'ready'
      ) timeline
      where timeline.occurred_at is not null
    ), '[]'::jsonb)
  ) into result
  from public.deliveries delivery
  join public.delivery_groups delivery_group on delivery_group.id = delivery.delivery_group_id
  join public.customer_checkouts checkout on checkout.id = delivery_group.checkout_id
  join public.markets market on market.id = delivery_group.market_id
  left join public.transporter_profiles transporter
    on transporter.id = delivery.assigned_transporter_id
  left join public.transporter_locations_current location
    on location.transporter_id = transporter.id
  left join public.delivery_confirmations confirmation
    on confirmation.delivery_id = delivery.id
  where delivery.id = p_delivery_id;

  return result;
end;
$$;

revoke all on function public.get_dispatcher_delivery_detail(uuid) from public;
revoke all on function public.audit_delivery_issue_operation() from public;
revoke all on function public.get_dispatcher_delivery_board() from public;
revoke all on function public.get_dispatcher_riders() from public;
revoke all on function public.get_dispatcher_nearby_riders(uuid, numeric) from public;
revoke all on function public.dispatcher_assign_delivery(uuid, uuid, uuid, text, integer, uuid, boolean) from public;
revoke all on function public.resolve_delivery_issue(uuid, uuid, text, text, uuid) from public;
revoke all on function public.dispatcher_delivery_action(uuid, uuid, text, text, integer, uuid) from public;

grant execute on function public.get_dispatcher_delivery_detail(uuid) to service_role;
grant execute on function public.get_dispatcher_delivery_board() to service_role;
grant execute on function public.get_dispatcher_riders() to service_role;
grant execute on function public.get_dispatcher_nearby_riders(uuid, numeric) to service_role;
grant execute on function public.dispatcher_assign_delivery(uuid, uuid, uuid, text, integer, uuid, boolean) to service_role;
grant execute on function public.resolve_delivery_issue(uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.dispatcher_delivery_action(uuid, uuid, text, text, integer, uuid) to service_role;
