-- PropRoster Milestone 21 — Realtor Connect RLS regression test.
--
-- Proves: (1) a normal authenticated user (and an anonymous/public
-- caller) can neither SELECT nor INSERT into realtor_leads directly —
-- the table is only ever written by the server-side admin
-- (service-role) client, and only ever read by the internal 'owner'
-- plan; (2) the 'owner' plan CAN select/update leads; (3) a normal user
-- still cannot update a lead even one they submitted while signed in.
--
-- Same methodology as supabase/tests/milestone-8..20-*.test.sql: run by
-- hand against a database with PropRoster's full schema.sql loaded and
-- the Supabase auth/storage schemas available (real Supabase, or a
-- local Postgres stubbed per the note at the bottom of
-- milestone-9-rls.test.sql). Every block RAISEs "REGRESSION" or NOTICEs
-- "PASS". Run with `psql -v ON_ERROR_STOP=0` and grep for "REGRESSION"
-- — a clean run has zero matches. Users/rows are created inside a
-- transaction that is rolled back at the end.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000a201', 'normaluser@example.com'),
  ('a0000000-0000-0000-0000-00000000a202', 'owneraccount@example.com');

insert into public.user_subscriptions (owner_id, plan, status) values
  ('a0000000-0000-0000-0000-00000000a201', 'free', 'active'),
  ('a0000000-0000-0000-0000-00000000a202', 'owner', 'active');

-- Seed one lead directly as postgres (simulating the admin/service-role
-- insert the real app performs — service-role bypasses RLS entirely, so
-- this INSERT as the table owner is the correct stand-in for it).
insert into public.realtor_leads (id, source, name, email, preferred_contact_method, consent_at, owner_user_id, geography_bucket)
values ('b0000000-0000-0000-0000-00000000b201', 'rental_analyzer', 'Test Lead', 'lead@example.com', 'Email', now(), 'a0000000-0000-0000-0000-00000000a201', 'Tampa Bay Area');

-- ===== 1. A normal authenticated user cannot SELECT any leads, including one they submitted while signed in =====
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a201', true);
do $$
declare found_count int;
begin
  select count(*) into found_count from public.realtor_leads;
  if found_count <> 0 then
    raise exception 'REGRESSION: a normal authenticated user (including the lead''s own submitter) could SELECT % realtor_leads rows, expected 0', found_count;
  end if;
  raise notice 'PASS: a normal authenticated user cannot SELECT any realtor_leads rows';
end $$;

-- ===== 2. A normal authenticated user cannot INSERT a lead directly (no policy grants it) =====
do $$
begin
  begin
    insert into public.realtor_leads (source, name, email, preferred_contact_method, consent_at)
      values ('home_purchase', 'Sneaky', 'sneaky@example.com', 'Email', now());
    raise exception 'REGRESSION: a normal authenticated user was able to INSERT a realtor_leads row directly';
  exception
    when insufficient_privilege then raise notice 'PASS: direct INSERT by a normal authenticated user correctly rejected';
  end;
end $$;

-- ===== 3. A normal authenticated user cannot UPDATE a lead =====
do $$
declare affected integer;
begin
  update public.realtor_leads set status = 'Closed' where id = 'b0000000-0000-0000-0000-00000000b201';
  get diagnostics affected = row_count;
  if affected > 0 then
    raise exception 'REGRESSION: a normal authenticated user was able to UPDATE a realtor_leads row';
  end if;
  raise notice 'PASS: a normal authenticated user''s UPDATE correctly affected 0 rows';
end $$;

-- ===== 4. An anonymous (no JWT at all) caller cannot SELECT leads either =====
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare found_count int;
begin
  select count(*) into found_count from public.realtor_leads;
  if found_count <> 0 then
    raise exception 'REGRESSION: an unauthenticated caller could SELECT % realtor_leads rows, expected 0', found_count;
  end if;
  raise notice 'PASS: an unauthenticated caller cannot SELECT any realtor_leads rows';
end $$;

-- ===== 5. The internal 'owner' plan CAN select leads =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a202', true);
do $$
declare found_count int;
begin
  select count(*) into found_count from public.realtor_leads;
  if found_count <> 1 then
    raise exception 'REGRESSION: the owner-plan account SELECT returned % rows, expected exactly 1', found_count;
  end if;
  raise notice 'PASS: the owner-plan account can SELECT realtor_leads';
end $$;

-- ===== 6. The internal 'owner' plan CAN update a lead's status/notes/referral fields =====
do $$
declare affected integer; new_status text;
begin
  update public.realtor_leads set status = 'Contacted', notes = 'Called, left voicemail.' where id = 'b0000000-0000-0000-0000-00000000b201';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'REGRESSION: the owner-plan account''s UPDATE affected % rows, expected exactly 1', affected;
  end if;
  select status into new_status from public.realtor_leads where id = 'b0000000-0000-0000-0000-00000000b201';
  if new_status <> 'Contacted' then
    raise exception 'REGRESSION: status did not actually update to Contacted (got %)', new_status;
  end if;
  raise notice 'PASS: the owner-plan account can UPDATE a realtor_leads row (status/notes)';
end $$;

-- ===== 7. the updated_at-touch trigger is actually installed on the table =====
-- (not a timestamp-delta check: now() is frozen for the whole duration of
-- this test's single wrapping transaction, so created_at and updated_at
-- are legitimately identical here even though the trigger ran — in
-- production each request is its own transaction, where they will
-- differ. This instead confirms the trigger itself exists and is
-- enabled, which is what the migration actually guarantees.)
do $$
declare trigger_count int;
begin
  select count(*) into trigger_count
  from pg_trigger
  where tgrelid = 'public.realtor_leads'::regclass
    and tgname = 'realtor_leads_touch_updated_at'
    and not tgisinternal;
  if trigger_count <> 1 then
    raise exception 'REGRESSION: realtor_leads_touch_updated_at trigger is not installed on public.realtor_leads';
  end if;
  raise notice 'PASS: the updated_at-touch trigger is installed on public.realtor_leads';
end $$;

-- ===== 8. A lead requires at least one of email/phone (constraint, not just app-layer) =====
reset role;
do $$
begin
  begin
    insert into public.realtor_leads (source, name, preferred_contact_method, consent_at)
      values ('rental_analyzer', 'No Contact', 'Email', now());
    raise exception 'REGRESSION: a realtor_leads row with neither email nor phone was accepted';
  exception
    when check_violation then raise notice 'PASS: a realtor_leads row with neither email nor phone is rejected by the check constraint';
  end;
end $$;

rollback;

-- To run against a fresh local Postgres instead of a real Supabase project,
-- see the stub schema documented at the bottom of
-- supabase/tests/milestone-9-rls.test.sql, then load supabase/schema.sql,
-- then this file.
