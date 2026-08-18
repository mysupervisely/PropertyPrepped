-- PropRoster Launch Polish — basic user profile photo (avatar).
-- Run once if upgrading an existing project (after Launch Pricing).
--
-- public.user_profiles.photo_path (supabase/milestone-11-property-
-- profile-2.sql) already exists and was explicitly reserved for this —
-- see app/profile/page.tsx's own prior comment ("reserved space so it
-- can be added later without another migration"). No table/column
-- change is needed; this file only adds the storage side: a new
-- private bucket for profile photos, following the EXACT same
-- owner-scoped-folder-path pattern already established by
-- property-photos (supabase/schema.sql) and tenant-connect-attachments
-- (supabase/milestone-10-tenant-connect.sql) — the first folder segment
-- of every object's path must equal the uploader's own auth.uid().
--
-- One canonical photo per user (not a gallery): the app always uploads
-- to a fresh path under the user's own folder and deletes the prior
-- object (if any) once the new upload succeeds, then updates
-- photo_path to the new path — mirrored from the exact same add/
-- replace/remove flow property_photos already uses for a property's
-- cover photo. Never public: the bucket is private, and the app reads
-- the image back only via a short-lived signed URL (same as
-- property-photos/property-documents), never a bare public URL.
--
-- Idempotent: safe to run multiple times, safe on a database that
-- already has this bucket/these policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  false,
  5242880, -- 5MB — a single small avatar image, deliberately tighter than property-photos' 20MB (a full property photo)
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies: a user can only work inside their own /<their-user-id>/...
-- folder — the same (storage.foldername(name))[1] = auth.uid() idiom
-- property-photos and property-documents already use. No service-role
-- bypass, no public read.
drop policy if exists "profile_photos_select_own" on storage.objects;
create policy "profile_photos_select_own" on storage.objects for select to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "profile_photos_insert_own" on storage.objects;
create policy "profile_photos_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "profile_photos_update_own" on storage.objects;
create policy "profile_photos_update_own" on storage.objects for update to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "profile_photos_delete_own" on storage.objects;
create policy "profile_photos_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- No change to public.user_profiles or its RLS policies — photo_path is
-- just another nullable column on a row already fully owner-scoped by
-- the existing user_profiles_select_own / insert_own / update_own
-- policies (supabase/milestone-11-property-profile-2.sql), none of
-- which reference specific column names.
