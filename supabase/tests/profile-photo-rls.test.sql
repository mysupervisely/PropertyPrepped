-- PropRoster Launch Polish — profile photo (avatar), RLS regression test.
--
-- public.user_profiles.photo_path already existed and its table RLS is
-- untouched by this pass (see supabase/milestone-20-profile-photo.sql).
-- This file verifies the NEW storage side: the profile-photos bucket's
-- owner-scoped folder-path policies, using the exact same technique as
-- supabase/tests/property-photos-rls.test.sql. Owner A must never be
-- able to read, replace, or delete Owner B's profile photo.
--
-- Same methodology as supabase/tests/milestone-8..19-*.test.sql / the
-- other non-milestone-numbered *-rls.test.sql files: run by hand
-- against a database with PropRoster's full schema.sql loaded and the
-- Supabase auth/storage schemas available (real Supabase, or a local
-- Postgres stubbed per the note at the bottom of
-- milestone-9-rls.test.sql — for storage.objects specifically, also
-- `alter table storage.objects enable row level security;`, since real
-- Supabase already has that on by platform default). Every block RAISEs
-- "REGRESSION" or NOTICEs "PASS". Run with `psql -v ON_ERROR_STOP=0`
-- and grep for "REGRESSION" — a clean run has zero matches. Two
-- throwaway users and their profiles are created inside a transaction
-- that is rolled back at the end.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000a001', 'ownerA@example.com'),
  ('a0000000-0000-0000-0000-00000000a002', 'ownerB@example.com');

-- public.handle_new_user_profile() already auto-created a bare profile
-- row for each user above (an AFTER INSERT trigger on auth.users) — set
-- photo_path on those existing rows rather than inserting fresh ones.
insert into public.user_profiles (id, photo_path) values
  ('a0000000-0000-0000-0000-00000000a001', 'a0000000-0000-0000-0000-00000000a001/avatar/photo.jpg'),
  ('a0000000-0000-0000-0000-00000000a002', 'a0000000-0000-0000-0000-00000000a002/avatar/photo.jpg')
on conflict (id) do update set photo_path = excluded.photo_path;

insert into storage.buckets (id, name, public) values ('profile-photos', 'profile-photos', false) on conflict (id) do nothing;
insert into storage.objects (bucket_id, name) values
  ('profile-photos', 'a0000000-0000-0000-0000-00000000a001/avatar/photo.jpg'),
  ('profile-photos', 'a0000000-0000-0000-0000-00000000a002/avatar/photo.jpg');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a001', true);

-- ===== 1. Owner A sees exactly their own object in the profile-photos bucket =====
do $$
declare found_count int;
begin
  select count(*) into found_count from storage.objects where bucket_id = 'profile-photos';
  if found_count <> 1 then
    raise exception 'REGRESSION: Owner A''s storage.objects SELECT returned % rows in profile-photos, expected exactly 1 (their own)', found_count;
  end if;
  raise notice 'PASS: Owner A sees exactly their own object in the profile-photos bucket';
end $$;

-- ===== 2. Owner A cannot INSERT (upload) under Owner B's folder path =====
do $$
begin
  begin
    insert into storage.objects (bucket_id, name) values ('profile-photos', 'a0000000-0000-0000-0000-00000000a002/avatar/sneaky.jpg');
    raise exception 'REGRESSION: Owner A inserted a profile-photos object under Owner B''s folder path';
  exception
    when insufficient_privilege then raise notice 'PASS: INSERT under another owner''s profile-photos folder correctly rejected';
  end;
end $$;

-- ===== 3. Owner A cannot UPDATE (replace) Owner B's profile photo object =====
do $$
declare affected integer;
begin
  update storage.objects set name = 'a0000000-0000-0000-0000-00000000a002/avatar/replaced.jpg' where bucket_id = 'profile-photos' and name = 'a0000000-0000-0000-0000-00000000a002/avatar/photo.jpg';
  get diagnostics affected = row_count;
  if affected > 0 then
    raise exception 'REGRESSION: Owner A was able to UPDATE (replace) Owner B''s profile photo object';
  end if;
  raise notice 'PASS: Owner A''s UPDATE of Owner B''s profile photo object correctly affected 0 rows';
end $$;

-- ===== 4. Owner A cannot DELETE (remove) Owner B's profile photo object =====
do $$
declare affected integer;
begin
  delete from storage.objects where bucket_id = 'profile-photos' and name = 'a0000000-0000-0000-0000-00000000a002/avatar/photo.jpg';
  get diagnostics affected = row_count;
  if affected > 0 then
    raise exception 'REGRESSION: Owner A was able to DELETE Owner B''s profile photo object';
  end if;
  raise notice 'PASS: Owner A''s DELETE of Owner B''s profile photo object correctly affected 0 rows';
end $$;

-- ===== 5. Owner A cannot SELECT Owner B's user_profiles row (photo_path, or anything else on it) =====
do $$
declare found_path text;
begin
  select photo_path into found_path from public.user_profiles where id = 'a0000000-0000-0000-0000-00000000a002';
  if found_path is not null then
    raise exception 'REGRESSION: Owner A was able to SELECT Owner B''s user_profiles row (including photo_path)';
  end if;
  raise notice 'PASS: Owner A cannot SELECT Owner B''s user_profiles row';
end $$;

-- ===== 6. The profile-photos bucket itself is not public =====
reset role;
do $$
declare is_public boolean;
begin
  select public into is_public from storage.buckets where id = 'profile-photos';
  if is_public then
    raise exception 'REGRESSION: the profile-photos bucket is public — avatars would be readable without a signed URL or auth at all';
  end if;
  raise notice 'PASS: the profile-photos bucket remains private';
end $$;

rollback;

-- To run against a fresh local Postgres instead of a real Supabase project,
-- see the stub schema documented at the bottom of
-- supabase/tests/milestone-9-rls.test.sql, then load supabase/schema.sql,
-- then this file (plus `alter table storage.objects enable row level
-- security;` for a local stub — see this file's own header note above).
