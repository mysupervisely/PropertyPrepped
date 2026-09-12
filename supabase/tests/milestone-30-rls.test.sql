-- PropRoster — Property Overview + Pricing Polish V1, Stage 1 — RLS
-- regression test for public.owner_has_tenant_connect(uuid).
--
-- Same methodology as milestone-9/10/25/26-rls.test.sql: NOT run by
-- `npm test` (no Postgres in the Node/vitest pipeline) — run by hand (or
-- from CI with a scratch Postgres) against a database with PropRoster's
-- full schema.sql plus supabase/milestone-30-property-overview-pricing-
-- polish-v1-stage1.sql loaded, and the Supabase auth schema stubbed (see
-- milestone-9-rls.test.sql's own note). Every block RAISEs "REGRESSION"
-- or NOTICEs "PASS"; a clean run has zero "REGRESSION" matches.
-- Everything happens inside a transaction rolled back at the end.
--
-- Directly exercises the function rather than a full Tenant Connect
-- fixture (invite/conversation/message) — every Tenant Connect RLS
-- policy already delegates to this one function (see schema.sql's own
-- Section E), so proving the function returns the right boolean for
-- every plan/row-state below is sufficient; milestone-24/25/26-rls.test.sql
-- already cover the policies themselves end to end for the plans they
-- were written against.
--
-- Covers BOTH findings this migration fixes:
--   Finding #1 — 'free'/'organize' were missing from the plan list at all.
--   Finding #2 — a row-less owner (no user_subscriptions row) must also
--   resolve to 'free' (and therefore true now), not fall through to a
--   bare `exists()` false with no fallback — the previous version's
--   latent bug that Stage 1 makes newly visible.

begin;

insert into auth.users (id) values
  ('30111111-1111-1111-1111-111111111111'), -- free, real row
  ('30222222-2222-2222-2222-222222222222'), -- organize, real row
  ('30333333-3333-3333-3333-333333333333'), -- manage, real row (regression guard — Section E's own fix)
  ('30444444-4444-4444-4444-444444444444'), -- investor, active (must stay false)
  ('30555555-5555-5555-5555-555555555555'), -- NO user_subscriptions row at all (Finding #2)
  ('30666666-6666-6666-6666-666666666666'); -- manage, but canceled status (falls back to free -> now true)

insert into public.user_subscriptions (owner_id, plan, status) values
  ('30111111-1111-1111-1111-111111111111', 'free', 'active'),
  ('30222222-2222-2222-2222-222222222222', 'organize', 'active'),
  ('30333333-3333-3333-3333-333333333333', 'manage', 'active'),
  ('30444444-4444-4444-4444-444444444444', 'investor', 'active'),
  ('30666666-6666-6666-6666-666666666666', 'manage', 'canceled');
  -- 30555555 deliberately has NO row.

do $$
begin
  if public.owner_has_tenant_connect('30111111-1111-1111-1111-111111111111') then
    raise notice 'PASS: Free (real row) has Tenant Connect';
  else
    raise exception 'REGRESSION: Free (real row) denied Tenant Connect';
  end if;
end $$;

do $$
begin
  if public.owner_has_tenant_connect('30222222-2222-2222-2222-222222222222') then
    raise notice 'PASS: Organize has Tenant Connect';
  else
    raise exception 'REGRESSION: Organize denied Tenant Connect';
  end if;
end $$;

do $$
begin
  if public.owner_has_tenant_connect('30333333-3333-3333-3333-333333333333') then
    raise notice 'PASS: Manage still has Tenant Connect (Section E regression guard)';
  else
    raise exception 'REGRESSION: Manage denied Tenant Connect';
  end if;
end $$;

do $$
begin
  if public.owner_has_tenant_connect('30444444-4444-4444-4444-444444444444') then
    raise exception 'REGRESSION: legacy Investor was granted Tenant Connect — TENANT_CONNECT_ENABLED.investor is deliberately false';
  else
    raise notice 'PASS: legacy Investor still denied Tenant Connect';
  end if;
end $$;

-- Finding #2 — the case the previous exists()-only function got wrong
-- as soon as 'free' needed to be true: no user_subscriptions row at all
-- (a real, common state for a brand-new signup) must resolve exactly
-- like resolveEffectivePlan() resolves it client-side — 'free' — and
-- therefore now true.
do $$
begin
  if public.owner_has_tenant_connect('30555555-5555-5555-5555-555555555555') then
    raise notice 'PASS: an owner with no subscription row at all resolves to Free and has Tenant Connect';
  else
    raise exception 'REGRESSION: an owner with no subscription row at all was denied Tenant Connect (the exists()-only bug Finding #2 documents)';
  end if;
end $$;

-- A stored plan of 'manage' with a non-entitled status falls back to
-- 'free' (same as resolveEffectivePlan()'s ENTITLED_STATUSES check) —
-- and since 'free' is now true, this must also be true (a DIFFERENT
-- outcome than it would have been before Stage 1, when it was correctly
-- false because free was false).
do $$
begin
  if public.owner_has_tenant_connect('30666666-6666-6666-6666-666666666666') then
    raise notice 'PASS: a canceled Manage subscriber falls back to Free and (now) still has Tenant Connect';
  else
    raise exception 'REGRESSION: a canceled Manage subscriber was denied Tenant Connect (should fall back to Free, which is now entitled)';
  end if;
end $$;

rollback;
