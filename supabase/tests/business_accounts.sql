-- Standalone PostgreSQL assertions; emits TAP and rolls back all fixtures.
-- Run after migrations with psql -X -v ON_ERROR_STOP=1 -f this-file.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'Assertion failed: %',message; end if; end; $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then
   if sqlstate = expected then return; end if;
   raise;
 end;
 raise exception 'Expected error % for %',expected,statement;
end; $$;
insert into auth.users(id,phone_confirmed_at) values
 ('bc000000-0000-4000-8000-000000000001',now()),
 ('bc000000-0000-4000-8000-000000000002',now()),
 ('bc000000-0000-4000-8000-000000000003',now()),
 ('bc000000-0000-4000-8000-000000000004',null);
insert into public.staff_members(user_id,role,status,display_name) values
 ('bc000000-0000-4000-8000-000000000003','admin','active','Business test reviewer');

do $$
declare
 owner_id uuid := 'bc000000-0000-4000-8000-000000000001';
 outsider uuid := 'bc000000-0000-4000-8000-000000000002';
 reviewer uuid := 'bc000000-0000-4000-8000-000000000003';
 unverified uuid := 'bc000000-0000-4000-8000-000000000004';
 op uuid := gen_random_uuid(); b jsonb; b_id uuid; second_id uuid; maize uuid; coffee uuid; coconut uuid; preferences jsonb;
begin
 perform pg_temp.expect_error(format('select public.command_business_account(%L,%L,%L,%L)',unverified,'create',gen_random_uuid(),'{"kind":"farmer","name":"Farm","location":"Entebbe"}'),'42501');
 perform pg_temp.expect_error(format('select public.command_business_account(%L,%L,%L,%L)',owner_id,'create',gen_random_uuid(),'{"kind":"warehouse","name":"Farm","location":"Entebbe"}'),'22023');
 b := public.command_business_account(owner_id,'create',op,'{"kind":"farmer","name":"Farm","location":"Entebbe"}');
 b_id := (b->>'id')::uuid;
 perform pg_temp.assert_true(b->>'status'='draft' and (b->>'canTrade')::boolean=false,'new business cannot trade');
 perform pg_temp.assert_true(public.command_business_account(owner_id,'create',op,'{"kind":"farmer","name":"Farm","location":"Entebbe"}')=b,'same operation replay');
 perform pg_temp.expect_error(format('select public.command_business_account(%L,%L,%L,%L)',owner_id,'create',op,'{"kind":"farmer","name":"Different","location":"Entebbe"}'),'23505');
 perform pg_temp.assert_true(public.command_business_account(owner_id,'create',gen_random_uuid(),'{"kind":"farmer","name":"Farm","location":"Entebbe"}')->>'id'=b_id::text,'resume existing onboarding');
 perform pg_temp.assert_true((select count(*)=1 from public.business_memberships where business_id=b_id),'one owner membership');
 perform pg_temp.expect_error(format('select public.read_business_accounts(%L,%L)',outsider,b_id),'42501');
 perform pg_temp.expect_error(format('select public.read_business_accounts(%L,null,true)',owner_id),'42501');
 perform pg_temp.expect_error(format('select public.command_business_account(%L,%L,%L,%L,%L)',owner_id,'submit',gen_random_uuid(),'{"expectedVersion":1}',b_id),'23514');
 select id into maize from public.agricultural_products where slug='maize';
 select id into coffee from public.agricultural_products where slug='coffee';
 select id into coconut from public.agricultural_products where slug='coconut';
 perform pg_temp.assert_true((select count(*)=2 from public.product_category_memberships where product_id=maize),'maize belongs to both categories');
 perform pg_temp.assert_true((select count(*)=1 from jsonb_array_elements(public.list_agricultural_products()) p where p->>'slug'='maize'),'one maize identity in catalogue');
 preferences:=jsonb_build_object('expectedVersion',1,'categories',jsonb_build_array('food'),'productIds',jsonb_build_array(coffee));
 perform pg_temp.expect_error(format('select public.command_business_account(%L,%L,%L,%L,%L)',owner_id,'preferences',gen_random_uuid(),preferences,b_id),'22023');
 preferences:=jsonb_build_object('expectedVersion',1,'categories',jsonb_build_array('cash','food'),'productIds',jsonb_build_array(maize,coffee,coconut));
 perform pg_temp.expect_error(format('select public.command_business_account(%L,%L,%L,%L,%L)',outsider,'preferences',gen_random_uuid(),preferences,b_id),'42501');
 b:=public.command_business_account(owner_id,'preferences',gen_random_uuid(),preferences,b_id);
 perform pg_temp.assert_true(jsonb_array_length(b->'categories')=2 and jsonb_array_length(b->'productIds')=3,'combined preferences saved');
 perform pg_temp.expect_error(format('select public.command_business_account(%L,%L,%L,%L,%L)',owner_id,'preferences',gen_random_uuid(),preferences,b_id),'40001');
 perform pg_temp.assert_true((public.business_snapshot(b_id)->>'version')::integer=2,'failed stale edit did not change state');
 b:=public.command_business_account(owner_id,'submit',gen_random_uuid(),'{"expectedVersion":2}',b_id);
 perform pg_temp.assert_true(b->>'status'='submitted','submitted for approval');
 insert into public.staff_members(user_id,role,status,display_name) values(owner_id,'admin','active','Self reviewer');
 perform pg_temp.expect_error(format('select public.command_business_account(%L,%L,%L,%L,%L)',owner_id,'review',gen_random_uuid(),'{"expectedVersion":3,"status":"approved","reason":"Approved"}',b_id),'42501');
 b:=public.command_business_account(reviewer,'review',gen_random_uuid(),'{"expectedVersion":3,"status":"changes_requested","reason":"Correct location"}',b_id);
 perform pg_temp.assert_true(b->>'status'='changes_requested','reviewer requests changes');
 b:=public.command_business_account(owner_id,'profile',gen_random_uuid(),'{"expectedVersion":4,"location":"Kampala"}',b_id);
 b:=public.command_business_account(owner_id,'submit',gen_random_uuid(),'{"expectedVersion":5}',b_id);
 b:=public.command_business_account(reviewer,'review',gen_random_uuid(),'{"expectedVersion":6,"status":"approved","reason":"Verified account"}',b_id);
 perform pg_temp.assert_true((b->>'canTrade')::boolean,'approved business can trade');
 preferences:=jsonb_build_object('expectedVersion',7,'categories',jsonb_build_array('food'),'productIds',jsonb_build_array(maize));
 b:=public.command_business_account(owner_id,'preferences',gen_random_uuid(),preferences,b_id);
 perform pg_temp.assert_true(b->>'status'='approved' and jsonb_array_length(b->'productIds')=1,'preferences editable after approval');
 b:=public.command_business_account(reviewer,'review',gen_random_uuid(),'{"expectedVersion":8,"status":"suspended","reason":"Account investigation"}',b_id);
 perform pg_temp.assert_true(not (b->>'canTrade')::boolean,'suspension blocks trading');
 preferences:=jsonb_set(preferences,'{expectedVersion}','9');
 perform pg_temp.expect_error(format('select public.command_business_account(%L,%L,%L,%L,%L)',owner_id,'preferences',gen_random_uuid(),preferences,b_id),'23514');
 second_id:=(public.command_business_account(owner_id,'create',gen_random_uuid(),'{"kind":"sme","name":"Shop","location":"Kampala"}')->>'id')::uuid;
 perform pg_temp.assert_true(second_id<>b_id,'one identity can own farmer and SME businesses');
 preferences:=jsonb_build_object('expectedVersion',1,'categories',jsonb_build_array('cash'),'productIds',jsonb_build_array(coffee));
 b:=public.command_business_account(owner_id,'preferences',gen_random_uuid(),preferences,second_id);
 perform pg_temp.assert_true(b->'categories'='["CASH"]'::jsonb,'cash-only selection');
 update public.agricultural_products set active=false where id=coffee;
 perform pg_temp.expect_error(format('select public.command_business_account(%L,%L,%L,%L,%L)',owner_id,'submit',gen_random_uuid(),'{"expectedVersion":2}',second_id),'23514');
 perform pg_temp.assert_true((select count(*)>5 from public.business_audit_events where business_id=b_id),'audit history retained');
 perform pg_temp.assert_true(not has_function_privilege('authenticated','public.command_business_account(uuid,text,uuid,jsonb,uuid)','EXECUTE'),'no direct command execution');
 perform pg_temp.assert_true(not has_table_privilege('authenticated','public.businesses','UPDATE'),'no direct profile writes');
 perform pg_temp.assert_true(not has_table_privilege('authenticated','public.business_memberships','INSERT'),'no self membership grants');
 perform pg_temp.assert_true(public.consume_business_auth_limit(repeat('a',64),1,60),'first rate-limit attempt succeeds');
 perform pg_temp.assert_true(not public.consume_business_auth_limit(repeat('a',64),1,60),'second attempt throttled');
end; $$;
-- Exercise actual authenticated RLS, not only the service-role functions.
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.businesses) then raise exception 'RLS leaked business'; end if;
 if exists(select 1 from public.business_product_preferences) then raise exception 'RLS leaked preferences'; end if;
end; $$;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000001',true);
do $$ begin
 if (select count(*) from public.businesses)<>2 then raise exception 'Owner cannot read own businesses'; end if;
end; $$;
reset role;
select '1..1';
select 'ok 1 - business identity, crop validation, replay, concurrency, approval, RLS and throttling';
rollback;
