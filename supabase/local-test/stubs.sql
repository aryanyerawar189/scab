-- Stand-ins for what Supabase provides, so the migrations run on plain Postgres + PostGIS.
-- Only for supabase/local-test/run.sh — never run against Supabase.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema extensions;
create schema auth;
create schema vault;
grant usage on schema public, extensions, auth to anon, authenticated, service_role;

-- auth.users + auth.uid(): set the "signed-in" user with
--   set request.jwt.claim.sub = '<uuid>';
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create publication supabase_realtime;

-- pg_cron: just records jobs, never runs them (call public.scab_housekeeping() yourself)
create schema cron;
create table cron.job (jobid serial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns int language sql as
  $$ insert into cron.job (jobname, schedule, command) values (n, s, c) returning jobid $$;
create function cron.unschedule(n text) returns boolean language sql as
  $$ delete from cron.job where jobname = n returning true $$;
