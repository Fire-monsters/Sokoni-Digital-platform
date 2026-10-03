-- SME wholesale orders are distinct from farmer procurement purchase_orders and
-- consumer marketplace orders. All writes go through service-role RPCs.
create sequence public.wholesale_order_reference_seq;
create sequence public.wholesale_invoice_reference_seq;

create table public.wholesale_catalogue_items (
  id uuid primary key default extensions.gen_random_uuid(),
  warehouse_business_id uuid not null references public.businesses(id),
  product_id uuid not null references public.agricultural_products(id),
  sku text not null check (length(btrim(sku)) between 3 and 60),
  name text not null check (length(btrim(name)) between 2 and 160),
  grade text not null check (length(btrim(grade)) between 1 and 40),
  package_unit text not null check (length(btrim(package_unit)) between 1 and 30),
  base_unit text not null check (base_unit in ('kg','nut','pack','bunch')),
  units_per_package numeric(14,3) not null check (units_per_package > 0),
  price_ugx_per_package bigint not null check (price_ugx_per_package > 0),
  minimum_packages integer not null default 1 check (minimum_packages > 0),
  available_packages integer not null default 0 check (available_packages >= 0),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (warehouse_business_id, sku),
  unique (id, warehouse_business_id)
);
create index wholesale_catalogue_discovery_idx on public.wholesale_catalogue_items(product_id, warehouse_business_id)
  where status = 'published';

create table public.wholesale_orders (
  id uuid primary key default extensions.gen_random_uuid(),
  reference text not null unique default ('WS-' || lpad(nextval('public.wholesale_order_reference_seq')::text,8,'0')),
  sme_business_id uuid not null references public.businesses(id),
  warehouse_business_id uuid not null references public.businesses(id),
  status text not null default 'submitted' check (status in ('submitted','confirmed','declined','cancelled')),
  notes text check (notes is null or length(notes) <= 2000),
  total_ugx bigint not null check (total_ugx > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (id, warehouse_business_id),
  check (sme_business_id <> warehouse_business_id),
  check ((status = 'confirmed') = (confirmed_at is not null))
);
create index wholesale_orders_sme_idx on public.wholesale_orders(sme_business_id, created_at desc, id);
create index wholesale_orders_warehouse_idx on public.wholesale_orders(warehouse_business_id, status, created_at desc, id);

create table public.wholesale_order_lines (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.wholesale_orders(id),
  catalogue_item_id uuid not null references public.wholesale_catalogue_items(id),
  product_id uuid not null references public.agricultural_products(id),
  sku text not null,
  name text not null,
  grade text not null,
  package_unit text not null,
  base_unit text not null,
  units_per_package numeric(14,3) not null check (units_per_package > 0),
  quantity_packages integer not null check (quantity_packages > 0),
  unit_price_ugx bigint not null check (unit_price_ugx > 0),
  line_total_ugx bigint generated always as (quantity_packages::bigint * unit_price_ugx) stored,
  unique (order_id, catalogue_item_id)
);
create index wholesale_order_lines_order_idx on public.wholesale_order_lines(order_id);

create table public.wholesale_order_status_history (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.wholesale_orders(id),
  actor_id uuid not null references auth.users(id),
  previous_status text,
  new_status text not null check (new_status in ('submitted','confirmed','declined','cancelled')),
  reason text,
  operation_id uuid not null unique,
  created_at timestamptz not null default now()
);
create index wholesale_order_history_order_idx on public.wholesale_order_status_history(order_id, created_at, id);

create table public.wholesale_invoices (
  id uuid primary key default extensions.gen_random_uuid(),
  reference text not null unique default ('INV-' || lpad(nextval('public.wholesale_invoice_reference_seq')::text,8,'0')),
  order_id uuid not null unique references public.wholesale_orders(id),
  sme_business_id uuid not null references public.businesses(id),
  warehouse_business_id uuid not null references public.businesses(id),
  buyer_name text not null,
  seller_name text not null,
  total_ugx bigint not null check (total_ugx > 0),
  issued_at timestamptz not null default now(),
  unique (id, warehouse_business_id)
);
create table public.wholesale_invoice_lines (
  id uuid primary key default extensions.gen_random_uuid(),
  invoice_id uuid not null references public.wholesale_invoices(id),
  name text not null,
  grade text not null,
  package_unit text not null,
  quantity_packages integer not null check (quantity_packages > 0),
  unit_price_ugx bigint not null check (unit_price_ugx > 0),
  line_total_ugx bigint not null check (line_total_ugx > 0)
);

create table public.wholesale_payments (
  id uuid primary key default extensions.gen_random_uuid(),
  provider text not null check (length(btrim(provider)) between 2 and 80),
  provider_account text not null check (length(btrim(provider_account)) between 2 and 160),
  external_reference text not null check (length(btrim(external_reference)) between 2 and 160),
  amount_ugx bigint not null check (amount_ugx > 0),
  evidence_path text,
  paid_at timestamptz not null,
  verified_by uuid not null references auth.users(id),
  verified_at timestamptz not null default now(),
  unique (provider, provider_account, external_reference)
);
create table public.wholesale_payment_allocations (
  payment_id uuid primary key references public.wholesale_payments(id),
  invoice_id uuid not null references public.wholesale_invoices(id),
  amount_ugx bigint not null check (amount_ugx > 0),
  created_at timestamptz not null default now()
);
create index wholesale_payment_allocations_invoice_idx on public.wholesale_payment_allocations(invoice_id);

create table public.wholesale_invoice_documents (
  invoice_id uuid primary key references public.wholesale_invoices(id),
  status text not null default 'pending' check (status in ('pending','ready','failed')),
  storage_path text unique,
  sha256 text,
  error_code text,
  updated_at timestamptz not null default now(),
  check ((status = 'ready') = (storage_path is not null and sha256 is not null))
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('wholesale-invoices','wholesale-invoices',false,10485760,array['application/pdf'])
on conflict(id) do nothing;

create table public.wholesale_operations (
  operation_id uuid primary key,
  actor_id uuid not null references auth.users(id),
  action text not null,
  input jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create table public.wholesale_audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  operation_id uuid not null unique,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function public.wholesale_reject_snapshot_change() returns trigger
language plpgsql set search_path='' as $$
begin
 raise exception 'Wholesale financial snapshot is append-only' using errcode='23514';
end $$;
create trigger wholesale_order_lines_immutable before update or delete on public.wholesale_order_lines
 for each row execute function public.wholesale_reject_snapshot_change();
create trigger wholesale_invoice_lines_immutable before update or delete on public.wholesale_invoice_lines
 for each row execute function public.wholesale_reject_snapshot_change();
create trigger wholesale_invoices_immutable before update or delete on public.wholesale_invoices
 for each row execute function public.wholesale_reject_snapshot_change();
create trigger wholesale_payments_immutable before update or delete on public.wholesale_payments
 for each row execute function public.wholesale_reject_snapshot_change();
create trigger wholesale_payment_allocations_immutable before update or delete on public.wholesale_payment_allocations
 for each row execute function public.wholesale_reject_snapshot_change();
create trigger wholesale_order_history_immutable before update or delete on public.wholesale_order_status_history
 for each row execute function public.wholesale_reject_snapshot_change();
create trigger wholesale_audit_immutable before update or delete on public.wholesale_audit_events
 for each row execute function public.wholesale_reject_snapshot_change();

insert into public.permissions(key,description) values
 ('wholesale.payments.read','View wholesale invoices and payments'),
 ('wholesale.payments.verify','Verify external wholesale payments')
on conflict(key) do nothing;
insert into public.role_permissions(role,permission) values
 ('admin','wholesale.payments.read'),('admin','wholesale.payments.verify'),
 ('finance','wholesale.payments.read'),('finance','wholesale.payments.verify')
on conflict do nothing;

do $$ declare name text; begin
  foreach name in array array[
    'wholesale_catalogue_items','wholesale_orders','wholesale_order_lines',
    'wholesale_order_status_history','wholesale_invoices','wholesale_invoice_lines',
    'wholesale_payments','wholesale_payment_allocations','wholesale_invoice_documents',
    'wholesale_operations','wholesale_audit_events'
  ] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public, anon, authenticated',name);
    execute format('grant select on public.%I to service_role',name);
  end loop;
end $$;

create function public.wholesale_require_business(p_actor uuid,p_business uuid,p_kind text,p_owner boolean default false)
returns void language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.businesses b join public.business_memberships m on m.business_id=b.id
   where b.id=p_business and b.kind=p_kind and b.status='approved'
   and m.user_id=p_actor and m.active and (not p_owner or m.role='owner')) then
   raise exception 'Approved business membership required' using errcode='42501';
 end if;
end $$;

create function public.wholesale_require_finance(p_actor uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.staff_members s join public.role_permissions p on p.role=s.role
   where s.user_id=p_actor and s.status='active' and p.permission='wholesale.payments.verify') then
   raise exception 'Finance permission required' using errcode='42501';
 end if;
end $$;

-- Admin-only warehouse setup; warehouse self-registration remains unavailable.
create function public.wholesale_provision_warehouse(
 p_admin uuid,p_owner uuid,p_name text,p_location text,p_operation uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.businesses; prior public.business_operations; result jsonb;
begin
 if not exists(select 1 from public.staff_members where user_id=p_admin and role='admin' and status='active') then
   raise exception 'Active admin required' using errcode='42501'; end if;
 if not exists(select 1 from auth.users where id=p_owner and phone_confirmed_at is not null) then
   raise exception 'Verified owner required' using errcode='42501'; end if;
 if p_operation is null or length(btrim(p_name)) not between 2 and 160 or
   length(btrim(p_location)) not between 2 and 300 then
   raise exception 'Invalid warehouse setup' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
 select * into prior from public.business_operations where operation_id=p_operation;
 if found then
   if prior.actor_id<>p_admin or prior.action<>'provision_warehouse' or
     prior.input<>jsonb_build_object('ownerId',p_owner,'name',p_name,'location',p_location) then
     raise exception 'Operation ID reused' using errcode='23505'; end if;
   return prior.business_id;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||'warehouse',0));
 select * into existing from public.businesses where owner_id=p_owner and kind='warehouse' for update;
 if found then raise exception 'Owner already has a warehouse' using errcode='23505'; end if;
 insert into public.businesses(owner_id,kind,name,location,status,review_reason)
 values(p_owner,'warehouse',btrim(p_name),btrim(p_location),'approved','Admin-provisioned warehouse')
 returning * into existing;
 insert into public.business_memberships(business_id,user_id,role)
 values(existing.id,p_owner,'owner');
 result:=public.business_snapshot(existing.id);
 insert into public.business_operations(operation_id,actor_id,action,business_id,input,result)
 values(p_operation,p_admin,'provision_warehouse',existing.id,
   jsonb_build_object('ownerId',p_owner,'name',p_name,'location',p_location),result);
 insert into public.business_audit_events(business_id,actor_id,action,new_status,reason,operation_id)
 values(existing.id,p_admin,'provision_warehouse','approved','Admin-provisioned warehouse',p_operation);
 return existing.id;
end $$;

create function public.wholesale_replay(p_operation uuid,p_actor uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare op public.wholesale_operations;
begin
 if p_operation is null then raise exception 'Operation ID required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
 select * into op from public.wholesale_operations where operation_id=p_operation;
 if not found then return null; end if;
 if op.actor_id<>p_actor or op.action<>p_action or op.input<>p_input then
   raise exception 'Operation ID reused' using errcode='23505';
 end if;
 return op.result;
end $$;

create function public.wholesale_save_catalogue_item(
 p_actor uuid,p_warehouse uuid,p_operation uuid,p_input jsonb,p_id uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare previous jsonb; item public.wholesale_catalogue_items; result jsonb;
begin
 perform public.wholesale_require_business(p_actor,p_warehouse,'warehouse',true);
 previous:=public.wholesale_replay(p_operation,p_actor,'catalogue',p_input || jsonb_build_object('id',p_id,'warehouse',p_warehouse));
 if previous is not null then return (previous->>'id')::uuid; end if;
 if not exists(select 1 from public.agricultural_products where id=(p_input->>'productId')::uuid and active) then
   raise exception 'Active crop required' using errcode='23514'; end if;
 if p_id is null then
   insert into public.wholesale_catalogue_items(warehouse_business_id,product_id,sku,name,grade,
     package_unit,base_unit,units_per_package,price_ugx_per_package,minimum_packages,available_packages,status)
   values(p_warehouse,(p_input->>'productId')::uuid,p_input->>'sku',p_input->>'name',p_input->>'grade',
     p_input->>'packageUnit',p_input->>'baseUnit',(p_input->>'unitsPerPackage')::numeric,
     (p_input->>'priceUgxPerPackage')::bigint,(p_input->>'minimumPackages')::integer,
     (p_input->>'availablePackages')::integer,p_input->>'status') returning * into item;
 else
   select * into item from public.wholesale_catalogue_items where id=p_id and warehouse_business_id=p_warehouse for update;
   if not found then raise exception 'Catalogue item not found' using errcode='P0002'; end if;
   if (p_input->>'expectedVersion')::integer is distinct from item.version then
     raise exception 'Version conflict' using errcode='40001'; end if;
   update public.wholesale_catalogue_items set
     product_id=(p_input->>'productId')::uuid,sku=p_input->>'sku',name=p_input->>'name',grade=p_input->>'grade',
     package_unit=p_input->>'packageUnit',base_unit=p_input->>'baseUnit',
     units_per_package=(p_input->>'unitsPerPackage')::numeric,
     price_ugx_per_package=(p_input->>'priceUgxPerPackage')::bigint,
     minimum_packages=(p_input->>'minimumPackages')::integer,
     available_packages=(p_input->>'availablePackages')::integer,
     status=p_input->>'status',version=version+1,updated_at=now()
   where id=p_id returning * into item;
 end if;
 result:=jsonb_build_object('id',item.id);
 insert into public.wholesale_operations values(p_operation,p_actor,'catalogue',
   p_input || jsonb_build_object('id',p_id,'warehouse',p_warehouse),result,now());
 insert into public.wholesale_audit_events(actor_id,action,entity_type,entity_id,operation_id)
 values(p_actor,'catalogue.save','catalogue_item',item.id,p_operation);
 return item.id;
end $$;

create function public.wholesale_submit_order(
 p_actor uuid,p_sme uuid,p_operation uuid,p_lines jsonb,p_notes text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare prior jsonb; input jsonb; item public.wholesale_catalogue_items; line jsonb;
  warehouse_id uuid; order_id uuid; total bigint:=0; n integer:=0;
begin
 perform public.wholesale_require_business(p_actor,p_sme,'sme');
 input:=jsonb_build_object('sme',p_sme,'lines',p_lines,'notes',p_notes);
 prior:=public.wholesale_replay(p_operation,p_actor,'submit',input);
 if prior is not null then return (prior->>'id')::uuid; end if;
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 50 then
   raise exception 'Order must contain 1 to 50 lines' using errcode='22023'; end if;
 if length(coalesce(p_notes,''))>2000 then raise exception 'Notes too long' using errcode='22023'; end if;
 perform 1 from public.wholesale_catalogue_items c
   where c.id in (select (value->>'catalogueItemId')::uuid from jsonb_array_elements(p_lines))
   order by c.id for update;
 for line in select value from jsonb_array_elements(p_lines) loop
   n:=n+1;
   select * into item from public.wholesale_catalogue_items where id=(line->>'catalogueItemId')::uuid;
   if not found or item.status<>'published' or
     not exists(select 1 from public.businesses b where b.id=item.warehouse_business_id
       and b.kind='warehouse' and b.status='approved') then
     raise exception 'Offer unavailable' using errcode='23514'; end if;
   if warehouse_id is null then warehouse_id:=item.warehouse_business_id; end if;
   if warehouse_id<>item.warehouse_business_id or
     (line->>'quantityPackages')::integer < item.minimum_packages or
     (line->>'quantityPackages')::integer > item.available_packages then
     raise exception 'Invalid quantity or mixed warehouses' using errcode='23514'; end if;
   if (line->>'expectedPriceUgx')::bigint is distinct from item.price_ugx_per_package then
     raise exception 'Price changed' using errcode='40001'; end if;
   if (select count(*) from jsonb_array_elements(p_lines) x
     where x->>'catalogueItemId'=line->>'catalogueItemId')>1 then
     raise exception 'Duplicate order line' using errcode='22023'; end if;
   total:=total+(line->>'quantityPackages')::integer*item.price_ugx_per_package;
 end loop;
 insert into public.wholesale_orders(sme_business_id,warehouse_business_id,total_ugx,notes)
 values(p_sme,warehouse_id,total,p_notes) returning id into order_id;
 for line in select value from jsonb_array_elements(p_lines) loop
   select * into item from public.wholesale_catalogue_items where id=(line->>'catalogueItemId')::uuid;
   insert into public.wholesale_order_lines(order_id,catalogue_item_id,product_id,sku,name,grade,
     package_unit,base_unit,units_per_package,quantity_packages,unit_price_ugx)
   values(order_id,item.id,item.product_id,item.sku,item.name,item.grade,item.package_unit,item.base_unit,
     item.units_per_package,(line->>'quantityPackages')::integer,item.price_ugx_per_package);
 end loop;
 insert into public.wholesale_order_status_history(order_id,actor_id,new_status,operation_id)
 values(order_id,p_actor,'submitted',p_operation);
 insert into public.wholesale_operations values(p_operation,p_actor,'submit',input,jsonb_build_object('id',order_id),now());
 insert into public.wholesale_audit_events(actor_id,action,entity_type,entity_id,operation_id)
 values(p_actor,'order.submit','wholesale_order',order_id,p_operation);
 return order_id;
end $$;

create function public.wholesale_command_order(
 p_actor uuid,p_order uuid,p_operation uuid,p_action text,p_reason text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare prior jsonb; input jsonb; ord public.wholesale_orders; line record; invoice_id uuid;
begin
 input:=jsonb_build_object('order',p_order,'action',p_action,'reason',p_reason);
 select * into ord from public.wholesale_orders where id=p_order for update;
 if not found then raise exception 'Order not found' using errcode='P0002'; end if;
 if p_action='cancel' then
   perform public.wholesale_require_business(p_actor,ord.sme_business_id,'sme');
 elsif p_action in ('confirm','decline') then
   perform public.wholesale_require_business(p_actor,ord.warehouse_business_id,'warehouse');
 else raise exception 'Unknown action' using errcode='22023'; end if;
 prior:=public.wholesale_replay(p_operation,p_actor,p_action,input);
 if prior is not null then return (prior->>'id')::uuid; end if;
 if ord.status<>'submitted' then raise exception 'Order already resolved' using errcode='23514'; end if;
 if p_action='decline' and length(btrim(coalesce(p_reason,'')))<3 then
   raise exception 'Decline reason required' using errcode='22023'; end if;
 if p_action='confirm' then
   if not exists(select 1 from public.businesses b where b.id=ord.sme_business_id
     and b.kind='sme' and b.status='approved') then
     raise exception 'Approved SME required' using errcode='42501'; end if;
   -- Lock in a stable order and update atomically. Other confirmations wait here.
   for line in select l.catalogue_item_id,l.quantity_packages from public.wholesale_order_lines l
     where l.order_id=p_order order by l.catalogue_item_id loop
     perform 1 from public.wholesale_catalogue_items where id=line.catalogue_item_id for update;
     update public.wholesale_catalogue_items set available_packages=available_packages-line.quantity_packages,
       version=version+1,updated_at=now()
     where id=line.catalogue_item_id and status='published'
       and available_packages>=line.quantity_packages;
     if not found then raise exception 'Insufficient published quantity' using errcode='23514'; end if;
   end loop;
   update public.wholesale_orders set status='confirmed',confirmed_at=now(),updated_at=now() where id=p_order;
   insert into public.wholesale_invoices(order_id,sme_business_id,warehouse_business_id,buyer_name,seller_name,total_ugx)
   values(p_order,ord.sme_business_id,ord.warehouse_business_id,
     (select name from public.businesses where id=ord.sme_business_id),
     (select name from public.businesses where id=ord.warehouse_business_id),ord.total_ugx)
   returning id into invoice_id;
   insert into public.wholesale_invoice_lines(invoice_id,name,grade,package_unit,quantity_packages,unit_price_ugx,line_total_ugx)
   select invoice_id,name,grade,package_unit,quantity_packages,unit_price_ugx,line_total_ugx
   from public.wholesale_order_lines where order_id=p_order;
   insert into public.wholesale_invoice_documents(invoice_id) values(invoice_id);
 else
   update public.wholesale_orders set status=case when p_action='cancel' then 'cancelled' else 'declined' end,
     updated_at=now() where id=p_order;
 end if;
 insert into public.wholesale_order_status_history(order_id,actor_id,previous_status,new_status,reason,operation_id)
 values(p_order,p_actor,'submitted',case when p_action='confirm' then 'confirmed'
   when p_action='cancel' then 'cancelled' else 'declined' end,p_reason,p_operation);
 insert into public.wholesale_operations values(p_operation,p_actor,p_action,input,jsonb_build_object('id',p_order),now());
 insert into public.wholesale_audit_events(actor_id,action,entity_type,entity_id,operation_id,details)
 values(p_actor,'order.'||p_action,'wholesale_order',p_order,p_operation,jsonb_build_object('reason',p_reason));
 return p_order;
end $$;

create function public.wholesale_verify_payment(
 p_actor uuid,p_invoice uuid,p_operation uuid,p_input jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare prior jsonb; inv public.wholesale_invoices; paid bigint; amount bigint; payment_id uuid;
begin
 perform public.wholesale_require_finance(p_actor);
 prior:=public.wholesale_replay(p_operation,p_actor,'payment',p_input || jsonb_build_object('invoice',p_invoice));
 if prior is not null then return (prior->>'id')::uuid; end if;
 select * into inv from public.wholesale_invoices where id=p_invoice for update;
 if not found then raise exception 'Invoice not found' using errcode='P0002'; end if;
 select coalesce(sum(amount_ugx),0) into paid from public.wholesale_payment_allocations where invoice_id=p_invoice;
 amount:=(p_input->>'amountUgx')::bigint;
 if amount<=0 or paid+amount>inv.total_ugx then raise exception 'Payment exceeds balance' using errcode='23514'; end if;
 insert into public.wholesale_payments(provider,provider_account,external_reference,amount_ugx,evidence_path,paid_at,verified_by)
 values(p_input->>'provider',p_input->>'providerAccount',p_input->>'externalReference',amount,
   p_input->>'evidencePath',(p_input->>'paidAt')::timestamptz,p_actor) returning id into payment_id;
 insert into public.wholesale_payment_allocations(payment_id,invoice_id,amount_ugx)
 values(payment_id,p_invoice,amount);
 insert into public.wholesale_operations values(p_operation,p_actor,'payment',
   p_input || jsonb_build_object('invoice',p_invoice),jsonb_build_object('id',payment_id),now());
 insert into public.wholesale_audit_events(actor_id,action,entity_type,entity_id,operation_id,details)
 values(p_actor,'payment.verify','wholesale_invoice',p_invoice,p_operation,
   jsonb_build_object('paymentId',payment_id,'amountUgx',amount));
 return payment_id;
end $$;

create function public.wholesale_set_invoice_document(
 p_invoice uuid,p_status text,p_path text,p_sha256 text,p_error text
) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_status not in ('ready','failed') then raise exception 'Invalid document status' using errcode='22023'; end if;
 update public.wholesale_invoice_documents set status=p_status,
   storage_path=case when p_status='ready' then p_path else null end,
   sha256=case when p_status='ready' then p_sha256 else null end,
   error_code=case when p_status='failed' then p_error else null end,
   updated_at=now() where invoice_id=p_invoice and (p_status='ready' or status<>'ready');
 if not found then
   if p_status='failed' and exists(select 1 from public.wholesale_invoice_documents
     where invoice_id=p_invoice and status='ready') then return; end if;
   raise exception 'Invoice document not found' using errcode='P0002';
 end if;
end $$;

revoke all on function public.wholesale_require_business(uuid,uuid,text,boolean),
 public.wholesale_require_finance(uuid),public.wholesale_replay(uuid,uuid,text,jsonb),
 public.wholesale_provision_warehouse(uuid,uuid,text,text,uuid),
 public.wholesale_save_catalogue_item(uuid,uuid,uuid,jsonb,uuid),
 public.wholesale_submit_order(uuid,uuid,uuid,jsonb,text),
 public.wholesale_command_order(uuid,uuid,uuid,text,text),
 public.wholesale_verify_payment(uuid,uuid,uuid,jsonb),
 public.wholesale_set_invoice_document(uuid,text,text,text,text),
 public.wholesale_reject_snapshot_change() from public,anon,authenticated;
grant execute on function public.wholesale_require_business(uuid,uuid,text,boolean),
 public.wholesale_require_finance(uuid),
 public.wholesale_provision_warehouse(uuid,uuid,text,text,uuid),
 public.wholesale_save_catalogue_item(uuid,uuid,uuid,jsonb,uuid),
 public.wholesale_submit_order(uuid,uuid,uuid,jsonb,text),
 public.wholesale_command_order(uuid,uuid,uuid,text,text),
 public.wholesale_verify_payment(uuid,uuid,uuid,jsonb),
 public.wholesale_set_invoice_document(uuid,text,text,text,text) to service_role;
