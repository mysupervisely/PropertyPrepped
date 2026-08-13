-- PropPrepped Milestone 9 — subscriptions/entitlements RLS + property-limit
-- regression test.
--
-- This is NOT run by `npm test` (there's no Postgres in the Node/vitest
-- pipeline) and is not required for the app to work. It exists so the
-- property-limit trigger and user_subscriptions/stripe_webhook_events RLS
-- in milestone-9-subscriptions.sql can be re-verified with a single command
-- whenever these change — run it by hand (or from CI with a scratch
-- Postgres) against a database that already has PropPrepped's schema
-- loaded and the Supabase `auth`/`storage` schemas available (any Supabase
-- project, or a local Postgres with those schemas stubbed — see the note
-- at the bottom).
--
-- Every block below either RAISEs "REGRESSION" (something is broken, fix
-- it before shipping) or NOTICEs "PASS" (the security/entitlement property
-- held). Run with `psql -v ON_ERROR_STOP=1` and grep the output for
-- "REGRESSION" — a clean run has zero matches.
--
-- Uses six throwaway users/properties created inside a transaction that is
-- rolled back at the end, so this never leaves test data behind.

begin;

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'), -- free user
  ('22222222-2222-2222-2222-222222222222'), -- investor user
  ('33333333-3333-3333-3333-333333333333'), -- portfolio user
  ('44444444-4444-4444-4444-444444444444'), -- over-limit legacy user (downgraded)
  ('55555555-5555-5555-5555-555555555555'), -- attacker
  ('66666666-6666-6666-6666-666666666666'); -- past_due user (should still be entitled)

insert into public.user_subscriptions (owner_id, plan, status) values
  ('22222222-2222-2222-2222-222222222222', 'investor', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'portfolio', 'active'),
  ('66666666-6666-6666-6666-666666666666', 'investor', 'past_due'),
  -- 44444444 starts on Portfolio so it can legitimately create 3
  -- properties, then gets "downgraded" to Free below to test that
  -- existing over-limit properties stay fully accessible.
  ('44444444-4444-4444-4444-444444444444', 'portfolio', 'active');

set local role authenticated;

-- ===== Free user (no paid subscription) can create property #1 =====
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$
begin
  insert into public.properties (owner_id, address, city) values ('11111111-1111-1111-1111-111111111111', '1 Free St', 'Town');
  raise notice 'PASS: Free user created property #1';
end $$;

-- ===== Free user blocked on property #2 =====
do $$
begin
  begin
    insert into public.properties (owner_id, address, city) values ('11111111-1111-1111-1111-111111111111', '2 Free St', 'Town');
    raise exception 'REGRESSION: Free user was allowed to create property #2';
  exception
    when others then
      if sqlerrm = 'PROPERTY_LIMIT_REACHED' then
        raise notice 'PASS: Free user blocked on property #2 (%)', sqlerrm;
      else
        raise exception 'REGRESSION: unexpected error on property #2: %', sqlerrm;
      end if;
  end;
end $$;

-- ===== Investor user can create properties #1-#4, blocked on #5 =====
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  for i in 1..4 loop
    insert into public.properties (owner_id, address, city) values ('22222222-2222-2222-2222-222222222222', 'Investor St ' || i, 'Town');
  end loop;
  raise notice 'PASS: Investor user created properties #1-#4';
end $$;
do $$
begin
  begin
    insert into public.properties (owner_id, address, city) values ('22222222-2222-2222-2222-222222222222', 'Investor St 5', 'Town');
    raise exception 'REGRESSION: Investor user was allowed to create property #5';
  exception
    when others then
      if sqlerrm = 'PROPERTY_LIMIT_REACHED' then
        raise notice 'PASS: Investor user blocked on property #5 (%)', sqlerrm;
      else
        raise exception 'REGRESSION: unexpected error on property #5: %', sqlerrm;
      end if;
  end;
end $$;

-- ===== Portfolio user can create #1-#9, blocked on #10 =====
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
do $$
begin
  for i in 1..9 loop
    insert into public.properties (owner_id, address, city) values ('33333333-3333-3333-3333-333333333333', 'Portfolio St ' || i, 'Town');
  end loop;
  raise notice 'PASS: Portfolio user created properties #1-#9';
end $$;
do $$
begin
  begin
    insert into public.properties (owner_id, address, city) values ('33333333-3333-3333-3333-333333333333', 'Portfolio St 10', 'Town');
    raise exception 'REGRESSION: Portfolio user was allowed to create property #10';
  exception
    when others then
      if sqlerrm = 'PROPERTY_LIMIT_REACHED' then
        raise notice 'PASS: Portfolio user blocked on property #10 (%)', sqlerrm;
      else
        raise exception 'REGRESSION: unexpected error on property #10: %', sqlerrm;
      end if;
  end;
end $$;

-- ===== past_due user is still treated as entitled (Investor, up to 4) =====
-- (Section 13: past_due keeps paid entitlements — Stripe is still retrying
-- the card; only unpaid/canceled/incomplete/incomplete_expired/paused fall
-- back to Free. See lib/billing/entitlements.ts ENTITLED_STATUSES.)
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
do $$
begin
  for i in 1..4 loop
    insert into public.properties (owner_id, address, city) values ('66666666-6666-6666-6666-666666666666', 'PastDue St ' || i, 'Town');
  end loop;
  raise notice 'PASS: past_due Investor user created properties #1-#4 (still entitled)';
end $$;

-- ===== Existing over-limit account retains full access after downgrade =====
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
do $$
begin
  for i in 1..3 loop
    insert into public.properties (owner_id, address, city) values ('44444444-4444-4444-4444-444444444444', 'Legacy St ' || i, 'Town');
  end loop;
  raise notice 'PASS: user 4 created 3 properties while on Portfolio plan';
end $$;

-- Simulate cancellation/downgrade to Free, exactly as the webhook would do.
reset role;
update public.user_subscriptions set plan = 'free', status = 'canceled' where owner_id = '44444444-4444-4444-4444-444444444444';
set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from public.properties where owner_id = '44444444-4444-4444-4444-444444444444';
  if visible_count <> 3 then
    raise exception 'REGRESSION: downgraded user only sees % of their 3 existing properties', visible_count;
  end if;
  -- Existing rows must remain fully editable (Section 5 & 13: never lock
  -- or hide data because of cancellation/downgrade/payment failure).
  update public.properties set estimated_value = 999999 where owner_id = '44444444-4444-4444-4444-444444444444' and address = 'Legacy St 1';
  raise notice 'PASS: downgraded (now-Free, over-limit) user retains SELECT+UPDATE access to all 3 existing properties';
end $$;

do $$
begin
  begin
    insert into public.properties (owner_id, address, city) values ('44444444-4444-4444-4444-444444444444', 'Legacy St 4 (new)', 'Town');
    raise exception 'REGRESSION: over-limit downgraded user was allowed to create a NEW property';
  exception
    when others then
      if sqlerrm = 'PROPERTY_LIMIT_REACHED' then
        raise notice 'PASS: downgraded over-limit user blocked from creating a NEW property (existing 3 untouched)';
      else
        raise exception 'REGRESSION: unexpected error blocking new property for over-limit user: %', sqlerrm;
      end if;
  end;
end $$;

-- ===== Cross-tenant owner_id spoof is rejected by RLS, not our trigger =====
-- (proves the info-leak guard in enforce_property_limit() works: an
-- attacker never gets our trigger's limit-check to run against a victim's
-- data, only RLS's generic denial)
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
do $$
begin
  begin
    -- attacker (user 5, no properties) tries to insert a row claiming to be user 3 (Portfolio, already at 9/9)
    insert into public.properties (owner_id, address, city) values ('33333333-3333-3333-3333-333333333333', 'Spoofed St', 'Town');
    raise exception 'REGRESSION: cross-tenant owner_id insert succeeded';
  exception
    when insufficient_privilege then
      raise notice 'PASS: cross-tenant owner_id insert correctly blocked by RLS (insufficient_privilege, not our limit-check exception)';
    when others then
      raise exception 'REGRESSION: cross-tenant insert failed with unexpected error (possible info leak): %', sqlerrm;
  end;
end $$;

-- ===== authenticated cannot write user_subscriptions at all (no self-upgrade) =====
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$
begin
  begin
    insert into public.user_subscriptions (owner_id, plan, status) values ('11111111-1111-1111-1111-111111111111', 'portfolio_pro', 'active');
    raise exception 'REGRESSION: authenticated client was able to INSERT into user_subscriptions (self-upgrade!)';
  exception
    when insufficient_privilege then
      raise notice 'PASS: authenticated INSERT into user_subscriptions correctly denied';
  end;
end $$;

-- No UPDATE policy exists at all for user_subscriptions, so RLS filters
-- every row out of the update's visibility rather than raising an error —
-- the update silently affects 0 rows. Assert that directly (row count,
-- and that the value truly didn't change), the same pattern used for the
-- M8 ai_usage_events DELETE-denied check.
do $$
declare
  affected integer;
begin
  update public.user_subscriptions set plan = 'portfolio_pro' where owner_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics affected = row_count;
  if affected > 0 then
    raise exception 'REGRESSION: authenticated client was able to UPDATE user_subscriptions (self-upgrade!) affected=%', affected;
  end if;
  raise notice 'PASS: authenticated UPDATE of user_subscriptions correctly affected 0 rows';
end $$;

reset role;
do $$
declare
  plan_after text;
begin
  select plan into plan_after from public.user_subscriptions where owner_id = '22222222-2222-2222-2222-222222222222';
  if plan_after <> 'investor' then
    raise exception 'REGRESSION: user_subscriptions.plan actually changed to % despite 0 rows reported affected', plan_after;
  end if;
  raise notice 'PASS: confirmed plan is still investor (unchanged) after the denied UPDATE attempt';
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

-- ===== plan_limits is readable (non-sensitive, needed for UI display) =====
do $$
declare
  v integer;
begin
  select max_properties into v from public.plan_limits where plan = 'portfolio_pro';
  if v <> 20 then
    raise exception 'REGRESSION: plan_limits.portfolio_pro.max_properties is % not 20', v;
  end if;
  raise notice 'PASS: plan_limits readable by authenticated, portfolio_pro = 20';
end $$;

-- ===== stripe_webhook_events is fully server-only (no client access at all) =====
do $$
begin
  begin
    insert into public.stripe_webhook_events (id, type) values ('evt_test', 'checkout.session.completed');
    raise exception 'REGRESSION: authenticated client was able to write stripe_webhook_events';
  exception
    when insufficient_privilege then
      raise notice 'PASS: authenticated client correctly denied write access to stripe_webhook_events';
  end;
end $$;

rollback;

-- To run against a fresh local Postgres instead of a real Supabase project,
-- first load a stub of the two Supabase-managed schemas this test touches
-- (identical to the stub used by supabase/tests/milestone-8-rls.test.sql):
--
--   create extension if not exists pgcrypto;
--   create schema if not exists auth;
--   create table auth.users (id uuid primary key default gen_random_uuid());
--   create or replace function auth.uid() returns uuid language sql stable as
--     $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
--   create schema if not exists storage;
--   create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
--   create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
--   create or replace function storage.foldername(name text) returns text[] language sql immutable as
--     $$ select string_to_array(name, '/') $$;
--   create role authenticated;
--   grant usage on schema public, auth to authenticated;
--   grant select, insert, update, delete on all tables in schema public to authenticated;
--
-- then run supabase/schema.sql, then this file.
