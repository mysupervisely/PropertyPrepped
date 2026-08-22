-- PropRoster Milestone 22 — Tax Center V2 property_tax_records RLS test.
--
-- Same methodology as supabase/tests/milestone-9..21-*.test.sql: run by
-- hand against a database with PropRoster's full schema.sql (+ this
-- milestone's migration) loaded and the Supabase auth/storage schemas
-- available (real Supabase, or a local Postgres stubbed per the note at
-- the bottom of milestone-9-rls.test.sql, plus the auth.jwt() stub noted
-- in milestone-10-rls.test.sql's top comment — this file doesn't need
-- auth.jwt() itself, but schema.sql's later tables do, so a full load
-- requires it regardless). Every block RAISEs "REGRESSION" or NOTICEs
-- "PASS". Run with `psql -v ON_ERROR_STOP=0` and grep for "REGRESSION"
-- — a clean run has zero matches. Users/rows are created inside a
-- transaction that is rolled back at the end.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000a220', 'owner-a@example.com'),
  ('a0000000-0000-0000-0000-00000000a221', 'owner-b@example.com');

insert into public.properties (id, owner_id, address, city, property_type) values
  ('b0000000-0000-0000-0000-00000000b220', 'a0000000-0000-0000-0000-00000000a220', '1 Owner A St', 'Tampa', 'Rental Property'),
  ('b0000000-0000-0000-0000-00000000b221', 'a0000000-0000-0000-0000-00000000a221', '2 Owner B Ave', 'Tampa', 'Rental Property');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a220', true);

-- ===== 1. Owner A can INSERT a manual tax record for their own property =====
do $$
begin
  insert into public.property_tax_records (property_id, owner_id, tax_year, mortgage_interest, notes)
  values ('b0000000-0000-0000-0000-00000000b220', 'a0000000-0000-0000-0000-00000000a220', 2026, 4800.00, 'From Form 1098');
  raise notice 'PASS: Owner A inserted a property_tax_records row for their own property';
end $$;

-- ===== 2. Owner A cannot INSERT a manual tax record against Owner B's property (forged property_id) =====
do $$
begin
  begin
    insert into public.property_tax_records (property_id, owner_id, tax_year, mortgage_interest)
    values ('b0000000-0000-0000-0000-00000000b221', 'a0000000-0000-0000-0000-00000000a220', 2026, 999.00);
    raise exception 'REGRESSION: Owner A created a property_tax_records row against Owner B''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: property_tax_records INSERT against another owner''s property correctly rejected';
  end;
end $$;

-- ===== 3. Owner A cannot INSERT a row claiming owner_id = Owner B (even against their own property) =====
do $$
begin
  begin
    insert into public.property_tax_records (property_id, owner_id, tax_year)
    values ('b0000000-0000-0000-0000-00000000b220', 'a0000000-0000-0000-0000-00000000a221', 2026);
    raise exception 'REGRESSION: Owner A inserted a property_tax_records row claiming owner_id = Owner B';
  exception
    when insufficient_privilege then raise notice 'PASS: property_tax_records INSERT with a forged owner_id correctly rejected';
  end;
end $$;

-- ===== 4. The same property + tax_year cannot be inserted twice (unique constraint) =====
do $$
begin
  begin
    insert into public.property_tax_records (property_id, owner_id, tax_year)
    values ('b0000000-0000-0000-0000-00000000b220', 'a0000000-0000-0000-0000-00000000a220', 2026);
    raise exception 'REGRESSION: a second property_tax_records row for the same property+tax_year was allowed';
  exception
    when unique_violation then raise notice 'PASS: duplicate property_id+tax_year correctly rejected by the unique constraint';
  end;
end $$;

-- ===== 5. A negative manual amount is rejected (non-negative check constraint) =====
do $$
begin
  begin
    insert into public.property_tax_records (property_id, owner_id, tax_year, insurance)
    values ('b0000000-0000-0000-0000-00000000b220', 'a0000000-0000-0000-0000-00000000a220', 2027, -500.00);
    raise exception 'REGRESSION: a negative manual amount was accepted';
  exception
    when check_violation then raise notice 'PASS: negative manual amount correctly rejected';
  end;
end $$;

-- ===== 6. Every manual field can be left NULL (blank) — no field is required =====
do $$
begin
  insert into public.property_tax_records (property_id, owner_id, tax_year)
  values ('b0000000-0000-0000-0000-00000000b220', 'a0000000-0000-0000-0000-00000000a220', 2028);
  raise notice 'PASS: a property_tax_records row with every manual field left blank was accepted';
end $$;

-- ===== 7. Owner B cannot SELECT Owner A's manual tax records =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a221', true);
do $$
declare cnt integer;
begin
  select count(*) into cnt from public.property_tax_records where property_id = 'b0000000-0000-0000-0000-00000000b220';
  if cnt <> 0 then raise exception 'REGRESSION: Owner B can see Owner A''s property_tax_records rows'; end if;
  raise notice 'PASS: property_tax_records SELECT isolation — Owner B cannot see Owner A''s rows';
end $$;

-- ===== 8. Owner B cannot UPDATE Owner A's manual tax record =====
do $$
declare affected integer;
begin
  update public.property_tax_records set mortgage_interest = 1.00 where property_id = 'b0000000-0000-0000-0000-00000000b220' and tax_year = 2026;
  get diagnostics affected = row_count;
  if affected > 0 then raise exception 'REGRESSION: Owner B updated Owner A''s property_tax_records row'; end if;
  raise notice 'PASS: property_tax_records UPDATE by Owner B correctly affected 0 rows';
end $$;

-- ===== 9. Owner B cannot DELETE Owner A's manual tax record =====
do $$
declare affected integer;
begin
  delete from public.property_tax_records where property_id = 'b0000000-0000-0000-0000-00000000b220' and tax_year = 2026;
  get diagnostics affected = row_count;
  if affected > 0 then raise exception 'REGRESSION: Owner B deleted Owner A''s property_tax_records row'; end if;
  raise notice 'PASS: property_tax_records DELETE by Owner B correctly affected 0 rows';
end $$;

-- ===== 10. Owner A can UPDATE their own manual tax record, and the
-- updated_at trigger is actually installed. Not a timestamp-delta
-- assertion: now() is frozen for the whole duration of this test's one
-- wrapping transaction in Postgres, so before/after updated_at values
-- are legitimately identical here even though the trigger correctly
-- fires in real per-request production transactions — the exact same
-- reasoning documented in milestone-21-rls.test.sql. Checking the
-- pg_trigger catalog instead proves the trigger exists and is enabled,
-- which is what's actually being verified. =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a220', true);
do $$
begin
  update public.property_tax_records set insurance = 1200.00 where property_id = 'b0000000-0000-0000-0000-00000000b220' and tax_year = 2026;
  if not found then raise exception 'REGRESSION: Owner A could not update their own property_tax_records row'; end if;
  raise notice 'PASS: Owner A can update their own property_tax_records row';
end $$;
reset role;
do $$
declare trigger_enabled text;
begin
  select tgenabled into trigger_enabled from pg_trigger where tgname = 'property_tax_records_touch_updated_at' and not tgisinternal;
  if trigger_enabled is null then raise exception 'REGRESSION: property_tax_records_touch_updated_at trigger is not installed'; end if;
  if trigger_enabled <> 'O' then raise exception 'REGRESSION: property_tax_records_touch_updated_at trigger is installed but not enabled (tgenabled=%)', trigger_enabled; end if;
  raise notice 'PASS: property_tax_records_touch_updated_at trigger is installed and enabled';
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a220', true);

-- ===== 11. Owner A can DELETE their own manual tax record =====
do $$
declare affected integer;
begin
  delete from public.property_tax_records where property_id = 'b0000000-0000-0000-0000-00000000b220' and tax_year = 2028;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'REGRESSION: Owner A could not delete their own property_tax_records row (affected=%)', affected; end if;
  raise notice 'PASS: Owner A can delete their own property_tax_records row';
end $$;

rollback;
