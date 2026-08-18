-- PropRoster Launch Pricing (capability-based relaunch) — Milestone 19.
-- Run once if upgrading an existing project (after Milestone 18).
--
-- Adds the new public plan ids ('organize', 'manage', 'automate') to the
-- SAME plan_limits/user_subscriptions tables Milestone 9 already
-- established — no new tables, no new columns. Purely additive:
--
--   - Widens both tables' `plan` check constraints to also allow
--     'organize', 'manage', 'automate' (Postgres check constraints don't
--     support incremental ADD VALUE the way an enum does, so the
--     existing "drop constraint if exists / add constraint" idiom —
--     already used by this same migration file's own 'owner' addition —
--     is reused here verbatim).
--   - Adds plan_limits rows for the three new ids (organize=5,
--     manage=15, automate=50 — see lib/billing/plans.ts's PLANS.automate
--     doc comment for why this row exists even though no subscription
--     can be sold at that plan yet: enforce_property_limit() fails
--     closed to 1 if a plan_limits row is ever missing, so this avoids
--     that surprise if 'automate' is ever assigned internally before a
--     real Stripe product exists for it).
--
-- CRITICAL — Legacy Subscribers: this migration does NOT touch the
-- existing 'free'/'investor'/'portfolio'/'portfolio_pro'/'owner' rows in
-- plan_limits, does NOT change their max_properties values, does NOT
-- rename any plan id, and does NOT alter a single existing
-- user_subscriptions row. Every existing subscriber keeps their exact
-- current plan id, Stripe price, property limit, and billing state.
-- lib/billing/stripe.ts's planForPriceId() independently keeps
-- recognizing their existing Stripe Price ids (a pure code change, nothing
-- to run here) — this file only ever ADDS new allowed values, it never
-- removes or rewrites one.
--
-- Idempotent: safe to run multiple times, safe on a database that
-- already has these constraint values/rows.

alter table public.plan_limits drop constraint if exists plan_limits_plan_check;
alter table public.plan_limits add constraint plan_limits_plan_check
  check (plan in ('free', 'organize', 'manage', 'automate', 'investor', 'portfolio', 'portfolio_pro', 'owner'));

alter table public.user_subscriptions drop constraint if exists user_subscriptions_plan_check;
alter table public.user_subscriptions add constraint user_subscriptions_plan_check
  check (plan in ('free', 'organize', 'manage', 'automate', 'investor', 'portfolio', 'portfolio_pro', 'owner'));

insert into public.plan_limits (plan, max_properties) values
  ('organize', 5),
  ('manage', 15),
  ('automate', 50)
on conflict (plan) do update set max_properties = excluded.max_properties;

-- Free/Investor/Portfolio/Portfolio Pro/Owner rows are intentionally left
-- untouched below this line — no insert, no update, no delete. Listed
-- here only so a reviewer can see at a glance that nothing legacy was
-- silently changed by this file:
--   free           -> 1   (unchanged, set by milestone-9-subscriptions.sql)
--   investor       -> 4   (unchanged, legacy)
--   portfolio      -> 9   (unchanged, legacy)
--   portfolio_pro  -> 20  (unchanged, legacy)
--   owner          -> 1000000000 (unchanged, internal)
