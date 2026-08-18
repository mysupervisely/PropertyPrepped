-- PropRoster — Privacy/Security Audit follow-up: investment_analyses RLS
-- isolation proof.
--
-- Milestone 7 (Investment Tools) predates the RLS-testing convention that
-- started at Milestone 8 — investment_analyses has never had its RLS
-- proven against a real Postgres before. This test closes that gap: it
-- proves an authenticated Owner A cannot SELECT, UPDATE, or DELETE Owner
-- B's saved analysis, and cannot INSERT a row forging Owner B's
-- ownership, while confirming Owner A's own row remains fully usable.
--
-- Same methodology as supabase/tests/milestone-8..12-rls.test.sql: run by
-- hand against a database with PropRoster's full schema.sql loaded and
-- the Supabase auth/storage schemas available (real Supabase, or a local
-- Postgres stubbed per the note at the bottom of milestone-9-rls.test.sql).
-- Every block RAISEs "REGRESSION" (broken, fix before shipping) or
-- NOTICEs "PASS". Run with `psql -v ON_ERROR_STOP=0` and grep for
-- "REGRESSION" — a clean run has zero matches. Two throwaway owners and
-- their properties/analyses are created inside a transaction that is
-- rolled back at the end — no data is left behind.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000a001', 'ownerA@example.com'),
  ('a0000000-0000-0000-0000-00000000a002', 'ownerB@example.com');

insert into public.properties (id, owner_id, address, city) values
  ('b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', '1 Owner A St', 'Town'),
  ('b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a002', '1 Owner B St', 'Town');

-- Baseline saved analyses, seeded with RLS bypassed, that the
-- impersonation blocks below try to read/forge against.
insert into public.investment_analyses (id, owner_id, property_id, name, address) values
  ('d0000000-0000-0000-0000-00000000d001', 'a0000000-0000-0000-0000-00000000a001', 'b0000000-0000-0000-0000-00000000b001', 'A''s Deal', '1 Owner A St'),
  ('d0000000-0000-0000-0000-00000000d002', 'a0000000-0000-0000-0000-00000000a002', 'b0000000-0000-0000-0000-00000000b002', 'B''s Deal', '1 Owner B St');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a001', true);

-- ===== 1. Owner A can SELECT their own saved analysis =====
do $$
declare found_name text;
begin
  select name into found_name from public.investment_analyses where id = 'd0000000-0000-0000-0000-00000000d001';
  if found_name is distinct from 'A''s Deal' then
    raise exception 'REGRESSION: Owner A could not read their own saved analysis (got %)', found_name;
  end if;
  raise notice 'PASS: Owner A can SELECT their own saved analysis';
end $$;

-- ===== 2. Owner A cannot SELECT Owner B's saved analysis (row simply
-- doesn't appear — RLS SELECT filters rather than throws) =====
do $$
declare found_id uuid;
begin
  select id into found_id from public.investment_analyses where id = 'd0000000-0000-0000-0000-00000000d002';
  if found_id is not null then
    raise exception 'REGRESSION: Owner A was able to SELECT Owner B''s saved analysis';
  end if;
  raise notice 'PASS: Owner A cannot SELECT Owner B''s saved analysis';
end $$;

-- ===== 3. Owner A's UPDATE of Owner B's row affects 0 rows (excluded by
-- USING, not a thrown error — the correct, expected RLS shape for
-- updating a row you can't see at all) =====
do $$
declare affected int;
begin
  update public.investment_analyses set name = 'Hijacked' where id = 'd0000000-0000-0000-0000-00000000d002';
  get diagnostics affected = row_count;
  if affected > 0 then
    raise exception 'REGRESSION: Owner A''s UPDATE against Owner B''s saved analysis affected % row(s)', affected;
  end if;
  raise notice 'PASS: Owner A''s UPDATE against Owner B''s saved analysis correctly affected 0 rows';
end $$;

-- ===== 4. Owner A's DELETE of Owner B's row affects 0 rows =====
do $$
declare affected int;
begin
  delete from public.investment_analyses where id = 'd0000000-0000-0000-0000-00000000d002';
  get diagnostics affected = row_count;
  if affected > 0 then
    raise exception 'REGRESSION: Owner A''s DELETE against Owner B''s saved analysis affected % row(s)', affected;
  end if;
  raise notice 'PASS: Owner A''s DELETE against Owner B''s saved analysis correctly affected 0 rows';
end $$;

-- ===== 5. Owner A cannot INSERT a row forging Owner B as the owner =====
do $$
begin
  begin
    insert into public.investment_analyses (owner_id, name) values ('a0000000-0000-0000-0000-00000000a002', 'Forged');
    raise exception 'REGRESSION: Owner A inserted a saved analysis with owner_id forged to Owner B';
  exception
    when insufficient_privilege then raise notice 'PASS: INSERT forging another owner''s owner_id correctly rejected';
  end;
end $$;

-- ===== 6. Confirm Owner B's row and its original name are completely
-- untouched by the blocked UPDATE/DELETE attempts above =====
reset role;
do $$
declare row_count_b int; name_b text;
begin
  select count(*), max(name) into row_count_b, name_b from public.investment_analyses where id = 'd0000000-0000-0000-0000-00000000d002';
  if row_count_b <> 1 or name_b <> 'B''s Deal' then
    raise exception 'REGRESSION: Owner B''s saved analysis was altered (count=%, name=%)', row_count_b, name_b;
  end if;
  raise notice 'PASS: Owner B''s saved analysis is unchanged — name still "B''s Deal"';
end $$;

rollback;

-- To run against a fresh local Postgres instead of a real Supabase project,
-- see the stub schema documented at the bottom of
-- supabase/tests/milestone-9-rls.test.sql, then load supabase/schema.sql,
-- then this file.
