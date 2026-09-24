begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('04000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'lifecycle@example.test');
insert into public.markets (id, name, slug) values
  ('14000000-0000-4000-8000-000000000001', 'Lifecycle Market', 'lifecycle-market');
insert into public.categories (id, name, slug) values
  ('24000000-0000-4000-8000-000000000001', 'Lifecycle Produce', 'lifecycle-produce');
insert into public.catalog_products (id, category_id, name, slug) values
  ('34000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000001', 'Beans', 'lifecycle-beans');
insert into public.sellers (id, business_name, market_id, verification_status) values
  ('44000000-0000-4000-8000-000000000001', 'Lifecycle Seller', '14000000-0000-4000-8000-000000000001', 'approved');
insert into public.listings (
  id, seller_id, catalog_product_id, package_quantity, package_unit,
  approved_price_ugx, status, stock_on_hand, stock_reserved
) values (
  '54000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001', 1, 'kg', 5000, 'active', 5, 2
);
insert into public.carts (id, consumer_id, market_id, status) values
  ('84000000-0000-4000-8000-000000000001', '04000000-0000-4000-8000-000000000001',
   '14000000-0000-4000-8000-000000000001', 'converted');
insert into public.customer_checkouts (
  id, reference, consumer_id, cart_id, market_id, items_subtotal_ugx, total_ugx,
  client_reference, reservation_expires_at
) values (
  '94000000-0000-4000-8000-000000000001', 'EK-2026-910001',
  '04000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001', 10000, 10000,
  'a4000000-0000-4000-8000-000000000001', now() + interval '15 minutes'
);
insert into public.vendor_orders (
  id, reference, checkout_id, seller_id, subtotal_ugx
) values (
  'd4000000-0000-4000-8000-000000000001', 'EK-S-9100001',
  '94000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001', 10000
);
insert into public.inventory_reservations (
  id, checkout_id, seller_order_id, listing_id, quantity, expires_at
) values (
  'e4000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000001',
  2, now() + interval '15 minutes'
);


insert into auth.users(id,aud,role,email) values
 ('a3400000-0000-4000-8000-000000000001','authenticated','authenticated','finance34@example.test'),
 ('a3400000-0000-4000-8000-000000000002','authenticated','authenticated','other34@example.test');
insert into public.staff_members(user_id,display_name,role) values
 ('a3400000-0000-4000-8000-000000000001','Finance reviewer','admin'),
 ('a3400000-0000-4000-8000-000000000002','Other reviewer','admin');
select public.create_pesapal_payment_attempt('04000000-0000-4000-8000-000000000001',
 '94000000-0000-4000-8000-000000000001','+256772123456',3,15);
select public.mark_payment_attempt_pending((select id from public.payment_attempts),
 'tracking34','request34','https://pay.example.test/34');
create function pg_temp.recheck(evidence jsonb, operation uuid default null,
 actor uuid default 'a3400000-0000-4000-8000-000000000001') returns jsonb language sql as $$
 select public.apply_payment_reconciliation((select id from public.payment_attempts),
 evidence,'admin_request',actor,operation);
$$;
create function pg_temp.finance(action text, input jsonb,
 actor uuid default 'a3400000-0000-4000-8000-000000000001') returns jsonb language sql as $$
 select public.command_payment_finance(actor,(select id from public.payment_attempts),action,input);
$$;

select ok(not has_function_privilege('authenticated','public.apply_payment_reconciliation(uuid,jsonb,text,uuid,uuid)','execute'),'clients cannot apply provider results');
select ok(not has_function_privilege('anon','public.command_payment_finance(uuid,uuid,text,jsonb)','execute'),'anonymous finance writes denied');
select ok(not has_table_privilege('authenticated','public.payment_investigations','select'),'investigations are private');
select ok(not has_function_privilege('authenticated','public.admin_get_payment_detail(uuid)','execute'),'private history is API-only');
select throws_ok($$select pg_temp.recheck('{"errorCode":"PROVIDER_LOOKUP_FAILED"}',null,null)$$,'42501',null,'admin reconciliation requires staff identity');
select throws_ok($$select pg_temp.recheck('{"errorCode":"PROVIDER_LOOKUP_FAILED"}',null,'04000000-0000-4000-8000-000000000001')$$,'42501',null,'consumer cannot reconcile as staff');
select throws_ok($$select pg_temp.recheck('{"status":"successful"}')$$,'22023',null,'incomplete evidence cannot mark a payment successful');
select throws_ok($$select pg_temp.finance('request-refund','{"operationId":"a3400000-0000-4000-8000-000000000010","reasonCode":"other","reason":"Not paid yet","amount":100}')$$,'55000',null,'pending payments cannot be refunded');
select is(pg_temp.recheck('{"transactionId":"tracking34","status":"pending","amount":10000,"currency":"UGX","rawResponse":{"secret":"must-not-leak"}}')->>'outcome','no_change','pending provider response is not a resolved payment');
select is(public.admin_list_payment_reconciliation(p_reconciliation_status=>'pending')->'pagination'->>'totalItems','1','pending recheck remains in pending queue');

-- Deliberately fail the final audit insert: payment, stock and evidence must all roll back.
create function pg_temp.fail_finance_audit() returns trigger language plpgsql as $$
begin raise exception 'test audit failure'; end; $$;
create trigger test_finance_audit before insert on public.payment_audit_events
 for each row when (new.action='payment.reconciled') execute function pg_temp.fail_finance_audit();
select throws_ok($$select pg_temp.recheck('{"transactionId":"tracking34","status":"successful","amount":10000,"currency":"UGX"}')$$,
 'P0001','test audit failure','audit failure rolls back the entire reconciliation');
select is((select status::text from public.payment_attempts),'pending','failed transaction did not mark payment paid');
select is((select stock_on_hand from public.listings),5,'failed transaction did not commit inventory');
select is((select count(*)::integer from public.payment_reconciliation_runs),1,'failed transaction left no false reconciliation evidence');
drop trigger test_finance_audit on public.payment_audit_events;

update public.payment_attempts set next_reconciliation_at=now()-interval '1 minute';
select is((select count(*)::integer from public.claim_admin_payment_batch('a3400000-0000-4000-8000-000000000001','a3400000-0000-4000-8000-000000000020',10)),1,'batch claims pending payment');
select is((select count(*)::integer from public.claim_admin_payment_batch('a3400000-0000-4000-8000-000000000001','a3400000-0000-4000-8000-000000000020',10)),1,'batch retry retains original membership');
select throws_ok($$select public.claim_admin_payment_batch('a3400000-0000-4000-8000-000000000002','a3400000-0000-4000-8000-000000000020',10)$$,'55000',null,'another staff member cannot reuse batch key');

select is(pg_temp.recheck('{"transactionId":"tracking34","status":"successful","amount":10000,"currency":"UGX"}','a3400000-0000-4000-8000-000000000021')->>'outcome','status_updated','verified success finalizes transactionally');
select is((select status::text from public.payment_attempts),'successful','provider success is applied');
select is((select status::text from public.customer_checkouts),'paid','checkout finalized with payment');
select is((select stock_on_hand from public.listings),3,'inventory committed exactly once');
select is(pg_temp.recheck('{"transactionId":"tracking34","status":"successful","amount":10000,"currency":"UGX"}','a3400000-0000-4000-8000-000000000021')->>'duplicate','true','same command is replayed');
select is((select count(*)::integer from public.payment_reconciliation_runs),2,'retry creates no extra run');
select is((select stock_on_hand from public.listings),3,'retry cannot double-commit stock');
select throws_ok($$select pg_temp.recheck('{"errorCode":"PROVIDER_LOOKUP_FAILED"}','a3400000-0000-4000-8000-000000000021','a3400000-0000-4000-8000-000000000002')$$,'55000',null,'recheck key cannot change actors');
select is(pg_temp.recheck('{"transactionId":"tracking34","status":"successful","amount":999,"currency":"UGX"}')->>'outcome','amount_mismatch','amount mismatch remains visible');
select is((select status::text from public.payment_attempts),'successful','mismatch never downgrades a successful payment');
select is((select local_status_after::text from public.payment_reconciliation_runs where result='amount_mismatch'),'successful','history uses actual resulting status');
select is(pg_temp.recheck('{"errorCode":"PROVIDER_LOOKUP_FAILED"}')->>'outcome','manual_review_required','provider timeout recorded for investigation');
select is((select count(*)::integer from public.payment_audit_events where action='payment.reconciled'),4,'every committed recheck is audited');
select ok(public.admin_get_payment_detail((select id from public.payment_attempts))::text not like '%must-not-leak%','detail excludes raw provider payloads');

select is(pg_temp.finance('flag-investigation','{"operationId":"a3400000-0000-4000-8000-000000000030","reasonCode":"incorrect_amount","reason":"Provider amount differs"}')->>'status','open','investigation opens without editing payment');
select is(pg_temp.finance('flag-investigation','{"operationId":"a3400000-0000-4000-8000-000000000030","reasonCode":"incorrect_amount","reason":"Provider amount differs"}')->>'duplicate','true','investigation retry is idempotent');
select is((select count(*)::integer from public.payment_investigations),1,'only one investigation created');
select throws_ok($$select pg_temp.finance('flag-investigation','{"operationId":"a3400000-0000-4000-8000-000000000030","reasonCode":"incorrect_amount","reason":"Different request"}')$$,'55000',null,'same key cannot carry a new reason');
select is(public.admin_list_payment_reconciliation(p_reconciliation_status=>'needs_review')->'data'->0->'flags' ? 'OPEN_INVESTIGATION',true,'finance queue exposes open investigations');
select throws_ok($$select pg_temp.finance('flag-investigation','{"operationId":"a3400000-0000-4000-8000-000000000031","reasonCode":"invented","reason":"Invalid reason code"}')$$,'23514',null,'database enforces structured investigation reasons');

select is(pg_temp.finance('request-refund','{"operationId":"a3400000-0000-4000-8000-000000000040","reasonCode":"incorrect_payment","reason":"Overpayment review","amount":6000}')->>'status','awaiting_approval','refund is proposed, not paid');
select is((select approval_state::text from public.refund_cases),'pending','refund requires approval');
select is((select approved_by from public.refund_cases),null::uuid,'proposer does not approve their request');
select is(pg_temp.finance('request-refund','{"operationId":"a3400000-0000-4000-8000-000000000040","reasonCode":"incorrect_payment","reason":"Overpayment review","amount":6000}')->>'duplicate','true','refund retries are safe');
select is((select count(*)::integer from public.refund_cases),1,'refund retry creates one case');
select throws_ok($$select pg_temp.finance('request-refund','{"operationId":"a3400000-0000-4000-8000-000000000041","reasonCode":"other","reason":"Too much refund","amount":5000}')$$,'22023',null,'combined requested refunds cannot exceed the payment');
select throws_ok($$select pg_temp.finance('request-refund','{"operationId":"a3400000-0000-4000-8000-000000000042","reasonCode":"other","reason":"Zero refund","amount":0}')$$,'22023',null,'zero refund is rejected');
select is(pg_temp.finance('request-refund','{"operationId":"a3400000-0000-4000-8000-000000000043","reasonCode":"other","reason":"Remaining refund","amount":4000}')->>'status','awaiting_approval','remaining balance may be requested');
select is((select sum(requested_amount_ugx)::bigint from public.refund_cases),10000::bigint,'refund requests reserve at most the captured amount');
select is((select status::text from public.payment_attempts),'successful','refund proposals do not rewrite payment status');
select is((select count(*)::integer from public.payment_audit_events where action='payment.request_refund'),2,'refund proposal audit is idempotent');
select is((select count(*)::integer from public.payment_audit_events where action='payment.flag_investigation'),1,'investigation audit is idempotent');
select * from finish();
rollback;
