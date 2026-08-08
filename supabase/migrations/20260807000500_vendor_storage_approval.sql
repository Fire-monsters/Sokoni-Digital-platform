create table public.catalogue_audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  previous_state jsonb,
  next_state jsonb,
  created_at timestamptz not null default now()
);

create table public.listing_availability_operations (
  operation_id uuid primary key,
  listing_id uuid not null references public.listings(id) on delete cascade,
  seller_id uuid not null references public.sellers(id),
  availability public.listing_availability not null,
  version integer not null check (version > 0),
  created_at timestamptz not null default now()
);

create index catalogue_audit_entity_idx
  on public.catalogue_audit_events (entity_type, entity_id, created_at desc);

create or replace function public.validate_listing_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = new.status then
    return new;
  end if;

  if not (
    (old.status = 'draft' and new.status in ('pending_approval', 'archived'))
    or (old.status = 'changes_requested' and new.status in ('draft', 'pending_approval', 'archived'))
    or (old.status = 'pending_approval' and new.status in ('active', 'changes_requested', 'archived'))
    or (old.status = 'active' and new.status in ('paused', 'archived'))
    or (old.status = 'paused' and new.status in ('active', 'archived'))
  ) then
    raise exception 'invalid listing transition from % to %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger listings_validate_transition
before update of status on public.listings
for each row execute function public.validate_listing_transition();

create or replace function public.enforce_listing_image_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    select count(*)
    from public.listing_images
    where listing_id = new.listing_id and upload_status = 'ready'
  ) >= 4 then
    raise exception 'a listing can have at most four ready images'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger listing_images_enforce_limit
before insert on public.listing_images
for each row execute function public.enforce_listing_image_limit();

create or replace function public.submit_listing_for_approval(
  requested_listing_id uuid,
  requested_user_id uuid
)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.listings;
begin
  if not exists (
    select 1
    from public.listings l
    join public.seller_accounts sa on sa.seller_id = l.seller_id
    join public.sellers s on s.id = l.seller_id
    where l.id = requested_listing_id
      and sa.user_id = requested_user_id
      and s.verification_status = 'approved'
      and l.status in ('draft', 'changes_requested')
  ) then
    raise exception 'listing is not editable by this approved vendor'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.listing_images
    where listing_id = requested_listing_id and upload_status = 'ready'
  ) then
    raise exception 'at least one ready image is required'
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.listing_price_requests
    where listing_id = requested_listing_id and status = 'pending'
  ) then
    raise exception 'a pending price request is required'
      using errcode = 'check_violation';
  end if;

  update public.listings
  set status = 'pending_approval'
  where id = requested_listing_id
  returning * into result;

  insert into public.catalogue_audit_events (
    actor_user_id, action, entity_type, entity_id, next_state
  ) values (
    requested_user_id, 'listing.submitted', 'listing', result.id,
    jsonb_build_object('status', result.status)
  );

  return result;
end;
$$;

create or replace function public.change_listing_availability(
  requested_listing_id uuid,
  requested_user_id uuid,
  requested_availability public.listing_availability,
  expected_version integer,
  requested_operation_id uuid
)
returns public.listing_availability_operations
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.listing_availability_operations;
  listing_seller_id uuid;
  next_version integer;
begin
  select * into existing
  from public.listing_availability_operations
  where operation_id = requested_operation_id;

  if found then
    return existing;
  end if;

  select l.seller_id into listing_seller_id
  from public.listings l
  join public.seller_accounts sa on sa.seller_id = l.seller_id
  join public.sellers s on s.id = l.seller_id
  where l.id = requested_listing_id
    and sa.user_id = requested_user_id
    and s.verification_status = 'approved'
    and l.status <> 'archived'
  for update of l;

  if listing_seller_id is null then
    raise exception 'listing is not managed by this approved vendor'
      using errcode = 'insufficient_privilege';
  end if;

  update public.listings
  set availability = requested_availability,
      version = version + 1
  where id = requested_listing_id
    and version = expected_version
  returning version into next_version;

  if next_version is null then
    raise exception 'listing version conflict'
      using errcode = 'serialization_failure';
  end if;

  insert into public.listing_availability_operations (
    operation_id, listing_id, seller_id, availability, version
  ) values (
    requested_operation_id, requested_listing_id, listing_seller_id,
    requested_availability, next_version
  ) returning * into existing;

  return existing;
end;
$$;

create or replace function public.approve_listing_and_price(
  requested_listing_id uuid,
  requested_admin_id uuid,
  requested_review_note text default null
)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.listing_price_requests;
  result public.listings;
begin
  select * into request_record
  from public.listing_price_requests
  where listing_id = requested_listing_id and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if request_record.id is null then
    raise exception 'pending price request not found' using errcode = 'no_data_found';
  end if;

  update public.listing_price_requests
  set status = 'approved', reviewed_by = requested_admin_id,
      reviewed_at = now(), review_note = requested_review_note
  where id = request_record.id;

  update public.listings
  set approved_price_ugx = request_record.proposed_price_ugx,
      status = case when status = 'pending_approval' then 'active' else status end
  where id = requested_listing_id
    and status in ('pending_approval', 'active', 'paused')
  returning * into result;

  if result.id is null then
    raise exception 'listing is not approvable' using errcode = 'check_violation';
  end if;

  insert into public.catalogue_audit_events (
    actor_user_id, action, entity_type, entity_id, previous_state, next_state
  ) values (
    requested_admin_id, 'listing.approved', 'listing', result.id,
    jsonb_build_object('proposedPriceUgx', request_record.proposed_price_ugx),
    jsonb_build_object('status', result.status, 'approvedPriceUgx', result.approved_price_ugx)
  );

  return result;
end;
$$;

create or replace function public.request_listing_changes(
  requested_listing_id uuid,
  requested_admin_id uuid,
  requested_note text
)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.listings;
begin
  update public.listings
  set status = 'changes_requested'
  where id = requested_listing_id and status = 'pending_approval'
  returning * into result;

  if result.id is null then
    raise exception 'listing is not pending approval' using errcode = 'check_violation';
  end if;

  update public.listing_price_requests
  set status = 'rejected', reviewed_by = requested_admin_id,
      reviewed_at = now(), review_note = requested_note
  where listing_id = requested_listing_id and status = 'pending';

  insert into public.catalogue_audit_events (
    actor_user_id, action, entity_type, entity_id, next_state
  ) values (
    requested_admin_id, 'listing.changes_requested', 'listing', result.id,
    jsonb_build_object('status', result.status, 'note', requested_note)
  );

  return result;
end;
$$;

create or replace function public.review_price_request(
  requested_request_id uuid,
  requested_admin_id uuid,
  requested_decision public.price_review_status,
  requested_note text default null
)
returns public.listing_price_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.listing_price_requests;
begin
  if requested_decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected' using errcode = 'check_violation';
  end if;

  update public.listing_price_requests
  set status = requested_decision, reviewed_by = requested_admin_id,
      reviewed_at = now(), review_note = requested_note
  where id = requested_request_id and status = 'pending'
  returning * into result;

  if result.id is null then
    raise exception 'pending price request not found' using errcode = 'no_data_found';
  end if;

  if requested_decision = 'approved' then
    update public.listings
    set approved_price_ugx = result.proposed_price_ugx
    where id = result.listing_id;
  end if;

  insert into public.catalogue_audit_events (
    actor_user_id, action, entity_type, entity_id, next_state
  ) values (
    requested_admin_id, 'price_request.' || requested_decision::text,
    'price_request', result.id,
    jsonb_build_object('status', result.status, 'note', requested_note)
  );

  return result;
end;
$$;

alter table public.catalogue_audit_events enable row level security;
alter table public.listing_availability_operations enable row level security;

create policy availability_operations_owner_read
  on public.listing_availability_operations
  for select to authenticated using (public.owns_seller(seller_id));

grant select on public.listing_availability_operations to authenticated;

revoke all on function public.submit_listing_for_approval(uuid, uuid) from public;
revoke all on function public.change_listing_availability(uuid, uuid, public.listing_availability, integer, uuid) from public;
revoke all on function public.approve_listing_and_price(uuid, uuid, text) from public;
revoke all on function public.request_listing_changes(uuid, uuid, text) from public;
revoke all on function public.review_price_request(uuid, uuid, public.price_review_status, text) from public;

grant execute on function public.submit_listing_for_approval(uuid, uuid) to service_role;
grant execute on function public.change_listing_availability(uuid, uuid, public.listing_availability, integer, uuid) to service_role;
grant execute on function public.approve_listing_and_price(uuid, uuid, text) to service_role;
grant execute on function public.request_listing_changes(uuid, uuid, text) to service_role;
grant execute on function public.review_price_request(uuid, uuid, public.price_review_status, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-images',
  'listing-images',
  true,
  500000,
  array['image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy listing_images_public_storage_read
  on storage.objects for select
  using (bucket_id = 'listing-images');
