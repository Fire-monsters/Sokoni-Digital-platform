-- Phase 5 Slice 2b: authoritative vendor fulfilment and quality state machine.

alter table public.vendor_orders
  add column version integer not null default 1 check (version > 0),
  add constraint vendor_orders_id_seller_unique unique (id, seller_id);

create type public.quality_check_status as enum ('draft', 'completed', 'invalidated');
create type public.quality_image_upload_status as enum ('pending', 'ready', 'invalidated');

create table public.quality_checks (
  id uuid primary key default extensions.gen_random_uuid(),
  vendor_order_id uuid not null,
  seller_id uuid not null,
  status public.quality_check_status not null default 'draft',
  packed_by_user_id uuid references auth.users(id),
  notes text check (char_length(notes) <= 1000),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_order_id),
  unique (id, vendor_order_id),
  foreign key (vendor_order_id, seller_id)
    references public.vendor_orders(id, seller_id) on delete cascade
);

create table public.quality_check_images (
  id uuid primary key default extensions.gen_random_uuid(),
  quality_check_id uuid not null,
  vendor_order_id uuid not null,
  storage_bucket text not null default 'quality-check-images'
    check (storage_bucket = 'quality-check-images'),
  storage_path text not null unique,
  thumbnail_path text unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 500000),
  width integer not null check (width > 0 and width <= 4096),
  height integer not null check (height > 0 and height <= 4096),
  is_packing_proof boolean not null default false,
  upload_status public.quality_image_upload_status not null default 'pending',
  created_at timestamptz not null default now(),
  foreign key (quality_check_id, vendor_order_id)
    references public.quality_checks(id, vendor_order_id) on delete cascade
);

create unique index quality_check_images_one_packing_proof_idx
  on public.quality_check_images (quality_check_id)
  where is_packing_proof and upload_status <> 'invalidated';
create index quality_check_images_transition_proof_idx
  on public.quality_check_images (vendor_order_id, quality_check_id)
  where is_packing_proof and upload_status = 'ready';

create table public.vendor_order_operations (
  operation_id uuid primary key,
  vendor_order_id uuid not null references public.vendor_orders(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  requested_status public.vendor_order_status not null,
  expected_version integer not null check (expected_version > 0),
  result_status public.vendor_order_status not null,
  result_version integer not null check (result_version > 0),
  created_at timestamptz not null default now()
);

create index vendor_order_operations_order_created_idx
  on public.vendor_order_operations (vendor_order_id, created_at desc);

create table public.vendor_order_status_history (
  id bigint generated always as identity primary key,
  vendor_order_id uuid not null references public.vendor_orders(id) on delete cascade,
  seller_id uuid not null references public.sellers(id),
  actor_user_id uuid not null references auth.users(id),
  operation_id uuid not null references public.vendor_order_operations(operation_id),
  from_status public.vendor_order_status not null,
  to_status public.vendor_order_status not null,
  from_version integer not null check (from_version > 0),
  to_version integer not null check (to_version = from_version + 1),
  created_at timestamptz not null default now(),
  unique (vendor_order_id, operation_id)
);

create index vendor_order_status_history_timeline_idx
  on public.vendor_order_status_history (vendor_order_id, created_at, id);

create table public.vendor_order_audit_events (
  id bigint generated always as identity primary key,
  vendor_order_id uuid not null references public.vendor_orders(id) on delete cascade,
  seller_id uuid not null references public.sellers(id),
  actor_user_id uuid not null references auth.users(id),
  operation_id uuid not null references public.vendor_order_operations(operation_id),
  action text not null,
  previous_status public.vendor_order_status,
  next_status public.vendor_order_status,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (vendor_order_id, operation_id)
);

create index vendor_order_audit_events_order_created_idx
  on public.vendor_order_audit_events (vendor_order_id, created_at, id);

create or replace function public.enforce_quality_check_image_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.upload_status <> 'invalidated' and (
    select count(*)
    from public.quality_check_images image
    where image.quality_check_id = new.quality_check_id
      and image.upload_status <> 'invalidated'
      and image.id <> new.id
  ) >= 3 then
    raise exception 'a quality check can have at most three active images'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger quality_check_images_limit
before insert or update of quality_check_id, upload_status on public.quality_check_images
for each row execute function public.enforce_quality_check_image_limit();

create trigger quality_checks_set_updated_at
before update on public.quality_checks
for each row execute function public.set_updated_at();

create or replace function public.normalize_legacy_vendor_order_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'confirmed' then
    new.status := 'awaiting_vendor_acceptance';
  end if;
  return new;
end;
$$;

create trigger vendor_orders_normalize_legacy_status
before insert or update of status on public.vendor_orders
for each row execute function public.normalize_legacy_vendor_order_status();

update public.vendor_orders
set status = 'awaiting_vendor_acceptance'
where status = 'confirmed';

alter table public.quality_checks enable row level security;
alter table public.quality_check_images enable row level security;
alter table public.vendor_order_operations enable row level security;
alter table public.vendor_order_status_history enable row level security;
alter table public.vendor_order_audit_events enable row level security;

revoke all on table public.quality_checks from public;
revoke all on table public.quality_check_images from public;
revoke all on table public.vendor_order_operations from public;
revoke all on table public.vendor_order_status_history from public;
revoke all on table public.vendor_order_audit_events from public;

create or replace function public.transition_vendor_order(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_to_status text,
  p_expected_version integer,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record public.vendor_orders;
  existing_operation public.vendor_order_operations;
  requested_status public.vendor_order_status;
  next_version integer;
begin
  if p_to_status not in (
    'accepted', 'preparing', 'quality_verified', 'ready_for_pickup',
    'cancelled', 'issue_reported'
  ) then
    raise exception 'unsupported vendor order status' using errcode = '22023';
  end if;
  requested_status := p_to_status::public.vendor_order_status;

  select * into order_record
  from public.vendor_orders
  where id = p_order_id
  for update;

  if order_record.id is null then
    raise exception 'vendor order not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.seller_accounts account
    join public.sellers seller on seller.id = account.seller_id
    where account.user_id = p_actor_user_id
      and account.seller_id = order_record.seller_id
      and seller.verification_status = 'approved'
  ) then
    raise exception 'vendor order is not managed by this approved vendor'
      using errcode = '42501';
  end if;

  select * into existing_operation
  from public.vendor_order_operations
  where operation_id = p_operation_id;

  if existing_operation.operation_id is not null then
    if existing_operation.vendor_order_id <> p_order_id
      or existing_operation.actor_user_id <> p_actor_user_id
      or existing_operation.requested_status <> requested_status
      or existing_operation.expected_version <> p_expected_version then
      raise exception 'operation id was already used for another transition'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'orderId', existing_operation.vendor_order_id,
      'status', existing_operation.result_status,
      'version', existing_operation.result_version,
      'operationId', existing_operation.operation_id,
      'duplicate', true
    );
  end if;

  if order_record.version <> p_expected_version then
    raise exception 'vendor order version conflict' using errcode = '40001';
  end if;

  if not (
    (order_record.status = 'awaiting_vendor_acceptance' and requested_status in ('accepted', 'cancelled'))
    or (order_record.status = 'accepted' and requested_status in ('preparing', 'cancelled'))
    or (order_record.status = 'preparing' and requested_status in ('quality_verified', 'issue_reported'))
    or (order_record.status = 'quality_verified' and requested_status = 'ready_for_pickup')
  ) then
    raise exception 'invalid vendor order transition: % -> %', order_record.status, requested_status
      using errcode = '23514';
  end if;

  if requested_status = 'quality_verified' and not exists (
    select 1
    from public.quality_checks check_record
    join public.quality_check_images image
      on image.quality_check_id = check_record.id
      and image.vendor_order_id = check_record.vendor_order_id
    where check_record.vendor_order_id = p_order_id
      and check_record.seller_id = order_record.seller_id
      and check_record.status = 'completed'
      and image.upload_status = 'ready'
      and image.is_packing_proof
  ) then
    raise exception 'PACKING_IMAGE_REQUIRED' using errcode = '23514';
  end if;

  next_version := order_record.version + 1;

  insert into public.vendor_order_operations (
    operation_id, vendor_order_id, actor_user_id, requested_status,
    expected_version, result_status, result_version
  ) values (
    p_operation_id, p_order_id, p_actor_user_id, requested_status,
    p_expected_version, requested_status, next_version
  );

  update public.vendor_orders
  set status = requested_status,
      version = next_version
  where id = p_order_id;

  insert into public.vendor_order_status_history (
    vendor_order_id, seller_id, actor_user_id, operation_id,
    from_status, to_status, from_version, to_version
  ) values (
    p_order_id, order_record.seller_id, p_actor_user_id, p_operation_id,
    order_record.status, requested_status, order_record.version, next_version
  );

  insert into public.vendor_order_audit_events (
    vendor_order_id, seller_id, actor_user_id, operation_id, action,
    previous_status, next_status, details
  ) values (
    p_order_id, order_record.seller_id, p_actor_user_id, p_operation_id,
    'vendor_order.' || requested_status::text,
    order_record.status, requested_status,
    jsonb_build_object('fromVersion', order_record.version, 'toVersion', next_version)
  );

  return jsonb_build_object(
    'orderId', p_order_id,
    'status', requested_status,
    'version', next_version,
    'operationId', p_operation_id,
    'duplicate', false
  );
end;
$$;

revoke all on function public.transition_vendor_order(uuid, uuid, text, integer, uuid) from public;
grant execute on function public.transition_vendor_order(uuid, uuid, text, integer, uuid) to service_role;
