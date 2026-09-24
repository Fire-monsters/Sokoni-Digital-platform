begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,aud,role,email,phone,phone_confirmed_at) values
 ('a3300000-0000-4000-8000-000000000001','authenticated','authenticated','applicant33@test.example','256700000331',now()),
 ('a3300000-0000-4000-8000-000000000002','authenticated','authenticated','reviewer33@test.example','256700000332',now()),
 ('a3300000-0000-4000-8000-000000000003','authenticated','authenticated','other33@test.example','256700000333',now());
insert into public.staff_members(user_id,display_name,role) values
 ('a3300000-0000-4000-8000-000000000002','Reviewer','admin'),
 ('a3300000-0000-4000-8000-000000000003','Other reviewer','agent');
insert into public.markets(id,name,slug) values ('a3300000-0000-4000-8000-000000000004','Test Market','application-review-test');

select public.save_account_application('a3300000-0000-4000-8000-000000000001','vendor',
 '{"personalDetails":{"fullName":"Test Vendor","nationalIdNumber":"CM123456789"},"stallDetails":{"businessName":"Test Stall","stallNumber":"A33","marketIdentificationNumber":"M33","marketId":"a3300000-0000-4000-8000-000000000004","productCategories":["Fruit"]},"verification":{"hasMarketLeadershipApproval":true,"hasAcceptedPlatformTerms":true,"hasAcceptedCommissionTerms":true}}');
select id::text as id from public.account_applications where user_id='a3300000-0000-4000-8000-000000000001' and type='vendor' \gset vendor_
select is((select status from public.account_applications where id=:'vendor_id'),'draft','applicant draft is persisted');
select is((select verification_status::text from public.sellers where id=:'vendor_id'),'pending','saving does not grant vendor eligibility');
select is(public.admin_list_applications(p_type=>'vendor',p_query=>'Test Vendor')->'pagination'->>'totalItems','0','drafts do not enter review queue');
select ok(cardinality(public.application_missing_requirements(:'vendor_id'))=3,'missing evidence blocks submission');
select throws_ok($$select public.submit_account_application('a3300000-0000-4000-8000-000000000001','vendor','a3300000-0000-4000-8000-000000000010')$$,
 '23514',null,'incomplete submission rejected');

-- Simulate uploads through the private storage service, then verify completion against storage metadata.
select public.register_application_document('a3300000-0000-4000-8000-000000000001','vendor',kind,'image/jpeg',100)
 from unnest(array['national_id','stall_photo','market_confirmation']) kind;
select throws_ok(format('select public.complete_application_document(%L,%L)','a3300000-0000-4000-8000-000000000001',
  (select id from public.application_documents where application_id=:'vendor_id' limit 1)), '23514',null,'cannot mark a missing upload complete');
select throws_ok(format('select public.complete_application_document(%L,%L)','a3300000-0000-4000-8000-000000000003',
  (select id from public.application_documents where application_id=:'vendor_id' limit 1)), 'P0002',null,'another applicant cannot complete this document');
insert into storage.objects(bucket_id,name,metadata)
 select 'verification-documents',storage_path,'{"size":100,"mimetype":"image/jpeg"}'::jsonb
 from public.application_documents where application_id=:'vendor_id';
select public.complete_application_document('a3300000-0000-4000-8000-000000000001',id)
 from public.application_documents where application_id=:'vendor_id';
select is(cardinality(public.application_missing_requirements(:'vendor_id')),0,'completed evidence satisfies requirements');
update auth.users set phone_confirmed_at=null where id='a3300000-0000-4000-8000-000000000001';
select ok('Verified phone'=any(public.application_missing_requirements(:'vendor_id')),'phone verification comes from auth record');
update auth.users set phone_confirmed_at=now() where id='a3300000-0000-4000-8000-000000000001';
select is(public.submit_account_application('a3300000-0000-4000-8000-000000000001','vendor','a3300000-0000-4000-8000-000000000010')->>'applicationStatus','pending_review','complete application submitted');
select is(public.submit_account_application('a3300000-0000-4000-8000-000000000001','vendor','a3300000-0000-4000-8000-000000000010')->>'duplicate','true','submission retry is idempotent');
select throws_ok($$select public.save_account_application('a3300000-0000-4000-8000-000000000001','vendor','{}')$$,'23514',null,'submitted evidence cannot be edited');
select version as version from public.account_applications where id=:'vendor_id' \gset vendor_
select is(public.review_account_application(:'vendor_id','a3300000-0000-4000-8000-000000000002','start-review',:vendor_version,'a3300000-0000-4000-8000-000000000011')->>'status','in_review','review claims application');
select is(public.admin_list_applications(p_type=>'vendor',p_query=>'Test Vendor')->'data'->0->'reviewer'->>'name','Reviewer','queue exposes reviewer ownership');
select is(public.admin_list_applications(p_type=>'vendor',p_market_id=>'a3300000-0000-4000-8000-000000000004')->'data'->0->>'id',:'vendor_id','market filter includes submitted market before approval');
select is(public.review_account_application(:'vendor_id','a3300000-0000-4000-8000-000000000002','start-review',:vendor_version,'a3300000-0000-4000-8000-000000000011')->>'duplicate','true','review claim replay does not duplicate audit');
select throws_ok(format('select public.review_account_application(%L,%L,%L,%s,%L)',:'vendor_id','a3300000-0000-4000-8000-000000000003','approve',:vendor_version+1,'a3300000-0000-4000-8000-000000000012'),
 '23514',null,'other reviewer cannot decide claimed application');
select throws_ok(format('select public.review_account_application(%L,%L,%L,%s,%L)',:'vendor_id','a3300000-0000-4000-8000-000000000002','approve',:vendor_version,'a3300000-0000-4000-8000-000000000012'),
 '40001',null,'stale decisions fail');
select throws_ok(format('select public.review_account_application(%L,%L,%L,%s,%L)',:'vendor_id','a3300000-0000-4000-8000-000000000001','approve',:vendor_version+1,'a3300000-0000-4000-8000-000000000012'),
 '42501',null,'applicant cannot self approve');
select is(public.review_account_application(:'vendor_id','a3300000-0000-4000-8000-000000000002','request-changes',:vendor_version+1,'a3300000-0000-4000-8000-000000000013','Clearer ID required','Private verification concern',array['NATIONAL_ID_IMAGE_UNREADABLE'])->>'status','changes_requested','changes requested with structured issues');
select is((select reason from public.account_applications where id=:'vendor_id'),'Clearer ID required','applicant-facing reason persisted');
select is((select details ? 'internalNotes' from public.account_applications where id=:'vendor_id'),false,'private notes are separate from applicant details');
select is((select event->>'internalNotes' from jsonb_array_elements(public.get_application_review(:'vendor_id')->'timeline') event where event->>'action'='request-changes'),'Private verification concern','review timeline contains private notes');
select public.submit_account_application('a3300000-0000-4000-8000-000000000001','vendor','a3300000-0000-4000-8000-000000000014');
select version as version from public.account_applications where id=:'vendor_id' \gset vendor_
select public.review_account_application(:'vendor_id','a3300000-0000-4000-8000-000000000002','start-review',:vendor_version,'a3300000-0000-4000-8000-000000000015');
select is(public.review_account_application(:'vendor_id','a3300000-0000-4000-8000-000000000002','approve',:vendor_version+1,'a3300000-0000-4000-8000-000000000016')->>'status','approved','vendor approved');
select is((select verification_status::text from public.sellers where id=:'vendor_id'),'approved','approval activates existing vendor account atomically');
select is((select market_id::text from public.sellers where id=:'vendor_id'),'a3300000-0000-4000-8000-000000000004','approval links vendor market');
select is(public.review_account_application(:'vendor_id','a3300000-0000-4000-8000-000000000002','approve',:vendor_version+1,'a3300000-0000-4000-8000-000000000016')->>'duplicate','true','approval replay succeeds');
select throws_ok(format('select public.review_account_application(%L,%L,%L,%s,%L,%L)',:'vendor_id','a3300000-0000-4000-8000-000000000002','approve',:vendor_version+1,'a3300000-0000-4000-8000-000000000016','Changed reason'),
 '23505',null,'reused operation ID rejects changed payload');
select is(public.review_account_application(:'vendor_id','a3300000-0000-4000-8000-000000000002','suspend',:vendor_version+2,'a3300000-0000-4000-8000-000000000017','Verification revoked')->>'status','suspended','approved vendor can be suspended');
select is((select verification_status::text from public.sellers where id=:'vendor_id'),'suspended','suspension revokes operational eligibility');

select public.save_account_application('a3300000-0000-4000-8000-000000000001','rider',
 '{"personalDetails":{"fullName":"Test Rider","nationalIdNumber":"CM123456789"},"motorcycleDetails":{"motorcycleNumberPlate":"UFA123A","vehicleType":"motorcycle","primaryOperatingArea":"Kitooro"},"associationAndNextOfKin":{"riderAssociation":"Kitooro Riders","associationIdentifier":"A123","nextOfKinName":"Test Kin","nextOfKinPhone":"+256700000334","nextOfKinRelationship":"Sibling"},"verification":{"hasAssociationConfirmation":true,"hasAcceptedPlatformTerms":true,"hasAcceptedSafetyTerms":true}}');
select id::text as id from public.account_applications where user_id='a3300000-0000-4000-8000-000000000001' and type='rider' \gset rider_
select public.register_application_document('a3300000-0000-4000-8000-000000000001','rider',kind,'image/jpeg',100)
 from unnest(array['national_id','motorcycle_photo','association_proof']) kind;
insert into storage.objects(bucket_id,name,metadata)
 select 'verification-documents',storage_path,'{"size":100,"mimetype":"image/jpeg"}'::jsonb
 from public.application_documents where application_id=:'rider_id';
select public.complete_application_document('a3300000-0000-4000-8000-000000000001',id)
 from public.application_documents where application_id=:'rider_id';
select public.submit_account_application('a3300000-0000-4000-8000-000000000001','rider','a3300000-0000-4000-8000-000000000020');
select version as version from public.account_applications where id=:'rider_id' \gset rider_
select public.review_account_application(:'rider_id','a3300000-0000-4000-8000-000000000002','start-review',:rider_version,'a3300000-0000-4000-8000-000000000021');
select public.review_account_application(:'rider_id','a3300000-0000-4000-8000-000000000002','approve',:rider_version+1,'a3300000-0000-4000-8000-000000000022');
select is((select verification_status::text from public.transporter_profiles where id=:'rider_id'),'approved','rider approval activates existing profile');
select is((select availability::text from public.transporter_profiles where id=:'rider_id'),'offline','rider must explicitly go online after approval');
select public.review_account_application(:'rider_id','a3300000-0000-4000-8000-000000000002','notes',:rider_version+2,'a3300000-0000-4000-8000-000000000023',null,'Documents verified in person');
select is((select internal_notes from public.application_review_events where application_id=:'rider_id' and action='notes'),'Documents verified in person','private notes persist without changing approval state');
select is(public.review_account_application(:'rider_id','a3300000-0000-4000-8000-000000000002','suspend',:rider_version+3,'a3300000-0000-4000-8000-000000000024','Safety investigation')->>'status','suspended','rider can be suspended');
select is((select verification_status::text from public.transporter_profiles where id=:'rider_id'),'suspended','rider suspension revokes eligibility');
select is((select availability::text from public.transporter_profiles where id=:'rider_id'),'offline','suspended rider is offline');
insert into public.sellers(id,business_name) values('a3300000-0000-4000-8000-000000000040','Incomplete legacy stall');
select public.review_account_application('a3300000-0000-4000-8000-000000000040','a3300000-0000-4000-8000-000000000002','start-review',1,'a3300000-0000-4000-8000-000000000041');
select throws_ok($$select public.review_account_application('a3300000-0000-4000-8000-000000000040','a3300000-0000-4000-8000-000000000002','approve',2,'a3300000-0000-4000-8000-000000000042')$$,
 '23514',null,'legacy incomplete application cannot be approved');
select is(public.review_account_application('a3300000-0000-4000-8000-000000000040','a3300000-0000-4000-8000-000000000002','reject',2,'a3300000-0000-4000-8000-000000000042','Unable to verify identity')->>'status','rejected','reviewer can reject an incomplete application');
select is((select verification_status::text from public.sellers where id='a3300000-0000-4000-8000-000000000040'),'rejected','rejection persists operational status');
select ok(not has_table_privilege('authenticated','public.application_review_events','select'),'private notes not directly accessible to applicants');
select ok(not has_function_privilege('authenticated','public.review_account_application(uuid,uuid,text,integer,uuid,text,text,text[])','execute'),'client cannot bypass review authorization');
select ok(not has_function_privilege('anon','public.get_application_review(uuid)','execute'),'documents and identities are not public');
select ok(exists(select 1 from public.admin_audit_event_projection where entity_id=:'rider_id' and action='application.approved'),'application decision appears in global audit feed');
select * from finish();
rollback;
