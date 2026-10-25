-- PropRoster — Mobile V2: customizable Dashboard Quick Actions.
--
-- NOT YET APPLIED TO PRODUCTION. Review before running.
--
-- The smallest useful preference model for "which four shortcuts does
-- this landlord want on their mobile dashboard" — mirrors
-- public.notification_preferences' own exact pattern (see
-- supabase/milestone-31-landlord-digest-v1.sql): a plain owner_id-keyed
-- table, RLS scoped to auth.uid(), no cross-table coupling to
-- public.user_profiles (Mobile V2's own requirement: "do not overwrite
-- existing profile settings" — a separate table means a quick-actions
-- save can never race with or clobber a profile-page save, and vice
-- versa, since they are different rows in different tables).
--
-- Deliberately NO auto-create-on-signup trigger and NO backfill (unlike
-- notification_preferences/user_profiles): a landlord who has never
-- customized their Quick Actions simply has no row yet, and the app
-- treats "no row" exactly the same as "a row with selected_actions
-- null" — both mean "show the product defaults"
-- (lib/dashboard/quick-actions.ts's DEFAULT_QUICK_ACTIONS, applied
-- client-side). The first customization creates the row via upsert,
-- the same upsert-without-guaranteed-existing-row pattern
-- app/profile/page.tsx already uses for photo_path. One fewer trigger
-- to maintain for a preference the large majority of accounts may never
-- touch.
--
-- selected_actions is a plain jsonb array of up to 4 short string ids
-- (e.g. ["add_expense","smart_upload","maintenance","invite_tenant"]) —
-- the exact id strings lib/dashboard/quick-actions.ts's QUICK_ACTION_IDS
-- defines. The check constraint below is integrity-only (a basic shape
-- guard: null, or an array of exactly 4 elements) — it deliberately does
-- NOT enumerate the valid id strings themselves, so adding a new
-- catalog entry in application code never needs a matching migration.
-- Unknown/stale id strings (e.g. a landlord's selection predating a
-- future catalog change) are handled defensively on READ, by
-- lib/dashboard/quick-actions.ts's normalizeQuickActionSelection() —
-- any selection that isn't exactly 4 currently-valid, unique ids falls
-- back to the product defaults rather than rendering a broken shortcut.

create table if not exists public.quick_action_preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  selected_actions jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quick_action_preferences_shape check (
    selected_actions is null or jsonb_typeof(selected_actions) = 'array'
  )
);

alter table public.quick_action_preferences enable row level security;

-- Same owner-scoped select/insert/update triplet as notification_preferences
-- and user_profiles — a landlord can only ever see or change their OWN
-- Quick Actions selection. Deliberately no delete policy (same reasoning
-- as those two tables: cleaned up automatically by the `on delete
-- cascade` FK when the account itself is deleted; "Restore Defaults" is
-- implemented as an update to null, not a row delete, so the UI never
-- needs one).
drop policy if exists "quick_action_preferences_select_own" on public.quick_action_preferences;
create policy "quick_action_preferences_select_own" on public.quick_action_preferences for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "quick_action_preferences_insert_own" on public.quick_action_preferences;
create policy "quick_action_preferences_insert_own" on public.quick_action_preferences for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "quick_action_preferences_update_own" on public.quick_action_preferences;
create policy "quick_action_preferences_update_own" on public.quick_action_preferences for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
