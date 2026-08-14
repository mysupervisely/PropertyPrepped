-- PropRoster Milestone 11: Privacy-First Admin Analytics.
--
-- Goal (see the completion report for the full rationale): give PropRoster
-- staff enough aggregate visibility to operate the SaaS business — growth,
-- subscription mix, feature adoption, AI cost, platform health — WITHOUT
-- ever exposing individual customer portfolio contents (addresses,
-- documents, tenants, financials, mortgages, insurance, investment
-- analyses, Tenant Connect messages). This file adds ONLY:
--
--   1. admin_roles           — server/database-controlled admin flag.
--   2. admin_audit_events    — append-only log of admin actions.
--   3. is_admin()            — the one place admin status is resolved.
--   4. Six SECURITY DEFINER aggregate functions — the ONLY way admin data
--      leaves the database. Every one authorizes the caller internally,
--      returns nothing but counts/sums/averages (never a portfolio row),
--      and is documented with exactly which columns it touches and why
--      that's safe.
--
-- Nothing here modifies any existing table, policy, or trigger. This is
-- purely additive.
--
-- ============================================================
-- 1. admin_roles — the ONLY source of truth for "is this user an admin."
-- ============================================================
-- Deliberately NOT derived from:
--   - any client-supplied value (there is no adminOverride flag anywhere)
--   - email domain (a client/attacker-controlled auth.users column)
--   - the 'owner' subscription plan (a SEPARATE, purely billing concept —
--     see lib/billing/plans.ts's 'owner' entry. An internal team member
--     could have BOTH an 'owner' subscription AND an admin_roles row, or
--     either alone, or neither; this table never reads user_subscriptions
--     and is_admin() below never reads it either).
--
-- There is deliberately no INSERT/UPDATE/DELETE policy for `authenticated`
-- at all, so RLS denies every client-side write with zero policies present
-- — the exact same pattern already used for stripe_webhook_events and the
-- internal 'owner' plan elsewhere in this schema. The ONLY way a row is
-- ever created here is a direct SQL statement run by a human operator with
-- database access (e.g. via the Supabase SQL Editor with the service
-- role/superuser connection) — never through this app's API surface. This
-- is what makes "normal users must never be able to make themselves
-- admins" true by construction, not convention.
--
-- revoked_at (nullable) lets an admin grant be revoked without deleting
-- history — is_admin() below only counts a row where revoked_at is null.
create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists admin_roles_active_idx on public.admin_roles(user_id) where revoked_at is null;

alter table public.admin_roles enable row level security;
-- No policies for `authenticated` — RLS enabled with zero policies denies
-- all client access (select, insert, update, delete alike). Only
-- SECURITY DEFINER functions below (is_admin()) and direct
-- operator/service-role SQL ever touch this table.

-- To grant/revoke admin access, run one of these directly against the
-- database (never exposed through any API route or UI in this app):
--
--   insert into public.admin_roles (user_id, granted_by)
--   values ('<uuid-of-new-admin>', '<uuid-of-granting-operator>');
--
--   update public.admin_roles set revoked_at = now() where user_id = '<uuid>';

-- ==================================================================
-- is_admin(uuid) — the ONE place admin status is resolved anywhere in
-- this codebase. Every admin-gated route/RPC calls this, never
-- duplicates the admin_roles lookup inline.
--
-- SECURITY DEFINER is required because admin_roles has no SELECT policy
-- for `authenticated` at all (see above) — a plain query from the caller's
-- own RLS context would see zero rows even for a real admin. This
-- function only ever returns a boolean, never a row, so the elevated read
-- can't leak anything beyond "is this specific user_id currently an
-- admin." Defaults to the caller's own auth.uid() when no argument is
-- given, matching the owner_has_tenant_connect(uuid) convention already
-- used in this schema (Milestone 10) for the same "elevated boolean
-- check, nothing else" shape.
-- ==================================================================
create or replace function public.is_admin(p_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_roles ar
    where ar.user_id = coalesce(p_user_id, auth.uid())
      and ar.revoked_at is null
  );
$$;

-- ============================================================
-- 2. admin_audit_events — append-only log of meaningful admin actions.
-- ============================================================
-- admin_user_id: who did it. target_user_id: nullable — set only for
-- actions that concern one specific account (none yet; reserved for a
-- future GRANT_INTERNAL_ROLE/REVOKE_INTERNAL_ROLE/CHANGE_ACCOUNT_STATUS
-- action, none of which this pass implements). metadata is operational
-- context ONLY — e.g. {} or a section name — application code must never
-- write a secret, a document id, a property address, or any other
-- customer-portfolio value into this column. `action` is deliberately a
-- free-text column, not a check-constrained enum: the exact action
-- vocabulary is defined and validated in TypeScript
-- (lib/admin/audit-actions.ts), not the database, so adding a new
-- documented action never requires a migration.
create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_events_admin_idx on public.admin_audit_events(admin_user_id, created_at desc);
create index if not exists admin_audit_events_action_idx on public.admin_audit_events(action);
create index if not exists admin_audit_events_target_idx on public.admin_audit_events(target_user_id);

alter table public.admin_audit_events enable row level security;

-- SELECT: any current admin may read the full audit log (this is an
-- internal ops tool — the audit trail itself is not per-admin private).
-- A normal, non-admin user gets zero rows, same mechanism as every other
-- RLS-gated table in this codebase.
drop policy if exists "admin_audit_events_select_admin" on public.admin_audit_events;
create policy "admin_audit_events_select_admin" on public.admin_audit_events for select to authenticated
using (public.is_admin((select auth.uid())));

-- INSERT: an authenticated admin may insert an audit row for THEIR OWN
-- admin_user_id only, and only while they currently pass is_admin() —
-- this is what lets the app log "VIEW_ADMIN_ANALYTICS" via a normal
-- RLS-scoped client call (the same pattern as ai_usage_events' own-row
-- insert policy) rather than needing a service-role key or another
-- SECURITY DEFINER function just to write a log line.
drop policy if exists "admin_audit_events_insert_admin" on public.admin_audit_events;
create policy "admin_audit_events_insert_admin" on public.admin_audit_events for insert to authenticated
with check (
  admin_user_id = (select auth.uid())
  and public.is_admin((select auth.uid()))
);
-- No UPDATE or DELETE policy: append-only audit trail, same convention as
-- ai_usage_events — RLS denies both by default with no policy present.

-- ============================================================
-- 3. Aggregate RPCs. Every function below:
--   - is SECURITY DEFINER with search_path pinned to `public` explicitly
--     (never trusts the caller's search_path)
--   - re-checks public.is_admin((select auth.uid())) as its very first
--     statement and RAISEs an insufficient_privilege error otherwise —
--     the same errcode a real RLS denial would surface, so a non-admin
--     caller cannot distinguish "this RPC doesn't exist" from "you're not
--     an admin" from any other RLS-style rejection anywhere else in the
--     app
--   - returns ONLY pre-aggregated counts/sums/averages — never a raw
--     properties/documents/leases/etc. row, never an address, never
--     document content, never a tenant message
--   - is documented with the exact source tables/columns it reads and
--     why each one is safe to aggregate
-- ============================================================

-- ------------------------------------------------------------
-- admin_overview_metrics() — USERS section.
-- Reads: auth.users(id, created_at, last_sign_in_at) only — no profile
-- fields, no email is selected here (email appears only in
-- admin_list_user_accounts() below, which is explicitly documented as
-- exposing account email as minimum account metadata, per the completion
-- report's Section 5 allow-list).
-- "Active user" is defined narrowly and explicitly, never guessed: signed
-- in within the last 30 days, using Supabase Auth's own last_sign_in_at —
-- a safe, already-existing definition rather than inventing an
-- engagement heuristic.
-- ------------------------------------------------------------
create or replace function public.admin_overview_metrics()
returns table(
  total_users bigint,
  new_users_this_month bigint,
  active_users_30d bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  return query
  select
    count(*)::bigint,
    count(*) filter (where u.created_at >= date_trunc('month', now()))::bigint,
    count(*) filter (where u.last_sign_in_at >= now() - interval '30 days')::bigint
  from auth.users u;
end;
$$;

-- ------------------------------------------------------------
-- admin_subscription_metrics() — SUBSCRIPTIONS section.
-- Reads: user_subscriptions(plan, status) grouped and counted — never
-- owner_id, never stripe_customer_id/stripe_subscription_id. Pricing
-- (needed to turn these counts into MRR) intentionally does NOT live in
-- SQL — it's computed in TypeScript from the exact same PLANS catalog
-- (lib/billing/plans.ts) the rest of the app already uses for pricing
-- display, so there is one source of truth for "what a plan costs," not
-- two that can drift.
-- ------------------------------------------------------------
create or replace function public.admin_subscription_metrics()
returns table(
  plan text,
  status text,
  account_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  return query
  select us.plan, us.status, count(*)::bigint
  from public.user_subscriptions us
  group by us.plan, us.status;
end;
$$;

-- ------------------------------------------------------------
-- admin_portfolio_usage_metrics() — PORTFOLIO USAGE section.
-- Reads: properties(owner_id) ONLY — grouped by owner_id purely to COUNT
-- rows per owner, never selecting address/estimated_value/mortgage_balance
-- or any other column. owner_id itself never leaves this function (it's
-- consumed inside the CTE, not returned). The result is five bucket
-- counts plus an average/median restricted to the population of owners
-- who have at least one property (matching the buckets, which start at
-- "1 property") — average-across-ALL-registered-accounts is computed in
-- TypeScript instead, by dividing this function's total_properties by
-- admin_overview_metrics()'s total_users, so this function never needs to
-- touch auth.users at all.
-- ------------------------------------------------------------
create or replace function public.admin_portfolio_usage_metrics()
returns table(
  total_properties bigint,
  owners_with_properties bigint,
  avg_properties_per_owner numeric,
  median_properties_per_owner numeric,
  bucket_1 bigint,
  bucket_2_4 bigint,
  bucket_5_9 bigint,
  bucket_10_20 bigint,
  bucket_21_plus bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  return query
  with per_owner as (
    select p.owner_id, count(*) as property_count
    from public.properties p
    group by p.owner_id
  )
  select
    coalesce(sum(property_count), 0)::bigint,
    count(*)::bigint,
    coalesce(avg(property_count), 0)::numeric,
    coalesce(percentile_cont(0.5) within group (order by property_count), 0)::numeric,
    count(*) filter (where property_count = 1)::bigint,
    count(*) filter (where property_count between 2 and 4)::bigint,
    count(*) filter (where property_count between 5 and 9)::bigint,
    count(*) filter (where property_count between 10 and 20)::bigint,
    count(*) filter (where property_count >= 21)::bigint
  from per_owner;
end;
$$;

-- ------------------------------------------------------------
-- admin_feature_adoption_metrics() — FEATURE ADOPTION section.
-- Reads only owner_id (for distinct-user counts) and row counts from
-- investment_analyses, document_analyses, and tenant_property_access —
-- never address/results/structured_data/tenant_email or any other
-- content column from those tables. Property Watch, Home Purchase
-- Calculator, and Property Value & Comps have no tables yet (not built),
-- so they are intentionally absent here rather than guessed — the
-- TypeScript layer renders them as "not available yet," never a fake 0.
-- ------------------------------------------------------------
create or replace function public.admin_feature_adoption_metrics()
returns table(
  investment_tools_users bigint,
  investment_analyses_count bigint,
  document_intelligence_users bigint,
  document_analyses_count bigint,
  tenant_connect_owner_count bigint,
  tenant_connect_active_relationships bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  return query
  select
    (select count(distinct ia.owner_id) from public.investment_analyses ia)::bigint,
    (select count(*) from public.investment_analyses)::bigint,
    (select count(distinct da.owner_id) from public.document_analyses da)::bigint,
    (select count(*) from public.document_analyses)::bigint,
    (select count(distinct tpa.owner_id) from public.tenant_property_access tpa where tpa.status <> 'Revoked')::bigint,
    (select count(*) from public.tenant_property_access tpa where tpa.status = 'Active')::bigint;
end;
$$;

-- ------------------------------------------------------------
-- admin_ai_usage_summary() — AI USAGE section (month-to-date totals).
-- Reads only owner_id/input_tokens/output_tokens/created_at from
-- ai_usage_events — never document_id/analysis_id are returned, and this
-- function never joins into document_analyses or property_documents, so
-- no document content or structured extraction result is anywhere near
-- this query.
-- ------------------------------------------------------------
create or replace function public.admin_ai_usage_summary()
returns table(
  analyses_this_month bigint,
  input_tokens_this_month bigint,
  output_tokens_this_month bigint,
  active_ai_users_this_month bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  return query
  select
    count(*)::bigint,
    coalesce(sum(e.input_tokens), 0)::bigint,
    coalesce(sum(e.output_tokens), 0)::bigint,
    count(distinct e.owner_id)::bigint
  from public.ai_usage_events e
  where e.created_at >= date_trunc('month', now());
end;
$$;

-- ------------------------------------------------------------
-- admin_ai_usage_daily(p_days) — AI USAGE section (cost by day/model, for
-- the "AI analyses/day" chart and cost-by-day breakdown). Grouped by
-- (day, model) so TypeScript can price each row against the correct
-- per-model rate (lib/admin/pricing.ts) rather than assuming every call
-- used the same model — never returns owner_id, document_id, or
-- analysis_id, so it cannot be used to reconstruct "who ran what."
-- p_days is clamped to [1, 365] so a caller can't force an unbounded
-- full-table scan/response.
-- ------------------------------------------------------------
create or replace function public.admin_ai_usage_daily(p_days integer default 30)
returns table(
  usage_date date,
  model text,
  analyses_count bigint,
  input_tokens bigint,
  output_tokens bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer;
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  v_days := greatest(least(coalesce(p_days, 30), 365), 1);

  return query
  select
    date_trunc('day', e.created_at)::date,
    e.model,
    count(*)::bigint,
    coalesce(sum(e.input_tokens), 0)::bigint,
    coalesce(sum(e.output_tokens), 0)::bigint
  from public.ai_usage_events e
  where e.created_at >= now() - (v_days || ' days')::interval
  group by date_trunc('day', e.created_at), e.model
  order by date_trunc('day', e.created_at) asc;
end;
$$;

-- ------------------------------------------------------------
-- admin_list_user_accounts(p_limit, p_offset) — minimum account metadata
-- only (Section 5 of the completion report's allow-list). Reads
-- auth.users(id, email, created_at, last_sign_in_at) joined with
-- user_subscriptions(plan, status, stripe_customer_id IS NOT NULL — never
-- the raw stripe_customer_id/stripe_subscription_id/stripe_price_id
-- values themselves) and a properties COUNT per owner. Never reads
-- properties.address, never any document/lease/mortgage/insurance/
-- financial/maintenance/investment-analysis/tenant table. p_limit is
-- clamped to [1, 500] so this can never be used to dump the entire user
-- base in one call.
-- ------------------------------------------------------------
create or replace function public.admin_list_user_accounts(p_limit integer default 200, p_offset integer default 0)
returns table(
  user_id uuid,
  email text,
  signup_date timestamptz,
  last_sign_in_at timestamptz,
  plan text,
  status text,
  has_stripe_customer boolean,
  property_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_offset integer;
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  v_limit := greatest(least(coalesce(p_limit, 200), 500), 1);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  select
    u.id,
    u.email,
    u.created_at,
    u.last_sign_in_at,
    coalesce(us.plan, 'free'),
    us.status,
    (us.stripe_customer_id is not null),
    coalesce(pc.property_count, 0)::bigint
  from auth.users u
  left join public.user_subscriptions us on us.owner_id = u.id
  left join (
    select p.owner_id, count(*) as property_count
    from public.properties p
    group by p.owner_id
  ) pc on pc.owner_id = u.id
  order by u.created_at desc
  limit v_limit offset v_offset;
end;
$$;
