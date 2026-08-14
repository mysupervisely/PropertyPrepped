-- PropRoster Milestone 11 — Property Watch RLS regression test.
--
-- This is NOT run by `npm test` (there's no Postgres in the Node/vitest
-- pipeline) and is not required for the app to work. It exists so
-- property_watch_items' RLS in milestone-11-property-watch.sql can be
-- re-verified with a single command whenever it changes — run it by hand
-- against a database that already has PropPrepped's full schema loaded
-- (schema.sql + every milestone-*.sql, including milestone-10-tenant-
-- connect.sql for the tenant test below) and the Supabase auth/storage
-- schemas available.
--
-- Every block below either RAISEs "REGRESSION" (something is broken, fix
-- it before shipping) or NOTICEs "PASS" (the security property held). Run
-- with `psql -v ON_ERROR_STOP=1` and grep the output for "REGRESSION" — a
-- clean run has zero matches.
--
-- Uses throwaway users/properties created inside a transaction that is
-- rolled back at the end, so this never leaves test data behind.

begin;

insert into auth.users (id) values
  ('a1111111-1111-1111-1111-111111111111'), -- Owner A
  ('b2222222-2222-2222-2222-222222222222'), -- Owner B (attacker against Owner A)
  ('c3333333-3333-3333-3333-333333333333'); -- Tenant with legitimate access to Owner A's property

set local role authenticated;

-- ===== Owner A creates a property + a lease, then a Watch item sourced from that lease =====
select set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
do $$
declare
  v_property_id uuid;
  v_lease_id uuid;
  v_watch_id uuid;
begin
  insert into public.properties (owner_id, address, city) values ('a1111111-1111-1111-1111-111111111111', '1 Owner A St', 'Town') returning id into v_property_id;
  insert into public.leases (owner_id, property_id, tenant_name, start_date, end_date) values ('a1111111-1111-1111-1111-111111111111', v_property_id, 'Test Tenant', current_date, current_date + 60)
    returning id into v_lease_id;
  insert into public.property_watch_items (owner_id, property_id, source_type, source_id, event_key, category, title, event_date)
    values ('a1111111-1111-1111-1111-111111111111', v_property_id, 'lease', v_lease_id, 'lease_expiration', 'Lease', 'Lease Expiring', current_date + 60)
    returning id into v_watch_id;
  raise notice 'PASS: Owner A created a property, lease and a lease-sourced Watch item';

  perform set_config('pw_test.property_a', v_property_id::text, false);
  perform set_config('pw_test.lease_a', v_lease_id::text, false);
  perform set_config('pw_test.watch_a', v_watch_id::text, false);
end $$;

-- ===== A manual Watch item (Section 13) also works, with a null source_id =====
do $$
begin
  insert into public.property_watch_items (owner_id, property_id, source_type, source_id, event_key, category, title, event_date)
    values ('a1111111-1111-1111-1111-111111111111', current_setting('pw_test.property_a')::uuid, 'manual', null, 'manual', 'Inspection', 'Pool inspection', current_date + 30);
  insert into public.property_watch_items (owner_id, property_id, source_type, source_id, event_key, category, title, event_date)
    values ('a1111111-1111-1111-1111-111111111111', current_setting('pw_test.property_a')::uuid, 'manual', null, 'manual', 'Inspection', 'Second manual item', current_date + 45);
  raise notice 'PASS: two manual Watch items (null source_id) coexist without colliding';
end $$;

-- ===== Owner B sets up their own property (for the cross-property forgery test below) =====
select set_config('request.jwt.claim.sub', 'b2222222-2222-2222-2222-222222222222', true);
do $$
declare
  v_property_id uuid;
begin
  insert into public.properties (owner_id, address, city) values ('b2222222-2222-2222-2222-222222222222', '2 Owner B Ave', 'Town') returning id into v_property_id;
  perform set_config('pw_test.property_b', v_property_id::text, false);
  raise notice 'PASS: Owner B created their own property';
end $$;

-- ===== TEST 1: Owner A cannot access Owner B's watch items (and vice versa) =====
do $$
begin
  if exists (select 1 from public.property_watch_items where owner_id = 'b2222222-2222-2222-2222-222222222222') then
    raise exception 'REGRESSION: Owner A (current role) can see a row belonging to Owner B before Owner B created any — test setup bug';
  end if;
  raise notice 'PASS: Owner A sees zero of Owner B''s watch items (none exist yet, sanity check)';
end $$;

select set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
do $$
declare
  v_count int;
begin
  -- Owner B has no watch items yet; insert one as Owner B first, then re-check as Owner A.
  perform set_config('request.jwt.claim.sub', 'b2222222-2222-2222-2222-222222222222', true);
  insert into public.property_watch_items (owner_id, property_id, source_type, source_id, event_key, category, title, event_date)
    values ('b2222222-2222-2222-2222-222222222222', current_setting('pw_test.property_b')::uuid, 'manual', null, 'manual', 'Other', 'Owner B private reminder', current_date + 10);

  perform set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
  select count(*) into v_count from public.property_watch_items where title = 'Owner B private reminder';
  if v_count <> 0 then
    raise exception 'REGRESSION: Owner A (uid a1111...) can see Owner B''s watch item';
  end if;
  raise notice 'PASS: Owner A cannot see Owner B''s watch item (TEST 1a)';
end $$;

select set_config('request.jwt.claim.sub', 'b2222222-2222-2222-2222-222222222222', true);
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.property_watch_items where title = 'Lease Expiring' and property_id = current_setting('pw_test.property_a')::uuid;
  if v_count <> 0 then
    raise exception 'REGRESSION: Owner B (uid b2222...) can see Owner A''s watch item';
  end if;
  raise notice 'PASS: Owner B cannot see Owner A''s watch item (TEST 1b)';
end $$;

-- ===== TEST 1c: Owner B cannot update or delete Owner A's watch item =====
do $$
begin
  update public.property_watch_items set status = 'Dismissed' where id = current_setting('pw_test.watch_a')::uuid;
  if found then
    raise exception 'REGRESSION: Owner B was able to update Owner A''s watch item';
  end if;
  raise notice 'PASS: Owner B''s update of Owner A''s watch item affected zero rows';
end $$;
do $$
begin
  delete from public.property_watch_items where id = current_setting('pw_test.watch_a')::uuid;
  if found then
    raise exception 'REGRESSION: Owner B was able to delete Owner A''s watch item';
  end if;
  raise notice 'PASS: Owner B''s delete of Owner A''s watch item affected zero rows';
end $$;

-- ===== TEST 2: Owner B cannot forge owner_id/property_id to plant a row that reads back as Owner A's =====
do $$
begin
  begin
    insert into public.property_watch_items (owner_id, property_id, source_type, source_id, event_key, category, title, event_date)
      values ('a1111111-1111-1111-1111-111111111111', current_setting('pw_test.property_a')::uuid, 'manual', null, 'manual', 'Other', 'Forged by Owner B', current_date);
    raise exception 'REGRESSION: Owner B inserted a row with owner_id = Owner A';
  exception
    when others then
      if sqlerrm ilike '%row-level security%' or sqlerrm ilike '%new row violates%' then
        raise notice 'PASS: Owner B blocked from forging owner_id = Owner A (%)', sqlerrm;
      else
        raise exception 'REGRESSION: unexpected error forging owner_id: %', sqlerrm;
      end if;
  end;
end $$;

do $$
begin
  begin
    insert into public.property_watch_items (owner_id, property_id, source_type, source_id, event_key, category, title, event_date)
      values ('b2222222-2222-2222-2222-222222222222', current_setting('pw_test.property_a')::uuid, 'manual', null, 'manual', 'Other', 'Forged property_id by Owner B', current_date);
    raise exception 'REGRESSION: Owner B inserted a row pointed at Owner A''s property_id';
  exception
    when others then
      if sqlerrm ilike '%row-level security%' or sqlerrm ilike '%new row violates%' then
        raise notice 'PASS: Owner B blocked from forging property_id = Owner A''s property (%)', sqlerrm;
      else
        raise exception 'REGRESSION: unexpected error forging property_id: %', sqlerrm;
      end if;
  end;
end $$;

-- ===== TEST 3: source relationships cannot be forged across properties =====
-- Owner B has their own property but tries to plant a Watch item claiming
-- source_type='lease', source_id = OWNER A's lease id, while owner_id/
-- property_id are Owner B's own (legitimately-owned) values. Must fail
-- because property_watch_source_is_valid() checks the lease's OWNER and
-- PROPERTY, not just its existence.
do $$
begin
  begin
    insert into public.property_watch_items (owner_id, property_id, source_type, source_id, event_key, category, title, event_date)
      values ('b2222222-2222-2222-2222-222222222222', current_setting('pw_test.property_b')::uuid, 'lease', current_setting('pw_test.lease_a')::uuid, 'lease_expiration', 'Lease', 'Forged cross-property source', current_date);
    raise exception 'REGRESSION: Owner B attached Owner A''s lease as a source on their own Watch item';
  exception
    when others then
      if sqlerrm ilike '%row-level security%' or sqlerrm ilike '%new row violates%' then
        raise notice 'PASS: Owner B blocked from forging a source relationship to Owner A''s lease (%)', sqlerrm;
      else
        raise exception 'REGRESSION: unexpected error forging source: %', sqlerrm;
      end if;
  end;
end $$;

-- A same-owner cross-PROPERTY forgery must also fail: Owner A tries to
-- attach their OWN lease (which belongs to property_a) to a Watch item
-- claiming property_b — but property_b belongs to Owner B, so this is
-- blocked by the property-ownership check before source validity is even
-- reached. Confirms the property_id check and the source check both
-- independently hold.
select set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
do $$
begin
  begin
    insert into public.property_watch_items (owner_id, property_id, source_type, source_id, event_key, category, title, event_date)
      values ('a1111111-1111-1111-1111-111111111111', current_setting('pw_test.property_b')::uuid, 'lease', current_setting('pw_test.lease_a')::uuid, 'lease_expiration', 'Lease', 'Forged property_id not owned', current_date);
    raise exception 'REGRESSION: Owner A inserted a Watch item against a property_id they do not own';
  exception
    when others then
      if sqlerrm ilike '%row-level security%' or sqlerrm ilike '%new row violates%' then
        raise notice 'PASS: Owner A blocked from using a property_id they do not own, even with their own lease as source (%)', sqlerrm;
      else
        raise exception 'REGRESSION: unexpected error: %', sqlerrm;
      end if;
  end;
end $$;

-- ===== TEST 4: Tenant Connect stays separate — a tenant with legitimate =====
-- ===== access to the property still cannot see the owner's Watch items =====
select set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
do $$
begin
  insert into public.tenant_property_access (property_id, owner_id, tenant_user_id, tenant_email, status, accepted_at)
    values (current_setting('pw_test.property_a')::uuid, 'a1111111-1111-1111-1111-111111111111', 'c3333333-3333-3333-3333-333333333333', 'tenant@example.com', 'Active', now());
  raise notice 'PASS: Owner A granted the tenant Active tenant_property_access to property_a';
end $$;

select set_config('request.jwt.claim.sub', 'c3333333-3333-3333-3333-333333333333', true);
do $$
declare
  v_count int;
  v_access_count int;
begin
  -- Sanity check: the tenant genuinely does have legitimate, working
  -- access to the property via Tenant Connect (so this is a real "tenant
  -- with access" scenario, not a tenant who's blocked from everything).
  select count(*) into v_access_count from public.tenant_property_access where tenant_user_id = 'c3333333-3333-3333-3333-333333333333' and status = 'Active';
  if v_access_count = 0 then
    raise exception 'REGRESSION: test setup bug — tenant does not even have their own tenant_property_access row visible';
  end if;

  select count(*) into v_count from public.property_watch_items where property_id = current_setting('pw_test.property_a')::uuid;
  if v_count <> 0 then
    raise exception 'REGRESSION: a tenant with legitimate property access can see % owner Watch item(s) — Property Watch is private owner information (Section 19)', v_count;
  end if;
  raise notice 'PASS: tenant with legitimate Tenant Connect access sees zero of the owner''s Watch items (Section 19 privacy boundary holds)';
end $$;

do $$
begin
  begin
    insert into public.property_watch_items (owner_id, property_id, source_type, source_id, event_key, category, title, event_date)
      values ('c3333333-3333-3333-3333-333333333333', current_setting('pw_test.property_a')::uuid, 'manual', null, 'manual', 'Other', 'Tenant-planted item', current_date);
    raise exception 'REGRESSION: tenant inserted a Watch item against the owner''s property';
  exception
    when others then
      if sqlerrm ilike '%row-level security%' or sqlerrm ilike '%new row violates%' then
        raise notice 'PASS: tenant blocked from inserting a Watch item on the owner''s property (%)', sqlerrm;
      else
        raise exception 'REGRESSION: unexpected error: %', sqlerrm;
      end if;
  end;
end $$;

-- ===== TEST 5: a legitimate update by the rightful owner still works (RLS isn't over-blocking) =====
select set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
do $$
begin
  update public.property_watch_items set status = 'Dismissed' where id = current_setting('pw_test.watch_a')::uuid;
  if not found then
    raise exception 'REGRESSION: Owner A could not update their own Watch item';
  end if;
  raise notice 'PASS: Owner A can update (Dismiss) their own Watch item';
end $$;

rollback;
