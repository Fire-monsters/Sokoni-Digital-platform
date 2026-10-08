-- Targeted repair for a hosted project using the legacy catalogue baseline.
-- Run as the database owner. This does not mark any migration as applied or
-- install business onboarding. It unblocks the /v1/business-auth endpoints.
begin;

select pg_advisory_xact_lock(hashtextextended('sokoni:business-auth-rate-limiter-repair', 0));

create table if not exists public.business_auth_limits (
  key_hash text primary key,
  window_start timestamptz not null,
  attempts integer not null
);

-- Refuse to use an incompatible pre-existing table rather than silently changing it.
do $$
begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'business_auth_limits') <> 3
    or (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'business_auth_limits'
          and is_nullable = 'NO' and (
            (column_name = 'key_hash' and data_type = 'text')
            or (column_name = 'window_start' and data_type = 'timestamp with time zone')
            or (column_name = 'attempts' and data_type = 'integer')
          )) <> 3
    or not exists (
      select 1 from pg_catalog.pg_constraint c
      join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attname = 'key_hash'
      where c.conrelid = 'public.business_auth_limits'::regclass
        and c.contype = 'p' and c.conkey = array[a.attnum]
    ) then
    raise exception 'Existing business_auth_limits table has an incompatible definition';
  end if;
end;
$$;

alter table public.business_auth_limits enable row level security;
revoke all on public.business_auth_limits from public, anon, authenticated;

create or replace function public.consume_business_auth_limit(
  p_key text, p_max integer, p_seconds integer
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_key is null or p_max is null or p_seconds is null
    or p_key !~ '^[a-f0-9]{64}$'
    or p_max not between 1 and 1000
    or p_seconds not between 1 and 3600 then
    raise exception 'Invalid rate limit' using errcode = '22023';
  end if;
  insert into public.business_auth_limits as l values (p_key, clock_timestamp(), 1)
  on conflict (key_hash) do update set
    attempts = case when l.window_start <= clock_timestamp() - make_interval(secs => p_seconds)
      then 1 else l.attempts + 1 end,
    window_start = case when l.window_start <= clock_timestamp() - make_interval(secs => p_seconds)
      then clock_timestamp() else l.window_start end
  returning attempts into n;
  delete from public.business_auth_limits where window_start < now() - interval '1 day';
  return n <= p_max;
end;
$$;

revoke all on function public.consume_business_auth_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_business_auth_limit(text, integer, integer)
  to service_role;

notify pgrst, 'reload schema';
commit;
