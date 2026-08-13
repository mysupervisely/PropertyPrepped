-- PropPrepped Milestone 8 — RLS security regression test.
--
-- This is NOT run by `npm test` (there's no Postgres in the Node/vitest
-- pipeline) and is not required for the app to work. It exists so the RLS
-- hardening in milestone-8-document-intelligence.sql can be re-verified
-- with a single command whenever these policies change — run it by hand
-- (or from CI with a scratch Postgres) against a database that already has
-- PropPrepped's schema loaded and the Supabase `auth`/`storage` schemas
-- available (any Supabase project, or a local Postgres with those schemas
-- stubbed — see the note at the bottom).
--
-- Every block below either RAISEs "SECURITY REGRESSION" (attack succeeded —
-- something is broken, fix it before shipping) or NOTICEs "PASS" (attack
-- was correctly blocked, or a legitimate operation correctly succeeded).
-- Run with `psql -v ON_ERROR_STOP=1` and grep the output for
-- "SECURITY REGRESSION" — a clean run has zero matches.
--
-- Uses two throwaway users/properties/documents created inside a
-- transaction that is rolled back at the end, so this never leaves test
-- data behind.

begin;

-- Two users, two properties, two documents — never leaves the test users
-- behind because everything here rolls back at COMMIT time (see final
-- `rollback` statement).
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

insert into public.properties (id, owner_id, address, city)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '123 Test St', 'Testville');
insert into public.property_documents (id, property_id, owner_id, name, storage_path)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'policy.pdf', '11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/documents/policy.pdf');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
insert into public.properties (id, owner_id, address, city)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', '456 Other Ave', 'Otherville');
insert into public.property_documents (id, property_id, owner_id, name, storage_path)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'lease.pdf', '22222222-2222-2222-2222-222222222222/cccccccc-cccc-cccc-cccc-cccccccccccc/documents/lease.pdf');

-- ===== ATTACK 1: user 2 inserts document_analyses referencing user 1's document + property (owner_id = self) =====
do $$
begin
  begin
    insert into public.document_analyses (document_id, property_id, owner_id, document_type, model_provider, model_name)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Insurance Policy', 'anthropic', 'claude-sonnet-5');
    raise exception 'SECURITY REGRESSION: attack 1 succeeded — cross-tenant document_analyses insert was NOT blocked';
  exception
    when insufficient_privilege then
      raise notice 'PASS: attack 1 (cross-tenant document_analyses insert) correctly blocked';
  end;
end $$;

-- ===== ATTACK 2: user 2's own document_id paired with user 1's property_id (mismatched pair) =====
do $$
begin
  begin
    insert into public.document_analyses (document_id, property_id, owner_id, document_type, model_provider, model_name)
    values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Insurance Policy', 'anthropic', 'claude-sonnet-5');
    raise exception 'SECURITY REGRESSION: attack 2 succeeded — mismatched document/property pair was NOT blocked';
  exception
    when insufficient_privilege then
      raise notice 'PASS: attack 2 (mismatched document_id/property_id pair) correctly blocked';
  end;
end $$;

-- ===== LEGITIMATE: user 2 analyzes their own document — must succeed =====
do $$
begin
  insert into public.document_analyses (document_id, property_id, owner_id, document_type, model_provider, model_name)
  values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'Insurance Policy', 'anthropic', 'claude-sonnet-5');
  raise notice 'PASS: legitimate document_analyses insert (own document + property) succeeded';
end $$;

-- ===== ATTACK 3: user 2 inserts ai_usage_events referencing user 1's document =====
do $$
begin
  begin
    insert into public.ai_usage_events (owner_id, document_id, provider, model)
    values ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'anthropic', 'claude-sonnet-5');
    raise exception 'SECURITY REGRESSION: attack 3 succeeded — cross-tenant ai_usage_events insert was NOT blocked';
  exception
    when insufficient_privilege then
      raise notice 'PASS: attack 3 (cross-tenant ai_usage_events insert) correctly blocked';
  end;
end $$;

-- ===== LEGITIMATE: user 2 logs usage against their own document — must succeed =====
do $$
begin
  insert into public.ai_usage_events (owner_id, document_id, provider, model)
  values ('22222222-2222-2222-2222-222222222222', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'anthropic', 'claude-sonnet-5');
  raise notice 'PASS: legitimate ai_usage_events insert (own document) succeeded';
end $$;

-- ===== ATTACK 4: user 2 reassigns their OWN property_documents row onto user 1's property =====
do $$
begin
  begin
    update public.property_documents set property_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    raise exception 'SECURITY REGRESSION: attack 4 succeeded — property_documents.property_id was reassigned to another user''s property';
  exception
    when insufficient_privilege then
      raise notice 'PASS: attack 4 (reassign property_documents.property_id cross-tenant) correctly blocked';
  end;
end $$;

-- ===== ATTACK 5: user 2 inserts a NEW property_documents row directly against user 1's property =====
do $$
begin
  begin
    insert into public.property_documents (property_id, owner_id, name, storage_path)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'sneaky.pdf', '22222222-2222-2222-2222-222222222222/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/documents/sneaky.pdf');
    raise exception 'SECURITY REGRESSION: attack 5 succeeded — property_documents row created against another user''s property';
  exception
    when insufficient_privilege then
      raise notice 'PASS: attack 5 (insert property_documents against another user''s property) correctly blocked';
  end;
end $$;

-- ===== ATTACK 6: user 2 tries to DELETE their own ai_usage_events row (should be denied by design — no DELETE policy) =====
do $$
declare
  deleted_count integer;
begin
  delete from public.ai_usage_events where owner_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics deleted_count = row_count;
  if deleted_count > 0 then
    raise exception 'SECURITY REGRESSION: attack 6 succeeded — ai_usage_events row was deleted (should be immutable audit data)';
  else
    raise notice 'PASS: ai_usage_events DELETE correctly denied (0 rows affected)';
  end if;
end $$;

-- ===== isolation check: user 2 can only SELECT their own document_analyses row =====
do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from public.document_analyses;
  if visible_count <> 1 then
    raise exception 'SECURITY REGRESSION: user 2 sees % document_analyses rows, expected exactly 1 (their own)', visible_count;
  end if;
  raise notice 'PASS: SELECT isolation on document_analyses confirmed (exactly 1 row visible)';
end $$;

rollback;

-- To run against a fresh local Postgres instead of a real Supabase project,
-- first load a stub of the two Supabase-managed schemas this test touches:
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
