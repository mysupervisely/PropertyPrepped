-- PropRoster — Platform Admin Authorization Fix.
--
-- Root cause this migration fixes: PropRoster had NO concept of a
-- "platform administrator" separate from billing. Every admin-ish
-- surface (app/admin/realtor-leads, the document-intelligence
-- diagnostics gate, and PR #81's app/admin/subscriptions) reused the
-- internal 'owner' PlanId on user_subscriptions as a stand-in for
-- "is this person allowed to see internal tools" — conflating a
-- customer's BILLING PLAN with an application ROLE. A real paying
-- customer's account (any plan) can never satisfy `plan = 'owner'`
-- without a manual, unrelated billing-plan change, which is exactly
-- backwards: platform administration must never be a side effect of
-- what someone is subscribed to.
--
-- Fix: a dedicated, minimal table that represents ONLY platform-admin
-- membership — nothing else. It carries no plan, no billing meaning,
-- and is fully independent of user_subscriptions.
--
-- Additive only — does not drop, rename, or rewrite any existing table,
-- column, policy, or row. No existing account's plan, status, or
-- property data is touched by this migration.

create table if not exists public.platform_admins (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

drop policy if exists "platform_admins_select_own" on public.platform_admins;
-- A signed-in user may read ONLY their own row — enough for the app
-- (server route + client hook) to answer "am I a platform admin",
-- never enough to enumerate or infer who else is one.
create policy "platform_admins_select_own" on public.platform_admins
  for select to authenticated using ((select auth.uid()) = owner_id);

-- Deliberately NO insert/update/delete policy for `authenticated` — the
-- exact same pattern already established for user_subscriptions.plan =
-- 'owner' (see supabase/milestone-9-subscriptions.sql's own comment on
-- that column): RLS with no write policy denies every client write by
-- construction, so no authenticated request — however crafted — can
-- grant itself (or anyone else) platform-admin access. The ONLY way a
-- row is ever created here is a manual SQL statement run by the
-- PropRoster project owner directly in the Supabase SQL editor (using
-- the dashboard's elevated connection, which bypasses RLS), the same
-- operational mechanism already used to assign plan = 'owner'. That
-- statement is intentionally NOT included in this file and is never
-- committed to the repository or hard-coded into application code —
-- it names a specific person's account, which does not belong in
-- source control. See the milestone completion report for the exact
-- statement to run.

-- ==================================================================
-- Migrate realtor_leads' admin RLS policies off plan = 'owner' onto
-- platform_admins (Section 3 of the follow-up: "eliminate subscription-
-- plan-as-admin authorization throughout PropRoster"). This REPLACES the
-- two policies originally created in
-- supabase/milestone-21-realtor-connect.sql — same table, same select/
-- update shape, same "admin only" intent — only the membership check
-- changes. Nothing about realtor_leads' columns, data, or non-admin
-- access (there is none — see that file's own top comment: "Deliberately
-- NO insert/select policy for anon or authenticated") is touched.
-- ==================================================================
drop policy if exists "realtor_leads_admin_select" on public.realtor_leads;
create policy "realtor_leads_admin_select" on public.realtor_leads for select to authenticated using (
  exists (
    select 1 from public.platform_admins pa
    where pa.owner_id = (select auth.uid())
  )
);

drop policy if exists "realtor_leads_admin_update" on public.realtor_leads;
create policy "realtor_leads_admin_update" on public.realtor_leads for update to authenticated
using (
  exists (
    select 1 from public.platform_admins pa
    where pa.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.platform_admins pa
    where pa.owner_id = (select auth.uid())
  )
);
