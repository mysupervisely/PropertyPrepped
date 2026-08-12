-- PropPrepped Milestone 6 upgrade
-- Run once if upgrading an existing project (Milestone 4 or 5).
-- Adds the Property Network: contacts and landlord-side maintenance requests.

-- Contacts: contractors, agents, lenders and other people tied to a property.
create table if not exists public.property_contacts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  business_name text,
  role text not null default 'Other',
  phone text,
  email text,
  website text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists property_contacts_property_idx on public.property_contacts(property_id);
create index if not exists property_contacts_owner_idx on public.property_contacts(owner_id);
alter table public.property_contacts enable row level security;
drop policy if exists "property_contacts_select_own" on public.property_contacts;
create policy "property_contacts_select_own" on public.property_contacts for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "property_contacts_insert_own" on public.property_contacts;
create policy "property_contacts_insert_own" on public.property_contacts for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "property_contacts_update_own" on public.property_contacts;
create policy "property_contacts_update_own" on public.property_contacts for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "property_contacts_delete_own" on public.property_contacts;
create policy "property_contacts_delete_own" on public.property_contacts for delete to authenticated using ((select auth.uid()) = owner_id);

-- Landlord Center: owner-side maintenance request tracking (foundation for future tenant accounts).
create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tenant_name text not null,
  tenant_email text,
  title text not null,
  description text not null default '',
  priority text not null default 'Normal' check (priority in ('Low', 'Normal', 'High', 'Urgent')),
  status text not null default 'Submitted' check (status in ('Submitted', 'Scheduled', 'In Progress', 'Completed')),
  created_at timestamptz not null default now()
);
create index if not exists maintenance_requests_property_idx on public.maintenance_requests(property_id, created_at desc);
create index if not exists maintenance_requests_owner_idx on public.maintenance_requests(owner_id);
create index if not exists maintenance_requests_status_idx on public.maintenance_requests(status);
alter table public.maintenance_requests enable row level security;
drop policy if exists "maintenance_requests_select_own" on public.maintenance_requests;
create policy "maintenance_requests_select_own" on public.maintenance_requests for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "maintenance_requests_insert_own" on public.maintenance_requests;
create policy "maintenance_requests_insert_own" on public.maintenance_requests for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "maintenance_requests_update_own" on public.maintenance_requests;
create policy "maintenance_requests_update_own" on public.maintenance_requests for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "maintenance_requests_delete_own" on public.maintenance_requests;
create policy "maintenance_requests_delete_own" on public.maintenance_requests for delete to authenticated using ((select auth.uid()) = owner_id);
