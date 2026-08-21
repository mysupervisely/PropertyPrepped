-- PropRoster Milestone 21: Realtor Connect V1.
--
-- Lead-capture workflow for calculator visitors who want help from a
-- real estate professional. ALL leads route to the PropRoster owner
-- first — this migration builds storage + access control only, never
-- automatic routing, referral-fee accounting, or agent matching.
--
-- Security model (Section 9 of the spec):
--   - NO insert policy is granted to anon or authenticated at all. A
--     lead can only be created by the server-side admin (service-role)
--     client in app/api/realtor-leads/route.ts — the ONLY other
--     consumer of that client in this codebase is the Stripe webhook,
--     for the identical reason (a write that must succeed regardless of
--     whether a session exists). This is what makes "public users may
--     INSERT a lead only through the intended server-side path" true at
--     the database level, not just by convention.
--   - NO select policy is granted to anon or a normal authenticated
--     user. Only the internal 'owner' plan (the exact same
--     `user_subscriptions.plan = 'owner'` check already used by
--     app/api/document-intelligence/analyze/route.ts's diagnostics gate,
--     app/account/billing/page.tsx, and app/pricing/page.tsx — a plan a
--     client can never self-assign, see milestone-9-subscriptions.sql)
--     may select/update rows, via a subquery against user_subscriptions.
--     This lets the admin Lead Center (app/admin/realtor-leads/page.tsx)
--     read/update leads through the caller's own normal RLS-scoped
--     client — no service-role key needed in that page at all.
--
-- Idempotent: safe to run multiple times, safe on a database that
-- already has this table/these policies. Additive only.

create table if not exists public.realtor_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Signed-in submitter, if any (Section 4: never required). ON DELETE
  -- SET NULL — a lead is a business record the owner may still need
  -- after the submitter's account is gone; it must never cascade-delete.
  owner_user_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('rental_analyzer', 'home_purchase')),
  property_address text,
  city text,
  state text,
  zip text,
  geography_bucket text not null default 'Unknown' check (geography_bucket in ('Tampa Bay Area', 'Outside Tampa Bay Area', 'Unknown')),
  name text not null,
  email text,
  phone text,
  preferred_contact_method text not null check (preferred_contact_method in ('Call', 'Text', 'Email')),
  message text,
  -- Explicit consent timestamp, not a boolean — set server-side only when
  -- the checkbox was actually true at submission (see
  -- lib/realtor-leads/handle-lead-submission.ts). Never defaulted.
  consent_at timestamptz not null,
  analysis_snapshot jsonb,
  status text not null default 'New' check (status in ('New', 'Contacted', 'Referred', 'Closed', 'Archived')),
  -- Manual referral fields only (Section 12/16) — the PropRoster owner
  -- fills these in by hand after deciding to refer a lead. No automatic
  -- routing, no commission/fee accounting of any kind.
  referred_to_name text,
  referred_to_email text,
  referred_to_state text,
  notes text,
  constraint realtor_leads_contact_required check (email is not null or phone is not null)
);

alter table public.realtor_leads add column if not exists updated_at timestamptz not null default now();

create index if not exists realtor_leads_status_created_idx on public.realtor_leads(status, created_at desc);
create index if not exists realtor_leads_owner_user_idx on public.realtor_leads(owner_user_id);

alter table public.realtor_leads enable row level security;

-- Deliberately NO insert/select policy for anon or authenticated here —
-- see this file's top comment. RLS with zero matching policies denies
-- by default, which is exactly the intended "not a public lead table."

drop policy if exists "realtor_leads_admin_select" on public.realtor_leads;
create policy "realtor_leads_admin_select" on public.realtor_leads for select to authenticated using (
  exists (
    select 1 from public.user_subscriptions us
    where us.owner_id = (select auth.uid())
      and us.plan = 'owner'
      and us.status in ('active', 'trialing', 'past_due')
  )
);

drop policy if exists "realtor_leads_admin_update" on public.realtor_leads;
create policy "realtor_leads_admin_update" on public.realtor_leads for update to authenticated
using (
  exists (
    select 1 from public.user_subscriptions us
    where us.owner_id = (select auth.uid())
      and us.plan = 'owner'
      and us.status in ('active', 'trialing', 'past_due')
  )
)
with check (
  exists (
    select 1 from public.user_subscriptions us
    where us.owner_id = (select auth.uid())
      and us.plan = 'owner'
      and us.status in ('active', 'trialing', 'past_due')
  )
);

create or replace function public.realtor_leads_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists realtor_leads_touch_updated_at on public.realtor_leads;
create trigger realtor_leads_touch_updated_at
  before update on public.realtor_leads
  for each row execute function public.realtor_leads_set_updated_at();

-- Not added to Global Search (Section 13) — no change to
-- lib/search/build-results.ts or any search-indexing code; this table is
-- simply never queried from there.
