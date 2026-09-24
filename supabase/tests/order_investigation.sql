begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,aud,role,email,phone,raw_user_meta_data) values
 ('a3500000-0000-4000-8000-000000000001','authenticated','authenticated','support35@example.test','+256700000351','{"display_name":"Support Agent"}'),
 ('a3500000-0000-4000-8000-000000000002','authenticated','authenticated','customer35@example.test','+256700000352','{"display_name":"Test Customer"}'),
 ('a3500000-0000-4000-8000-000000000003','authenticated','authenticated','rider35@example.test','+256700000353','{}'),
 ('a3500000-0000-4000-8000-000000000004','authenticated','authenticated','vendor35@example.test','+256700000354','{}');
insert into public.staff_members(user_id,display_name,role) values
 ('a3500000-0000-4000-8000-000000000001','Support Agent','admin');
insert into public.markets(id,name,slug) values ('a3500000-0000-4000-8000-000000000010','Support Market','support-market-35');
insert into public.delivery_zones(id,market_id,name,delivery_fee_ugx) values ('a3500000-0000-4000-8000-000000000011','a3500000-0000-4000-8000-000000000010','Support Zone',3000);
insert into public.consumer_addresses(id,consumer_id,label,summary,phone_number) values ('a3500000-0000-4000-8000-000000000012','a3500000-0000-4000-8000-000000000002','Home','Support address','+256700000352');
insert into public.categories(id,name,slug) values ('a3500000-0000-4000-8000-000000000013','Support Produce','support-produce-35');
insert into public.catalog_products(id,category_id,name,slug) values ('a3500000-0000-4000-8000-000000000014','a3500000-0000-4000-8000-000000000013','Support Beans','support-beans-35');
insert into public.sellers(id,business_name,market_id,verification_status) values ('a3500000-0000-4000-8000-000000000015','Support Vendor','a3500000-0000-4000-8000-000000000010','approved');
insert into public.seller_accounts(seller_id,user_id) values ('a3500000-0000-4000-8000-000000000015','a3500000-0000-4000-8000-000000000004');
insert into public.listings(id,seller_id,catalog_product_id,package_quantity,package_unit,approved_price_ugx,status,stock_on_hand,stock_reserved) values
 ('a3500000-0000-4000-8000-000000000016','a3500000-0000-4000-8000-000000000015','a3500000-0000-4000-8000-000000000014',1,'kg',5000,'active',10,2);
insert into public.carts(id,consumer_id,market_id,status) values
 ('a3500000-0000-4000-8000-000000000020','a3500000-0000-4000-8000-000000000002','a3500000-0000-4000-8000-000000000010','converted'),
 ('a3500000-0000-4000-8000-000000000021','a3500000-0000-4000-8000-000000000002','a3500000-0000-4000-8000-000000000010','converted');
insert into public.customer_checkouts(id,reference,consumer_id,cart_id,market_id,status,items_subtotal_ugx,delivery_fee_ugx,total_ugx,client_reference,reservation_expires_at) values
 ('a3500000-0000-4000-8000-000000000030','EK-2026-SUPPORT-1','a3500000-0000-4000-8000-000000000002','a3500000-0000-4000-8000-000000000020','a3500000-0000-4000-8000-000000000010','awaiting_payment',10000,0,10000,'a3500000-0000-4000-8000-000000000031',now()+interval '15 minutes'),
 ('a3500000-0000-4000-8000-000000000032','EK-2026-SUPPORT-2','a3500000-0000-4000-8000-000000000002','a3500000-0000-4000-8000-000000000021','a3500000-0000-4000-8000-000000000010','paid',10000,3000,13000,'a3500000-0000-4000-8000-000000000033',now()+interval '15 minutes');
insert into public.checkout_fulfilments(checkout_id,type,schedule_type,phone_number,pickup_market_id) values
 ('a3500000-0000-4000-8000-000000000030','market_pickup','immediate','+256700000352','a3500000-0000-4000-8000-000000000010');
insert into public.checkout_fulfilments(checkout_id,type,schedule_type,phone_number,delivery_zone_id,delivery_zone_name,address_id,address_label,address_summary) values
 ('a3500000-0000-4000-8000-000000000032','delivery','immediate','+256700000352','a3500000-0000-4000-8000-000000000011','Support Zone','a3500000-0000-4000-8000-000000000012','Home','Support address');
insert into public.vendor_orders(id,reference,checkout_id,seller_id,status,subtotal_ugx) values
 ('a3500000-0000-4000-8000-000000000040','EK-S-SUPPORT-1','a3500000-0000-4000-8000-000000000030','a3500000-0000-4000-8000-000000000015','awaiting_payment',10000),
 ('a3500000-0000-4000-8000-000000000041','EK-S-SUPPORT-2','a3500000-0000-4000-8000-000000000032','a3500000-0000-4000-8000-000000000015','ready_for_pickup',10000);
insert into public.vendor_order_items(vendor_order_id,listing_id,seller_id,product_name,package_quantity,package_unit,unit_price_ugx,quantity,line_total_ugx) values
 ('a3500000-0000-4000-8000-000000000040','a3500000-0000-4000-8000-000000000016','a3500000-0000-4000-8000-000000000015','Support Beans',1,'kg',5000,2,10000),
 ('a3500000-0000-4000-8000-000000000041','a3500000-0000-4000-8000-000000000016','a3500000-0000-4000-8000-000000000015','Support Beans',1,'kg',5000,2,10000);
insert into public.inventory_reservations(id,checkout_id,seller_order_id,listing_id,quantity,expires_at) values
 ('a3500000-0000-4000-8000-000000000050','a3500000-0000-4000-8000-000000000030','a3500000-0000-4000-8000-000000000040','a3500000-0000-4000-8000-000000000016',2,now()+interval '15 minutes');
insert into public.transporter_profiles(id,user_id,display_name,verification_status,availability) values
 ('a3500000-0000-4000-8000-000000000060','a3500000-0000-4000-8000-000000000003','Support Rider','approved','busy');
insert into public.delivery_groups(id,checkout_id,consumer_id,market_id,delivery_zone_id,delivery_address_id,delivery_zone_name,address_label,address_summary,phone_number) values
 ('a3500000-0000-4000-8000-000000000061','a3500000-0000-4000-8000-000000000032','a3500000-0000-4000-8000-000000000002','a3500000-0000-4000-8000-000000000010','a3500000-0000-4000-8000-000000000011','a3500000-0000-4000-8000-000000000012','Support Zone','Home','Support address','+256700000352');
insert into public.delivery_group_orders(delivery_group_id,seller_order_id) values ('a3500000-0000-4000-8000-000000000061','a3500000-0000-4000-8000-000000000041');
insert into public.deliveries(id,reference,delivery_group_id,status,assigned_transporter_id,assigned_at,fee_ugx) values
 ('a3500000-0000-4000-8000-000000000062','DL-SUPPORT-2','a3500000-0000-4000-8000-000000000061','assigned','a3500000-0000-4000-8000-000000000060',now(),3000);
update public.vendor_orders set status='preparing' where id='a3500000-0000-4000-8000-000000000041';
insert into public.payment_attempts(id,checkout_id,consumer_id,provider,payment_method,status,amount_ugx,merchant_reference,provider_transaction_id,resolved_at) values
 ('a3500000-0000-4000-8000-000000000063','a3500000-0000-4000-8000-000000000032','a3500000-0000-4000-8000-000000000002','pesapal','mtn_momo','successful',13000,'PAY-SUPPORT-2','TRACK-SUPPORT-2',now());
insert into public.refund_cases(id,checkout_id,payment_attempt_id,reason,requested_amount_ugx,status,approval_state,proposed_by) values
 ('a3500000-0000-4000-8000-000000000064','a3500000-0000-4000-8000-000000000032','a3500000-0000-4000-8000-000000000063','other',1000,'awaiting_approval','pending','a3500000-0000-4000-8000-000000000001');
insert into public.notification_events(id,user_id,event_type,entity_type,entity_id,title,body,priority,payload,dedupe_key) values
 ('a3500000-0000-4000-8000-000000000070','a3500000-0000-4000-8000-000000000002','vendor_order.preparing','vendor_order','a3500000-0000-4000-8000-000000000041','Old title','Old arbitrary body','normal','{"status":"preparing"}','support-source-35');
insert into public.notification_deliveries(event_id,channel,status) values ('a3500000-0000-4000-8000-000000000070','push','delivered');

create function pg_temp.command_order(order_id uuid,action text,input jsonb,actor uuid default 'a3500000-0000-4000-8000-000000000001') returns jsonb language sql as $$
 select public.command_order_investigation(order_id,actor,action,input);
$$;

select ok(not has_function_privilege('authenticated','public.command_order_investigation(uuid,uuid,text,jsonb)','execute'),'clients cannot execute support commands');
select ok(not has_table_privilege('authenticated','public.order_support_notes','select'),'support notes are private');
select throws_ok($$select pg_temp.command_order('a3500000-0000-4000-8000-000000000032','notes','{"operationId":"a3500000-0000-4000-8000-000000000080","note":"Private support context"}','a3500000-0000-4000-8000-000000000002')$$,'42501',null,'consumer cannot add support notes');
select is(pg_temp.command_order('a3500000-0000-4000-8000-000000000032','notes','{"operationId":"a3500000-0000-4000-8000-000000000080","note":"Private support context"}')->>'status','recorded','staff adds a support note');
select is(pg_temp.command_order('a3500000-0000-4000-8000-000000000032','notes','{"operationId":"a3500000-0000-4000-8000-000000000080","note":"Private support context"}')->>'duplicate','true','support note retries are idempotent');
select is((select count(*)::integer from public.order_support_notes),1,'retry creates one note');
select throws_ok($$update public.order_support_notes set note='Edited'$$,'23514','Support notes are append-only.','support notes cannot be edited');
select throws_ok($$delete from public.order_support_notes$$,'23514','Support notes are append-only.','support notes cannot be deleted');
select is(public.admin_get_order_investigation('a3500000-0000-4000-8000-000000000032')->'supportNotes'->0->>'note','Private support context','detail includes support notes');
select is(public.admin_get_order_investigation('a3500000-0000-4000-8000-000000000032')->'supportNotes'->0->'author'->>'name','Support Agent','notes include author');

select is(pg_temp.command_order('a3500000-0000-4000-8000-000000000032','reveal-contact','{"operationId":"a3500000-0000-4000-8000-000000000081","reason":"Call about delivery","target":"consumer"}')->>'phoneNumber','+256700000352','consumer contact reveal returns phone once');
select is(pg_temp.command_order('a3500000-0000-4000-8000-000000000032','reveal-contact','{"operationId":"a3500000-0000-4000-8000-000000000081","reason":"Call about delivery","target":"consumer"}')->>'phoneNumber',null,'replay does not reveal contact again');
select ok((select response ? 'phoneNumber' from public.order_support_operations where operation_id='a3500000-0000-4000-8000-000000000081')=false,'phone is absent from replay storage');
select ok((select details ? 'phoneNumber' from public.order_support_audit_events where operation_id='a3500000-0000-4000-8000-000000000081')=false,'phone is absent from audit details');
select is(pg_temp.command_order('a3500000-0000-4000-8000-000000000032','reveal-contact','{"operationId":"a3500000-0000-4000-8000-000000000082","reason":"Coordinate collection","target":"rider"}')->>'phoneNumber','+256700000353','rider reveal follows linked assignment');

select is(pg_temp.command_order('a3500000-0000-4000-8000-000000000032','escalate-dispatch','{"operationId":"a3500000-0000-4000-8000-000000000083","reason":"Customer reports a delay","expectedDeliveryVersion":1}')->>'status','open','dispatch escalation creates an issue');
select is((select count(*)::integer from public.delivery_issues where delivery_id='a3500000-0000-4000-8000-000000000062' and status='open'),1,'escalation enters dispatch issue queue');
select is(pg_temp.command_order('a3500000-0000-4000-8000-000000000032','escalate-dispatch','{"operationId":"a3500000-0000-4000-8000-000000000083","reason":"Customer reports a delay","expectedDeliveryVersion":1}')->>'duplicate','true','escalation retry is idempotent');
select throws_ok($$select pg_temp.command_order('a3500000-0000-4000-8000-000000000032','escalate-dispatch','{"operationId":"a3500000-0000-4000-8000-000000000084","reason":"Stale screen","expectedDeliveryVersion":2}')$$,'40001',null,'stale delivery escalation is rejected');

select is(pg_temp.command_order('a3500000-0000-4000-8000-000000000032','resend-notification','{"operationId":"a3500000-0000-4000-8000-000000000085","reason":"Customer requested another update","notificationId":"a3500000-0000-4000-8000-000000000070"}')->>'status','queued','approved current template is queued');
select is((select body from public.notification_events where dedupe_key='order-support:a3500000-0000-4000-8000-000000000085'),'Seller order EK-S-SUPPORT-2 is now preparing.','resend reconstructs approved copy rather than old body');
select is((select count(*)::integer from public.notification_deliveries d join public.notification_events e on e.id=d.event_id where e.dedupe_key='order-support:a3500000-0000-4000-8000-000000000085'),1,'resend creates delivery work');
select is(pg_temp.command_order('a3500000-0000-4000-8000-000000000032','resend-notification','{"operationId":"a3500000-0000-4000-8000-000000000085","reason":"Customer requested another update","notificationId":"a3500000-0000-4000-8000-000000000070"}')->>'duplicate','true','resend replay does not enqueue twice');
select throws_ok($$select pg_temp.command_order('a3500000-0000-4000-8000-000000000032','resend-notification','{"operationId":"a3500000-0000-4000-8000-000000000086","reason":"Too soon to resend","notificationId":"a3500000-0000-4000-8000-000000000070"}')$$,'55000',null,'notification resend has a cooldown');
update public.vendor_orders set status='ready_for_pickup' where id='a3500000-0000-4000-8000-000000000041';
select throws_ok($$select pg_temp.command_order('a3500000-0000-4000-8000-000000000032','resend-notification','{"operationId":"a3500000-0000-4000-8000-000000000087","reason":"Stale notification","notificationId":"a3500000-0000-4000-8000-000000000070"}')$$,'55000',null,'stale notification templates cannot be resent');

select throws_ok($$select pg_temp.command_order('a3500000-0000-4000-8000-000000000032','cancel','{"operationId":"a3500000-0000-4000-8000-000000000090","reason":"Customer requested cancellation"}')$$,'55000',null,'paid dispatched order cannot be cancelled');
select is(pg_temp.command_order('a3500000-0000-4000-8000-000000000030','cancel','{"operationId":"a3500000-0000-4000-8000-000000000091","reason":"Customer changed their mind"}')->>'status','cancelled','eligible unpaid order is cancelled');
select is((select status::text from public.customer_checkouts where id='a3500000-0000-4000-8000-000000000030'),'cancelled','order state machine records cancellation');
select is((select status::text from public.vendor_orders where id='a3500000-0000-4000-8000-000000000040'),'cancelled','vendor work is cancelled');
select is((select status::text from public.inventory_reservations where id='a3500000-0000-4000-8000-000000000050'),'released','inventory reservation is released');
select is((select stock_reserved from public.listings where id='a3500000-0000-4000-8000-000000000016'),0,'reserved stock is restored exactly once');
select is(pg_temp.command_order('a3500000-0000-4000-8000-000000000030','cancel','{"operationId":"a3500000-0000-4000-8000-000000000091","reason":"Customer changed their mind"}')->>'duplicate','true','cancellation retry is idempotent');
select is((select stock_reserved from public.listings where id='a3500000-0000-4000-8000-000000000016'),0,'cancellation replay does not restore stock twice');
select is((select count(*)::integer from public.checkout_status_history where checkout_id='a3500000-0000-4000-8000-000000000030' and to_status='cancelled'),1,'cancellation writes one state history event');
select is((select count(*)::integer from public.order_support_audit_events where checkout_id='a3500000-0000-4000-8000-000000000030' and action='order.cancel'),1,'cancellation writes one support audit');
select is(public.admin_get_order_investigation('a3500000-0000-4000-8000-000000000032')->'refunds'->0->>'requestedAmount','1000','order detail returns refund history');
select ok(jsonb_array_length(public.admin_get_order_investigation('a3500000-0000-4000-8000-000000000032')->'timeline')>=4,'support actions appear in unified timeline');

select * from finish();
rollback;
