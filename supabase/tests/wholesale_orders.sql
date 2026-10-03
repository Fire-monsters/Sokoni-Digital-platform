-- Rollback-only integration assertions for the SME wholesale workflow.
begin;
create function pg_temp.ok(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'Assertion failed: %',message; end if; end $$;
create function pg_temp.expect(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then if sqlstate=expected then return; end if; raise; end;
 raise exception 'Expected SQLSTATE %: %',expected,statement;
end $$;
insert into auth.users(id,phone_confirmed_at) values
 ('ad000000-0000-4000-8000-000000000001',now()),
 ('ad000000-0000-4000-8000-000000000002',now()),
 ('ad000000-0000-4000-8000-000000000003',now()),
 ('ad000000-0000-4000-8000-000000000004',now()),
 ('ad000000-0000-4000-8000-000000000005',now()),
 ('ad000000-0000-4000-8000-000000000006',now());
insert into public.businesses(id,owner_id,kind,name,location,status) values
 ('ad000000-0000-4000-8000-000000000011','ad000000-0000-4000-8000-000000000001','sme','Kampala SME','Kampala','approved'),
 ('ad000000-0000-4000-8000-000000000012','ad000000-0000-4000-8000-000000000002','warehouse','Central Warehouse','Kampala','approved'),
 ('ad000000-0000-4000-8000-000000000013','ad000000-0000-4000-8000-000000000003','sme','Other SME','Jinja','approved');
insert into public.business_memberships(business_id,user_id,role) values
 ('ad000000-0000-4000-8000-000000000011','ad000000-0000-4000-8000-000000000001','owner'),
 ('ad000000-0000-4000-8000-000000000012','ad000000-0000-4000-8000-000000000002','owner'),
 ('ad000000-0000-4000-8000-000000000013','ad000000-0000-4000-8000-000000000003','owner');
insert into public.staff_members(user_id,role,status,display_name)
values('ad000000-0000-4000-8000-000000000004','finance','active','Finance tester'),
 ('ad000000-0000-4000-8000-000000000005','admin','active','Admin tester');

do $$
declare
  sme uuid:='ad000000-0000-4000-8000-000000000001';
  warehouse uuid:='ad000000-0000-4000-8000-000000000002';
  outsider uuid:='ad000000-0000-4000-8000-000000000003';
  finance uuid:='ad000000-0000-4000-8000-000000000004';
  sme_business uuid:='ad000000-0000-4000-8000-000000000011';
  warehouse_business uuid:='ad000000-0000-4000-8000-000000000012';
  maize uuid; offer_id uuid; v_order_id uuid; v_invoice_id uuid; second_order uuid; provisioned uuid;
  item jsonb; request_lines jsonb; operation uuid:=gen_random_uuid();
begin
 provisioned:=public.wholesale_provision_warehouse('ad000000-0000-4000-8000-000000000005',
   'ad000000-0000-4000-8000-000000000006','New Warehouse','Jinja',gen_random_uuid());
 perform pg_temp.ok((select kind='warehouse' and status='approved' from public.businesses where id=provisioned),
   'admin provisions approved warehouse for verified owner');
 select id into maize from public.agricultural_products where slug='maize';
 item:=jsonb_build_object('productId',maize,'sku','MAIZE-A-50','name','Maize grain',
   'grade','A','packageUnit','bag','baseUnit','kg','unitsPerPackage',50,
   'priceUgxPerPackage',75000,'minimumPackages',1,'availablePackages',10,'status','published');
 perform pg_temp.expect(format('select public.wholesale_save_catalogue_item(%L,%L,%L,%L)',
   sme,warehouse_business,gen_random_uuid(),item),'42501');
 offer_id:=public.wholesale_save_catalogue_item(warehouse,warehouse_business,gen_random_uuid(),item);
 request_lines:=jsonb_build_array(jsonb_build_object('catalogueItemId',offer_id,
   'quantityPackages',6,'expectedPriceUgx',75000));
 perform pg_temp.expect(format('select public.wholesale_submit_order(%L,%L,%L,%L)',
   outsider,sme_business,gen_random_uuid(),request_lines),'42501');
 v_order_id:=public.wholesale_submit_order(sme,sme_business,operation,request_lines);
 perform pg_temp.ok(v_order_id=public.wholesale_submit_order(sme,sme_business,operation,request_lines),
   'submission replay returns same order');
 perform pg_temp.ok((select total_ugx=450000 and status='submitted' from public.wholesale_orders where id=v_order_id),
   'submitted total and status');
 perform pg_temp.ok((select available_packages=10 from public.wholesale_catalogue_items where id=offer_id),
   'submission does not commit stock');
 item:=jsonb_set(item,'{priceUgxPerPackage}','80000');
 item:=jsonb_set(item,'{expectedVersion}','1');
 perform public.wholesale_save_catalogue_item(warehouse,warehouse_business,gen_random_uuid(),item,offer_id);
 perform pg_temp.ok((select unit_price_ugx=75000 from public.wholesale_order_lines where order_id=v_order_id),
   'catalogue price change does not rewrite submitted order');
 perform pg_temp.expect(format('select public.wholesale_submit_order(%L,%L,%L,%L)',
   sme,sme_business,gen_random_uuid(),request_lines),'40001');
 perform pg_temp.expect(format('select public.wholesale_command_order(%L,%L,%L,%L)',
   outsider,v_order_id,gen_random_uuid(),'confirm'),'42501');
 operation:=gen_random_uuid();
 perform public.wholesale_command_order(warehouse,v_order_id,operation,'confirm');
 perform pg_temp.ok(v_order_id=public.wholesale_command_order(warehouse,v_order_id,operation,'confirm'),
   'confirmation replay returns same order');
 perform pg_temp.ok((select available_packages=4 from public.wholesale_catalogue_items where id=offer_id),
   'confirmation commits six packages exactly once');
 select id into v_invoice_id from public.wholesale_invoices where order_id=v_order_id;
 perform pg_temp.ok(v_invoice_id is not null and
   (select total_ugx=450000 from public.wholesale_invoices where id=v_invoice_id),
   'confirmation creates one exact invoice');
 perform pg_temp.expect(format('select public.wholesale_verify_payment(%L,%L,%L,%L)',
   warehouse,v_invoice_id,gen_random_uuid(),'{"provider":"Bank","providerAccount":"ABC","externalReference":"REF1","amountUgx":100000,"paidAt":"2026-10-03T09:00:00+03:00"}'),'42501');
 perform public.wholesale_verify_payment(finance,v_invoice_id,gen_random_uuid(),
   '{"provider":"Bank","providerAccount":"ABC","externalReference":"REF1","amountUgx":100000,"paidAt":"2026-10-03T09:00:00+03:00"}');
 perform pg_temp.ok((select sum(amount_ugx)=100000 from public.wholesale_payment_allocations
   where invoice_id=v_invoice_id),'partial payment allocated');
 perform pg_temp.expect(format('select public.wholesale_verify_payment(%L,%L,%L,%L)',
   finance,v_invoice_id,gen_random_uuid(),'{"provider":"Bank","providerAccount":"ABC","externalReference":"REF1","amountUgx":350000,"paidAt":"2026-10-03T09:00:00+03:00"}'),'23505');
 perform pg_temp.expect(format('select public.wholesale_verify_payment(%L,%L,%L,%L)',
   finance,v_invoice_id,gen_random_uuid(),'{"provider":"Bank","providerAccount":"ABC","externalReference":"REF2","amountUgx":400000,"paidAt":"2026-10-03T09:00:00+03:00"}'),'23514');
 perform public.wholesale_verify_payment(finance,v_invoice_id,gen_random_uuid(),
   '{"provider":"Bank","providerAccount":"ABC","externalReference":"REF2","amountUgx":350000,"paidAt":"2026-10-03T09:00:00+03:00"}');
 perform pg_temp.ok((select sum(amount_ugx)=450000 from public.wholesale_payment_allocations
   where invoice_id=v_invoice_id),'invoice fully paid only from verified allocations');
 perform pg_temp.ok((select count(*)=1 from public.wholesale_invoices where order_id=v_order_id),
   'one invoice per order');
 perform pg_temp.expect(format('update public.wholesale_invoice_lines set unit_price_ugx=1 where invoice_id=%L',v_invoice_id),'23514');
 request_lines:=jsonb_build_array(jsonb_build_object('catalogueItemId',offer_id,
   'quantityPackages',4,'expectedPriceUgx',80000));
 second_order:=public.wholesale_submit_order(sme,sme_business,gen_random_uuid(),request_lines);
 item:=jsonb_set(item,'{availablePackages}','0');
 item:=jsonb_set(item,'{expectedVersion}','3');
 perform public.wholesale_save_catalogue_item(warehouse,warehouse_business,gen_random_uuid(),item,offer_id);
 perform pg_temp.expect(format('select public.wholesale_command_order(%L,%L,%L,%L)',
   warehouse,second_order,gen_random_uuid(),'confirm'),'23514');
 perform pg_temp.ok((select status='submitted' from public.wholesale_orders where id=second_order),
   'insufficient quantity leaves order submitted');
 operation:=gen_random_uuid();
 perform public.wholesale_command_order(warehouse,second_order,operation,'decline','No stock available');
 perform pg_temp.ok(second_order=public.wholesale_command_order(warehouse,second_order,operation,'decline','No stock available'),
   'decline replays');
 perform pg_temp.ok((select status='declined' from public.wholesale_orders where id=second_order),
   'warehouse decline is recorded');
 item:=jsonb_set(item,'{availablePackages}','4');
 item:=jsonb_set(item,'{expectedVersion}','4');
 perform public.wholesale_save_catalogue_item(warehouse,warehouse_business,gen_random_uuid(),item,offer_id);
 second_order:=public.wholesale_submit_order(sme,sme_business,gen_random_uuid(),request_lines);
 operation:=gen_random_uuid();
 perform public.wholesale_command_order(sme,second_order,operation,'cancel');
 perform pg_temp.ok(second_order=public.wholesale_command_order(sme,second_order,operation,'cancel'),
   'cancellation replays');
 perform pg_temp.ok((select status='cancelled' from public.wholesale_orders where id=second_order),
   'SME cancellation is recorded');
 perform pg_temp.ok(not has_table_privilege('authenticated','public.wholesale_orders','SELECT'),
   'client roles cannot read wholesale tables directly');
end $$;
select '1..1';
select 'ok 1 - scoped wholesale order, exact snapshot, confirmation, invoice and payments';
rollback;
