-- Application content is private; operational eligibility remains on existing profiles.
create table public.account_applications (
  id uuid primary key,
  type text not null check (type in ('vendor', 'rider')),
  user_id uuid references auth.users(id),
  seller_id uuid unique references public.sellers(id),
  transporter_id uuid unique references public.transporter_profiles(id),
  status text not null check (status in ('draft','pending_review','in_review','changes_requested','approved','rejected','suspended')),
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  version integer not null default 1 check (version > 0),
  reviewer_id uuid references public.staff_members(user_id),
  review_started_at timestamptz,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reason text,
  issues text[] not null default '{}',
  unique(user_id, type),
  check ((type = 'vendor' and seller_id = id and transporter_id is null)
    or (type = 'rider' and transporter_id = id and seller_id is null))
);
create index account_applications_queue_idx on public.account_applications(type,status,submitted_at desc,id);

create table public.application_review_events (
  id uuid primary key default extensions.gen_random_uuid(),
  application_id uuid not null references public.account_applications(id),
  actor_user_id uuid not null references auth.users(id),
  action text not null,
  from_status text not null,
  to_status text not null,
  reason text,
  issues text[] not null default '{}',
  internal_notes text,
  created_at timestamptz not null default now()
);
create index application_review_events_application_idx on public.application_review_events(application_id,created_at,id);
create table public.application_review_operations (
  operation_id uuid primary key,
  command jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create table public.application_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  application_id uuid not null references public.account_applications(id),
  document_type text not null check (document_type in ('national_id','stall_photo','market_confirmation','motorcycle_photo','association_proof')),
  storage_path text not null unique,
  content_type text not null check (content_type in ('image/jpeg','image/png','application/pdf')),
  byte_size integer not null check (byte_size between 1 and 5000000),
  status text not null default 'pending' check (status in ('pending','ready')),
  created_at timestamptz not null default now()
);
create index application_documents_application_idx on public.application_documents(application_id,status);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('verification-documents','verification-documents',false,5000000,array['image/jpeg','image/png','application/pdf'])
on conflict (id) do nothing;

-- Keep the Phase 2 application IDs stable, including profiles created by existing workflows.
create function public.register_account_application() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'sellers' then
    insert into public.account_applications(id,type,seller_id,status,submitted_at)
    values (new.id,'vendor',new.id,case when new.verification_status = 'pending' then 'pending_review' else new.verification_status::text end,new.created_at);
  else
    insert into public.account_applications(id,type,transporter_id,user_id,status,submitted_at)
    values (new.id,'rider',new.id,new.user_id,case when new.verification_status = 'pending' then 'pending_review' else new.verification_status::text end,new.created_at);
  end if;
  return new;
end;
$$;
insert into public.account_applications(id,type,seller_id,user_id,status,submitted_at)
select s.id,'vendor',s.id,sa.user_id,case when s.verification_status='pending' then 'pending_review' else s.verification_status::text end,s.created_at
from public.sellers s left join public.seller_accounts sa on sa.seller_id=s.id;
insert into public.account_applications(id,type,transporter_id,user_id,status,submitted_at)
select id,'rider',id,user_id,case when verification_status='pending' then 'pending_review' else verification_status::text end,created_at
from public.transporter_profiles;
create trigger sellers_register_application after insert on public.sellers for each row execute function public.register_account_application();
create trigger transporters_register_application after insert on public.transporter_profiles for each row execute function public.register_account_application();
create function public.link_vendor_application_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.account_applications set user_id=new.user_id where seller_id=new.seller_id;
  return new;
end;
$$;
create trigger seller_accounts_link_application after insert or update of user_id on public.seller_accounts
for each row execute function public.link_vendor_application_owner();

create function public.application_missing_requirements(p_id uuid) returns text[]
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

create function public.get_application_review(p_id uuid) returns jsonb
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
  left join public.sellers s on s.id=a.seller_id left join public.markets m on m.id=s.market_id
  left join public.transporter_profiles t on t.id=a.transporter_id
  left join public.staff_members sm on sm.user_id=a.reviewer_id where a.id=p_id;
$$;

create function public.review_account_application(p_id uuid,p_actor uuid,p_action text,p_version integer,
  p_operation_id uuid,p_reason text default null,p_notes text default null,p_issues text[] default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.account_applications; cmd jsonb; prior public.application_review_operations; result jsonb; target text;
begin
  if p_action is null or p_action not in ('start-review','approve','request-changes','reject','suspend','notes')
    or p_operation_id is null or p_version is null or p_version<1 then
    raise exception 'Invalid review command.' using errcode='22023'; end if;
  if not exists(select 1 from public.staff_members sm join public.role_permissions rp on rp.role=sm.role
    where sm.user_id=p_actor and sm.status='active' and rp.permission=case when p_action='suspend' then 'users.manage' else 'applications.review' end) then
    raise exception 'Staff permission required.' using errcode='42501'; end if;
  if p_action in ('request-changes','reject','suspend') and length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'A reason is required.' using errcode='22023'; end if;
  if p_action='notes' and length(trim(coalesce(p_notes,'')))<3 then raise exception 'A private note is required.' using errcode='22023'; end if;
  if length(coalesce(p_reason,''))>1000 or length(coalesce(p_notes,''))>2000 or cardinality(p_issues)>20 then
    raise exception 'Review input is too long.' using errcode='22023'; end if;
  cmd:=jsonb_build_object('id',p_id,'actor',p_actor,'action',p_action,'version',p_version,'reason',p_reason,'notes',p_notes,'issues',p_issues);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  select * into prior from public.application_review_operations where operation_id=p_operation_id;
  if found then
    if prior.command<>cmd then raise exception 'Operation ID reused with different input.' using errcode='23505'; end if;
    return prior.result||jsonb_build_object('duplicate',true);
  end if;
  select * into a from public.account_applications where id=p_id for update;
  if not found then raise exception 'Application not found.' using errcode='P0002'; end if;
  if a.version<>p_version then raise exception 'Application changed. Refresh before reviewing.' using errcode='40001'; end if;
  if a.user_id=p_actor then raise exception 'You cannot review your own application.' using errcode='42501'; end if;
  target:=a.status;
  if p_action='start-review' then
    if a.status<>'pending_review' then raise exception 'Application is not pending review.' using errcode='23514'; end if;
    target:='in_review';
  elsif p_action in ('approve','request-changes','reject') then
    if a.status<>'in_review' or a.reviewer_id is distinct from p_actor then
      raise exception 'Only the assigned reviewer can decide an application in review.' using errcode='23514'; end if;
    target:=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'changes_requested' end;
    if p_action='approve' and cardinality(public.application_missing_requirements(a.id))>0 then
      raise exception 'Application requirements are incomplete.' using errcode='23514'; end if;
  elsif p_action='suspend' then
    if a.status<>'approved' then raise exception 'Only approved applications can be suspended.' using errcode='23514'; end if;
    target:='suspended';
  end if;
  if p_action in ('approve','reject','suspend') then
    if a.type='vendor' then
      update public.sellers set verification_status=target::public.seller_verification_status,
        business_name=coalesce(a.details#>>'{stallDetails,businessName}',business_name),
        market_id=coalesce((a.details#>>'{stallDetails,marketId}')::uuid,market_id) where id=a.seller_id;
    else
      -- Match dispatch lock order; active deliveries must be reassigned/resolved first.
      perform 1 from public.transporter_profiles where id=a.transporter_id for update;
      if p_action='suspend' and exists(select 1 from public.deliveries where assigned_transporter_id=a.transporter_id
        and status not in ('delivered','assignment_cancelled','returned','pickup_failed','delivery_failed')) then
        raise exception 'Resolve or reassign active deliveries before suspension.' using errcode='23514'; end if;
      update public.delivery_offers set status='withdrawn',withdrawn_at=now()
        where transporter_id=a.transporter_id and status='pending' and p_action='suspend';
      update public.transporter_profiles set verification_status=target::public.transporter_verification_status,
        availability='offline',availability_updated_at=now(),updated_at=now(),
        display_name=coalesce(a.details#>>'{personalDetails,fullName}',display_name) where id=a.transporter_id;
    end if;
  end if;
  update public.account_applications set status=target,version=version+1,updated_at=now(),
    reviewer_id=case when p_action='start-review' then p_actor else reviewer_id end,
    review_started_at=case when p_action='start-review' then now() else review_started_at end,
    reason=case when p_action in ('request-changes','reject','suspend') then p_reason else reason end,
    issues=case when p_action in ('request-changes','reject','suspend') then p_issues else issues end where id=a.id;
  insert into public.application_review_events(application_id,actor_user_id,action,from_status,to_status,reason,issues,internal_notes)
    values(a.id,p_actor,p_action,a.status,target,p_reason,p_issues,p_notes);
  result:=jsonb_build_object('applicationId',a.id,'status',target,'version',a.version+1,'operationId',p_operation_id,'duplicate',false);
  insert into public.application_review_operations(operation_id,command,result) values(p_operation_id,cmd,result);
  return result;
end;
$$;

create function public.save_account_application(p_user uuid,p_type text,p_details jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.account_applications; profile_id uuid;
begin
  if p_type not in ('vendor','rider') or jsonb_typeof(p_details)<>'object' then raise exception 'Invalid application.' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text||p_type,0));
  select * into a from public.account_applications where user_id=p_user and type=p_type for update;
  if not found then
    if p_type='vendor' then
      insert into public.sellers(business_name) values(coalesce(nullif(p_details#>>'{stallDetails,businessName}',''),'New vendor')) returning id into profile_id;
      insert into public.seller_accounts(seller_id,user_id) values(profile_id,p_user);
    else
      insert into public.transporter_profiles(user_id,display_name) values(p_user,coalesce(nullif(p_details#>>'{personalDetails,fullName}',''),'New rider')) returning id into profile_id;
    end if;
    update public.account_applications set status='draft' where id=profile_id;
    select * into a from public.account_applications where id=profile_id for update;
  end if;
  if a.status not in ('draft','changes_requested') then raise exception 'Application is not editable.' using errcode='23514'; end if;
  update public.account_applications set details=details||p_details,version=version+1,updated_at=now() where id=a.id;
  return jsonb_build_object('applicationId',a.id,'role',a.type,'applicationStatus',a.status,'saved',true);
end;
$$;

create function public.submit_account_application(p_user uuid,p_type text,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.account_applications; cmd jsonb; prior public.application_review_operations; result jsonb;
begin
  cmd:=jsonb_build_object('action','submit','userId',p_user,'type',p_type);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  select * into prior from public.application_review_operations where operation_id=p_operation_id;
  if found then
    if prior.command<>cmd then raise exception 'Operation ID reused with different input.' using errcode='23505'; end if;
    return prior.result||jsonb_build_object('duplicate',true);
  end if;
  select * into a from public.account_applications where user_id=p_user and type=p_type for update;
  if not found then raise exception 'Application not found.' using errcode='P0002'; end if;
  if a.status not in ('draft','changes_requested') then raise exception 'Application cannot be submitted.' using errcode='23514'; end if;
  if cardinality(public.application_missing_requirements(a.id))>0 then raise exception 'Application requirements are incomplete.' using errcode='23514'; end if;
  update public.account_applications set status='pending_review',version=version+1,submitted_at=now(),updated_at=now(),
    reviewer_id=null,review_started_at=null,reason=null,issues='{}' where id=a.id;
  insert into public.application_review_events(application_id,actor_user_id,action,from_status,to_status)
    values(a.id,p_user,'submit',a.status,'pending_review');
  result:=jsonb_build_object('applicationId',a.id,'role',a.type,'applicationStatus','pending_review','duplicate',false);
  insert into public.application_review_operations(operation_id,command,result) values(p_operation_id,cmd,result);
  return result;
end;
$$;

-- Serialize document writes with submission and review. Applicants cannot change evidence after submission.
create function public.register_application_document(p_user uuid,p_type text,p_document_type text,p_content_type text,p_byte_size integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.account_applications; d public.application_documents; doc_id uuid:=extensions.gen_random_uuid();
begin
  select * into a from public.account_applications where user_id=p_user and type=p_type for update;
  if not found then raise exception 'Save the application before uploading documents.' using errcode='P0002'; end if;
  if a.status not in ('draft','changes_requested') then raise exception 'Application is not editable.' using errcode='23514'; end if;
  if p_document_type<>all(case when p_type='vendor' then array['national_id','stall_photo','market_confirmation'] else array['national_id','motorcycle_photo','association_proof'] end) then
    raise exception 'Invalid document type.' using errcode='22023'; end if;
  insert into public.application_documents(id,application_id,document_type,storage_path,content_type,byte_size)
    values(doc_id,a.id,p_document_type,p_user::text||'/'||a.id::text||'/'||doc_id::text,p_content_type,p_byte_size) returning * into d;
  return to_jsonb(d);
end;
$$;
create function public.complete_application_document(p_user uuid,p_document_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.account_applications; d public.application_documents;
begin
  select * into d from public.application_documents where id=p_document_id;
  select * into a from public.account_applications where id=d.application_id and user_id=p_user for update;
  if not found then raise exception 'Document not found.' using errcode='P0002'; end if;
  if a.status not in ('draft','changes_requested') then raise exception 'Application is not editable.' using errcode='23514'; end if;
  if not exists(select 1 from storage.objects where bucket_id='verification-documents' and name=d.storage_path
    and (metadata->>'size')::bigint=d.byte_size and metadata->>'mimetype'=d.content_type) then
    raise exception 'Uploaded document size or type does not match.' using errcode='23514'; end if;
  update public.application_documents set status='ready' where id=d.id;
  update public.account_applications set version=version+1,updated_at=now() where id=a.id;
  return jsonb_build_object('documentId',d.id,'status','uploaded');
end;
$$;

alter table public.account_applications enable row level security;
alter table public.application_documents enable row level security;
alter table public.application_review_events enable row level security;
alter table public.application_review_operations enable row level security;
revoke all on public.account_applications,public.application_documents,public.application_review_events,public.application_review_operations from public,anon,authenticated;
grant all on public.account_applications,public.application_documents,public.application_review_events,public.application_review_operations to service_role;
revoke all on function public.register_account_application(),public.link_vendor_application_owner(),public.application_missing_requirements(uuid),
  public.get_application_review(uuid),public.review_account_application(uuid,uuid,text,integer,uuid,text,text,text[]),
  public.save_account_application(uuid,text,jsonb),public.submit_account_application(uuid,text,uuid),
  public.register_application_document(uuid,text,text,text,integer),public.complete_application_document(uuid,uuid) from public,anon,authenticated;
grant execute on function public.application_missing_requirements(uuid),public.get_application_review(uuid),
  public.review_account_application(uuid,uuid,text,integer,uuid,text,text,text[]),public.save_account_application(uuid,text,jsonb),
  public.submit_account_application(uuid,text,uuid),public.register_application_document(uuid,text,text,text,integer),
  public.complete_application_document(uuid,uuid) to service_role;

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
    left join public.markets m on m.id=s.market_id
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
