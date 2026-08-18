-- PropRoster Milestone 17: Tenant & Lease Management V2
-- Run once if upgrading an existing project (after Milestone 16).
--
-- Schema audit (done before writing this file, source of truth was the
-- actual public.leases table, not this prompt) found the leases table
-- already supports: a flat tenant_name/tenant_email per lease, monthly
-- rent, a not-null security_deposit, start/end dates, a free-text
-- renewal_status, an optional linked lease document, notes, and — since
-- property_id carries NO unique constraint — already-unlimited lease
-- rows per property, i.e. lease history is already fully supported at
-- the schema/RLS level with zero migration needed for that capability.
--
-- Two small, additive, nullable columns were genuinely missing and are
-- added here:
--   tenant_phone   — a second contact channel alongside the existing
--                    tenant_email; purely informational, same shape as
--                    every other contact phone field in this schema.
--   rent_due_day   — a plain calendar day (1-31) the rent is due, e.g.
--                    "due the 1st." NOT a rent ledger, NOT a payment
--                    schedule, NOT tied to any specific month's actual
--                    length — recorded verbatim, never computed.
--
-- Deliberately NOT added in this pass: a lease_tenants join table for
-- true multiple-named-tenants-per-lease. The existing tenant_name/
-- tenant_email/tenant_phone columns are flat (one tenant identity per
-- lease row) and migrating every existing lease row into a relational
-- multi-tenant shape is a materially bigger, riskier change than this
-- milestone's smallest-safe-change mandate allows. See the Milestone 17
-- completion report for the deferred design.
--
-- Idempotent: safe to run multiple times, safe on a database that
-- already has these columns — same "add column if not exists" +
-- "drop constraint if exists / add constraint" idiom already used
-- elsewhere in this schema (e.g. milestone-13-financing-status.sql).
--
-- No RLS changes: tenant_phone and rent_due_day are plain non-FK columns
-- on leases, already fully covered by the existing owner-scoped
-- leases_select_own / leases_insert_own / leases_update_own /
-- leases_delete_own policies (supabase/schema.sql), none of which
-- reference specific column names.

alter table public.leases add column if not exists tenant_phone text;
alter table public.leases add column if not exists rent_due_day smallint;

alter table public.leases drop constraint if exists leases_rent_due_day_range;
alter table public.leases add constraint leases_rent_due_day_range
  check (rent_due_day is null or (rent_due_day >= 1 and rent_due_day <= 31));
