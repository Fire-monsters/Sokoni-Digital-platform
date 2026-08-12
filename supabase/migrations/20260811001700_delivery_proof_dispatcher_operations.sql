-- Phase 6 slices 9-10: proof of delivery and dispatcher operations.

create type public.delivery_confirmation_method as enum ('pin');
create type public.delivery_proof_upload_status as enum ('pending', 'ready', 'invalidated');
create type public.delivery_issue_reason as enum (
  'CUSTOMER_UNAVAILABLE',
  'CUSTOMER_REJECTED_ORDER',
  'INCORRECT_ADDRESS',
  'PRODUCT_DAMAGED',
  'VEHICLE_PROBLEM',
  'SELLER_ORDER_MISSING',
  'UNSAFE_DELIVERY_LOCATION',
  'OTHER'
);
create type public.delivery_issue_status as enum ('open', 'resolved');

create table public.delivery_confirmations (
  delivery_id uuid primary key references public.deliveries(id) on delete cascade,
  pin_hash text not null,
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  confirmation_method public.delivery_confirmation_method,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  locked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint delivery_confirmation_shape check (
    (confirmed_at is null and confirmation_method is null)
    or (confirmed_at is not null and confirmation_method is not null)
  )
);

create table public.delivery_pin_confirmation_operations (
  operation_id uuid primary key,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  confirmed boolean not null,
  remaining_attempts integer not null check (remaining_attempts between 0 and 5),
  created_at timestamptz not null default now()
);

create table public.delivery_proofs (
  id uuid primary key default extensions.gen_random_uuid(),
  delivery_id uuid not null unique references public.deliveries(id) on delete cascade,
  transporter_id uuid not null references public.transporter_profiles(id),
  proof_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.delivery_proof_images (
  id uuid primary key,
  delivery_proof_id uuid not null references public.delivery_proofs(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  transporter_id uuid not null references public.transporter_profiles(id),
  storage_path text not null unique,
  thumbnail_path text not null unique,
  mime_type text not null check (mime_type = 'image/jpeg'),
  byte_size integer not null check (byte_size between 1 and 500000),
  width integer not null check (width between 1 and 1280),
  height integer not null check (height between 1 and 1280),
  captured_at timestamptz not null,
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(10, 6) check (longitude between -180 and 180),
  accuracy_meters numeric(8, 2) check (accuracy_meters > 0 and accuracy_meters <= 500),
  upload_status public.delivery_proof_upload_status not null default 'pending',
  upload_expires_at timestamptz not null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  constraint delivery_proof_location_shape check (
    (latitude is null and longitude is null and accuracy_meters is null)
    or (latitude is not null and longitude is not null)
  ),
  constraint delivery_proof_upload_shape check (
    (upload_status = 'pending' and finalized_at is null)
    or (upload_status = 'ready' and finalized_at is not null)
    or upload_status = 'invalidated'
  ),
  unique (id, delivery_id, transporter_id)
);

create table public.delivery_issues (
  id uuid primary key default extensions.gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  reported_by_user_id uuid not null references auth.users(id),
  reason public.delivery_issue_reason not null,
  note text check (note is null or char_length(note) <= 500),
  status public.delivery_issue_status not null default 'open',
  reported_delivery_status public.delivery_status not null,
  reported_delivery_version integer not null check (reported_delivery_version > 0),
  resolved_by_user_id uuid references auth.users(id),
  resolution_code text,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 500),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_issue_resolution_shape check (
    (status = 'open' and resolved_by_user_id is null and resolution_code is null and resolved_at is null)
    or (status = 'resolved' and resolved_by_user_id is not null and resolution_code is not null and resolved_at is not null)
  )
);

create table public.delivery_issue_operations (
  operation_id uuid primary key,
  delivery_issue_id uuid not null references public.delivery_issues(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  action text not null check (action in ('reported', 'resolved')),
  created_at timestamptz not null default now()
);

create index delivery_proof_images_ready_idx
  on public.delivery_proof_images (delivery_id, finalized_at desc, id)
  where upload_status = 'ready';
create index delivery_issues_open_idx
  on public.delivery_issues (created_at, delivery_id, id)
  where status = 'open';
create index delivery_issues_delivery_idx
  on public.delivery_issues (delivery_id, created_at desc, id);

create trigger delivery_confirmations_set_updated_at before update on public.delivery_confirmations
for each row execute function public.set_updated_at();
create trigger delivery_proofs_set_updated_at before update on public.delivery_proofs
for each row execute function public.set_updated_at();
create trigger delivery_issues_set_updated_at before update on public.delivery_issues
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'delivery-proof-images', 'delivery-proof-images', false, 500000, array['image/jpeg']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.rotate_delivery_pin(
  p_delivery_id uuid,
  p_consumer_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_record public.deliveries;
  random_bytes bytea;
  pin_value text;
  expiry_value timestamptz := now() + interval '24 hours';
begin
  select delivery.* into delivery_record
  from public.deliveries delivery
  join public.delivery_groups delivery_group on delivery_group.id = delivery.delivery_group_id
  where delivery.id = p_delivery_id and delivery_group.consumer_id = p_consumer_user_id
  for update of delivery;
  if delivery_record.id is null then
    raise exception 'delivery not found' using errcode = 'P0002';
  end if;
  if delivery_record.status not in (
    'assigned', 'arrived_at_market', 'picked_up', 'in_transit', 'arrived_at_customer'
  ) then
    raise exception 'delivery PIN is unavailable for this status' using errcode = '23514';
  end if;

  random_bytes := extensions.gen_random_bytes(6);
  pin_value :=
    (pg_catalog.get_byte(random_bytes, 0) % 10)::text ||
    (pg_catalog.get_byte(random_bytes, 1) % 10)::text ||
    (pg_catalog.get_byte(random_bytes, 2) % 10)::text ||
    (pg_catalog.get_byte(random_bytes, 3) % 10)::text ||
    (pg_catalog.get_byte(random_bytes, 4) % 10)::text ||
    (pg_catalog.get_byte(random_bytes, 5) % 10)::text;

  insert into public.delivery_confirmations (
    delivery_id, pin_hash, expires_at, confirmed_at, confirmation_method,
    failed_attempts, locked_at
  ) values (
    p_delivery_id, extensions.crypt(pin_value, extensions.gen_salt('bf', 10)), expiry_value,
    null, null, 0, null
  ) on conflict (delivery_id) do update
  set pin_hash = excluded.pin_hash,
      expires_at = excluded.expires_at,
      confirmed_at = null,
      confirmation_method = null,
      failed_attempts = 0,
      locked_at = null;

  return jsonb_build_object(
    'deliveryId', p_delivery_id,
    'pin', pin_value,
    'expiresAt', expiry_value
  );
end;
$$;

create or replace function public.confirm_delivery_consumer_pin(
  p_delivery_id uuid,
  p_rider_user_id uuid,
  p_pin text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_record public.deliveries;
  confirmation_record public.delivery_confirmations;
  existing_operation public.delivery_pin_confirmation_operations;
  confirmed_value boolean := false;
  remaining_value integer;
begin
  select * into existing_operation
  from public.delivery_pin_confirmation_operations where operation_id = p_operation_id;
  if existing_operation.operation_id is not null then
    if existing_operation.delivery_id <> p_delivery_id
      or existing_operation.actor_user_id <> p_rider_user_id then
      raise exception 'operation id was already used for another PIN confirmation'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'deliveryId', p_delivery_id, 'confirmed', existing_operation.confirmed,
      'remainingAttempts', existing_operation.remaining_attempts,
      'operationId', p_operation_id, 'duplicate', true
    );
  end if;
  if p_pin !~ '^[0-9]{6}$' then
    raise exception 'delivery PIN must contain six digits' using errcode = '22023';
  end if;

  select * into delivery_record from public.deliveries where id = p_delivery_id for update;
  if delivery_record.id is null then raise exception 'delivery not found' using errcode = 'P0002'; end if;
  if delivery_record.status <> 'arrived_at_customer' then
    raise exception 'customer arrival is required before PIN confirmation' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.transporter_profiles transporter
    where transporter.id = delivery_record.assigned_transporter_id
      and transporter.user_id = p_rider_user_id
      and transporter.verification_status = 'approved'
  ) then
    raise exception 'delivery is not assigned to this approved rider' using errcode = '42501';
  end if;

  select * into confirmation_record
  from public.delivery_confirmations where delivery_id = p_delivery_id for update;
  if confirmation_record.delivery_id is null then
    raise exception 'consumer delivery PIN has not been generated' using errcode = 'P0002';
  end if;
  if confirmation_record.confirmed_at is not null then
    confirmed_value := true;
  elsif confirmation_record.expires_at <= now() then
    raise exception 'DELIVERY_PIN_EXPIRED' using errcode = '23514';
  elsif confirmation_record.locked_at is not null or confirmation_record.failed_attempts >= 5 then
    raise exception 'DELIVERY_PIN_LOCKED' using errcode = '23514';
  elsif extensions.crypt(p_pin, confirmation_record.pin_hash) = confirmation_record.pin_hash then
    confirmed_value := true;
    update public.delivery_confirmations
    set confirmed_at = now(), confirmation_method = 'pin'
    where delivery_id = p_delivery_id;
  else
    update public.delivery_confirmations
    set failed_attempts = least(5, failed_attempts + 1),
        locked_at = case when failed_attempts + 1 >= 5 then now() else locked_at end
    where delivery_id = p_delivery_id
    returning * into confirmation_record;
  end if;

  select * into confirmation_record
  from public.delivery_confirmations where delivery_id = p_delivery_id;
  remaining_value := greatest(0, 5 - confirmation_record.failed_attempts);
  insert into public.delivery_pin_confirmation_operations (
    operation_id, delivery_id, actor_user_id, confirmed, remaining_attempts
  ) values (p_operation_id, p_delivery_id, p_rider_user_id, confirmed_value, remaining_value);

  return jsonb_build_object(
    'deliveryId', p_delivery_id, 'confirmed', confirmed_value,
    'confirmedAt', confirmation_record.confirmed_at,
    'remainingAttempts', remaining_value,
    'locked', confirmation_record.locked_at is not null,
    'operationId', p_operation_id, 'duplicate', false
  );
end;
$$;

create or replace function public.ensure_delivery_proof(
  p_delivery_id uuid,
  p_rider_user_id uuid,
  p_suggested_proof_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_record public.deliveries;
  transporter_record public.transporter_profiles;
  proof_record public.delivery_proofs;
begin
  select * into delivery_record from public.deliveries where id = p_delivery_id for update;
  if delivery_record.id is null then raise exception 'delivery not found' using errcode = 'P0002'; end if;
  select * into transporter_record from public.transporter_profiles
  where id = delivery_record.assigned_transporter_id and user_id = p_rider_user_id;
  if transporter_record.id is null or transporter_record.verification_status <> 'approved' then
    raise exception 'delivery is not assigned to this approved rider' using errcode = '42501';
  end if;
  if delivery_record.status <> 'arrived_at_customer' then
    raise exception 'proof is only accepted after customer arrival' using errcode = '23514';
  end if;
  select * into proof_record from public.delivery_proofs where delivery_id = p_delivery_id;
  if proof_record.id is null then
    insert into public.delivery_proofs (id, delivery_id, transporter_id)
    values (p_suggested_proof_id, p_delivery_id, transporter_record.id)
    returning * into proof_record;
  elsif proof_record.transporter_id <> transporter_record.id then
    raise exception 'delivery proof belongs to another rider' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'proofId', proof_record.id,
    'deliveryId', proof_record.delivery_id,
    'transporterId', proof_record.transporter_id
  );
end;
$$;

create or replace function public.create_delivery_proof_image_intent(
  p_delivery_id uuid,
  p_rider_user_id uuid,
  p_proof_id uuid,
  p_image_id uuid,
  p_storage_path text,
  p_thumbnail_path text,
  p_mime_type text,
  p_byte_size integer,
  p_width integer,
  p_height integer,
  p_captured_at timestamptz,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_accuracy_meters numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  proof_record public.delivery_proofs;
  existing_image public.delivery_proof_images;
begin
  perform public.ensure_delivery_proof(p_delivery_id, p_rider_user_id, p_proof_id);
  select * into proof_record from public.delivery_proofs where id = p_proof_id for update;
  if p_mime_type <> 'image/jpeg' or p_byte_size < 1 or p_byte_size > 500000
    or p_width < 1 or p_width > 1280 or p_height < 1 or p_height > 1280
    or p_captured_at < now() - interval '24 hours' or p_captured_at > now() + interval '5 minutes' then
    raise exception 'invalid delivery proof image metadata' using errcode = '22023';
  end if;
  if p_storage_path <> p_delivery_id::text || '/' || proof_record.transporter_id::text || '/' || p_image_id::text || '/original.jpg'
    or p_thumbnail_path <> p_delivery_id::text || '/' || proof_record.transporter_id::text || '/' || p_image_id::text || '/thumbnail.jpg' then
    raise exception 'delivery proof paths do not match their identities' using errcode = '22023';
  end if;
  select * into existing_image from public.delivery_proof_images where id = p_image_id;
  if existing_image.id is not null then
    if existing_image.delivery_id <> p_delivery_id
      or existing_image.delivery_proof_id <> p_proof_id
      or existing_image.storage_path <> p_storage_path
      or existing_image.thumbnail_path <> p_thumbnail_path then
      raise exception 'image id was already used for another proof' using errcode = '23505';
    end if;
    return jsonb_build_object('imageId', existing_image.id, 'duplicate', true);
  end if;
  if (select count(*) from public.delivery_proof_images image where image.delivery_proof_id = p_proof_id and image.upload_status <> 'invalidated') >= 2 then
    raise exception 'a delivery may have at most two proof images' using errcode = '23514';
  end if;

  insert into public.delivery_proof_images (
    id, delivery_proof_id, delivery_id, transporter_id, storage_path, thumbnail_path,
    mime_type, byte_size, width, height, captured_at, latitude, longitude,
    accuracy_meters, upload_expires_at
  ) values (
    p_image_id, p_proof_id, p_delivery_id, proof_record.transporter_id,
    p_storage_path, p_thumbnail_path, p_mime_type, p_byte_size, p_width, p_height,
    p_captured_at, p_latitude, p_longitude, p_accuracy_meters, now() + interval '2 hours'
  );
  return jsonb_build_object('imageId', p_image_id, 'duplicate', false);
end;
$$;

create or replace function public.finalize_delivery_proof_image(
  p_delivery_id uuid,
  p_rider_user_id uuid,
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
  image_record public.delivery_proof_images;
begin
  select image.* into image_record
  from public.delivery_proof_images image
  join public.transporter_profiles transporter on transporter.id = image.transporter_id
  where image.id = p_image_id and image.delivery_id = p_delivery_id
    and transporter.user_id = p_rider_user_id
  for update of image;
  if image_record.id is null then raise exception 'delivery proof image not found' using errcode = 'P0002'; end if;
  if image_record.upload_status = 'ready' then
    return jsonb_build_object(
      'proofId', image_record.delivery_proof_id, 'imageId', image_record.id,
      'status', 'ready', 'duplicate', true
    );
  end if;
  if image_record.upload_status = 'invalidated' or image_record.upload_expires_at <= now() then
    raise exception 'delivery proof upload intent is unavailable' using errcode = '23514';
  end if;
  if image_record.storage_path <> p_storage_path or image_record.thumbnail_path <> p_thumbnail_path
    or image_record.mime_type <> p_mime_type or image_record.byte_size <> p_byte_size
    or image_record.width <> p_width or image_record.height <> p_height then
    raise exception 'finalized proof metadata does not match its intent' using errcode = '22023';
  end if;

  update public.delivery_proof_images
  set upload_status = 'ready', finalized_at = now()
  where id = image_record.id;
  update public.delivery_proofs
  set proof_completed_at = coalesce(proof_completed_at, now())
  where id = image_record.delivery_proof_id;
  return jsonb_build_object(
    'proofId', image_record.delivery_proof_id, 'imageId', image_record.id,
    'status', 'ready', 'duplicate', false
  );
end;
$$;

create or replace function public.enforce_delivery_completion_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'delivered' and old.status is distinct from new.status and not (
    exists (
      select 1 from public.delivery_confirmations confirmation
      where confirmation.delivery_id = new.id and confirmation.confirmed_at is not null
    ) and exists (
      select 1 from public.delivery_proofs proof
      join public.delivery_proof_images image on image.delivery_proof_id = proof.id
      where proof.delivery_id = new.id and proof.proof_completed_at is not null
        and image.upload_status = 'ready'
    )
  ) then
    raise exception 'DELIVERY_PROOF_REQUIRED' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger deliveries_require_completion_evidence
before update of status on public.deliveries
for each row execute function public.enforce_delivery_completion_evidence();

create or replace function public.complete_delivery(
  p_delivery_id uuid,
  p_rider_user_id uuid,
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
  next_version integer;
begin
  select * into delivery_record from public.deliveries where id = p_delivery_id for update;
  if delivery_record.id is null then raise exception 'delivery not found' using errcode = 'P0002'; end if;
  select * into existing_operation from public.delivery_operations where operation_id = p_operation_id;
  if existing_operation.operation_id is not null then
    if existing_operation.delivery_id <> p_delivery_id
      or existing_operation.actor_user_id <> p_rider_user_id
      or existing_operation.requested_status <> 'delivered' then
      raise exception 'operation id was already used for another completion' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'deliveryId', p_delivery_id, 'status', existing_operation.result_status,
      'version', existing_operation.result_version, 'operationId', p_operation_id,
      'duplicate', true
    );
  end if;
  if delivery_record.version <> p_expected_version then raise exception 'delivery version conflict' using errcode = '40001'; end if;
  if delivery_record.status <> 'arrived_at_customer' then raise exception 'delivery is not ready for completion' using errcode = '23514'; end if;
  if not exists (
    select 1 from public.transporter_profiles transporter
    where transporter.id = delivery_record.assigned_transporter_id
      and transporter.user_id = p_rider_user_id and transporter.verification_status = 'approved'
  ) then raise exception 'delivery is not assigned to this approved rider' using errcode = '42501'; end if;
  if not (
    exists (select 1 from public.delivery_confirmations confirmation where confirmation.delivery_id = p_delivery_id and confirmation.confirmed_at is not null)
    and exists (
      select 1 from public.delivery_proofs proof
      join public.delivery_proof_images image on image.delivery_proof_id = proof.id
      where proof.delivery_id = p_delivery_id and proof.proof_completed_at is not null and image.upload_status = 'ready'
    )
  ) then raise exception 'DELIVERY_PROOF_REQUIRED' using errcode = '23514'; end if;

  next_version := delivery_record.version + 1;
  insert into public.delivery_operations (
    operation_id, delivery_id, actor_user_id, actor_type, requested_status,
    expected_version, result_status, result_version, reason, metadata
  ) values (
    p_operation_id, p_delivery_id, p_rider_user_id, 'rider', 'delivered',
    p_expected_version, 'delivered', next_version, 'proof_and_pin_verified', '{}'::jsonb
  );
  update public.deliveries
  set status = 'delivered', version = next_version, completed_at = now()
  where id = p_delivery_id;
  update public.transporter_profiles
  set availability = 'available', availability_updated_at = now()
  where id = delivery_record.assigned_transporter_id;
  insert into public.delivery_status_history (
    delivery_id, operation_id, actor_user_id, actor_type, from_status, to_status,
    from_version, to_version, reason
  ) values (
    p_delivery_id, p_operation_id, p_rider_user_id, 'rider', delivery_record.status,
    'delivered', delivery_record.version, next_version, 'proof_and_pin_verified'
  );
  insert into public.delivery_audit_events (
    delivery_id, operation_id, actor_user_id, actor_type, action,
    previous_status, next_status, details
  ) values (
    p_delivery_id, p_operation_id, p_rider_user_id, 'rider', 'delivery.completed',
    delivery_record.status, 'delivered', jsonb_build_object('proofVerified', true, 'consumerConfirmed', true)
  );
  return jsonb_build_object(
    'deliveryId', p_delivery_id, 'status', 'delivered', 'version', next_version,
    'operationId', p_operation_id, 'duplicate', false
  );
end;
$$;

create or replace function public.report_delivery_issue(
  p_delivery_id uuid,
  p_rider_user_id uuid,
  p_reason text,
  p_note text,
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
  existing_operation public.delivery_issue_operations;
  issue_id_value uuid;
  consumer_user_id uuid;
  notification_event_id uuid;
begin
  if p_reason not in (
    'CUSTOMER_UNAVAILABLE', 'CUSTOMER_REJECTED_ORDER', 'INCORRECT_ADDRESS',
    'PRODUCT_DAMAGED', 'VEHICLE_PROBLEM', 'SELLER_ORDER_MISSING',
    'UNSAFE_DELIVERY_LOCATION', 'OTHER'
  ) or char_length(coalesce(p_note, '')) > 500 then
    raise exception 'invalid delivery issue' using errcode = '22023';
  end if;
  select * into existing_operation from public.delivery_issue_operations where operation_id = p_operation_id;
  if existing_operation.operation_id is not null then
    return jsonb_build_object('issueId', existing_operation.delivery_issue_id, 'duplicate', true);
  end if;
  select * into delivery_record from public.deliveries where id = p_delivery_id for update;
  if delivery_record.id is null then raise exception 'delivery not found' using errcode = 'P0002'; end if;
  if delivery_record.version <> p_expected_version then raise exception 'delivery version conflict' using errcode = '40001'; end if;
  if delivery_record.status not in ('assigned', 'arrived_at_market', 'picked_up', 'in_transit', 'arrived_at_customer') then
    raise exception 'issues cannot be reported for this delivery status' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.transporter_profiles transporter
    where transporter.id = delivery_record.assigned_transporter_id and transporter.user_id = p_rider_user_id
  ) then raise exception 'delivery is not assigned to this rider' using errcode = '42501'; end if;

  insert into public.delivery_issues (
    delivery_id, reported_by_user_id, reason, note,
    reported_delivery_status, reported_delivery_version
  ) values (
    p_delivery_id, p_rider_user_id, p_reason::public.delivery_issue_reason,
    nullif(trim(coalesce(p_note, '')), ''), delivery_record.status, delivery_record.version
  ) returning id into issue_id_value;
  insert into public.delivery_issue_operations (operation_id, delivery_issue_id, actor_user_id, action)
  values (p_operation_id, issue_id_value, p_rider_user_id, 'reported');
  select delivery_group.consumer_id into consumer_user_id
  from public.delivery_groups delivery_group
  where delivery_group.id = delivery_record.delivery_group_id;
  insert into public.notification_events (
    user_id, event_type, entity_type, entity_id, title, body, priority, payload, dedupe_key
  ) values (
    consumer_user_id, 'delivery.issue', 'delivery', p_delivery_id,
    'Delivery needs attention',
    'Your rider reported a delivery problem. Operations has been notified.',
    'critical',
    jsonb_build_object('deliveryId', p_delivery_id, 'issueId', issue_id_value, 'reason', p_reason),
    'delivery:' || p_delivery_id::text || ':issue:' || issue_id_value::text
  ) returning id into notification_event_id;
  insert into public.notification_deliveries (event_id, channel)
  values (notification_event_id, 'push'), (notification_event_id, 'sms')
  on conflict (event_id, channel) do nothing;
  insert into public.notification_audit_events (notification_event_id, action, details)
  values (notification_event_id, 'notification.enqueued', jsonb_build_object('channels', jsonb_build_array('push', 'sms')));
  return jsonb_build_object('issueId', issue_id_value, 'deliveryId', p_delivery_id, 'status', 'open', 'duplicate', false);
end;
$$;

create or replace function public.enqueue_delivery_status_notification()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  consumer_user_id uuid;
  message_title text;
  message_body text;
begin
  if old.status is not distinct from new.status
    or new.status not in ('arrived_at_market', 'picked_up', 'in_transit', 'arrived_at_customer', 'delivered') then
    return new;
  end if;
  select consumer_id into consumer_user_id
  from public.delivery_groups where id = new.delivery_group_id;
  message_title := case new.status
    when 'arrived_at_market' then 'Rider at the market'
    when 'picked_up' then 'Order collected'
    when 'in_transit' then 'Order on the way'
    when 'arrived_at_customer' then 'Rider has arrived'
    when 'delivered' then 'Delivery completed'
    else 'Delivery update'
  end;
  message_body := case new.status
    when 'arrived_at_market' then 'Your rider is collecting the seller orders.'
    when 'picked_up' then 'Every seller handover is confirmed.'
    when 'in_transit' then 'Your order is travelling to your delivery address.'
    when 'arrived_at_customer' then 'Meet your rider and check the order before confirming delivery.'
    when 'delivered' then 'Delivery was confirmed with your PIN and private evidence is available in your order.'
    else 'Your delivery status is now ' || replace(new.status::text, '_', ' ') || '.'
  end;
  insert into public.notification_events (
    user_id, event_type, entity_type, entity_id, title, body, priority, payload, dedupe_key
  ) values (
    consumer_user_id,
    case when new.status = 'delivered' then 'delivery.completed' else 'delivery.status_changed' end,
    'delivery', new.id, message_title, message_body,
    (case when new.status = 'arrived_at_customer' then 'critical' else 'normal' end)::public.notification_priority,
    jsonb_build_object('deliveryId', new.id, 'status', new.status, 'version', new.version),
    'delivery:' || new.id::text || ':status:' || new.status::text || ':version:' || new.version::text
  ) on conflict (dedupe_key) do nothing;
  insert into public.notification_deliveries (event_id, channel)
  select event.id, 'push' from public.notification_events event
  where event.dedupe_key = 'delivery:' || new.id::text || ':status:' || new.status::text || ':version:' || new.version::text
  on conflict (event_id, channel) do nothing;
  insert into public.notification_audit_events (notification_event_id, action, details)
  select event.id, 'notification.enqueued', jsonb_build_object('channel', 'push')
  from public.notification_events event
  where event.dedupe_key = 'delivery:' || new.id::text || ':status:' || new.status::text || ':version:' || new.version::text
    and not exists (
      select 1 from public.notification_audit_events audit
      where audit.notification_event_id = event.id and audit.action = 'notification.enqueued'
    );
  return new;
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
  if delivery_record.id is null then raise exception 'delivery not found' using errcode = 'P0002'; end if;
  select * into existing_operation from public.delivery_operations where operation_id = p_operation_id;
  if existing_operation.operation_id is not null then
    if existing_operation.delivery_id <> p_delivery_id or existing_operation.actor_user_id <> p_dispatcher_user_id then
      raise exception 'operation id was already used for another dispatcher assignment' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'deliveryId', p_delivery_id, 'transporterId', p_transporter_id,
      'status', existing_operation.result_status, 'version', existing_operation.result_version,
      'operationId', p_operation_id, 'duplicate', true
    );
  end if;
  if delivery_record.version <> p_expected_version then raise exception 'delivery version conflict' using errcode = '40001'; end if;
  if (not p_reassign and delivery_record.status not in ('unassigned', 'offering'))
    or (p_reassign and delivery_record.status not in ('assigned', 'arrived_at_market')) then
    raise exception 'delivery cannot be assigned in this status' using errcode = '23514';
  end if;
  if p_reassign and exists (
    select 1 from public.delivery_pickups pickup where pickup.delivery_id = p_delivery_id and pickup.status = 'collected'
  ) then raise exception 'collected deliveries cannot be reassigned' using errcode = '23514'; end if;
  select * into transporter_record from public.transporter_profiles where id = p_transporter_id for update;
  if transporter_record.id is null or transporter_record.verification_status <> 'approved'
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
    update public.transporter_profiles set availability = 'available', availability_updated_at = now()
    where id = previous_transporter_id;
  end if;
  update public.deliveries
  set assigned_transporter_id = p_transporter_id, status = 'assigned',
      assigned_at = now(), version = next_version
  where id = p_delivery_id;
  update public.transporter_profiles set availability = 'assigned', availability_updated_at = now()
  where id = p_transporter_id;

  insert into public.delivery_operations (
    operation_id, delivery_id, actor_user_id, actor_type, requested_status,
    expected_version, result_status, result_version, reason, metadata
  ) values (
    p_operation_id, p_delivery_id, p_dispatcher_user_id, 'dispatcher', 'assigned',
    p_expected_version, 'assigned', next_version, p_reason,
    jsonb_build_object('transporterId', p_transporter_id, 'previousTransporterId', previous_transporter_id, 'reassignment', p_reassign)
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
    jsonb_build_object('transporterId', p_transporter_id, 'previousTransporterId', previous_transporter_id, 'reason', p_reason)
  );
  return jsonb_build_object(
    'deliveryId', p_delivery_id, 'transporterId', p_transporter_id,
    'previousTransporterId', previous_transporter_id, 'status', 'assigned',
    'version', next_version, 'operationId', p_operation_id, 'duplicate', false
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
  if p_resolution_code not in ('RESUME_DELIVERY', 'CUSTOMER_CONTACTED', 'RIDER_REASSIGNED', 'RETURN_AUTHORIZED', 'CLOSED_NO_ACTION')
    or char_length(trim(coalesce(p_resolution_note, ''))) < 3
    or char_length(p_resolution_note) > 500 then
    raise exception 'valid issue resolution and note are required' using errcode = '22023';
  end if;
  select * into existing_operation from public.delivery_issue_operations where operation_id = p_operation_id;
  if existing_operation.operation_id is not null then
    return jsonb_build_object('issueId', existing_operation.delivery_issue_id, 'status', 'resolved', 'duplicate', true);
  end if;
  select * into issue_record from public.delivery_issues where id = p_issue_id for update;
  if issue_record.id is null then raise exception 'delivery issue not found' using errcode = 'P0002'; end if;
  if issue_record.status <> 'open' then raise exception 'delivery issue is already resolved' using errcode = '23514'; end if;
  update public.delivery_issues
  set status = 'resolved', resolved_by_user_id = p_dispatcher_user_id,
      resolution_code = p_resolution_code, resolution_note = p_resolution_note,
      resolved_at = now()
  where id = p_issue_id;
  insert into public.delivery_issue_operations (operation_id, delivery_issue_id, actor_user_id, action)
  values (p_operation_id, p_issue_id, p_dispatcher_user_id, 'resolved');
  return jsonb_build_object('issueId', p_issue_id, 'deliveryId', issue_record.delivery_id, 'status', 'resolved', 'duplicate', false);
end;
$$;

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
        'consumerPhoneNumber', delivery_group.phone_number,
        'transporter', case when transporter.id is null then null else jsonb_build_object(
          'id', transporter.id,
          'displayName', transporter.display_name,
          'availability', transporter.availability,
          'phoneNumber', rider_user.phone
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
      left join public.transporter_profiles transporter on transporter.id = delivery.assigned_transporter_id
      left join auth.users rider_user on rider_user.id = transporter.user_id
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

create or replace function public.get_dispatcher_nearby_riders(
  p_delivery_id uuid,
  p_radius_km numeric default 10
)
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
    'phoneNumber', rider_user.phone,
    'distanceKm', candidate.distance_km,
    'locationIsFresh', true,
    'locationReceivedAt', candidate.location_received_at
  ) order by candidate.distance_km, transporter.display_name), '[]'::jsonb)
  from public.find_nearby_transporters(p_delivery_id, p_radius_km, 100) candidate
  join public.transporter_profiles transporter on transporter.id = candidate.transporter_id
  join auth.users rider_user on rider_user.id = transporter.user_id;
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
  if p_action not in ('CANCEL_ASSIGNMENT', 'MARK_CUSTOMER_UNAVAILABLE', 'RETURN_TO_MARKET', 'CONTACT_RIDER', 'CONTACT_CONSUMER')
    or char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'valid dispatcher action and reason are required' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_delivery_id::text, 0));
  select * into delivery_record from public.deliveries where id = p_delivery_id for update;
  if delivery_record.id is null then raise exception 'delivery not found' using errcode = 'P0002'; end if;
  select * into existing_operation from public.delivery_operations where operation_id = p_operation_id;
  if existing_operation.operation_id is not null then
    if existing_operation.delivery_id <> p_delivery_id
      or existing_operation.actor_user_id <> p_dispatcher_user_id
      or existing_operation.metadata->>'dispatcherAction' <> p_action then
      raise exception 'operation id was already used for another dispatcher action' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'deliveryId', p_delivery_id, 'action', p_action, 'status', existing_operation.result_status,
      'version', existing_operation.result_version, 'operationId', p_operation_id,
      'contactPhoneNumber', existing_operation.metadata->>'contactPhoneNumber', 'duplicate', true
    );
  end if;
  if delivery_record.version <> p_expected_version then raise exception 'delivery version conflict' using errcode = '40001'; end if;
  next_status := delivery_record.status;
  next_version := delivery_record.version;

  if p_action = 'CANCEL_ASSIGNMENT' then
    if delivery_record.status not in ('assigned', 'arrived_at_market') or exists (
      select 1 from public.delivery_pickups pickup where pickup.delivery_id = p_delivery_id and pickup.status = 'collected'
    ) then raise exception 'assignment cannot be cancelled in this state' using errcode = '23514'; end if;
    next_status := 'unassigned'; next_version := delivery_record.version + 1;
  elsif p_action = 'MARK_CUSTOMER_UNAVAILABLE' then
    if delivery_record.status not in ('in_transit', 'arrived_at_customer') then raise exception 'customer unavailable is invalid in this state' using errcode = '23514'; end if;
    next_status := 'customer_unavailable'; next_version := delivery_record.version + 1;
  elsif p_action = 'RETURN_TO_MARKET' then
    if delivery_record.status not in ('picked_up', 'in_transit', 'arrived_at_customer', 'customer_unavailable') then raise exception 'return is invalid in this state' using errcode = '23514'; end if;
    next_status := 'returned'; next_version := delivery_record.version + 1;
  elsif p_action = 'CONTACT_CONSUMER' then
    select delivery_group.phone_number into contact_phone from public.delivery_groups delivery_group where delivery_group.id = delivery_record.delivery_group_id;
  elsif p_action = 'CONTACT_RIDER' then
    if delivery_record.assigned_transporter_id is null then raise exception 'delivery has no assigned rider' using errcode = '23514'; end if;
    select transporter.* into transporter_record from public.transporter_profiles transporter where transporter.id = delivery_record.assigned_transporter_id;
    select rider_user.phone into contact_phone from auth.users rider_user where rider_user.id = transporter_record.user_id;
  end if;

  insert into public.delivery_operations (
    operation_id, delivery_id, actor_user_id, actor_type, requested_status, expected_version,
    result_status, result_version, reason, metadata
  ) values (
    p_operation_id, p_delivery_id, p_dispatcher_user_id, 'dispatcher', next_status,
    p_expected_version, next_status, next_version, p_reason,
    jsonb_strip_nulls(jsonb_build_object('dispatcherAction', p_action, 'contactPhoneNumber', contact_phone, 'transporterId', delivery_record.assigned_transporter_id))
  );
  if next_version > delivery_record.version then
    if p_action = 'CANCEL_ASSIGNMENT' then
      update public.deliveries set status = next_status, version = next_version,
        assigned_transporter_id = null, assigned_at = null where id = p_delivery_id;
    else
      update public.deliveries set status = next_status, version = next_version where id = p_delivery_id;
    end if;
    if delivery_record.assigned_transporter_id is not null then
      update public.transporter_profiles set availability = 'available', availability_updated_at = now()
      where id = delivery_record.assigned_transporter_id;
    end if;
    insert into public.delivery_status_history (
      delivery_id, operation_id, actor_user_id, actor_type, from_status, to_status,
      from_version, to_version, reason
    ) values (
      p_delivery_id, p_operation_id, p_dispatcher_user_id, 'dispatcher', delivery_record.status,
      next_status, delivery_record.version, next_version, p_reason
    );
  end if;
  insert into public.delivery_audit_events (
    delivery_id, operation_id, actor_user_id, actor_type, action, previous_status, next_status, details
  ) values (
    p_delivery_id, p_operation_id, p_dispatcher_user_id, 'dispatcher', 'delivery.' || lower(p_action),
    delivery_record.status, next_status, jsonb_strip_nulls(jsonb_build_object('reason', p_reason, 'contactPhoneNumber', contact_phone))
  );
  return jsonb_build_object(
    'deliveryId', p_delivery_id, 'action', p_action, 'status', next_status,
    'version', next_version, 'operationId', p_operation_id,
    'contactPhoneNumber', contact_phone, 'duplicate', false
  );
end;
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
    'locationIsFresh', location.received_at >= now() - interval '10 minutes',
    'locationReceivedAt', location.received_at
  ) order by
    case transporter.availability when 'available' then 0 when 'offline' then 1 else 2 end,
    transporter.display_name, transporter.id), '[]'::jsonb)
  from public.transporter_profiles transporter
  left join public.transporter_locations_current location on location.transporter_id = transporter.id
  where transporter.verification_status = 'approved';
$$;

alter table public.delivery_confirmations enable row level security;
alter table public.delivery_pin_confirmation_operations enable row level security;
alter table public.delivery_proofs enable row level security;
alter table public.delivery_proof_images enable row level security;
alter table public.delivery_issues enable row level security;
alter table public.delivery_issue_operations enable row level security;

revoke all on table public.delivery_confirmations from public;
revoke all on table public.delivery_pin_confirmation_operations from public;
revoke all on table public.delivery_proofs from public;
revoke all on table public.delivery_proof_images from public;
revoke all on table public.delivery_issues from public;
revoke all on table public.delivery_issue_operations from public;

revoke all on function public.rotate_delivery_pin(uuid, uuid) from public;
revoke all on function public.confirm_delivery_consumer_pin(uuid, uuid, text, uuid) from public;
revoke all on function public.ensure_delivery_proof(uuid, uuid, uuid) from public;
revoke all on function public.create_delivery_proof_image_intent(uuid, uuid, uuid, uuid, text, text, text, integer, integer, integer, timestamptz, numeric, numeric, numeric) from public;
revoke all on function public.finalize_delivery_proof_image(uuid, uuid, uuid, text, text, text, integer, integer, integer) from public;
revoke all on function public.complete_delivery(uuid, uuid, integer, uuid) from public;
revoke all on function public.report_delivery_issue(uuid, uuid, text, text, integer, uuid) from public;
revoke all on function public.dispatcher_assign_delivery(uuid, uuid, uuid, text, integer, uuid, boolean) from public;
revoke all on function public.resolve_delivery_issue(uuid, uuid, text, text, uuid) from public;
revoke all on function public.get_dispatcher_delivery_board() from public;
revoke all on function public.get_dispatcher_riders() from public;
revoke all on function public.get_dispatcher_nearby_riders(uuid, numeric) from public;
revoke all on function public.dispatcher_delivery_action(uuid, uuid, text, text, integer, uuid) from public;

grant execute on function public.rotate_delivery_pin(uuid, uuid) to service_role;
grant execute on function public.confirm_delivery_consumer_pin(uuid, uuid, text, uuid) to service_role;
grant execute on function public.ensure_delivery_proof(uuid, uuid, uuid) to service_role;
grant execute on function public.create_delivery_proof_image_intent(uuid, uuid, uuid, uuid, text, text, text, integer, integer, integer, timestamptz, numeric, numeric, numeric) to service_role;
grant execute on function public.finalize_delivery_proof_image(uuid, uuid, uuid, text, text, text, integer, integer, integer) to service_role;
grant execute on function public.complete_delivery(uuid, uuid, integer, uuid) to service_role;
grant execute on function public.report_delivery_issue(uuid, uuid, text, text, integer, uuid) to service_role;
grant execute on function public.dispatcher_assign_delivery(uuid, uuid, uuid, text, integer, uuid, boolean) to service_role;
grant execute on function public.resolve_delivery_issue(uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.get_dispatcher_delivery_board() to service_role;
grant execute on function public.get_dispatcher_riders() to service_role;
grant execute on function public.get_dispatcher_nearby_riders(uuid, numeric) to service_role;
grant execute on function public.dispatcher_delivery_action(uuid, uuid, text, text, integer, uuid) to service_role;
