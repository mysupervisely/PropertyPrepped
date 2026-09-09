-- PropRoster — Tenant Connect: Scheduling Coordination V1.
--
-- NOT YET APPLIED TO PRODUCTION. Review before running.
--
-- Inspected only what this milestone's own brief named: guided intake
-- (maintenance_intake_sessions/answers), tenant_requests, the canonical
-- maintenance_requests case (milestone-26), and the live Provider
-- Outreach V1 table/RLS shape (milestone-27). No broader audit.
--
-- Three additive pieces, all new — nothing here alters an existing
-- table's data, and no existing RLS policy on any other table is
-- touched:
--
--   1. tenant_requests.entry_preference — a single nullable column.
--      Entry preference is one fact per request (not a list), so it
--      lives directly on tenant_requests exactly like category/title
--      already do, rather than a second one-row-per-request table.
--      PRODUCT PRINCIPLE: this column records what the TENANT said
--      about their own presence/contact preference — it is NEVER
--      permission to enter, and no code anywhere may treat it as such
--      (see lib/maintenance/availability.ts's own header).
--
--   2. maintenance_availability_windows — one row per tenant-selected
--      day+block (Morning/Afternoon/Evening), scoped to a single
--      tenant_requests row as this feature is explicitly request-
--      specific, not a standing tenant calendar (Section 2: "do not
--      create a permanent tenant calendar"). Joined to the canonical
--      maintenance_requests case the SAME way category already is
--      (tenant_requests.maintenance_request_id) — no new FK to
--      maintenance_requests is needed or added. Shaped identically to
--      the existing maintenance_intake_answers precedent: tenant-
--      insert-only (append-only, no update/delete), owner+active-tenant
--      select, request_id verified against the caller's own active
--      tenant_access_id so a forged request_id from another tenant's
--      request can never be inserted under.
--
--   3. maintenance_appointments — the provider-proposes/landlord-
--      confirms scheduling record. Deliberately separate from BOTH
--      maintenance_requests.status and maintenance_provider_outreach's
--      own status column (Section 8's explicit "must remain separate"
--      instruction) — a provider proposing or a landlord confirming a
--      time never writes to either of those columns directly; only the
--      existing, pre-approved landlord confirm action (server route)
--      may additionally move maintenance_requests.status to the
--      pre-existing 'Scheduled' value, exactly as milestone-26 already
--      allows any landlord action to do. Access model mirrors
--      milestone-27's maintenance_provider_outreach precedent exactly:
--      no client insert/update policy at all (a provider has no
--      session to scope RLS to, and confirmation needs the same
--      landlord-RLS-re-fetch-as-authorization pattern the existing send
--      route already uses) — only a landlord-owner SELECT policy.
--      A new proposal is always a NEW row, never an edit to a prior one
--      (Section 9: "do not overwrite scheduling history") — see
--      lib/maintenance/appointments.ts's latestAppointmentForOutreach()
--      for how callers cheaply show only the current one regardless.

-- ===================================================================
-- 1. Entry preference — a single additive column on tenant_requests.
-- ===================================================================
alter table public.tenant_requests add column if not exists entry_preference text
  check (entry_preference in ('someone_home', 'contact_before_entering', 'other'));

-- ===================================================================
-- 2. Tenant availability windows.
-- ===================================================================
create table if not exists public.maintenance_availability_windows (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.tenant_requests(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tenant_access_id uuid not null references public.tenant_property_access(id) on delete restrict,
  window_date date not null,
  window_label text not null check (window_label in ('morning', 'afternoon', 'evening')),
  created_at timestamptz not null default now(),
  unique (request_id, window_date, window_label)
);
create index if not exists maintenance_availability_windows_request_idx on public.maintenance_availability_windows(request_id);
create index if not exists maintenance_availability_windows_owner_idx on public.maintenance_availability_windows(owner_id);

alter table public.maintenance_availability_windows enable row level security;

drop policy if exists "maintenance_availability_windows_select" on public.maintenance_availability_windows;
create policy "maintenance_availability_windows_select" on public.maintenance_availability_windows for select to authenticated using (
  (select auth.uid()) = owner_id
  or exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
  )
);

-- INSERT-only (append-only — an availability selection, once given, is
-- a historical fact about what the tenant offered; no update/delete
-- policy, same shape as maintenance_intake_answers). request_id must
-- belong to a tenant_requests row the caller's own active
-- tenant_access_id actually owns — never a forged/different tenant's
-- request.
drop policy if exists "maintenance_availability_windows_insert_tenant" on public.maintenance_availability_windows;
create policy "maintenance_availability_windows_insert_tenant" on public.maintenance_availability_windows for insert to authenticated with check (
  owner_id = (select tr.owner_id from public.tenant_requests tr where tr.id = request_id)
  and tenant_access_id = (select tr.tenant_access_id from public.tenant_requests tr where tr.id = request_id)
  and exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
  )
);

-- ===================================================================
-- 3. Provider-proposed / landlord-confirmed appointments.
-- ===================================================================
create table if not exists public.maintenance_appointments (
  id uuid primary key default gen_random_uuid(),
  maintenance_request_id uuid not null references public.maintenance_requests(id) on delete cascade,
  outreach_id uuid not null references public.maintenance_provider_outreach(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  proposed_start_at timestamptz not null,
  proposed_by text not null default 'provider' check (proposed_by in ('provider', 'landlord')),
  -- Deterministic only (Section 6: "do not use AI to determine whether
  -- times overlap") — computed once, server-side, at proposal time by
  -- lib/maintenance/availability.ts's matchProposedTime(), and stored
  -- rather than re-derived on every read so a later change to the
  -- tenant's availability can never silently reclassify a past
  -- proposal.
  matched_availability boolean not null default false,
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'declined', 'cancelled')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists maintenance_appointments_request_idx on public.maintenance_appointments(maintenance_request_id, created_at desc);
create index if not exists maintenance_appointments_outreach_idx on public.maintenance_appointments(outreach_id, created_at desc);
create index if not exists maintenance_appointments_owner_idx on public.maintenance_appointments(owner_id);

alter table public.maintenance_appointments enable row level security;

-- The only client-facing policy — landlord reads their own appointment
-- rows directly, same as maintenance_provider_outreach_select_own. No
-- insert/update/delete policy for any role: a provider proposal comes
-- through app/api/provider-outreach/propose-appointment (token-
-- validated, admin client — the provider has no session to scope RLS
-- to); a landlord confirm/decline comes through
-- app/api/maintenance/appointments/confirm (RLS-scoped re-fetch of the
-- linked maintenance_requests row as the authorization check, then the
-- admin client writes) — exactly milestone-27's own precedent, not a
-- new pattern.
drop policy if exists "maintenance_appointments_select_own" on public.maintenance_appointments;
create policy "maintenance_appointments_select_own" on public.maintenance_appointments
  for select to authenticated using ((select auth.uid()) = owner_id);

create or replace function public.maintenance_appointments_set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists maintenance_appointments_updated_at on public.maintenance_appointments;
create trigger maintenance_appointments_updated_at
  before update on public.maintenance_appointments
  for each row execute function public.maintenance_appointments_set_updated_at();
