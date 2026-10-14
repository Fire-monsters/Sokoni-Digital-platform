-- Operations-only records. No stock, provider, delivery status or checkout status changes.
create table public.operations_order_investigations (
  id uuid primary key default extensions.gen_random_uuid(),
  checkout_id uuid not null references public.customer_checkouts(id),
  status text not null default 'open' check (status in ('open','resolved')),
  opened_by uuid not null references auth.users(id),
  opened_at timestamptz not null default now(),
  resolution text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  version integer not null default 1 check (version > 0),
  check ((status='resolved') = (resolution is not null and resolved_by is not null and resolved_at is not null))
);
create unique index operations_active_investigation_idx on public.operations_order_investigations(checkout_id) where status='open';
create index operations_investigation_checkout_idx on public.operations_order_investigations(checkout_id,opened_at desc);
alter table public.order_support_notes add column investigation_id uuid references public.operations_order_investigations(id);
create table public.operations_payment_records (
  id uuid primary key default extensions.gen_random_uuid(),
  payment_attempt_id uuid not null references public.payment_attempts(id),
  external_reference text not null unique check (char_length(trim(external_reference)) between 3 and 160),
  observed_amount_ugx bigint check (observed_amount_ugx > 0),
  observed_at timestamptz not null,
  note text not null check (char_length(trim(note)) between 3 and 2000),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now()
);
create index operations_payment_record_payment_idx on public.operations_payment_records(payment_attempt_id,recorded_at desc);
create table public.operations_delivery_notes (
  id uuid primary key default extensions.gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id),
  note text not null check (char_length(trim(note)) between 3 and 2000),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index operations_delivery_notes_delivery_idx on public.operations_delivery_notes(delivery_id,created_at desc);
create table public.operations_catalogue_notes (
  id uuid primary key default extensions.gen_random_uuid(),
  listing_id uuid references public.listings(id),
  price_request_id uuid references public.listing_price_requests(id),
  note text not null check (char_length(trim(note)) between 3 and 1000),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check ((listing_id is not null)::integer + (price_request_id is not null)::integer = 1)
);
create index operations_catalogue_notes_listing_idx on public.operations_catalogue_notes(listing_id,created_at desc);
create index operations_catalogue_notes_price_idx on public.operations_catalogue_notes(price_request_id,created_at desc);

alter table public.operations_order_investigations enable row level security;
alter table public.operations_payment_records enable row level security;
alter table public.operations_delivery_notes enable row level security;
alter table public.operations_catalogue_notes enable row level security;
revoke all on public.operations_order_investigations,public.operations_payment_records,public.operations_delivery_notes,public.operations_catalogue_notes from public,anon,authenticated;
grant all on public.operations_order_investigations,public.operations_payment_records,public.operations_delivery_notes,public.operations_catalogue_notes to service_role;

-- Domain mutations and canonical audit insert together. Existing operation tables supply replay semantics.
create function public.operations_investigation_command(
  p_order_id uuid,p_actor uuid,p_action text,p_input jsonb,p_context jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare operation uuid := (p_input->>'operationId')::uuid; prior public.order_support_operations;
  case_record public.operations_order_investigations; checkout public.customer_checkouts;
  note_id uuid; result jsonb; old_status text;
begin
  if operation is null or p_action not in ('open','notes','resolve') then raise exception 'Invalid investigation command.' using errcode='22023'; end if;
  if not exists(select 1 from public.staff_members s join public.role_permissions r on r.role=s.role where s.user_id=p_actor and s.status='active' and r.permission='orders.support') then raise exception 'Investigation permission required.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(operation::text,35));
  select * into prior from public.order_support_operations where operation_id=operation;
  if found then
    if prior.checkout_id<>p_order_id or prior.actor_id<>p_actor or prior.action<>'investigation-'||p_action or prior.input<>p_input then raise exception 'Operation key reused.' using errcode='23505'; end if;
    return prior.response||jsonb_build_object('duplicate',true);
  end if;
  select * into checkout from public.customer_checkouts where id=p_order_id for share;
  if not found then raise exception 'Order not found.' using errcode='P0002'; end if;
  if p_action='open' then
    if exists(select 1 from public.operations_order_investigations where checkout_id=p_order_id and status='open') then raise exception 'An active investigation already exists.' using errcode='23505'; end if;
    insert into public.operations_order_investigations(checkout_id,opened_by) values(p_order_id,p_actor) returning * into case_record;
  else
    select * into case_record from public.operations_order_investigations where id=(p_input->>'investigationId')::uuid and checkout_id=p_order_id for update;
    if not found then raise exception 'Investigation not found.' using errcode='P0002'; end if;
    if case_record.status<>'open' then raise exception 'Investigation already resolved.' using errcode='23514'; end if;
    if case_record.version is distinct from (p_input->>'expectedVersion')::integer then raise exception 'Investigation version conflict.' using errcode='40001'; end if;
    if p_action='notes' then
      if char_length(trim(coalesce(p_input->>'note',''))) not between 3 and 2000 then raise exception 'A note is required.' using errcode='22023'; end if;
      insert into public.order_support_notes(checkout_id,author_id,note,investigation_id) values(p_order_id,p_actor,trim(p_input->>'note'),case_record.id) returning id into note_id;
      update public.operations_order_investigations set version=version+1 where id=case_record.id returning * into case_record;
    else
      if char_length(trim(coalesce(p_input->>'resolution',''))) not between 3 and 2000 then raise exception 'A resolution is required.' using errcode='22023'; end if;
      update public.operations_order_investigations set status='resolved',resolution=trim(p_input->>'resolution'),resolved_by=p_actor,resolved_at=now(),version=version+1 where id=case_record.id returning * into case_record;
    end if;
  end if;
  perform public.set_sensitive_audit_context(p_context,operation);
  result:=jsonb_build_object('id',case_record.id,'orderId',p_order_id,'status',case_record.status,'version',case_record.version,'noteId',note_id,'duplicate',false);
  insert into public.order_support_operations(operation_id,checkout_id,actor_id,action,input,response) values(operation,p_order_id,p_actor,'investigation-'||p_action,p_input,result);
  insert into public.audit_events(source_type,source_id,actor_staff_id,action,entity_type,entity_id,reason,operation_id,request_id,previous_state,new_state,details)
  values('operations_investigation',operation::text,p_actor,'order.investigation_'||p_action,'order',p_order_id,
    coalesce(nullif(trim(p_input->>'resolution'),''),nullif(trim(p_input->>'note'),''),nullif(trim(p_input->>'reason'),''),p_action),operation,p_context->>'requestId',
    jsonb_build_object('status',case when p_action='open' then null else 'open' end),jsonb_build_object('status',case_record.status,'version',case_record.version),jsonb_build_object('investigationId',case_record.id,'noteId',note_id));
  return result;
end; $$;

create function public.operations_payment_record_command(
  p_payment_id uuid,p_actor uuid,p_input jsonb,p_context jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare operation uuid := (p_input->>'operationId')::uuid; prior public.payment_finance_operations; payment public.payment_attempts; row public.operations_payment_records; result jsonb;
begin
  if operation is null then raise exception 'Operation ID required.' using errcode='22023'; end if;
  if not exists(select 1 from public.staff_members s join public.role_permissions r on r.role=s.role where s.user_id=p_actor and s.status='active' and r.permission='payments.reconcile') then raise exception 'Payment review permission required.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(operation::text,35));
  select * into prior from public.payment_finance_operations where operation_id=operation;
  if found then
    if prior.actor_id<>p_actor or prior.payment_attempt_id<>p_payment_id or prior.action<>'record-observation' or prior.input<>p_input then raise exception 'Operation key reused.' using errcode='23505'; end if;
    return prior.response||jsonb_build_object('duplicate',true);
  end if;
  select * into payment from public.payment_attempts where id=p_payment_id for share;
  if not found then raise exception 'Payment not found.' using errcode='P0002'; end if;
  if char_length(trim(coalesce(p_input->>'externalReference',''))) not between 3 and 160 or char_length(trim(coalesce(p_input->>'note',''))) not between 3 and 2000 then raise exception 'Reference and note required.' using errcode='22023'; end if;
  insert into public.operations_payment_records(payment_attempt_id,external_reference,observed_amount_ugx,observed_at,note,recorded_by)
    values(p_payment_id,trim(p_input->>'externalReference'),nullif(p_input->>'amount','')::bigint,(p_input->>'observedAt')::timestamptz,trim(p_input->>'note'),p_actor) returning * into row;
  result:=jsonb_build_object('id',row.id,'paymentAttemptId',p_payment_id,'status','recorded','duplicate',false);
  insert into public.payment_finance_operations(operation_id,actor_id,payment_attempt_id,action,input,response) values(operation,p_actor,p_payment_id,'record-observation',p_input,result);
  perform public.set_sensitive_audit_context(p_context,operation);
  insert into public.payment_audit_events(payment_attempt_id,actor_user_id,action,previous_status,next_status,details)
    values(p_payment_id,p_actor,'payment.record_observation',payment.status,payment.status,jsonb_build_object('operationId',operation,'reference',row.external_reference,'note',row.note,'recordId',row.id));
  -- The existing payment-audit trigger writes canonical audit in the same transaction.
  return result;
end; $$;

create function public.operations_delivery_note_command(
  p_delivery_id uuid,p_actor uuid,p_input jsonb,p_context jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare operation uuid := (p_input->>'operationId')::uuid; prior public.delivery_operations; delivery public.deliveries; row public.operations_delivery_notes; result jsonb;
begin
  if operation is null then raise exception 'Operation ID required.' using errcode='22023'; end if;
  if not exists(select 1 from public.staff_members s join public.role_permissions r on r.role=s.role where s.user_id=p_actor and s.status='active' and r.permission='deliveries.manage') then raise exception 'Delivery management permission required.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(operation::text,35));
  select * into prior from public.delivery_operations where operation_id=operation;
  if found then
    if prior.delivery_id<>p_delivery_id or prior.actor_user_id<>p_actor or prior.metadata->>'note' is distinct from p_input->>'note' then raise exception 'Operation key reused.' using errcode='23505'; end if;
    return jsonb_build_object('id',prior.metadata->>'noteId','deliveryId',p_delivery_id,'status','recorded','duplicate',true);
  end if;
  select * into delivery from public.deliveries where id=p_delivery_id for update;
  if not found then raise exception 'Delivery not found.' using errcode='P0002'; end if;
  if delivery.version is distinct from (p_input->>'expectedVersion')::integer then raise exception 'Delivery version conflict.' using errcode='40001'; end if;
  if char_length(trim(coalesce(p_input->>'note',''))) not between 3 and 2000 then raise exception 'Note required.' using errcode='22023'; end if;
  insert into public.operations_delivery_notes(delivery_id,note,actor_id) values(p_delivery_id,trim(p_input->>'note'),p_actor) returning * into row;
  insert into public.delivery_operations(operation_id,delivery_id,actor_user_id,actor_type,requested_status,expected_version,result_status,result_version,reason,metadata)
    values(operation,p_delivery_id,p_actor,'dispatcher',delivery.status,delivery.version,delivery.status,delivery.version,left(row.note,500),jsonb_build_object('note',row.note,'noteId',row.id));
  perform public.set_sensitive_audit_context(p_context,operation);
  insert into public.delivery_audit_events(delivery_id,operation_id,actor_user_id,actor_type,action,previous_status,next_status,details)
    values(p_delivery_id,operation,p_actor,'dispatcher','delivery.note_added',delivery.status,delivery.status,jsonb_build_object('noteId',row.id,'note',row.note));
  result:=jsonb_build_object('id',row.id,'deliveryId',p_delivery_id,'status','recorded','duplicate',false);
  return result;
end; $$;

revoke all on function public.operations_investigation_command(uuid,uuid,text,jsonb,jsonb),public.operations_payment_record_command(uuid,uuid,jsonb,jsonb),public.operations_delivery_note_command(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.operations_investigation_command(uuid,uuid,text,jsonb,jsonb),public.operations_payment_record_command(uuid,uuid,jsonb,jsonb),public.operations_delivery_note_command(uuid,uuid,jsonb,jsonb) to service_role;

alter table public.catalogue_review_operations drop constraint catalogue_review_operations_action_check;
alter table public.catalogue_review_operations add constraint catalogue_review_operations_action_check
  check (action in ('listing.approve','listing.request_changes','price_request.approve','price_request.reject','listing.note','price_request.note'));
create function public.operations_catalogue_note_command(
  p_entity_id uuid,p_actor uuid,p_kind text,p_input jsonb,p_context jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare operation uuid := (p_input->>'operationId')::uuid; prior public.catalogue_review_operations;
  row public.operations_catalogue_notes; listing public.listings; price public.listing_price_requests; result jsonb;
begin
  if operation is null or p_kind not in ('listing','price_request') or char_length(trim(coalesce(p_input->>'note',''))) not between 3 and 1000 then raise exception 'Invalid review note.' using errcode='22023'; end if;
  if not exists(select 1 from public.staff_members s join public.role_permissions r on r.role=s.role where s.user_id=p_actor and s.status='active' and r.permission='catalogue.review') then raise exception 'Catalogue review permission required.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(operation::text,35));
  select * into prior from public.catalogue_review_operations where operation_id=operation;
  if found then
    if prior.entity_id<>p_entity_id or prior.actor_user_id<>p_actor or prior.action<>p_kind||'.note' or prior.review_note is distinct from trim(p_input->>'note') then raise exception 'Operation key reused.' using errcode='23505'; end if;
    return prior.result||jsonb_build_object('duplicate',true);
  end if;
  if p_kind='listing' then
    select * into listing from public.listings where id=p_entity_id for share;
    if not found then raise exception 'Listing not found.' using errcode='P0002'; end if;
    if listing.version is distinct from (p_input->>'expectedVersion')::integer then raise exception 'Listing version conflict.' using errcode='40001'; end if;
    insert into public.operations_catalogue_notes(listing_id,note,actor_id) values(p_entity_id,trim(p_input->>'note'),p_actor) returning * into row;
  else
    select * into price from public.listing_price_requests where id=p_entity_id for share;
    if not found then raise exception 'Price request not found.' using errcode='P0002'; end if;
    insert into public.operations_catalogue_notes(price_request_id,note,actor_id) values(p_entity_id,trim(p_input->>'note'),p_actor) returning * into row;
  end if;
  result:=jsonb_build_object('id',row.id,'entityId',p_entity_id,'status','recorded','duplicate',false);
  insert into public.catalogue_review_operations(operation_id,action,entity_id,actor_user_id,expected_version,review_note,result)
    values(operation,p_kind||'.note',p_entity_id,p_actor,nullif(p_input->>'expectedVersion','')::integer,row.note,result);
  perform public.set_sensitive_audit_context(p_context,operation);
  insert into public.catalogue_audit_events(actor_user_id,action,entity_type,entity_id,previous_state,next_state)
    values(p_actor,p_kind||'.note',p_kind,p_entity_id,null,jsonb_build_object('reviewNote',row.note,'noteId',row.id));
  return result;
end; $$;
revoke all on function public.operations_catalogue_note_command(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.operations_catalogue_note_command(uuid,uuid,text,jsonb,jsonb) to service_role;
