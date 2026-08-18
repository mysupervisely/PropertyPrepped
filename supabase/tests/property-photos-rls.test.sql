-- PropRoster Launch Polish — primary property photo, RLS regression test.
--
-- No schema change was made for the property-photo feature (it already
-- existed — see the Launch Polish completion report). This file exists
-- because Section 4 of that pass explicitly asked to VERIFY, not just
-- assume from reading the policy definitions, that Owner A cannot read,
-- replace, or delete Owner B's property photo — covering both the
-- public.property_photos table AND the property-photos storage bucket's
-- owner-scoped folder-path policies (supabase/schema.sql).
--
-- Same methodology as supabase/tests/milestone-8..19-*.test.sql: run by
-- hand against a database with PropRoster's full schema.sql loaded and
-- the Supabase auth/storage schemas available (real Supabase, or a
-- local Postgres stubbed per the note at the bottom of
-- milestone-9-rls.test.sql). Every block RAISEs "REGRESSION" or NOTICEs
-- "PASS". Run with `psql -v ON_ERROR_STOP=0` and grep for "REGRESSION"
-- — a clean run has zero matches. Two throwaway owners and their
-- properties/photos are created inside a transaction that is rolled
-- back at the end.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000a001', 'ownerA@example.com'),
  ('a0000000-0000-0000-0000-00000000a002', 'ownerB@example.com');

insert into public.properties (id, owner_id, address, city) values
  ('b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', '1 Owner A St', 'Town'),
  ('b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a002', '1 Owner B St', 'Town');

insert into public.property_photos (id, property_id, owner_id, name, storage_path, is_cover) values
  ('c0000000-0000-0000-0000-00000000c001', 'b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', 'front.jpg', 'a0000000-0000-0000-0000-00000000a001/b0000000-0000-0000-0000-00000000b001/photos/front.jpg', true),
  ('c0000000-0000-0000-0000-00000000c002', 'b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a002', 'front.jpg', 'a0000000-0000-0000-0000-00000000a002/b0000000-0000-0000-0000-00000000b002/photos/front.jpg', true);

-- Storage rows are always written by the storage service (never
-- directly by a client insert into storage.objects), so these are
-- seeded as the table owner before switching to the authenticated role
-- — same approach milestone-10-rls.test.sql already uses for
-- tenant-connect-attachments.
insert into storage.buckets (id, name, public) values ('property-photos', 'property-photos', false) on conflict (id) do nothing;
insert into storage.objects (bucket_id, name) values
  ('property-photos', 'a0000000-0000-0000-0000-00000000a001/b0000000-0000-0000-0000-00000000b001/photos/front.jpg'),
  ('property-photos', 'a0000000-0000-0000-0000-00000000a002/b0000000-0000-0000-0000-00000000b002/photos/front.jpg');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a001', true);

-- ===== 1. Owner A's SELECT on property_photos returns only their own row =====
do $$
declare found_count int;
begin
  select count(*) into found_count from public.property_photos;
  if found_count <> 1 then
    raise exception 'REGRESSION: Owner A''s SELECT returned % property_photos rows, expected exactly 1', found_count;
  end if;
  raise notice 'PASS: Owner A sees exactly their own property_photos row';
end $$;

-- ===== 2. Owner A cannot SELECT Owner B's photo row directly by id =====
do $$
declare found_id uuid;
begin
  select id into found_id from public.property_photos where id = 'c0000000-0000-0000-0000-00000000c002';
  if found_id is not null then
    raise exception 'REGRESSION: Owner A was able to SELECT Owner B''s property_photos row';
  end if;
  raise notice 'PASS: Owner A cannot SELECT Owner B''s property_photos row';
end $$;

-- ===== 3. Owner A cannot UPDATE (e.g. change is_cover on) Owner B's photo row =====
do $$
declare affected integer;
begin
  update public.property_photos set is_cover = false where id = 'c0000000-0000-0000-0000-00000000c002';
  get diagnostics affected = row_count;
  if affected > 0 then
    raise exception 'REGRESSION: Owner A was able to UPDATE Owner B''s property_photos row';
  end if;
  raise notice 'PASS: Owner A''s UPDATE of Owner B''s photo row correctly affected 0 rows';
end $$;

-- ===== 4. Owner A cannot DELETE Owner B's photo row =====
do $$
declare affected integer;
begin
  delete from public.property_photos where id = 'c0000000-0000-0000-0000-00000000c002';
  get diagnostics affected = row_count;
  if affected > 0 then
    raise exception 'REGRESSION: Owner A was able to DELETE Owner B''s property_photos row';
  end if;
  raise notice 'PASS: Owner A''s DELETE of Owner B''s photo row correctly affected 0 rows';
end $$;

-- ===== 5. Owner A cannot INSERT a property_photos row claiming Owner B's owner_id =====
do $$
begin
  begin
    insert into public.property_photos (property_id, owner_id, name, storage_path, is_cover)
      values ('b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a002', 'sneaky.jpg', 'a0000000-0000-0000-0000-00000000a002/b0000000-0000-0000-0000-00000000b002/photos/sneaky.jpg', false);
    raise exception 'REGRESSION: Owner A inserted a property_photos row claiming Owner B''s owner_id';
  exception
    when insufficient_privilege then raise notice 'PASS: INSERT claiming another owner''s owner_id correctly rejected';
  end;
end $$;

-- ===== 6. Storage: Owner A cannot SELECT Owner B's photo object (different top-level folder) =====
do $$
declare found_count int;
begin
  select count(*) into found_count from storage.objects where bucket_id = 'property-photos';
  if found_count <> 1 then
    raise exception 'REGRESSION: Owner A''s storage.objects SELECT returned % rows in property-photos, expected exactly 1 (their own)', found_count;
  end if;
  raise notice 'PASS: Owner A sees exactly their own object in the property-photos bucket';
end $$;

-- ===== 7. Storage: Owner A cannot INSERT an object under Owner B's folder path =====
do $$
begin
  begin
    insert into storage.objects (bucket_id, name) values ('property-photos', 'a0000000-0000-0000-0000-00000000a002/b0000000-0000-0000-0000-00000000b002/photos/sneaky.jpg');
    raise exception 'REGRESSION: Owner A inserted a storage object under Owner B''s folder path';
  exception
    when insufficient_privilege then raise notice 'PASS: INSERT under another owner''s storage folder correctly rejected';
  end;
end $$;

-- ===== 8. Storage: Owner A cannot DELETE Owner B's object =====
do $$
declare affected integer;
begin
  delete from storage.objects where bucket_id = 'property-photos' and name = 'a0000000-0000-0000-0000-00000000a002/b0000000-0000-0000-0000-00000000b002/photos/front.jpg';
  get diagnostics affected = row_count;
  if affected > 0 then
    raise exception 'REGRESSION: Owner A was able to DELETE Owner B''s storage object';
  end if;
  raise notice 'PASS: Owner A''s DELETE of Owner B''s storage object correctly affected 0 rows';
end $$;

-- ===== 9. The property-photos bucket itself is not public =====
reset role;
do $$
declare is_public boolean;
begin
  select public into is_public from storage.buckets where id = 'property-photos';
  if is_public then
    raise exception 'REGRESSION: the property-photos bucket is public — photos would be readable without a signed URL or auth at all';
  end if;
  raise notice 'PASS: the property-photos bucket remains private';
end $$;

rollback;

-- To run against a fresh local Postgres instead of a real Supabase project,
-- see the stub schema documented at the bottom of
-- supabase/tests/milestone-9-rls.test.sql, then load supabase/schema.sql,
-- then this file. Real Supabase already has row level security enabled
-- on storage.objects by platform default (our schema.sql never issues
-- that statement itself); a local stub needs it turned on explicitly —
-- `alter table storage.objects enable row level security;` — before
-- Sections 6-8 mean anything (see milestone-10-rls.test.sql's own note).
