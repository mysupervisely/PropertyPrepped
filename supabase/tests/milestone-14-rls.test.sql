-- PropRoster Milestone 14 — Smart Import V1 RLS regression test.
--
-- milestone-12-rls.test.sql already proves smart_upload_items' general
-- owner isolation (select/insert/update/delete all scoped to owner_id).
-- This file is narrowly focused on what Milestone 14 actually changed:
-- the new `source` column and the "find my unfinished Smart Import
-- batches" resume query built on top of it. Proves that filtering by
-- source never becomes a second, looser way to see another owner's rows
-- — the existing owner-scoped policies still gate everything.
--
-- Same methodology as supabase/tests/milestone-8..13-rls.test.sql: run by
-- hand against a database with PropRoster's full schema.sql loaded and
-- the Supabase auth/storage schemas available (real Supabase, or a local
-- Postgres stubbed per the note at the bottom of milestone-9-rls.test.sql).
-- Every block RAISEs "REGRESSION" or NOTICEs "PASS". Run with
-- `psql -v ON_ERROR_STOP=0` and grep for "REGRESSION" — a clean run has
-- zero matches. Two throwaway owners and their properties/documents/
-- items are created inside a transaction that is rolled back at the end.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000a001', 'ownerA@example.com'),
  ('a0000000-0000-0000-0000-00000000a002', 'ownerB@example.com');

insert into public.properties (id, owner_id, address, city) values
  ('b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', '1 Owner A St', 'Town'),
  ('b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a002', '1 Owner B St', 'Town');

insert into public.property_documents (id, property_id, owner_id, name, storage_path) values
  ('11100000-0000-0000-0000-000000000001', null, 'a0000000-0000-0000-0000-00000000a001', 'A import doc', 'a0000000-0000-0000-0000-00000000a001/smart-upload/x/1'),
  ('11100000-0000-0000-0000-000000000002', null, 'a0000000-0000-0000-0000-00000000a002', 'B import doc', 'a0000000-0000-0000-0000-00000000a002/smart-upload/y/1');

-- Both rows use source = 'SmartImport' and are unfinished (completed_at
-- null) — exactly the shape app/smart-import/page.tsx's resume query
-- looks for.
insert into public.smart_upload_items (id, owner_id, document_id, batch_id, source) values
  ('66600000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000a001', '11100000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000c001', 'SmartImport'),
  ('66600000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000a002', '11100000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000c002', 'SmartImport');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a001', true);

-- ===== 1. Owner A's own-source resume query finds their own unfinished batch =====
do $$
declare found_count int;
begin
  select count(*) into found_count from public.smart_upload_items where source = 'SmartImport' and completed_at is null;
  if found_count <> 1 then
    raise exception 'REGRESSION: Owner A''s resume query found % rows, expected exactly 1 (their own)', found_count;
  end if;
  raise notice 'PASS: Owner A''s Smart Import resume query finds exactly their own unfinished batch';
end $$;

-- ===== 2. Owner A cannot see Owner B's SmartImport item through the same
-- resume-shaped query, filtering by source and completed_at changes
-- nothing about ownership scoping =====
do $$
declare found_id uuid;
begin
  select id into found_id from public.smart_upload_items where id = '66600000-0000-0000-0000-000000000002' and source = 'SmartImport';
  if found_id is not null then
    raise exception 'REGRESSION: Owner A was able to SELECT Owner B''s SmartImport-sourced item';
  end if;
  raise notice 'PASS: Owner A cannot SELECT Owner B''s SmartImport-sourced item';
end $$;

-- ===== 3. Owner A cannot INSERT a smart_upload_items row pointing at
-- Owner B's document, source column included, same FK-ownership check
-- Milestone 12 already enforces =====
do $$
begin
  begin
    insert into public.smart_upload_items (owner_id, document_id, source) values ('a0000000-0000-0000-0000-00000000a001', '11100000-0000-0000-0000-000000000002', 'SmartImport');
    raise exception 'REGRESSION: Owner A inserted a smart_upload_items row against Owner B''s document';
  exception
    when insufficient_privilege then raise notice 'PASS: INSERT against another owner''s document correctly rejected regardless of source';
  end;
end $$;

-- ===== 4. The source check constraint rejects an invalid value (defense
-- in depth — the application layer never sends anything else, but the
-- constraint is the actual backstop) =====
do $$
begin
  begin
    insert into public.smart_upload_items (owner_id, document_id, source) values ('a0000000-0000-0000-0000-00000000a001', '11100000-0000-0000-0000-000000000001', 'SomethingElse');
    raise exception 'REGRESSION: an invalid source value was accepted';
  exception
    when check_violation then raise notice 'PASS: an invalid source value is rejected by the check constraint';
  end;
end $$;

rollback;

-- To run against a fresh local Postgres instead of a real Supabase project,
-- see the stub schema documented at the bottom of
-- supabase/tests/milestone-9-rls.test.sql, then load supabase/schema.sql,
-- then this file.
