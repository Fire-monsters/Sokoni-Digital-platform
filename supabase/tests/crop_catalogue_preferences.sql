-- Run after all migrations; transactional tests do not alter persisted data.
begin;
create function pg_temp.check_crop(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'Assertion failed: %',message; end if; end $$;
create function pg_temp.expect_crop_error(statement text, expected text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then if sqlstate=expected then return; end if; raise; end;
 raise exception 'Expected SQLSTATE %',expected;
end $$;
insert into auth.users(id,phone_confirmed_at) values ('ec210000-0000-4000-8000-000000000001',now()),('ec210000-0000-4000-8000-000000000002',now());
do $$
declare actor uuid:='ec210000-0000-4000-8000-000000000001';
 outsider uuid:='ec210000-0000-4000-8000-000000000002';
 b jsonb; business uuid; maize uuid; coffee uuid; coconut uuid; old_operation uuid:=gen_random_uuid();
 old_result jsonb; old_input jsonb; payload jsonb;
begin
 perform pg_temp.check_crop(public.list_product_categories()='[{"code":"CASH","name":"Cash crops"},{"code":"FOOD","name":"Food crops"}]'::jsonb,'canonical category catalogue');
 perform pg_temp.check_crop((select array_agg(slug order by slug)=array['coconut','coffee','maize'] from public.agricultural_products where active),'only three active seed products');
 select id into maize from public.agricultural_products where slug='maize';
 select id into coffee from public.agricultural_products where slug='coffee';
 select id into coconut from public.agricultural_products where slug='coconut';
 perform pg_temp.check_crop((select count(*)=1 from jsonb_array_elements(public.list_agricultural_products()) x where x->>'id'=maize::text),'maize not duplicated');
 perform pg_temp.check_crop((select count(*)=2 from public.product_category_memberships where product_id=maize),'maize belongs to both categories');
 perform pg_temp.check_crop(jsonb_array_length(public.list_agricultural_products('FOOD'))=1,'FOOD filter returns maize');
 perform pg_temp.expect_crop_error(format('insert into public.product_category_memberships values(%L,%L)',coffee,'OTHER'),'23503');
 b:=public.command_business_account(actor,'create',gen_random_uuid(),'{"kind":"sme","name":"Crop test shop","location":"Kampala"}');
 business:=(b->>'id')::uuid;
 old_input:=jsonb_build_object('expectedVersion',1,'categories',jsonb_build_array('CASH'),'productIds',jsonb_build_array(coffee));
 old_result:=public.command_business_account(actor,'preferences',old_operation,old_input,business);
 perform pg_temp.check_crop(old_result->'categories'='["CASH"]'::jsonb,'cash-only choice');
 payload:=jsonb_build_object('expectedVersion',2,'categories',jsonb_build_array('FOOD'),'productIds',jsonb_build_array(maize));
 b:=public.command_business_account(actor,'preferences',gen_random_uuid(),payload,business);
 perform pg_temp.check_crop(b->'categories'='["FOOD"]'::jsonb,'food-only choice');
 payload:=jsonb_build_object('expectedVersion',3,'categories',jsonb_build_array('CASH','FOOD'),'productIds',jsonb_build_array(maize,coffee,coconut));
 b:=public.command_business_account(actor,'preferences',gen_random_uuid(),payload,business);
 perform pg_temp.check_crop(jsonb_array_length(b->'categories')=2 and jsonb_array_length(b->'productIds')=3,'both categories with specific products');
 perform pg_temp.check_crop((select result=old_result and input=old_input from public.business_operations where operation_id=old_operation),'preference edit did not rewrite historical operation');
 perform pg_temp.check_crop(public.command_business_account(actor,'preferences',old_operation,old_input,business)=old_result,'historical retry returns original result');
 perform pg_temp.check_crop((public.business_snapshot(business)->>'version')::integer=4,'historical retry did not revert current preferences');
 payload:=jsonb_build_object('expectedVersion',4,'categories',jsonb_build_array('CASH','cash'),'productIds',jsonb_build_array(coffee));
 perform pg_temp.expect_crop_error(format('select public.command_business_account(%L,%L,%L,%L,%L)',actor,'preferences',gen_random_uuid(),payload,business),'22023');
 payload:=jsonb_build_object('expectedVersion',4,'categories',jsonb_build_array('FOOD'),'productIds',jsonb_build_array(coffee));
 perform pg_temp.expect_crop_error(format('select public.command_business_account(%L,%L,%L,%L,%L)',actor,'preferences',gen_random_uuid(),payload,business),'22023');
 payload:=jsonb_build_object('expectedVersion',4,'categories',jsonb_build_array('FOOD'),'productIds',jsonb_build_array(gen_random_uuid()));
 perform pg_temp.expect_crop_error(format('select public.command_business_account(%L,%L,%L,%L,%L)',actor,'preferences',gen_random_uuid(),payload,business),'22023');
 perform pg_temp.expect_crop_error(format('select public.read_business_accounts(%L,%L)',outsider,business),'42501');
 update public.agricultural_products set active=false where id=coffee;
 payload:=jsonb_build_object('expectedVersion',4,'categories',jsonb_build_array('CASH'),'productIds',jsonb_build_array(coffee));
 perform pg_temp.expect_crop_error(format('select public.command_business_account(%L,%L,%L,%L,%L)',actor,'preferences',gen_random_uuid(),payload,business),'22023');
 perform pg_temp.check_crop((public.business_snapshot(business)->>'version')::integer=4,'invalid writes are atomic');
 perform pg_temp.check_crop(not has_table_privilege('authenticated','public.business_category_preferences','UPDATE'),'no direct preference edits');
 perform pg_temp.check_crop(not has_table_privilege('authenticated','public.product_categories','INSERT'),'no client taxonomy writes');
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','ec210000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.business_category_preferences) then raise exception 'RLS leaked another business categories'; end if;
 if (select count(*) from public.product_categories)<>2 then raise exception 'Authenticated taxonomy read failed'; end if;
end $$;
reset role;
select '1..1';
select 'ok 1 - canonical crop catalogue and isolated, history-preserving preferences';
rollback;
