-- PropRoster — Landlord Digest V1: the smallest useful notification-
-- preference model, plus duplicate-send protection for the scheduled
-- weekly digest.
--
-- NOT YET APPLIED TO PRODUCTION. Review before running.
--
-- This is the FIRST proactive/scheduled notification PropRoster ever
-- sends (every existing email — Realtor Connect, Tenant Connect — fires
-- synchronously off a direct user action). It needs exactly two things
-- at the database layer:
--   1. An opt-in preference, so nobody receives this email who hasn't
--      explicitly turned it on (see DEFAULT below — deliberately not a
--      silent opt-in).
--   2. A "when was this account's digest last sent" timestamp, so the
--      scheduled function can never send two digests to the same
--      landlord in the same weekly period, even under a retry/duplicate
--      invocation (see lib/notifications/digest-period.ts's
--      isDigestDue()).
--
-- Mirrors public.user_profiles' own exact pattern (1:1 with auth.users,
-- id IS the primary key AND the FK, RLS scoped to auth.uid(), a trigger
-- that creates a row for every new signup, a one-time backfill for
-- existing accounts) — see supabase/schema.sql's "Section 1/2: User
-- Profile" for the precedent this follows.
--
-- DEFAULT: weekly_digest_enabled defaults to FALSE for every account,
-- new and existing. This is deliberately conservative — this milestone
-- introduces PropRoster's first-ever proactive outbound email, nobody
-- has agreed to receive it yet, and it is explicitly NOT a marketing/
-- newsletter system (no user should be silently opted into a new
-- recurring email just because this migration ran). A landlord turns it
-- on from Profile > Notifications when they want it.

create table if not exists public.notification_preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  weekly_digest_enabled boolean not null default false,
  last_weekly_digest_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

-- Same owner-scoped select/insert/update triplet as user_profiles — a
-- landlord can only ever see or change their OWN preference row.
-- Deliberately no delete policy (same reasoning as user_profiles: the
-- row is cleaned up automatically by the `on delete cascade` FK when
-- the account itself is deleted; there's no product reason for a
-- signed-in user to delete just this row).
drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own" on public.notification_preferences for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own" on public.notification_preferences for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own" on public.notification_preferences for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
-- No policy at all for the scheduled digest job's own read/write access
-- (it needs to see every eligible owner's row, and update
-- last_weekly_digest_sent_at after a send) — that job runs exclusively
-- through lib/supabase-server.ts's createAdminClient() (the service-role
-- key), which bypasses RLS entirely by design, the same as the Stripe
-- webhook already does for the same "no user session exists by
-- construction" reason. See that file's own updated header comment.

-- Auto-creates a disabled-by-default preference row the moment a new
-- auth user is created — mirrors handle_new_user_profile() exactly, so
-- the digest job never has to special-case "no preference row yet"
-- (it simply won't find the owner in its own eligible-owners query,
-- since that query filters on weekly_digest_enabled = true and a
-- missing row is never eligible either way). Idempotent — safe to
-- re-run this file against a project that already has it.
create or replace function public.handle_new_user_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_preferences (owner_id) values (new.id)
  on conflict (owner_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_notification_preferences on auth.users;
create trigger on_auth_user_created_notification_preferences
  after insert on auth.users
  for each row execute procedure public.handle_new_user_notification_preferences();

-- Backfill: existing accounts created before this migration get a row
-- too (disabled by default, per the DEFAULT reasoning above) — without
-- this, every pre-existing account would simply never be able to opt in
-- until they happened to trigger some other flow that inserts one; the
-- Profile page's own toggle needs a row to update.
insert into public.notification_preferences (owner_id)
select id from auth.users
on conflict (owner_id) do nothing;

-- Index for the scheduled job's own eligible-owners scan — filters on
-- weekly_digest_enabled = true, which without this index would be a
-- full table scan as the account base grows. Partial (only true rows)
-- since the job never queries for disabled ones.
create index if not exists notification_preferences_weekly_digest_enabled_idx
  on public.notification_preferences (weekly_digest_enabled)
  where weekly_digest_enabled = true;
