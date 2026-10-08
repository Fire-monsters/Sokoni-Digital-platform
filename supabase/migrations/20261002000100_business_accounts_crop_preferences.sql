-- Business onboarding is separate from retail seller ownership and applications.
create table public.agricultural_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  active boolean not null default true
);
create table public.agricultural_product_categories (
  product_id uuid not null references public.agricultural_products(id),
  category text not null check (category in ('cash','food')),
  primary key(product_id, category)
);
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  kind text not null check (kind in ('farmer','sme','warehouse')),
  name text not null check (length(btrim(name)) between 2 and 160),
  location text not null check (length(btrim(location)) between 2 and 300),
  status text not null default 'draft' check (status in
    ('draft','submitted','changes_requested','approved','rejected','suspended')),
  review_reason text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, kind)
);
create table public.business_memberships (
  business_id uuid not null references public.businesses(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','employee')),
  active boolean not null default true,
  primary key (business_id, user_id)
);
create index business_memberships_user_idx on public.business_memberships(user_id, business_id) where active;
create index businesses_status_idx on public.businesses(status, created_at, id);
create table public.business_crop_categories (
  business_id uuid not null references public.businesses(id),
  category text not null check (category in ('cash','food')),
  primary key(business_id, category)
);
create table public.business_product_preferences (
  business_id uuid not null references public.businesses(id),
  product_id uuid not null references public.agricultural_products(id),
  primary key(business_id, product_id)
);
create table public.business_audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  actor_id uuid not null references auth.users(id),
  action text not null,
  previous_status text,
  new_status text not null,
  reason text,
  operation_id uuid not null unique,
  created_at timestamptz not null default now()
);
create table public.business_operations (
  operation_id uuid primary key,
  actor_id uuid not null references auth.users(id),
  action text not null,
  business_id uuid not null references public.businesses(id),
  input jsonb not null,
  result jsonb not null
);
create table public.business_auth_limits (
  key_hash text primary key,
  window_start timestamptz not null,
  attempts integer not null
);

insert into public.agricultural_products(slug,name) values
 ('coffee','Coffee'),('maize','Maize'),('coconut','Coconut'),('beans','Beans'),
 ('rice','Rice'),('cassava','Cassava'),('sweet-potatoes','Sweet potatoes'),('bananas','Bananas');
insert into public.agricultural_product_categories(product_id,category)
 select id, 'cash' from public.agricultural_products where slug in ('coffee','maize','coconut');
insert into public.agricultural_product_categories(product_id,category)
 select id, 'food' from public.agricultural_products where slug in
 ('maize','beans','rice','cassava','sweet-potatoes','bananas');

create function public.is_business_member(p_business_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.business_memberships
 where business_id=p_business_id and user_id=auth.uid() and active);
$$;
revoke all on function public.is_business_member(uuid) from public, anon;
grant execute on function public.is_business_member(uuid) to authenticated;

alter table public.agricultural_products enable row level security;
alter table public.agricultural_product_categories enable row level security;
alter table public.businesses enable row level security;
alter table public.business_memberships enable row level security;
alter table public.business_crop_categories enable row level security;
alter table public.business_product_preferences enable row level security;
alter table public.business_audit_events enable row level security;
alter table public.business_operations enable row level security;
alter table public.business_auth_limits enable row level security;

revoke all on public.agricultural_products, public.agricultural_product_categories,
 public.businesses, public.business_memberships, public.business_crop_categories,
 public.business_product_preferences, public.business_audit_events,
 public.business_operations, public.business_auth_limits from anon, authenticated;
grant select on public.agricultural_products, public.agricultural_product_categories,
 public.businesses, public.business_memberships, public.business_crop_categories,
 public.business_product_preferences to authenticated;
create policy agricultural_products_read on public.agricultural_products for select to authenticated using (active);
create policy agricultural_categories_read on public.agricultural_product_categories for select to authenticated
 using (exists(select 1 from public.agricultural_products p where p.id=product_id and p.active));
create policy businesses_read on public.businesses for select to authenticated using (public.is_business_member(id));
create policy business_memberships_read on public.business_memberships for select to authenticated using (user_id=auth.uid());
create policy business_categories_read on public.business_crop_categories for select to authenticated using (public.is_business_member(business_id));
create policy business_products_read on public.business_product_preferences for select to authenticated using (public.is_business_member(business_id));

-- Only server functions can mutate business records. Actor IDs come from verified tokens.
create function public.business_snapshot(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',b.id,'kind',b.kind,'name',b.name,'location',b.location,
 'status',b.status,'version',b.version,'reviewReason',b.review_reason,
 'canTrade', b.status='approved',
 'categories',coalesce((select jsonb_agg(category order by category) from public.business_crop_categories where business_id=b.id),'[]'::jsonb),
 'productIds',coalesce((select jsonb_agg(product_id order by product_id) from public.business_product_preferences where business_id=b.id),'[]'::jsonb))
 from public.businesses b where b.id=p_id;
$$;

create function public.read_business_accounts(p_actor uuid, p_id uuid default null, p_admin boolean default false,
 p_limit integer default 50, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if p_limit not between 1 and 100 or p_offset not between 0 and 100000 then
   raise exception 'Invalid pagination' using errcode='22023';
 end if;
 if p_admin and not exists(select 1 from public.staff_members s join public.role_permissions r on r.role=s.role
   where s.user_id=p_actor and s.status='active' and r.permission='applications.read') then
   raise exception 'Not authorized' using errcode='42501';
 end if;
 if p_id is not null then
   if not p_admin and not exists(select 1 from public.business_memberships where business_id=p_id and user_id=p_actor and active) then
     raise exception 'Not authorized' using errcode='42501';
   end if;
   if not exists(select 1 from public.businesses where id=p_id) then raise exception 'Business not found' using errcode='P0002'; end if;
   return public.business_snapshot(p_id);
 end if;
 return coalesce((select jsonb_agg(public.business_snapshot(b.id) order by b.created_at,b.id) from
 (select id,created_at from public.businesses b where p_admin or exists
 (select 1 from public.business_memberships m where m.business_id=b.id and m.user_id=p_actor and m.active)
 order by created_at,id limit p_limit offset p_offset) b),'[]'::jsonb);
end;
$$;

create function public.list_agricultural_products(p_category text default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'slug',p.slug,'name',p.name,
 'categories',(select jsonb_agg(category order by category) from public.agricultural_product_categories where product_id=p.id)) order by p.name),'[]'::jsonb)
 from public.agricultural_products p where p.active and (p_category is null or exists
 (select 1 from public.agricultural_product_categories c where c.product_id=p.id and c.category=p_category));
$$;

create function public.command_business_account(p_actor uuid,p_action text,p_operation uuid,p_input jsonb,p_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.businesses; previous text; op public.business_operations; result jsonb;
 categories text[]; products uuid[]; target text;
begin
 if p_operation is null or jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid request' using errcode='22023'; end if;
 -- Serialize identical operation IDs even before a business exists.
 perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
 if not exists(select 1 from auth.users where id=p_actor and phone_confirmed_at is not null)
   and p_action <> 'review' then raise exception 'Verified phone required' using errcode='42501'; end if;
 if p_action='review' then
   if not exists(select 1 from public.staff_members s join public.role_permissions r on r.role=s.role
     where s.user_id=p_actor and s.status='active' and r.permission='applications.review') then
     raise exception 'Not authorized' using errcode='42501'; end if;
 elsif p_action <> 'create' then
   if not exists(select 1 from public.business_memberships where business_id=p_id and user_id=p_actor and role='owner' and active) then
     raise exception 'Owner access required' using errcode='42501'; end if;
 end if;
 select * into op from public.business_operations where operation_id=p_operation;
 if found then
   if op.actor_id<>p_actor or op.action<>p_action or op.input<>p_input or (p_action<>'create' and op.business_id is distinct from p_id) then
     raise exception 'Operation ID reused' using errcode='23505'; end if;
   return op.result;
 end if;
 if p_action='create' then
   if p_input->>'kind' not in ('farmer','sme') or p_input->>'kind' is null then raise exception 'Invalid business kind' using errcode='22023'; end if;
   perform pg_advisory_xact_lock(hashtextextended(p_actor::text || (p_input->>'kind'),0));
   select * into b from public.businesses where owner_id=p_actor and kind=p_input->>'kind' for update;
   if not found then
     insert into public.businesses(owner_id,kind,name,location) values
       (p_actor,p_input->>'kind',btrim(p_input->>'name'),btrim(p_input->>'location')) returning * into b;
     insert into public.business_memberships(business_id,user_id,role) values(b.id,p_actor,'owner');
   end if;
 else
   select * into b from public.businesses where id=p_id for update;
   if not found then raise exception 'Business not found' using errcode='P0002'; end if;
   if (p_input->>'expectedVersion')::integer is distinct from b.version then raise exception 'Version conflict' using errcode='40001'; end if;
   previous := b.status;
   if p_action='profile' then
     if b.status not in ('draft','changes_requested') then raise exception 'Profile cannot be edited in this state' using errcode='23514'; end if;
     update public.businesses set name=coalesce(btrim(p_input->>'name'),name), location=coalesce(btrim(p_input->>'location'),location) where id=b.id;
   elsif p_action='preferences' then
     if b.status in ('rejected','suspended') then raise exception 'Business is inactive' using errcode='23514'; end if;
     select array_agg(value) into categories from jsonb_array_elements_text(p_input->'categories');
     select array_agg(value::uuid) into products from jsonb_array_elements_text(p_input->'productIds');
     if coalesce(cardinality(categories),0) not between 1 and 2 or coalesce(cardinality(products),0) not between 1 and 100
       or exists(select 1 from unnest(categories) c where c not in ('cash','food'))
       or (select count(distinct c) from unnest(categories) c)<>cardinality(categories)
       or (select count(distinct x) from unnest(products) x)<>cardinality(products) then
       raise exception 'Invalid crop preferences' using errcode='22023'; end if;
     if exists(select 1 from unnest(products) x where not exists(select 1 from public.agricultural_products p
       join public.agricultural_product_categories c on c.product_id=p.id
       where p.id=x and p.active and c.category=any(categories))) then
       raise exception 'Product is inactive or outside selected categories' using errcode='22023'; end if;
     delete from public.business_crop_categories where business_id=b.id;
     delete from public.business_product_preferences where business_id=b.id;
     insert into public.business_crop_categories select b.id,c from unnest(categories) c;
     insert into public.business_product_preferences select b.id,x from unnest(products) x;
   elsif p_action='submit' then
     if b.status not in ('draft','changes_requested') then raise exception 'Application cannot be submitted' using errcode='23514'; end if;
     if not exists(select 1 from public.business_crop_categories where business_id=b.id)
       or not exists(select 1 from public.business_product_preferences where business_id=b.id)
       or exists(select 1 from public.business_product_preferences pref where pref.business_id=b.id and not exists
         (select 1 from public.agricultural_products p join public.agricultural_product_categories c on c.product_id=p.id
          join public.business_crop_categories bc on bc.category=c.category and bc.business_id=b.id where p.id=pref.product_id and p.active)) then
       raise exception 'Valid crop preferences required' using errcode='23514'; end if;
     update public.businesses set status='submitted',review_reason=null where id=b.id;
   elsif p_action='review' then
     if exists(select 1 from public.business_memberships where business_id=b.id and user_id=p_actor) or b.owner_id=p_actor then
       raise exception 'Cannot review own business' using errcode='42501'; end if;
     target := p_input->>'status';
     if not ((b.status='submitted' and target in ('approved','rejected','changes_requested')) or
       (b.status='approved' and target='suspended')) or target is null then raise exception 'Invalid review transition' using errcode='23514'; end if;
     if length(btrim(coalesce(p_input->>'reason',''))) not between 3 and 1000 then raise exception 'Reason required' using errcode='22023'; end if;
     update public.businesses set status=target, review_reason=p_input->>'reason' where id=b.id;
   else raise exception 'Unknown business action' using errcode='22023';
   end if;
   update public.businesses set version=version+1,updated_at=now() where id=b.id;
 end if;
 result := public.business_snapshot(b.id);
 insert into public.business_audit_events(business_id,actor_id,action,previous_status,new_status,reason,operation_id)
 values(b.id,p_actor,p_action,previous,result->>'status',p_input->>'reason',p_operation);
 insert into public.business_operations values(p_operation,p_actor,p_action,b.id,p_input,result);
 return result;
end;
$$;

-- Database-backed throttling works across API replicas and stores no raw phone/IP.
create function public.consume_business_auth_limit(p_key text,p_max integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if p_key !~ '^[a-f0-9]{64}$' or p_max not between 1 and 1000 or p_seconds not between 1 and 3600 then
 raise exception 'Invalid rate limit' using errcode='22023'; end if;
 insert into public.business_auth_limits as l values(p_key,clock_timestamp(),1)
 on conflict(key_hash) do update set
 attempts=case when l.window_start <= clock_timestamp()-make_interval(secs=>p_seconds) then 1 else l.attempts+1 end,
 window_start=case when l.window_start <= clock_timestamp()-make_interval(secs=>p_seconds) then clock_timestamp() else l.window_start end
 returning attempts into n;
 delete from public.business_auth_limits where window_start < now()-interval '1 day';
 return n <= p_max;
end;
$$;

revoke all on function public.business_snapshot(uuid),public.read_business_accounts(uuid,uuid,boolean,integer,integer),
 public.list_agricultural_products(text),public.command_business_account(uuid,text,uuid,jsonb,uuid),
 public.consume_business_auth_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.business_snapshot(uuid),public.read_business_accounts(uuid,uuid,boolean,integer,integer),
 public.list_agricultural_products(text),public.command_business_account(uuid,text,uuid,jsonb,uuid),
 public.consume_business_auth_limit(text,integer,integer) to service_role;
