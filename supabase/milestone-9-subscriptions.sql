-- PropPrepped Milestone 9 upgrade — SaaS plans, Stripe billing, entitlements.
-- Run once in the Supabase SQL Editor. Additive only — does not drop or
-- rewrite any existing table, column, policy, or property data from earlier
-- milestones. Existing accounts default to the Free plan the moment this
-- migration runs; nothing about existing properties changes.

-- ==================================================================
-- plan_limits — single source of truth for "how many properties does
-- each plan allow." Both the property-limit trigger below AND
-- lib/billing/plans.ts read from this same launch numbers; plans.ts
-- documents that this table is authoritative for enforcement (plans.ts
-- is what the UI displays, but this table is what actually gets
-- enforced, so the two can never silently drift apart at the point that
-- matters — an app deploy without a matching SQL update simply can't
-- change what's allowed).
-- ==================================================================
create table if not exists public.plan_limits (
  plan text primary key check (plan in ('free', 'investor', 'portfolio', 'portfolio_pro')),
  max_properties integer not null check (max_properties > 0)
);

insert into public.plan_limits (plan, max_properties) values
  ('free', 1),
  ('investor', 4),
  ('portfolio', 9),
  ('portfolio_pro', 20)
on conflict (plan) do update set max_properties = excluded.max_properties;

alter table public.plan_limits enable row level security;
drop policy if exists "plan_limits_select_all" on public.plan_limits;
-- Non-sensitive, identical for every user — readable by any signed-in
-- client so the UI can display accurate limits without duplicating them.
create policy "plan_limits_select_all" on public.plan_limits for select to authenticated using (true);

-- ==================================================================
-- user_subscriptions — one row per user, holding Stripe-synchronized
-- subscription state. Users without a paid subscription simply have no
-- row here (or a row with plan = 'free') — both are treated as Free by
-- every reader (Section 5: existing users default to Free, never broken).
-- ==================================================================
create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,

  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,

  plan text not null default 'free' check (plan in ('free', 'investor', 'portfolio', 'portfolio_pro')),
  -- Mirrors Stripe Subscription.status verbatim (see
  -- lib/billing/webhook-handlers.ts) plus 'active' as the implicit
  -- default for a brand-new Free row that has never touched Stripe.
  status text not null default 'active' check (status in (
    'active', 'trialing', 'past_due', 'unpaid', 'canceled',
    'incomplete', 'incomplete_expired', 'paused'
  )),

  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_subscriptions_owner_idx on public.user_subscriptions(owner_id);
create index if not exists user_subscriptions_stripe_customer_idx on public.user_subscriptions(stripe_customer_id);
create index if not exists user_subscriptions_stripe_subscription_idx on public.user_subscriptions(stripe_subscription_id);

alter table public.user_subscriptions enable row level security;

drop policy if exists "user_subscriptions_select_own" on public.user_subscriptions;
create policy "user_subscriptions_select_own" on public.user_subscriptions for select to authenticated using ((select auth.uid()) = owner_id);

-- Deliberately NO insert/update/delete policy for the `authenticated`
-- role (Section 3 & 14): plan, status, and every Stripe id are written
-- exclusively by the server — the Stripe webhook handler, using the
-- Supabase service-role key after verifying the Stripe signature — never
-- by a client request, however it's authenticated. This is what makes
-- "a user cannot self-upgrade / fake subscription status / change their
-- own Stripe ids" true at the database level rather than merely in
-- application code: RLS denies every client write to this table by
-- construction, so there is nothing for a malicious client to bypass.
-- The service-role key itself is never sent to the browser.

create or replace function public.user_subscriptions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_subscriptions_touch_updated_at on public.user_subscriptions;
create trigger user_subscriptions_touch_updated_at
  before update on public.user_subscriptions
  for each row
  execute function public.user_subscriptions_set_updated_at();

-- ==================================================================
-- stripe_webhook_events — idempotency ledger. Stripe may deliver the
-- same event more than once (retries, duplicate sends); the webhook
-- route claims an event id here before doing any work, and skips
-- processing entirely if the id was already claimed. No PII, no
-- business data — just enough to make webhook processing idempotent.
-- ==================================================================
create table if not exists public.stripe_webhook_events (
  id text primary key,
  type text not null,
  created_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
-- No policies at all for `authenticated` — this table is never read or
-- written by a client, only by the server-side webhook handler via the
-- service-role key (which bypasses RLS). RLS being enabled with zero
-- policies means the `authenticated` role is denied every operation,
-- which is exactly the intended "server-only" table.

-- ==================================================================
-- Property-limit enforcement (Section 6) — a database-level BEFORE
-- INSERT trigger on properties, so the limit holds no matter how a row
-- gets inserted: the existing client-side
-- supabase.from('properties').insert() call in app/page.tsx, the
-- Convert-Analysis-to-Property flow in investment-tools, any future
-- server route, or a malicious client calling the Supabase REST API
-- directly all pass through this same check. Nothing about the caller's
-- plan or that plan's limit is ever supplied by the client — both are
-- looked up from tables the client cannot write (user_subscriptions,
-- plan_limits).
-- ==================================================================
create or replace function public.enforce_property_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_status text;
  v_max integer;
  v_count integer;
begin
  -- BEFORE INSERT triggers run before RLS's WITH CHECK is evaluated, so
  -- without this guard a caller could submit owner_id = someone else's
  -- id and have this trigger look up THAT person's plan/count before the
  -- insert is ultimately rejected by properties_insert_own's
  -- `(select auth.uid()) = owner_id` check anyway. That insert was
  -- always going to fail — but running the lookup first would let an
  -- attacker learn "is this owner_id at their property limit" as a
  -- side channel. Skip straight through when owner_id doesn't match the
  -- caller and let RLS reject it with no information disclosed; only
  -- check the limit for an insert that could otherwise actually succeed.
  if new.owner_id is distinct from (select auth.uid()) then
    return new;
  end if;

  select plan, status into v_plan, v_status
  from public.user_subscriptions
  where owner_id = new.owner_id;

  -- No subscription row, or a status that doesn't currently grant paid
  -- entitlements (see lib/billing/entitlements.ts ENTITLED_STATUSES for
  -- the full reasoning) → Free. This is what keeps a canceled/past-due/
  -- unpaid account from being treated as still-paid for enforcement
  -- purposes, while never touching their existing property rows.
  if v_plan is null or v_status is null or v_status not in ('active', 'past_due') then
    v_plan := 'free';
  end if;

  select max_properties into v_max from public.plan_limits where plan = v_plan;
  if v_max is null then
    v_max := 1; -- fail closed to the safest (Free) limit if plan_limits is ever missing a row
  end if;

  select count(*) into v_count from public.properties where owner_id = new.owner_id;

  if v_count >= v_max then
    -- Distinguishable message so the client can show the upgrade prompt
    -- copy from Section 8 instead of a raw database error — see
    -- lib/billing/entitlements.ts / app/page.tsx's addProperty() and
    -- app/investment-tools/property-evaluator/page.tsx's
    -- convertToProperty(), which both check entitlements client-side
    -- BEFORE reaching this point (better UX) and also parse this
    -- specific message as a fallback (this trigger is the actual
    -- security boundary; the client-side check is UX only).
    raise exception 'PROPERTY_LIMIT_REACHED'
      using detail = format('plan=%s;max=%s;current=%s', v_plan, v_max, v_count),
            hint = 'Upgrade your PropRoster plan to add more properties.';
  end if;

  return new;
end;
$$;

drop trigger if exists properties_enforce_limit on public.properties;
create trigger properties_enforce_limit
  before insert on public.properties
  for each row
  execute function public.enforce_property_limit();

-- Note: this trigger intentionally does NOT fire on UPDATE or DELETE —
-- editing or removing an existing property never re-checks the limit
-- (Section 5: never lock existing data), and downgrading a plan below
-- the account's current property count only blocks *creating* another
-- property, exactly as specified.
