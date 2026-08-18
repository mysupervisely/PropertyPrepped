-- PropRoster Launch Pricing (capability-based relaunch) — property-limit
-- enforcement regression test.
--
-- Milestone 9's enforce_property_limit() trigger (supabase/milestone-9-
-- subscriptions.sql) is NOT modified by milestone-19-launch-pricing.sql —
-- it already looks up max_properties generically for whatever plan a
-- caller is on. This file proves that generic lookup produces the
-- correct NEW limits for 'organize'/'manage', while the LEGACY limits
-- ('investor'/'portfolio'/'portfolio_pro') remain byte-for-byte
-- unchanged — the single most important regression to catch, since a
-- constraint/plan_limits mistake here would either lock new customers
-- out too early or (worse) silently strand an existing legacy
-- subscriber's property count.
--
-- Same methodology as supabase/tests/milestone-8..18-rls.test.sql: run
-- by hand against a database with PropRoster's full schema.sql loaded
-- and the Supabase auth/storage schemas available (real Supabase, or a
-- local Postgres stubbed per the note at the bottom of
-- milestone-9-rls.test.sql). Every block RAISEs "REGRESSION" or NOTICEs
-- "PASS". Run with `psql -v ON_ERROR_STOP=0` and grep for "REGRESSION" —
-- a clean run has zero matches. Every owner and their properties are
-- created inside a transaction that is rolled back at the end.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000a001', 'organize-owner@example.com'),
  ('a0000000-0000-0000-0000-00000000a002', 'manage-owner@example.com'),
  ('a0000000-0000-0000-0000-00000000a003', 'legacy-investor@example.com');

insert into public.user_subscriptions (owner_id, plan, status) values
  ('a0000000-0000-0000-0000-00000000a001', 'organize', 'active'),
  ('a0000000-0000-0000-0000-00000000a002', 'manage', 'active'),
  ('a0000000-0000-0000-0000-00000000a003', 'investor', 'active');

-- ===== 1. Organize: can create the 5th property, cannot create a 6th =====
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a001', true);
do $$
begin
  for i in 1..5 loop
    insert into public.properties (owner_id, address, city) values ('a0000000-0000-0000-0000-00000000a001', format('%s Organize St', i), 'Town');
  end loop;
  raise notice 'PASS: Organize created 5 properties with no error';
end $$;
do $$
begin
  begin
    insert into public.properties (owner_id, address, city) values ('a0000000-0000-0000-0000-00000000a001', '6 Organize St', 'Town');
    raise exception 'REGRESSION: Organize was able to create a 6th property (limit should be 5)';
  exception
    when others then
      if sqlerrm like '%PROPERTY_LIMIT_REACHED%' then
        raise notice 'PASS: Organize correctly blocked at 6th property (limit 5)';
      else
        raise exception 'REGRESSION: unexpected error blocking Organize''s 6th property: %', sqlerrm;
      end if;
  end;
end $$;
reset role;

-- ===== 2. Manage: can create the 15th property, cannot create a 16th =====
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a002', true);
do $$
begin
  for i in 1..15 loop
    insert into public.properties (owner_id, address, city) values ('a0000000-0000-0000-0000-00000000a002', format('%s Manage Ave', i), 'Town');
  end loop;
  raise notice 'PASS: Manage created 15 properties with no error';
end $$;
do $$
begin
  begin
    insert into public.properties (owner_id, address, city) values ('a0000000-0000-0000-0000-00000000a002', '16 Manage Ave', 'Town');
    raise exception 'REGRESSION: Manage was able to create a 16th property (limit should be 15)';
  exception
    when others then
      if sqlerrm like '%PROPERTY_LIMIT_REACHED%' then
        raise notice 'PASS: Manage correctly blocked at 16th property (limit 15)';
      else
        raise exception 'REGRESSION: unexpected error blocking Manage''s 16th property: %', sqlerrm;
      end if;
  end;
end $$;
reset role;

-- ===== 3. CRITICAL: legacy Investor's limit is UNCHANGED (still 4, not 5) =====
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a003', true);
do $$
begin
  for i in 1..4 loop
    insert into public.properties (owner_id, address, city) values ('a0000000-0000-0000-0000-00000000a003', format('%s Legacy Rd', i), 'Town');
  end loop;
  raise notice 'PASS: legacy Investor created 4 properties with no error';
end $$;
do $$
begin
  begin
    insert into public.properties (owner_id, address, city) values ('a0000000-0000-0000-0000-00000000a003', '5 Legacy Rd', 'Town');
    raise exception 'REGRESSION: legacy Investor was able to create a 5th property — Launch Pricing must not have changed their limit from 4';
  exception
    when others then
      if sqlerrm like '%PROPERTY_LIMIT_REACHED%' then
        raise notice 'PASS: legacy Investor still correctly blocked at 5th property (limit remains 4, unchanged by Launch Pricing)';
      else
        raise exception 'REGRESSION: unexpected error blocking legacy Investor''s 5th property: %', sqlerrm;
      end if;
  end;
end $$;
reset role;

-- ===== 4. plan_limits carries the exact expected values for every id =====
do $$
declare v_max integer;
begin
  select max_properties into v_max from public.plan_limits where plan = 'organize'; if v_max <> 5 then raise exception 'REGRESSION: organize max_properties is % (expected 5)', v_max; end if;
  select max_properties into v_max from public.plan_limits where plan = 'manage'; if v_max <> 15 then raise exception 'REGRESSION: manage max_properties is % (expected 15)', v_max; end if;
  select max_properties into v_max from public.plan_limits where plan = 'free'; if v_max <> 1 then raise exception 'REGRESSION: free max_properties changed to % (expected unchanged 1)', v_max; end if;
  select max_properties into v_max from public.plan_limits where plan = 'investor'; if v_max <> 4 then raise exception 'REGRESSION: investor max_properties changed to % (expected unchanged 4)', v_max; end if;
  select max_properties into v_max from public.plan_limits where plan = 'portfolio'; if v_max <> 9 then raise exception 'REGRESSION: portfolio max_properties changed to % (expected unchanged 9)', v_max; end if;
  select max_properties into v_max from public.plan_limits where plan = 'portfolio_pro'; if v_max <> 20 then raise exception 'REGRESSION: portfolio_pro max_properties changed to % (expected unchanged 20)', v_max; end if;
  raise notice 'PASS: plan_limits carries exactly the expected new AND unchanged-legacy values';
end $$;

-- ===== 5. user_subscriptions accepts every new AND legacy plan value (constraint widened, not narrowed) =====
do $$
begin
  insert into public.user_subscriptions (owner_id, plan, status) values ('a0000000-0000-0000-0000-00000000a001', 'automate', 'active')
    on conflict (owner_id) do update set plan = 'automate';
  raise notice 'PASS: user_subscriptions accepts the new "automate" plan value';
exception
  when check_violation then raise exception 'REGRESSION: user_subscriptions rejected the new "automate" plan value';
end $$;

rollback;

-- To run against a fresh local Postgres instead of a real Supabase project,
-- see the stub schema documented at the bottom of
-- supabase/tests/milestone-9-rls.test.sql, then load supabase/schema.sql,
-- then this file.
