-- PropRoster Milestone 13: Property Financing Status Foundation
-- Run once if upgrading an existing project (after Milestone 12).
--
-- Core Experience Bundle, item 6 (approved): the Investment Analysis
-- calculator already supports an explicit, analysis-level
-- Mortgage/Paid-Off/Unknown choice, but the canonical property itself
-- had no way to remember that distinction — properties.mortgage_balance
-- is a plain not-null numeric(14,2) (0 could mean "genuinely paid off"
-- OR "never entered"), and mortgages is a separate zero-or-more-rows
-- table (no row is just as ambiguous). This adds the single nullable
-- column that fixes both.
--
-- Adds ONE new column, four allowed values:
--   - 'Active Mortgage'  — has an active loan
--   - 'Paid Off'         — previously financed, now paid in full
--   - 'No Mortgage'      — bought outright / cash purchase, never financed
--   - 'Unknown'          — not yet asked / not entered
--
-- NULL is the "not entered" state for every existing row and every new
-- property going forward — this migration NEVER infers 'Paid Off' or
-- 'No Mortgage' from the absence of a mortgages row or from
-- mortgage_balance = 0. That silent inference is exactly the bug this
-- column exists to prevent. The application layer treats NULL the same
-- as the explicit 'Unknown' value; both mean "not entered," never
-- "confirmed paid off."
--
-- Idempotent: safe to run multiple times, safe on a database that
-- already has this column — same "add column if not exists" +
-- "drop constraint if exists / add constraint" idiom already used
-- elsewhere in this schema for additive columns and for policies.

alter table public.properties add column if not exists financing_status text;

alter table public.properties drop constraint if exists properties_financing_status_check;
alter table public.properties add constraint properties_financing_status_check
  check (financing_status is null or financing_status in ('Active Mortgage', 'Paid Off', 'No Mortgage', 'Unknown'));

-- No RLS changes needed — financing_status is just another column on
-- properties, already covered by the existing owner-scoped
-- properties_select_own / properties_insert_own / properties_update_own /
-- properties_delete_own policies (supabase/schema.sql, Section 1).
