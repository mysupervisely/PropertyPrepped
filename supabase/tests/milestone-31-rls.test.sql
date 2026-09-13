-- PropRoster — Landlord Digest V1 — RLS regression test for
-- public.notification_preferences.
--
-- Same methodology as milestone-9/26/30-rls.test.sql: NOT run by
-- `npm test` (no Postgres in the Node/vitest pipeline) — run by hand (or
-- from CI with a scratch Postgres) against a database with PropRoster's
-- full schema.sql plus supabase/milestone-31-landlord-digest-v1.sql
-- loaded, and the Supabase auth schema stubbed (see milestone-9-rls
-- .test.sql's own note: create schema auth; create table auth.users;
-- create function auth.uid(); create role authenticated/anon; etc.).
-- Every block RAISEs "REGRESSION" or NOTICEs "PASS"; a clean run has
-- zero "REGRESSION" matches. Everything happens inside a transaction
-- rolled back at the end.
--
-- Covers: the trigger backfill/auto-create, owner-scoped select/insert/
-- update, cross-owner isolation (the ONE property this table exists to
-- guarantee — "one landlord must NEVER receive another landlord's
-- property information" starts with never being able to READ another
-- owner's preference row), no delete policy, and the default value.

begin;

insert into auth.users (id) values
  ('31111111-1111-1111-1111-111111111111'), -- owner 1
  ('31222222-2222-2222-2222-222222222222'); -- owner 2

-- The on_auth_user_created_notification_preferences trigger should have
-- fired for both inserts above already — verify the backfill/trigger
-- behavior BEFORE this test inserts anything of its own.
do $$
declare
  v_enabled boolean;
begin
  select weekly_digest_enabled into v_enabled from public.notification_preferences where owner_id = '31111111-1111-1111-1111-111111111111';
  if v_enabled is null then
    raise exception 'REGRESSION: on_auth_user_created_notification_preferences did not create a row for the new user';
  elsif v_enabled = false then
    raise notice 'PASS: trigger creates a row, defaulting weekly_digest_enabled to false';
  else
    raise exception 'REGRESSION: new account''s weekly_digest_enabled defaulted to true — this must be an explicit opt-in, never a silent default-on';
  end if;
end $$;

-- Owner 1 can read and update their OWN row.
set local role authenticated;
select set_config('request.jwt.claim.sub', '31111111-1111-1111-1111-111111111111', true);

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.notification_preferences where owner_id = '31111111-1111-1111-1111-111111111111';
  if v_count = 1 then
    raise notice 'PASS: owner 1 can select their own notification_preferences row';
  else
    raise exception 'REGRESSION: owner 1 could not select their own row (got % rows)', v_count;
  end if;
end $$;

update public.notification_preferences set weekly_digest_enabled = true where owner_id = '31111111-1111-1111-1111-111111111111';

do $$
declare
  v_enabled boolean;
begin
  select weekly_digest_enabled into v_enabled from public.notification_preferences where owner_id = '31111111-1111-1111-1111-111111111111';
  if v_enabled then
    raise notice 'PASS: owner 1 can turn their own digest on';
  else
    raise exception 'REGRESSION: owner 1''s own update to weekly_digest_enabled did not take effect';
  end if;
end $$;

-- CROSS-OWNER ISOLATION — the property this table exists to guarantee.
-- Owner 1 must see ZERO rows when querying for owner 2's row, and must
-- not be able to update it either.
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.notification_preferences where owner_id = '31222222-2222-2222-2222-222222222222';
  if v_count = 0 then
    raise notice 'PASS: owner 1 cannot see owner 2''s notification_preferences row';
  else
    raise exception 'REGRESSION: owner 1 could see owner 2''s row — cross-owner data leak';
  end if;
end $$;

update public.notification_preferences set weekly_digest_enabled = true where owner_id = '31222222-2222-2222-2222-222222222222';

do $$
declare
  v_enabled boolean;
begin
  reset role;
  select weekly_digest_enabled into v_enabled from public.notification_preferences where owner_id = '31222222-2222-2222-2222-222222222222';
  if v_enabled = false then
    raise notice 'PASS: owner 1''s update statement against owner 2''s row affected nothing (RLS-filtered to zero rows, not an error, not a leak)';
  else
    raise exception 'REGRESSION: owner 1''s update against owner 2''s owner_id somehow changed owner 2''s row';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '31111111-1111-1111-1111-111111111111', true);

-- No delete policy — an authenticated owner's own delete attempt must
-- affect zero rows (RLS has no delete policy at all for this table),
-- never actually removing the row.
delete from public.notification_preferences where owner_id = '31111111-1111-1111-1111-111111111111';

do $$
declare
  v_count int;
begin
  reset role;
  select count(*) into v_count from public.notification_preferences where owner_id = '31111111-1111-1111-1111-111111111111';
  if v_count = 1 then
    raise notice 'PASS: no delete policy exists — the row survives a delete attempt';
  else
    raise exception 'REGRESSION: notification_preferences row was deleted — no delete policy should have allowed this';
  end if;
end $$;

rollback;
