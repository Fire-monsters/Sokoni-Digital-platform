-- Run against an isolated database after the targeted repair; fixtures roll back.
begin;

create function pg_temp.assert_true(value boolean, message text) returns void
language plpgsql as $$
begin
  if value is distinct from true then raise exception 'Assertion failed: %', message; end if;
end;
$$;

do $$
declare k text := repeat('b', 64);
begin
  perform pg_temp.assert_true(public.consume_business_auth_limit(k, 2, 60), 'first request allowed');
  perform pg_temp.assert_true(public.consume_business_auth_limit(k, 2, 60), 'second request allowed');
  perform pg_temp.assert_true(not public.consume_business_auth_limit(k, 2, 60), 'third request denied');
  perform pg_temp.assert_true((select attempts = 3 from public.business_auth_limits where key_hash = k), 'atomic counter persisted');

  update public.business_auth_limits set window_start = clock_timestamp() - interval '61 seconds' where key_hash = k;
  perform pg_temp.assert_true(public.consume_business_auth_limit(k, 2, 60), 'expired window resets');
  perform pg_temp.assert_true((select attempts = 1 from public.business_auth_limits where key_hash = k), 'reset starts at one');

  begin
    perform public.consume_business_auth_limit('raw-phone-or-ip', 2, 60);
    raise exception 'Invalid keys must fail';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.consume_business_auth_limit(null, 2, 60);
    raise exception 'Null keys must fail';
  exception when sqlstate '22023' then null;
  end;

  perform pg_temp.assert_true((select relrowsecurity from pg_catalog.pg_class where oid = 'public.business_auth_limits'::regclass), 'RLS enabled');
  perform pg_temp.assert_true(not has_function_privilege('anon', 'public.consume_business_auth_limit(text,integer,integer)', 'EXECUTE'), 'anonymous callers denied');
  perform pg_temp.assert_true(not has_function_privilege('authenticated', 'public.consume_business_auth_limit(text,integer,integer)', 'EXECUTE'), 'user callers denied');
  perform pg_temp.assert_true(not has_table_privilege('authenticated', 'public.business_auth_limits', 'SELECT'), 'counter table private');
  perform pg_temp.assert_true(has_function_privilege('service_role', 'public.consume_business_auth_limit(text,integer,integer)', 'EXECUTE'), 'service role allowed');
end;
$$;

set local role service_role;
select public.consume_business_auth_limit(repeat('c', 64), 1, 60) as service_role_request_allowed;
reset role;

rollback;
