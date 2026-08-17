-- PropRoster Milestone 11: Property Profile 2.0 Foundation
-- Run once if upgrading an existing project (after Milestone 10).
--
-- Adds: a real user profile table (Section 1/2), additional Overview
-- fields on properties (Section 5), Ownership/Entity recordkeeping
-- (Section 6), Property Systems & Appliances (Section 7), Notes 2.0
-- (Section 8), and the PropCrew extension of the existing
-- property_contacts table (Sections 10-13) — reusing that table rather
-- than duplicating it, since a PropCrew provider IS a property contact,
-- just no longer scoped to a single property.
--
-- Property Timeline (Section 9) intentionally adds NO new table — it is
-- fully derived, client-side, from the tables that already exist (leases,
-- mortgages, insurance_policies, maintenance_records, financial_transactions,
-- property_systems). See lib/property-timeline/derive-timeline.ts for the
-- derivation logic and its doc comment for the full architecture rationale.
--
-- Every new table follows the exact owner_id + RLS pattern already used by
-- every other table in this schema (see schema.sql) — "select to
-- authenticated using ((select auth.uid()) = owner_id)" and the matching
-- insert/update/delete policies, with write policies additionally checking
-- the referenced property_id belongs to the same owner where applicable.

-- ============================================================
-- Section 1/2: User Profile
-- ============================================================
-- 1:1 with auth.users, per Part 1 ("Use a proper user profile data model
-- linked 1:1 to auth.users. Do not rely exclusively on mutable auth
-- metadata"). id IS the primary key AND the FK to auth.users, enforcing
-- the 1:1 relationship structurally, not just by convention.
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  display_name text,
  phone text,
  timezone text,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_profiles enable row level security;
drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own" on public.user_profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own" on public.user_profiles for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own" on public.user_profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- Deliberately no delete policy — a profile row is cleaned up automatically
-- by the `on delete cascade` FK to auth.users when the account itself is
-- deleted; a signed-in user has no reason to delete just the profile row.

-- Auto-creates a blank profile row the moment a new auth user is created,
-- so the app never has to special-case "no profile row yet" beyond the
-- greeting fallback chain itself (Part 1's display/preferred name -> first
-- name -> email prefix -> "there"). Idempotent trigger — safe to re-run
-- this file against a project that already has it.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_user_profile();

-- Backfill: existing accounts created before this migration get a blank
-- profile row too, so the greeting fallback chain has a row to read from
-- (still all-null -> still falls back to email prefix, nothing changes
-- visibly until the user actually fills in their profile).
insert into public.user_profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- ============================================================
-- Section 5: additional Property Overview fields
-- ============================================================
-- All nullable, all additive — existing rows are unaffected (every
-- existing property simply reads as "not set yet" for these until the
-- owner fills them in; Part 5: "Never fabricate... omit gracefully or
-- provide a clear Add/Edit action").
alter table public.properties add column if not exists beds integer;
alter table public.properties add column if not exists baths numeric(4,1);
alter table public.properties add column if not exists square_feet integer;
alter table public.properties add column if not exists year_built integer;
alter table public.properties add column if not exists lot_size_sqft integer;
alter table public.properties add column if not exists purchase_date date;
alter table public.properties add column if not exists property_tax_annual numeric(14,2);
alter table public.properties add column if not exists hoa_monthly numeric(14,2);

-- ============================================================
-- Section 6: Ownership / Entity recordkeeping
-- ============================================================
-- Multiple rows per property are allowed on purpose (a partnership with
-- two owners each holding a percentage) — recordkeeping only, never legal
-- advice (Part 6).
create table if not exists public.property_ownership (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_name text not null,
  ownership_type text not null default 'Individual' check (ownership_type in ('Individual', 'LLC', 'Trust', 'Partnership', 'Other')),
  ownership_percentage numeric(5,2),
  acquisition_date date,
  purchase_price numeric(14,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists property_ownership_property_idx on public.property_ownership(property_id);
create index if not exists property_ownership_owner_idx on public.property_ownership(owner_id);
alter table public.property_ownership enable row level security;
drop policy if exists "property_ownership_select_own" on public.property_ownership;
create policy "property_ownership_select_own" on public.property_ownership for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "property_ownership_insert_own" on public.property_ownership;
create policy "property_ownership_insert_own" on public.property_ownership for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "property_ownership_update_own" on public.property_ownership;
create policy "property_ownership_update_own" on public.property_ownership for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "property_ownership_delete_own" on public.property_ownership;
create policy "property_ownership_delete_own" on public.property_ownership for delete to authenticated using ((select auth.uid()) = owner_id);

-- ============================================================
-- Section 7: Property Systems & Appliances
-- ============================================================
create table if not exists public.property_systems (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  system_type text not null check (system_type in (
    'Roof', 'HVAC', 'Water Heater', 'Electrical', 'Plumbing', 'Refrigerator',
    'Range/Oven', 'Dishwasher', 'Washer', 'Dryer', 'Pool Equipment', 'Solar', 'Other'
  )),
  name text,
  manufacturer text,
  model text,
  serial_number text,
  install_date date,
  last_service_date date,
  warranty_expiration date,
  cost numeric(14,2),
  -- The PropCrew provider (property_contacts row) who installed/services
  -- this system, if any — see Section 10-13's PropCrew notes below for why
  -- property_contacts is PropCrew, not a separate table.
  propcrew_contact_id uuid references public.property_contacts(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists property_systems_property_idx on public.property_systems(property_id);
create index if not exists property_systems_owner_idx on public.property_systems(owner_id);
alter table public.property_systems enable row level security;
drop policy if exists "property_systems_select_own" on public.property_systems;
create policy "property_systems_select_own" on public.property_systems for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "property_systems_insert_own" on public.property_systems;
create policy "property_systems_insert_own" on public.property_systems for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "property_systems_update_own" on public.property_systems;
create policy "property_systems_update_own" on public.property_systems for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "property_systems_delete_own" on public.property_systems;
create policy "property_systems_delete_own" on public.property_systems for delete to authenticated using ((select auth.uid()) = owner_id);

-- Linked documents (plural, per Part 7) — a system can reference more than
-- one document (e.g. an install invoice AND a warranty PDF), so this is a
-- join table rather than a single document_id column like the simpler
-- module tables (leases/mortgages/etc.) use.
create table if not exists public.property_system_documents (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.property_systems(id) on delete cascade,
  document_id uuid not null references public.property_documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (system_id, document_id)
);
create index if not exists property_system_documents_system_idx on public.property_system_documents(system_id);
alter table public.property_system_documents enable row level security;
drop policy if exists "property_system_documents_select_own" on public.property_system_documents;
create policy "property_system_documents_select_own" on public.property_system_documents for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "property_system_documents_insert_own" on public.property_system_documents;
create policy "property_system_documents_insert_own" on public.property_system_documents for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.property_systems s where s.id = system_id and s.owner_id = (select auth.uid()))
  and exists (select 1 from public.property_documents d where d.id = document_id and d.owner_id = (select auth.uid()))
);
drop policy if exists "property_system_documents_delete_own" on public.property_system_documents;
create policy "property_system_documents_delete_own" on public.property_system_documents for delete to authenticated using ((select auth.uid()) = owner_id);

-- "Linked maintenance records" (Part 7) reuses the EXISTING
-- maintenance_records table rather than a new concept — just a nullable
-- pointer back to the system it serviced. This is also the Property
-- Timeline's "system installed/replaced" and "maintenance event" source
-- for a given system (Part 9: "avoid a second source of truth").
alter table public.maintenance_records add column if not exists system_id uuid references public.property_systems(id) on delete set null;
create index if not exists maintenance_records_system_idx on public.maintenance_records(system_id);

-- A real FK from maintenance history to the PropCrew provider who did the
-- work — deliberately NOT inferred by fuzzy-matching maintenance_records'
-- free-text `vendor` field against contact names (Part 12: "Only
-- calculate from real linked records. Never invent spend totals."). This
-- is what makes PropCrew "service history"/"documented spend" (Part 12)
-- a real, linked calculation instead of a guess.
alter table public.maintenance_records add column if not exists propcrew_contact_id uuid references public.property_contacts(id) on delete set null;
create index if not exists maintenance_records_propcrew_contact_idx on public.maintenance_records(propcrew_contact_id);

-- ============================================================
-- Section 8: Property Notes 2.0
-- ============================================================
-- related_table/related_id are reserved for future record-specific notes
-- (Part 8: "Architect for future record-specific notes, but do not
-- overengineer V1") — always null in V1, where every note is a
-- property-level note; nothing in this milestone reads or writes them yet.
create table if not exists public.property_notes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  is_pinned boolean not null default false,
  related_table text,
  related_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists property_notes_property_idx on public.property_notes(property_id, is_pinned desc, created_at desc);
alter table public.property_notes enable row level security;
drop policy if exists "property_notes_select_own" on public.property_notes;
create policy "property_notes_select_own" on public.property_notes for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "property_notes_insert_own" on public.property_notes;
create policy "property_notes_insert_own" on public.property_notes for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "property_notes_update_own" on public.property_notes;
create policy "property_notes_update_own" on public.property_notes for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "property_notes_delete_own" on public.property_notes;
create policy "property_notes_delete_own" on public.property_notes for delete to authenticated using ((select auth.uid()) = owner_id);

-- ============================================================
-- Sections 10-13: PropCrew
-- ============================================================
-- PropCrew is property_contacts, evolved rather than duplicated (Phase 0:
-- "Avoid duplicate systems" — property_contacts already has exactly
-- PropCrew's shape: name/business_name/role(category)/phone/email/
-- website/notes). Two additive changes make it PropCrew:
--
-- 1. would_use_again + experience_note: the private reuse-preference
--    fields (Part 11). NEVER "review"/"rating"/"feedback" — see the UI
--    copy requirements in components/PropCrewPanel.tsx. Selecting NO must
--    never delete/hide the historical record (enforced by the app layer
--    simply never offering a delete-on-NO action; nothing at the schema
--    level ties would_use_again to row visibility).
alter table public.property_contacts add column if not exists would_use_again text check (would_use_again in ('YES', 'POSSIBLY', 'NO'));
alter table public.property_contacts add column if not exists experience_note text;

-- 2. property_contact_links: a provider can serve MULTIPLE properties
--    (Part 10: "One PropCrew provider may be associated with multiple
--    properties"), but property_contacts.property_id is a single FK — kept
--    exactly as-is for backward compatibility (every existing contact's
--    original property association still works unchanged). This join
--    table adds the ADDITIONAL associations on top; a contact's full
--    "associated properties" list is its own property_id UNIONed with
--    every row here.
create table if not exists public.property_contact_links (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.property_contacts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (contact_id, property_id)
);
create index if not exists property_contact_links_contact_idx on public.property_contact_links(contact_id);
create index if not exists property_contact_links_property_idx on public.property_contact_links(property_id);
alter table public.property_contact_links enable row level security;
drop policy if exists "property_contact_links_select_own" on public.property_contact_links;
create policy "property_contact_links_select_own" on public.property_contact_links for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "property_contact_links_insert_own" on public.property_contact_links;
create policy "property_contact_links_insert_own" on public.property_contact_links for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.property_contacts c where c.id = contact_id and c.owner_id = (select auth.uid()))
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "property_contact_links_delete_own" on public.property_contact_links;
create policy "property_contact_links_delete_own" on public.property_contact_links for delete to authenticated using ((select auth.uid()) = owner_id);

-- Backfill: every existing contact's current property_id becomes its
-- first "associated property" link too, so PropCrew's multi-property view
-- and the per-property People tab agree from day one.
insert into public.property_contact_links (contact_id, property_id, owner_id)
select id, property_id, owner_id from public.property_contacts
on conflict (contact_id, property_id) do nothing;

-- ============================================================
-- Section 15 prep: Tenant Connect + PropCrew future integration boundary
-- ============================================================
-- A single nullable pointer so a maintenance request can (later) record
-- which PropCrew provider was assigned to it — no automation/matching is
-- built in this milestone, this only keeps the future flow (Part 15:
-- "owner approves -> relevant PropCrew options shown -> owner selects
-- approved provider(s)") from requiring a schema change when it's built.
alter table public.maintenance_requests add column if not exists assigned_contact_id uuid references public.property_contacts(id) on delete set null;
