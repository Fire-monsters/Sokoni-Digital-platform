-- Epic 2: canonical taxonomy and business preferences. Keep historical IDs and operations.
create table public.product_categories (
  code text primary key check (code in ('CASH','FOOD')),
  name text not null check (length(btrim(name)) > 0)
);
insert into public.product_categories(code,name) values ('CASH','Cash crops'),('FOOD','Food crops');
alter table public.product_categories enable row level security;
revoke all on public.product_categories from anon, authenticated;
grant select on public.product_categories to authenticated;
create policy product_categories_read on public.product_categories for select to authenticated using (true);

-- Rename in place: memberships, grants and RLS policies retain their identities.
alter table public.agricultural_product_categories rename to product_category_memberships;
alter table public.product_category_memberships rename constraint agricultural_product_categories_pkey to product_category_memberships_pkey;
alter table public.product_category_memberships rename constraint agricultural_product_categories_product_id_fkey to product_category_memberships_product_id_fkey;
alter table public.product_category_memberships drop constraint agricultural_product_categories_category_check;
update public.product_category_memberships set category=upper(category);
alter table public.product_category_memberships add constraint product_category_memberships_category_fkey
 foreign key(category) references public.product_categories(code);

alter table public.business_crop_categories rename to business_category_preferences;
alter table public.business_category_preferences rename constraint business_crop_categories_pkey to business_category_preferences_pkey;
alter table public.business_category_preferences rename constraint business_crop_categories_business_id_fkey to business_category_preferences_business_id_fkey;
alter table public.business_category_preferences drop constraint business_crop_categories_category_check;
update public.business_category_preferences set category=upper(category);
alter table public.business_category_preferences add constraint business_category_preferences_category_fkey
 foreign key(category) references public.product_categories(code);

-- Retire the earlier demonstration seeds. Keep referenced identities archived;
-- remove only unused defaults so fresh databases contain exactly the three crops.
update public.agricultural_products set active=false
 where slug in ('beans','rice','cassava','sweet-potatoes','bananas');
with unused_defaults as (
 select p.id from public.agricultural_products p
 where p.slug in ('beans','rice','cassava','sweet-potatoes','bananas')
 and not exists(select 1 from public.business_product_preferences pref where pref.product_id=p.id)
 and not exists(select 1 from public.business_operations op
   where coalesce(op.input->'productIds','[]'::jsonb) ? p.id::text
      or coalesce(op.result->'productIds','[]'::jsonb) ? p.id::text)
), removed_memberships as (
 delete from public.product_category_memberships where product_id in (select id from unused_defaults) returning product_id
)
delete from public.agricultural_products where id in (select id from unused_defaults);
insert into public.agricultural_products(slug,name) values
 ('coffee','Coffee'),('maize','Maize'),('coconut','Coconut') on conflict(slug) do nothing;
insert into public.product_category_memberships(product_id,category)
 select id,'CASH' from public.agricultural_products where slug in ('coffee','maize','coconut')
 on conflict do nothing;
insert into public.product_category_memberships(product_id,category)
 select id,'FOOD' from public.agricultural_products where slug='maize'
 on conflict do nothing;

-- Normalize legacy lowercase payloads only at comparison/response time.
-- Do not rewrite the stored input/result of an old transaction or operation.
create function public.canonical_crop_payload(p_input jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select case when jsonb_typeof(p_input->'categories')='array' then
 jsonb_set(p_input,'{categories}',coalesce((select jsonb_agg(upper(value) order by ord)
 from jsonb_array_elements_text(p_input->'categories') with ordinality as x(value,ord)),'[]'::jsonb))
 else p_input end;
$$;
revoke all on function public.canonical_crop_payload(jsonb) from public,anon,authenticated;
grant execute on function public.canonical_crop_payload(jsonb) to service_role;

create or replace function public.business_snapshot(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',b.id,'kind',b.kind,'name',b.name,'location',b.location,
 'status',b.status,'version',b.version,'reviewReason',b.review_reason,
 'canTrade', b.status='approved',
 'categories',coalesce((select jsonb_agg(category order by category) from public.business_category_preferences where business_id=b.id),'[]'::jsonb),
 'productIds',coalesce((select jsonb_agg(product_id order by product_id) from public.business_product_preferences where business_id=b.id),'[]'::jsonb))
 from public.businesses b where b.id=p_id;
$$;

create or replace function public.list_agricultural_products(p_category text default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'slug',p.slug,'name',p.name,
 'categories',(select jsonb_agg(category order by category) from public.product_category_memberships where product_id=p.id)) order by p.name),'[]'::jsonb)
 from public.agricultural_products p where p.active and (p_category is null or exists
 (select 1 from public.product_category_memberships c where c.product_id=p.id and c.category=upper(p_category)));
$$;

create or replace function public.command_business_account(p_actor uuid,p_action text,p_operation uuid,p_input jsonb,p_id uuid default null)
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
   if op.actor_id<>p_actor or op.action<>p_action or public.canonical_crop_payload(op.input)<>public.canonical_crop_payload(p_input) or (p_action<>'create' and op.business_id is distinct from p_id) then
     raise exception 'Operation ID reused' using errcode='23505'; end if;
   return public.canonical_crop_payload(op.result);
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
     select array_agg(upper(value)) into categories from jsonb_array_elements_text(p_input->'categories');
     select array_agg(value::uuid) into products from jsonb_array_elements_text(p_input->'productIds');
     if coalesce(cardinality(categories),0) not between 1 and 2 or coalesce(cardinality(products),0) not between 1 and 100
       or exists(select 1 from unnest(categories) c where c not in ('CASH','FOOD'))
       or (select count(distinct c) from unnest(categories) c)<>cardinality(categories)
       or (select count(distinct x) from unnest(products) x)<>cardinality(products) then
       raise exception 'Invalid crop preferences' using errcode='22023'; end if;
     if exists(select 1 from unnest(products) x where not exists(select 1 from public.agricultural_products p
       join public.product_category_memberships c on c.product_id=p.id
       where p.id=x and p.active and c.category=any(categories))) then
       raise exception 'Product is inactive or outside selected categories' using errcode='22023'; end if;
     delete from public.business_category_preferences where business_id=b.id;
     delete from public.business_product_preferences where business_id=b.id;
     insert into public.business_category_preferences select b.id,c from unnest(categories) c;
     insert into public.business_product_preferences select b.id,x from unnest(products) x;
   elsif p_action='submit' then
     if b.status not in ('draft','changes_requested') then raise exception 'Application cannot be submitted' using errcode='23514'; end if;
     if not exists(select 1 from public.business_category_preferences where business_id=b.id)
       or not exists(select 1 from public.business_product_preferences where business_id=b.id)
       or exists(select 1 from public.business_product_preferences pref where pref.business_id=b.id and not exists
         (select 1 from public.agricultural_products p join public.product_category_memberships c on c.product_id=p.id
          join public.business_category_preferences bc on bc.category=c.category and bc.business_id=b.id where p.id=pref.product_id and p.active)) then
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

create function public.list_product_categories() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name) order by code),'[]'::jsonb)
 from public.product_categories;
$$;
revoke all on function public.list_product_categories() from public,anon,authenticated;
grant execute on function public.list_product_categories() to service_role;
