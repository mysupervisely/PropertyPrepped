-- PropRoster — Property Overview + Pricing Polish V1, Stage 1: FINAL
-- pricing-model decision. PropRoster scales by portfolio size
-- (maxProperties) only — Tenant Connect, Smart Upload, Portfolio
-- Import, AI Document Intelligence, Rent Ledger and PropWatch are core
-- capabilities on every real plan (Free/Organize/Manage), not a
-- Manage-only "automation product." See lib/billing/entitlements.ts's
-- own comment for the full reasoning; this migration is the ONE
-- database-layer consequence of that decision.
--
-- NOT YET APPLIED TO PRODUCTION. Review before running.
--
-- ===================================================================
-- FINDING #1 (same shape as schema.sql's own "SECTION E" — the
-- Milestone-26-era owner_has_tenant_connect() plan-list fix for
-- 'manage'/'automate'): public.owner_has_tenant_connect(uuid) is the
-- ONE place the database enforces the Tenant Connect entitlement — it
-- mirrors lib/billing/entitlements.ts's TENANT_CONNECT_ENABLED map, and
-- is called from every Tenant Connect RLS policy (tenant invite,
-- conversations, messages, tenant_requests, storage attachments).
-- TENANT_CONNECT_ENABLED now grants Tenant Connect to 'free' and
-- 'organize' too (Stage 1's decision) — the currently-live function
-- does not yet include those plan names, so without this migration a
-- Free/Organize landlord would see Tenant Connect enabled in the UI
-- (the frontend gate reads entitlementsFor(), which is already correct)
-- but every actual database write gated by owner_has_tenant_connect()
-- would be silently rejected by RLS — the exact same class of bug
-- schema.sql's Section E already documented and fixed once for
-- 'manage'/'automate'.
--
-- FINDING #2 (a second, previously-latent bug this same fix must also
-- correct, or Finding #1's own fix would be incomplete): the currently-
-- live function is a bare `exists(select 1 from user_subscriptions
-- where owner_id = ... and status in (...) and plan in (...))`. A
-- brand-new account that has never touched Stripe has NO
-- user_subscriptions row at all — resolveEffectivePlan() in
-- lib/billing/entitlements.ts (and enforce_property_limit() in
-- supabase/milestone-9-subscriptions.sql, the property-limit trigger)
-- both correctly treat "no row" as plan = 'free'. The exists()-based
-- function has no such fallback: "no row" simply fails the exists()
-- check and returns false, with NO branch that ever re-derives 'free'
-- from a missing row. This was harmless before Stage 1 ONLY because
-- 'free' itself resolved to owner_has_tenant_connect() = false anyway —
-- "no row → false" and "free → false" were accidentally the same
-- answer. Now that 'free' must resolve to TRUE, that accidental
-- equivalence breaks: simply adding 'free' to the plan list would still
-- leave every landlord with NO user_subscriptions row at all (a
-- realistic, common case for a brand-new signup) incorrectly denied.
-- This migration replaces the bare exists() query with the same
-- explicit "missing row / missing status / non-entitled status / a
-- free row regardless of status all resolve to 'free' first" branching
-- resolveEffectivePlan() already uses, so the two layers make the exact
-- same decision for every possible row state, not just the previously-
-- tested "a real row with a real plan and status" case.
--
-- This migration is intentionally a single CREATE OR REPLACE FUNCTION,
-- additive and idempotent, changing nothing else — no table, no other
-- policy, no data migration. It grants nothing beyond what the
-- already-updated TypeScript entitlements layer already tells a
-- Free/Organize landlord they have; it only makes the database agree,
-- for every account state that layer actually resolves, not only the
-- states the previous version happened to get right.
--
-- Legacy 'investor' is deliberately NOT added here — TENANT_CONNECT_ENABLED
-- keeps it false (a genuinely separate, not-yet-built optional add-on;
-- see that map's own comment), so this function must not grant it
-- either, or the two layers would newly disagree in the other direction.
create or replace function public.owner_has_tenant_connect(p_owner_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_status text;
begin
  select us.plan, us.status into v_plan, v_status
  from public.user_subscriptions us
  where us.owner_id = p_owner_id;

  -- Mirrors resolveEffectivePlan() in lib/billing/entitlements.ts
  -- exactly, branch for branch: no row, no plan, or no status → 'free';
  -- a stored plan of 'free' short-circuits to 'free' regardless of
  -- status; otherwise a non-entitled status also falls back to 'free'.
  if v_plan is null or v_status is null then
    v_plan := 'free';
  elsif v_plan = 'free' then
    v_plan := 'free';
  elsif v_status not in ('active', 'trialing', 'past_due') then
    v_plan := 'free';
  end if;

  return v_plan in ('free', 'organize', 'manage', 'automate', 'portfolio', 'portfolio_pro', 'owner');
end;
$$;
