-- PropRoster — Tenant-Facing Experience V1.
--
-- NOT YET APPLIED TO PRODUCTION. Review before running. Migration 28
-- (Scheduling Coordination V1) is already applied in production; this
-- file is fully independent of it — no shared tables/columns.
--
-- Inspected first: app/tenant/page.tsx (the tenant portal already
-- built in Tenant Connect V1 — M10/M24), supabase/schema.sql's
-- tenant_property_view / tenant_lease_view / is_active_tenant_of_*()
-- (the existing narrow-view pattern for tenant-safe reads), and
-- tenant_property_access / accept_tenant_invite()'s own RLS +
-- email-match security model. This migration extends that EXACT
-- pattern for two more tenant-facing surfaces (Rent history, shared
-- Documents) rather than inventing a new one. No RLS is weakened on
-- any base table, and no existing policy is touched.
--
-- ===================================================================
-- 1. Rent history — reuses the is_active_tenant_of_lease() security-
--    definer helper the existing tenant_lease_view already relies on.
--    Exposes only the columns a tenant should ever see about their own
--    payment history — never reference_number/notes (landlord-facing
--    detail), never financial_transaction_id or any other property's
--    rent_payments row.
-- ===================================================================
drop view if exists public.tenant_rent_payments_view;
create view public.tenant_rent_payments_view as
select
  rp.id,
  rp.lease_id,
  rp.rent_period,
  rp.date_received,
  rp.amount,
  rp.payment_method
from public.rent_payments rp
where public.is_active_tenant_of_lease(rp.lease_id);

grant select on public.tenant_rent_payments_view to authenticated;

-- ===================================================================
-- 2. Shared documents — "ONLY documents explicitly appropriate/shared
--    for the tenant" (this milestone's own instruction). A single
--    additive, default-false column the landlord opts a document INTO
--    — never opt-out, never a blanket "all documents visible" mode.
--    The existing owner-only documents_update_own policy already lets
--    the landlord toggle this column; no new base-table policy is
--    needed for the write side.
-- ===================================================================
alter table public.property_documents add column if not exists tenant_visible boolean not null default false;

drop view if exists public.tenant_documents_view;
create view public.tenant_documents_view as
select
  pd.id,
  pd.property_id,
  pd.name,
  pd.category,
  pd.storage_path,
  pd.created_at
from public.property_documents pd
where pd.tenant_visible = true
  and public.is_active_tenant_of_property(pd.property_id);

grant select on public.tenant_documents_view to authenticated;

-- Deliberately NO storage.objects policy change: the existing
-- property_documents_select_own storage policy stays owner-only (see
-- schema.sql). A tenant reading a shared document's actual file goes
-- through app/api/tenant-connect/document-url (RLS re-fetch via
-- tenant_documents_view as the authorization check, then the admin
-- client signs the URL) — the same "RLS re-fetch, then admin client
-- for what RLS-scoped storage can't do" pattern Provider Outreach V1
-- and Scheduling Coordination V1 already established, not a new one.
