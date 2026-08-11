-- Phase 5 Slices 4-5: private packing uploads and quality-check completion.

alter table public.quality_checks
  add column checklist jsonb not null default '{}'::jsonb,
  add column completion_operation_id uuid unique,
  add constraint quality_checks_completed_shape check (
    status <> 'completed' or (
      packed_by_user_id is not null
      and verified_at is not null
      and checklist @> '{"itemsChecked":true,"quantitiesChecked":true,"packagingSecure":true}'::jsonb
    )
  );

alter table public.quality_check_images
  add column upload_expires_at timestamptz;

create table public.quality_check_audit_events (
  id bigint generated always as identity primary key,
  quality_check_id uuid not null references public.quality_checks(id) on delete cascade,
  vendor_order_id uuid not null references public.vendor_orders(id) on delete cascade,
  seller_id uuid not null references public.sellers(id),
  actor_user_id uuid not null references auth.users(id),
  operation_id uuid not null unique,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index quality_check_audit_order_created_idx
  on public.quality_check_audit_events (vendor_order_id, created_at, id);

alter table public.quality_check_audit_events enable row level security;
revoke all on table public.quality_check_audit_events from public;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quality-check-images',
  'quality-check-images',
  false,
  500000,
  array['image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- There are intentionally no client storage.objects policies for this bucket.
-- Uploads use backend-created signed upload tokens and reads use short-lived
-- backend-created signed URLs, so RLS remains default-deny for client access.

create or replace function public.ensure_quality_check(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_suggested_check_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record public.vendor_orders;
  check_record public.quality_checks;
begin
  select * into order_record from public.vendor_orders where id = p_order_id for update;
  if order_record.id is null then
    raise exception 'vendor order not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.seller_accounts account
    join public.sellers seller on seller.id = account.seller_id
    where account.user_id = p_actor_user_id
      and account.seller_id = order_record.seller_id
      and seller.verification_status = 'approved'
  ) then
    raise exception 'vendor order is not managed by this approved vendor' using errcode = '42501';
  end if;
  if order_record.status not in ('accepted', 'preparing') then
    raise exception 'quality checks are only available for accepted or preparing orders'
      using errcode = '23514';
  end if;
  select * into check_record from public.quality_checks where vendor_order_id = p_order_id;
  if check_record.id is null then
    insert into public.quality_checks (id, vendor_order_id, seller_id)
    values (p_suggested_check_id, p_order_id, order_record.seller_id)
    returning * into check_record;
  elsif check_record.status <> 'draft' then
    raise exception 'completed or invalidated quality checks cannot accept images'
      using errcode = '23514';
  end if;
  return jsonb_build_object(
    'qualityCheckId', check_record.id,
    'sellerId', check_record.seller_id,
    'status', check_record.status
  );
end;
$$;

create or replace function public.create_quality_image_intent(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_quality_check_id uuid,
  p_image_id uuid,
  p_storage_path text,
  p_thumbnail_path text,
  p_mime_type text,
  p_byte_size integer,
  p_width integer,
  p_height integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record public.vendor_orders;
  check_record public.quality_checks;
  existing_image public.quality_check_images;
begin
  select * into order_record
  from public.vendor_orders
  where id = p_order_id
  for update;
  if order_record.id is null then
    raise exception 'vendor order not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.seller_accounts account
    join public.sellers seller on seller.id = account.seller_id
    where account.user_id = p_actor_user_id
      and account.seller_id = order_record.seller_id
      and seller.verification_status = 'approved'
  ) then
    raise exception 'vendor order is not managed by this approved vendor' using errcode = '42501';
  end if;
  if order_record.status not in ('accepted', 'preparing') then
    raise exception 'packing images can only be added to accepted or preparing orders'
      using errcode = '23514';
  end if;
  if p_mime_type not in ('image/jpeg', 'image/webp')
    or p_byte_size < 1 or p_byte_size > 500000
    or p_width < 1 or p_width > 1280
    or p_height < 1 or p_height > 1280 then
    raise exception 'invalid quality image compression metadata' using errcode = '22023';
  end if;
  if p_storage_path !~ ('^' || order_record.seller_id::text || '/' || p_order_id::text || '/')
    or p_thumbnail_path !~ ('^' || order_record.seller_id::text || '/' || p_order_id::text || '/') then
    raise exception 'quality image path does not belong to this seller order' using errcode = '22023';
  end if;

  select * into existing_image
  from public.quality_check_images
  where id = p_image_id;
  if existing_image.id is not null then
    if existing_image.vendor_order_id <> p_order_id
      or existing_image.storage_path <> p_storage_path
      or existing_image.thumbnail_path <> p_thumbnail_path
      or existing_image.mime_type <> p_mime_type
      or existing_image.byte_size <> p_byte_size
      or existing_image.width <> p_width
      or existing_image.height <> p_height then
      raise exception 'image id was already used for another upload intent' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'qualityCheckId', existing_image.quality_check_id,
      'imageId', existing_image.id,
      'duplicate', true
    );
  end if;

  select * into check_record
  from public.quality_checks
  where id = p_quality_check_id and vendor_order_id = p_order_id
  for update;
  if check_record.id is null then
    raise exception 'quality check not found' using errcode = 'P0002';
  elsif check_record.status <> 'draft' then
    raise exception 'completed or invalidated quality checks cannot accept images'
      using errcode = '23514';
  end if;
  if p_storage_path !~ ('/' || check_record.id::text || '/' || p_image_id::text || '/')
    or p_thumbnail_path !~ ('/' || check_record.id::text || '/' || p_image_id::text || '/') then
    raise exception 'quality image path does not match its check and image identity'
      using errcode = '22023';
  end if;

  update public.quality_check_images
  set upload_status = 'invalidated'
  where quality_check_id = check_record.id
    and upload_status = 'pending'
    and upload_expires_at is not null
    and upload_expires_at <= now();

  insert into public.quality_check_images (
    id, quality_check_id, vendor_order_id, storage_path, thumbnail_path,
    mime_type, byte_size, width, height, upload_status, upload_expires_at
  ) values (
    p_image_id, check_record.id, p_order_id, p_storage_path, p_thumbnail_path,
    p_mime_type, p_byte_size, p_width, p_height, 'pending', now() + interval '2 hours'
  );

  return jsonb_build_object(
    'qualityCheckId', check_record.id,
    'imageId', p_image_id,
    'duplicate', false
  );
end;
$$;

create or replace function public.finalize_quality_image(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_image_id uuid,
  p_storage_path text,
  p_thumbnail_path text,
  p_mime_type text,
  p_byte_size integer,
  p_width integer,
  p_height integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record public.vendor_orders;
  image_record public.quality_check_images;
  packing_proof boolean;
begin
  select * into order_record from public.vendor_orders where id = p_order_id for update;
  if order_record.id is null then
    raise exception 'vendor order not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.seller_accounts account
    join public.sellers seller on seller.id = account.seller_id
    where account.user_id = p_actor_user_id
      and account.seller_id = order_record.seller_id
      and seller.verification_status = 'approved'
  ) then
    raise exception 'vendor order is not managed by this approved vendor' using errcode = '42501';
  end if;
  if order_record.status not in ('accepted', 'preparing') then
    raise exception 'packing images can only be finalized for accepted or preparing orders'
      using errcode = '23514';
  end if;

  select * into image_record
  from public.quality_check_images
  where id = p_image_id and vendor_order_id = p_order_id
  for update;
  if image_record.id is null then
    raise exception 'quality image not found' using errcode = 'P0002';
  end if;
  if image_record.storage_path <> p_storage_path
    or image_record.thumbnail_path <> p_thumbnail_path
    or image_record.mime_type <> p_mime_type
    or image_record.byte_size <> p_byte_size
    or image_record.width <> p_width
    or image_record.height <> p_height then
    raise exception 'finalized metadata does not match the upload intent' using errcode = '22023';
  end if;
  if image_record.upload_status = 'invalidated' then
    raise exception 'invalidated quality image cannot be finalized' using errcode = '23514';
  end if;
  if image_record.upload_status = 'pending'
    and image_record.upload_expires_at is not null
    and image_record.upload_expires_at <= now() then
    update public.quality_check_images set upload_status = 'invalidated' where id = image_record.id;
    raise exception 'quality image upload intent expired' using errcode = '23514';
  end if;
  if image_record.upload_status = 'ready' then
    return jsonb_build_object(
      'qualityCheckId', image_record.quality_check_id,
      'imageId', image_record.id,
      'isPackingProof', image_record.is_packing_proof,
      'uploadStatus', image_record.upload_status,
      'duplicate', true
    );
  end if;

  packing_proof := not exists (
    select 1 from public.quality_check_images other
    where other.quality_check_id = image_record.quality_check_id
      and other.is_packing_proof
      and other.upload_status = 'ready'
  );
  update public.quality_check_images
  set upload_status = 'ready', is_packing_proof = packing_proof
  where id = image_record.id
  returning * into image_record;

  return jsonb_build_object(
    'qualityCheckId', image_record.quality_check_id,
    'imageId', image_record.id,
    'isPackingProof', image_record.is_packing_proof,
    'uploadStatus', image_record.upload_status,
    'duplicate', false
  );
end;
$$;

create or replace function public.complete_quality_check(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_items_checked boolean,
  p_quantities_checked boolean,
  p_packaging_secure boolean,
  p_notes text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record public.vendor_orders;
  check_record public.quality_checks;
  requested_checklist jsonb;
begin
  if not p_items_checked or not p_quantities_checked or not p_packaging_secure then
    raise exception 'all packing checklist items must be confirmed' using errcode = '23514';
  end if;
  if p_notes is not null and char_length(p_notes) > 1000 then
    raise exception 'quality check notes are too long' using errcode = '22023';
  end if;
  requested_checklist := jsonb_build_object(
    'itemsChecked', p_items_checked,
    'quantitiesChecked', p_quantities_checked,
    'packagingSecure', p_packaging_secure
  );

  select * into order_record from public.vendor_orders where id = p_order_id for update;
  if order_record.id is null then
    raise exception 'vendor order not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.seller_accounts account
    join public.sellers seller on seller.id = account.seller_id
    where account.user_id = p_actor_user_id
      and account.seller_id = order_record.seller_id
      and seller.verification_status = 'approved'
  ) then
    raise exception 'vendor order is not managed by this approved vendor' using errcode = '42501';
  end if;
  if order_record.status <> 'preparing' then
    raise exception 'quality checks can only be completed while preparing'
      using errcode = '23514';
  end if;

  select * into check_record
  from public.quality_checks
  where vendor_order_id = p_order_id
  for update;
  if check_record.id is null then
    raise exception 'quality check not found' using errcode = 'P0002';
  end if;
  if check_record.status = 'completed' then
    if check_record.completion_operation_id = p_operation_id
      and check_record.packed_by_user_id = p_actor_user_id
      and check_record.checklist = requested_checklist
      and check_record.notes is not distinct from p_notes then
      return jsonb_build_object(
        'qualityCheckId', check_record.id,
        'status', check_record.status,
        'verifiedAt', check_record.verified_at,
        'duplicate', true
      );
    end if;
    raise exception 'quality check is already completed' using errcode = '23505';
  end if;
  if check_record.status = 'invalidated' then
    raise exception 'invalidated quality check cannot be completed' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.quality_check_images image
    where image.quality_check_id = check_record.id
      and image.vendor_order_id = p_order_id
      and image.upload_status = 'ready'
      and image.is_packing_proof
  ) then
    raise exception 'PACKING_IMAGE_REQUIRED' using errcode = '23514';
  end if;

  update public.quality_checks
  set status = 'completed',
      checklist = requested_checklist,
      notes = p_notes,
      packed_by_user_id = p_actor_user_id,
      verified_at = now(),
      completion_operation_id = p_operation_id
  where id = check_record.id
  returning * into check_record;

  insert into public.quality_check_audit_events (
    quality_check_id, vendor_order_id, seller_id, actor_user_id,
    operation_id, action, details
  ) values (
    check_record.id, p_order_id, order_record.seller_id, p_actor_user_id,
    p_operation_id, 'quality_check.completed',
    jsonb_build_object('checklist', requested_checklist, 'notes', p_notes)
  );

  return jsonb_build_object(
    'qualityCheckId', check_record.id,
    'status', check_record.status,
    'verifiedAt', check_record.verified_at,
    'duplicate', false
  );
end;
$$;

revoke all on function public.ensure_quality_check(uuid, uuid, uuid) from public;
revoke all on function public.create_quality_image_intent(uuid, uuid, uuid, uuid, text, text, text, integer, integer, integer) from public;
revoke all on function public.finalize_quality_image(uuid, uuid, uuid, text, text, text, integer, integer, integer) from public;
revoke all on function public.complete_quality_check(uuid, uuid, boolean, boolean, boolean, text, uuid) from public;
grant execute on function public.ensure_quality_check(uuid, uuid, uuid) to service_role;
grant execute on function public.create_quality_image_intent(uuid, uuid, uuid, uuid, text, text, text, integer, integer, integer) to service_role;
grant execute on function public.finalize_quality_image(uuid, uuid, uuid, text, text, text, integer, integer, integer) to service_role;
grant execute on function public.complete_quality_check(uuid, uuid, boolean, boolean, boolean, text, uuid) to service_role;
