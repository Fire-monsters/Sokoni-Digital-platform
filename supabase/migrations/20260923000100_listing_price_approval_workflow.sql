-- Idempotent catalogue review commands and complete admin review projections.

create table public.catalogue_review_operations (
  operation_id uuid primary key,
  action text not null check (action in ('listing.approve', 'listing.request_changes', 'price_request.approve', 'price_request.reject')),
  entity_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  expected_version integer,
  review_note text,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index catalogue_review_operations_entity_idx
  on public.catalogue_review_operations (entity_id, created_at desc);

alter table public.catalogue_review_operations enable row level security;

create or replace function public.get_admin_listing_review(p_listing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id,
    'sellerId', l.seller_id,
    'vendorName', s.business_name,
    'marketName', m.name,
    'catalogProductId', l.catalog_product_id,
    'productName', cp.name,
    'categoryName', c.name,
    'packageQuantity', l.package_quantity,
    'packageUnit', l.package_unit,
    'description', l.description,
    'approvedPriceUgx', l.approved_price_ugx,
    'status', l.status,
    'availability', l.availability,
    'version', l.version,
    'updatedAt', l.updated_at,
    'submittedAt', coalesce(
      (select max(cae.created_at) from public.catalogue_audit_events cae
       where cae.entity_type = 'listing' and cae.entity_id = l.id and cae.action = 'listing.submitted'),
      l.updated_at
    ),
    'images', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', li.id, 'storageBucket', li.storage_bucket, 'storagePath', li.storage_path,
        'thumbnailPath', li.thumbnail_path, 'sortOrder', li.sort_order, 'isPrimary', li.is_primary
      ) order by li.sort_order, li.id)
      from public.listing_images li
      where li.listing_id = l.id and li.upload_status = 'ready'
    ), '[]'::jsonb),
    'latestPriceRequest', (
      select jsonb_build_object(
        'id', pr.id, 'proposedPriceUgx', pr.proposed_price_ugx,
        'currentPriceUgx', pr.current_price_ugx, 'status', pr.status,
        'reviewNote', pr.review_note, 'createdAt', pr.created_at
      )
      from public.listing_price_requests pr where pr.listing_id = l.id
      order by pr.created_at desc, pr.id desc limit 1
    ),
    'priceHistory', coalesce((
      select jsonb_agg(jsonb_build_object(
        'requestId', pr.id, 'previousPriceUgx', pr.current_price_ugx,
        'proposedPriceUgx', pr.proposed_price_ugx, 'status', pr.status,
        'reason', pr.reason, 'reviewNote', pr.review_note,
        'submittedAt', pr.created_at, 'reviewedAt', pr.reviewed_at
      ) order by pr.created_at desc, pr.id desc)
      from public.listing_price_requests pr where pr.listing_id = l.id
    ), '[]'::jsonb),
    'auditHistory', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cae.id, 'action', cae.action, 'actorUserId', cae.actor_user_id,
        'previousState', cae.previous_state, 'nextState', cae.next_state,
        'createdAt', cae.created_at
      ) order by cae.created_at desc, cae.id desc)
      from public.catalogue_audit_events cae
      where (cae.entity_type = 'listing' and cae.entity_id = l.id)
         or (cae.entity_type = 'price_request' and cae.entity_id in (
           select pr.id from public.listing_price_requests pr where pr.listing_id = l.id
         ))
    ), '[]'::jsonb)
  )
  from public.listings l
  join public.sellers s on s.id = l.seller_id
  left join public.markets m on m.id = s.market_id
  join public.catalog_products cp on cp.id = l.catalog_product_id
  join public.categories c on c.id = cp.category_id
  where l.id = p_listing_id;
$$;

create or replace function public.get_admin_listing_review_queue()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.get_admin_listing_review(l.id) order by l.updated_at, l.id), '[]'::jsonb)
  from public.listings l where l.status = 'pending_approval';
$$;

create or replace function public.get_admin_price_review_queue()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(review order by submitted_at, request_id), '[]'::jsonb)
  from (
    select pr.created_at submitted_at, pr.id request_id, jsonb_build_object(
      'requestId', pr.id,
      'listingId', l.id,
      'productName', cp.name,
      'vendorName', s.business_name,
      'marketName', m.name,
      'packageQuantity', l.package_quantity,
      'packageUnit', l.package_unit,
      'currentPriceUgx', pr.current_price_ugx,
      'proposedPriceUgx', pr.proposed_price_ugx,
      'reason', pr.reason,
      'createdAt', pr.created_at,
      'percentageChange', case when pr.current_price_ugx is null then null else
        round(((pr.proposed_price_ugx - pr.current_price_ugx)::numeric / pr.current_price_ugx) * 100, 1) end,
      'largePriceChange', case when pr.current_price_ugx is null then false else
        abs((pr.proposed_price_ugx - pr.current_price_ugx)::numeric / pr.current_price_ugx) >= 0.5 end,
      'recentUnavailableChanges', (
        select count(*) from public.listing_availability_operations lao
        where lao.listing_id = l.id and lao.availability = 'unavailable'
          and lao.created_at >= now() - interval '30 days'
      ),
      'images', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', li.id, 'storageBucket', li.storage_bucket, 'storagePath', li.storage_path,
          'thumbnailPath', li.thumbnail_path, 'sortOrder', li.sort_order, 'isPrimary', li.is_primary
        ) order by li.sort_order, li.id)
        from public.listing_images li
        where li.listing_id = l.id and li.upload_status = 'ready'
      ), '[]'::jsonb),
      'auditHistory', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', cae.id, 'action', cae.action, 'actorUserId', cae.actor_user_id,
          'previousState', cae.previous_state, 'nextState', cae.next_state,
          'createdAt', cae.created_at
        ) order by cae.created_at desc, cae.id desc)
        from public.catalogue_audit_events cae
        where (cae.entity_type = 'listing' and cae.entity_id = l.id)
           or (cae.entity_type = 'price_request' and cae.entity_id = pr.id)
      ), '[]'::jsonb)
    ) review
    from public.listing_price_requests pr
    join public.listings l on l.id = pr.listing_id
    join public.sellers s on s.id = l.seller_id
    left join public.markets m on m.id = s.market_id
    join public.catalog_products cp on cp.id = l.catalog_product_id
    where pr.status = 'pending' and l.status in ('active', 'paused')
  ) pending;
$$;

create or replace function public.admin_review_listing(
  p_listing_id uuid,
  p_admin_id uuid,
  p_decision text,
  p_review_note text,
  p_expected_version integer,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.catalogue_review_operations;
  listing_record public.listings;
  price_record public.listing_price_requests;
  result jsonb;
  action_name text;
begin
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'invalid listing review decision' using errcode = 'check_violation';
  end if;
  if p_decision = 'changes_requested' and length(trim(coalesce(p_review_note, ''))) < 3 then
    raise exception 'a review note is required when requesting changes' using errcode = 'check_violation';
  end if;
  action_name := case when p_decision = 'approved' then 'listing.approve' else 'listing.request_changes' end;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text, 0));

  select * into existing from public.catalogue_review_operations where operation_id = p_operation_id;
  if found then
    if existing.action <> action_name or existing.entity_id <> p_listing_id
       or existing.actor_user_id <> p_admin_id or existing.expected_version is distinct from p_expected_version
       or existing.review_note is distinct from nullif(trim(p_review_note), '') then
      raise exception 'operation id was already used with different input' using errcode = 'unique_violation';
    end if;
    return existing.result || jsonb_build_object('duplicate', true);
  end if;

  select * into listing_record from public.listings where id = p_listing_id for update;
  if not found then raise exception 'listing not found' using errcode = 'no_data_found'; end if;
  if listing_record.status <> 'pending_approval' then
    raise exception 'listing is not pending approval' using errcode = 'check_violation';
  end if;
  if listing_record.version <> p_expected_version then
    raise exception 'listing version conflict' using errcode = 'serialization_failure';
  end if;

  select * into price_record from public.listing_price_requests
  where listing_id = p_listing_id and status = 'pending'
  order by created_at desc, id desc limit 1 for update;
  if price_record.id is null then
    raise exception 'pending price request not found' using errcode = 'no_data_found';
  end if;

  if p_decision = 'approved' then
    update public.listing_price_requests set status = 'approved', reviewed_by = p_admin_id,
      reviewed_at = now(), review_note = nullif(trim(p_review_note), '') where id = price_record.id;
    update public.listings set approved_price_ugx = price_record.proposed_price_ugx,
      status = 'active', version = version + 1 where id = p_listing_id returning * into listing_record;
  else
    update public.listing_price_requests set status = 'rejected', reviewed_by = p_admin_id,
      reviewed_at = now(), review_note = trim(p_review_note) where id = price_record.id;
    update public.listings set status = 'changes_requested', version = version + 1
      where id = p_listing_id returning * into listing_record;
  end if;

  insert into public.catalogue_audit_events
    (actor_user_id, action, entity_type, entity_id, previous_state, next_state)
  values (p_admin_id, action_name, 'listing', p_listing_id,
    jsonb_build_object('status', 'pending_approval', 'version', p_expected_version),
    jsonb_build_object('status', listing_record.status, 'version', listing_record.version,
      'reviewNote', nullif(trim(p_review_note), ''), 'approvedPriceUgx', listing_record.approved_price_ugx));

  result := jsonb_build_object('operationId', p_operation_id, 'duplicate', false,
    'listingId', p_listing_id, 'requestId', price_record.id,
    'status', listing_record.status, 'version', listing_record.version);
  insert into public.catalogue_review_operations
    (operation_id, action, entity_id, actor_user_id, expected_version, review_note, result)
  values (p_operation_id, action_name, p_listing_id, p_admin_id, p_expected_version,
    nullif(trim(p_review_note), ''), result);
  return result;
end;
$$;

create or replace function public.admin_review_price_request(
  p_request_id uuid,
  p_admin_id uuid,
  p_decision text,
  p_review_note text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.catalogue_review_operations;
  price_record public.listing_price_requests;
  listing_record public.listings;
  result jsonb;
  action_name text;
  previous_approved_price integer;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid price review decision' using errcode = 'check_violation';
  end if;
  if p_decision = 'rejected' and length(trim(coalesce(p_review_note, ''))) < 3 then
    raise exception 'a review note is required when rejecting a price' using errcode = 'check_violation';
  end if;
  action_name := 'price_request.' || case when p_decision = 'approved' then 'approve' else 'reject' end;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text, 0));

  select * into existing from public.catalogue_review_operations where operation_id = p_operation_id;
  if found then
    if existing.action <> action_name or existing.entity_id <> p_request_id
       or existing.actor_user_id <> p_admin_id
       or existing.review_note is distinct from nullif(trim(p_review_note), '') then
      raise exception 'operation id was already used with different input' using errcode = 'unique_violation';
    end if;
    return existing.result || jsonb_build_object('duplicate', true);
  end if;

  select * into price_record from public.listing_price_requests where id = p_request_id for update;
  if not found then raise exception 'price request not found' using errcode = 'no_data_found'; end if;
  if price_record.status <> 'pending' then
    raise exception 'price request is not pending' using errcode = 'check_violation';
  end if;
  select * into listing_record from public.listings where id = price_record.listing_id for update;
  if listing_record.status not in ('active', 'paused') then
    raise exception 'listing is not eligible for a price review' using errcode = 'check_violation';
  end if;
  previous_approved_price := listing_record.approved_price_ugx;

  update public.listing_price_requests set status = p_decision::public.price_review_status,
    reviewed_by = p_admin_id, reviewed_at = now(), review_note = nullif(trim(p_review_note), '')
    where id = p_request_id returning * into price_record;
  if p_decision = 'approved' then
    update public.listings set approved_price_ugx = price_record.proposed_price_ugx,
      version = version + 1 where id = price_record.listing_id returning * into listing_record;
  end if;

  insert into public.catalogue_audit_events
    (actor_user_id, action, entity_type, entity_id, previous_state, next_state)
  values (p_admin_id, action_name, 'price_request', p_request_id,
    jsonb_build_object('status', 'pending', 'approvedPriceUgx', previous_approved_price),
    jsonb_build_object('status', price_record.status, 'proposedPriceUgx', price_record.proposed_price_ugx,
      'reviewNote', nullif(trim(p_review_note), '')));

  result := jsonb_build_object('operationId', p_operation_id, 'duplicate', false,
    'listingId', price_record.listing_id, 'requestId', p_request_id,
    'status', price_record.status, 'version', listing_record.version);
  insert into public.catalogue_review_operations
    (operation_id, action, entity_id, actor_user_id, review_note, result)
  values (p_operation_id, action_name, p_request_id, p_admin_id,
    nullif(trim(p_review_note), ''), result);
  return result;
end;
$$;

revoke all on table public.catalogue_review_operations from public, anon, authenticated;
revoke all on function public.get_admin_listing_review(uuid) from public, anon, authenticated;
revoke all on function public.get_admin_listing_review_queue() from public, anon, authenticated;
revoke all on function public.get_admin_price_review_queue() from public, anon, authenticated;
revoke all on function public.admin_review_listing(uuid, uuid, text, text, integer, uuid) from public, anon, authenticated;
revoke all on function public.admin_review_price_request(uuid, uuid, text, text, uuid) from public, anon, authenticated;

grant execute on function public.get_admin_listing_review(uuid) to service_role;
grant execute on function public.get_admin_listing_review_queue() to service_role;
grant execute on function public.get_admin_price_review_queue() to service_role;
grant execute on function public.admin_review_listing(uuid, uuid, text, text, integer, uuid) to service_role;
grant execute on function public.admin_review_price_request(uuid, uuid, text, text, uuid) to service_role;
