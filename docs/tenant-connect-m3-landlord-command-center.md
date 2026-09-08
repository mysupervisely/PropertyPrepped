# Tenant Connect + Maintenance Coordination — M3: Landlord Maintenance Command Center V1

Builds directly on the already-merged foundation: M1/M1.1 (canonical
`maintenance_requests` case + `tenant_requests` intake, `supabase/
milestone-25-maintenance-coordination-foundation.sql` and `milestone-26-
canonical-maintenance-case.sql`) and M2 (Guided Intake, deterministic
urgent triggers, `lib/maintenance/intake/*`). This milestone adds **zero**
new tables and **zero** schema changes — it is a read/enrichment/action
layer on top of what already exists, per its own explicit instruction to
avoid schema changes when the existing model is sufficient.

## What M3 is

A landlord-facing place — portfolio-wide and property-level — to review
tenant- and landlord-reported maintenance cases, see urgency at a glance,
assign a PropCrew contact, and move a case through its existing status
lifecycle. Not provider outreach, not scheduling, not SMS, not payments —
see "Explicit scope control" below.

## Architecture decision: enrichment, not a new data model

`public.maintenance_requests` remains the single canonical case (M1.1's
own decision, unchanged). This milestone enriches a case, entirely at
READ time, with two facts that live in already-existing related tables:

1. **category** — from the linked `tenant_requests` row
   (`tenant_requests.maintenance_request_id = maintenance_requests.id`).
2. **urgent** — from the linked `maintenance_intake_sessions.outcome`
   (`'escalated_urgent'`), OR the case's own pre-existing
   `priority = 'Urgent'`. **Never AI-derived, never a heuristic** — the
   only signal ever read is the outcome Guided Intake's own deterministic
   safety logic already decided (`lib/maintenance/intake/urgent.ts`,
   unmodified by this milestone). This UI cannot override or re-classify
   a safety determination.

A tenant-sourced case's "structured guided-intake answers" did **not**
need a third data source: `GuidedIntake.tsx` already builds the full
structured summary via `buildSummary()` (`lib/maintenance/intake/
engine.ts`) **before** submission, and that exact text is what becomes
`tenant_requests.description` — which the M1.1 trigger already copies
verbatim onto the linked `maintenance_requests.description`. A case's own
`description` field already **is** the tenant's structured report; this
milestone displays it in full in the new detail view rather than
re-fetching/re-rendering raw `maintenance_intake_answers` rows a second
time.

New shared module: `lib/maintenance/command-center.ts` — pure,
framework-free enrichment/sorting/summary functions
(`enrichMaintenanceCases`, `isUrgentCase`, `nextActionFor`,
`sortCasesForCommandCenter`, `casesForProperty`,
`relevantContactsForProperty`, `summarizeCommandCenter`), fully unit
tested (`lib/maintenance/command-center.test.ts`, 18 tests).

## The Command Center

**Portfolio-level:** new page, `app/maintenance/page.tsx`, reachable from
the main nav (`components/AuthNavMenu.tsx`, "Maintenance"). Own
independent Supabase fetch (same pattern as `/rent-ledger` and
`/tax-center` — not reusing `app/page.tsx`'s in-memory state). Summary
tiles (Needs attention / Urgent / Completed), an Active list sorted
urgent-first, and a collapsed-by-default History section (Completed
cases — never deleted, only reordered last).

**Property-level:** the existing Rent > Tenant tab list
(`app/page.tsx`) is enhanced, not replaced — every existing element
(status pill, tenant-source badge, category lookup, status `<select>`,
Remove button) is untouched byte-for-byte. Added: a deterministic
urgency badge, and a "Manage" button that opens the same shared detail
modal the portfolio view uses.

**Shared detail/actions modal:** `components/maintenance/
MaintenanceCaseDetail.tsx` — mounted from both places, so there is
exactly one detail/actions implementation. A "dumb" component (every
write goes through a caller-supplied callback; it never touches
Supabase itself). Shows: property, source, category, tenant name/email,
full description (the structured summary for tenant-sourced cases), a
non-dismissible urgent banner when applicable, PropCrew assignment
`<select>`, status `<select>`, and a "Mark Completed" fast-path button.

## PropCrew assignment

Uses the existing `maintenance_requests.assigned_contact_id` column
(Milestone 11 — already existed, unused, exactly for this). "Relevant"
contacts for a property = `property_contacts.property_id` match UNION
`property_contact_links` rows (the same multi-property association
model Milestone 11 already established — no new relevance rule
invented). Assign/change/remove are the exact same single write
(`update({ assigned_contact_id: contactId | null })`) — no
special-cased "change" vs "remove" path. **This milestone only records
the landlord's decision** — confirmed by a dedicated test
(`lib/maintenance/command-center-wiring.test.ts`) that the shared detail
component never references `property_messages`, an access/provider
token, or an appointment — and the UI itself says so explicitly
("Recorded as your decision only — has not been notified or
contacted").

## Status model — reused exactly as-is

`maintenance_requests.status` stays `Submitted`/`Scheduled`/`In
Progress`/`Completed` — the pre-existing M0 lifecycle, unchanged, no new
value. "Needs attention / Active" vs "Completed / History" (the Command
Center's own grouping) is a pure view-level derivation
(`status !== 'Completed'`), never a persisted state.

## Two genuine gaps found — NOT implemented, NOT migrated

This milestone's own brief asks for a "Mark Needs More Information"
action and a "landlord internal note." Neither has a home in the
current schema:

- **"Needs More Information"** has no value in
  `maintenance_requests.status`'s CHECK constraint
  (`Submitted`/`Scheduled`/`In Progress`/`Completed` only). Conflating it
  with an existing value would lose information a landlord genuinely
  needs to distinguish ("I'm waiting on the tenant" is not the same
  fact as "I'm actively working this" or "this is scheduled").
- **A landlord-only internal note** has no column/table anywhere at the
  request level (`property_contacts.notes` is a PropCrew-contact-level
  field, unrelated; `property_notes` is property-wide, not per-request).

Per this milestone's own explicit instruction ("avoid schema changes if
the existing model is sufficient... if a schema migration is needed,
stop before applying it and report exactly what is required"), **neither
was implemented, and no migration was written to a `supabase/*.sql`
file or applied**. The smallest compatible change, if the product owner
wants this in a future milestone, would be:

```sql
-- Additive, backward-compatible CHECK-constraint widening — every
-- existing row (Submitted/Scheduled/In Progress/Completed) remains
-- valid; only a NEW value becomes possible going forward.
alter table public.maintenance_requests drop constraint if exists maintenance_requests_status_check;
alter table public.maintenance_requests add constraint maintenance_requests_status_check
  check (status in ('Submitted', 'Scheduled', 'In Progress', 'Needs Info', 'Completed'));

-- A nullable, landlord-only column — never selectable by a tenant (no
-- tenant-facing SELECT policy would ever include it; the existing
-- maintenance_requests_select_own policy is owner-only already, so
-- this needs no new RLS policy, only the column itself).
alter table public.maintenance_requests add column if not exists landlord_note text;
```

Neither statement has been run against any database, and neither exists
in any `supabase/*.sql` file in this repository. This is a proposal for
a future milestone's own review, not a decision made here.

## Tenant visibility — unchanged

No tenant permission was expanded. Tenants continue to see and change
exactly what they could before (their own `tenant_requests.status`, via
the pre-existing `TenantRequestsPanel`/tenant portal) — nothing built in
this milestone is tenant-facing at all; every new file
(`app/maintenance/page.tsx`, `MaintenanceCaseDetail.tsx`,
`command-center.ts`) is reached only from the landlord's own
authenticated app.

## Security / tenancy

Every new query relies entirely on the existing, pre-audited RLS
policies (`maintenance_requests_select_own`/`_update_own`,
`tenant_requests_select`, `maintenance_intake_sessions_select`,
`property_contacts_select_own`, `property_contact_links_select_own`,
`properties_select_own`) — no explicit `owner_id` filter was added
client-side (none is needed; RLS is the actual boundary, the same
pattern every other portfolio page — Rent Ledger, Tax Center — already
uses), no service-role key, no elevated client, anywhere in this
milestone. Verified by a dedicated test, not just by inspection
(`lib/maintenance/command-center-wiring.test.ts`'s "Security" describe
block).

## Mobile UX

`app/maintenance/page.tsx` renders a card grid (one `<button>` per
case, full-width, no `<table>` anywhere) — readable at a glance, no
horizontal scrolling, large tap targets. Urgency and property identity
are always the first two things visible on a card. The shared detail
modal reuses the app's existing `.overlay`/`.modal` pattern (no new,
one-off dialog implementation).

## Files changed

- `lib/maintenance/command-center.ts` (new) — pure enrichment logic.
- `lib/maintenance/command-center.test.ts` (new, 18 tests).
- `lib/maintenance/command-center-wiring.test.ts` (new, 22 tests) —
  source-read regression guards covering the categories this
  milestone's own brief asked for: portfolio listing, property scoping,
  urgency/source display, PropCrew assignment/reassignment/removal,
  active-vs-history separation, permitted status transitions, and
  security/tenant-isolation.
- `components/maintenance/MaintenanceCaseDetail.tsx` (new) — shared
  detail/actions modal.
- `app/maintenance/page.tsx` (new) — portfolio Command Center.
- `components/AuthNavMenu.tsx` — one new nav entry.
- `app/page.tsx` — additive: two new read-only queries
  (`maintenance_intake_sessions`, `property_contact_links`, both
  excluded from the hard-fail error path exactly like `tenant_requests`
  already is), an `assignMaintenanceContact()` function, and the
  urgency badge / "Manage" button / shared modal mount described above.
- `app/globals.css` — additive CSS only; reuses `.statusPill`/
  `.pillBad`/`.financialStat`/`.emptyState`/`.overlay`/`.modal`
  wholesale.
- `lib/dashboard/property-first-simplification-v2.test.ts` — updated
  (intentional, documented) to include the new `/maintenance` nav
  destination in its exact-hierarchy assertion.

## Explicit scope control — confirmed NOT built

Provider outreach automation, provider secure links, scheduling, quote
approval, SMS Service Thread, AI provider discovery, autonomous hiring,
payments, full Tenant Connect portal expansion, PropCrew company/person
evolution beyond what already exists, provider discovery, rent
collection, Smart Upload Structured Data V1, the Smart Upload X-close
fix, PropCrew iPhone contact import, Snapshot/Property Intelligence,
lease builder, turnover, or any unrelated dashboard redesign. M1/M2 were
not revisited except for the two new, additive, defensively-excluded
read-only queries listed above.

## Testing

- `npm test` — 91 test files, 1407 tests, all passing (40 new tests
  across the two new Maintenance Coordination test files, plus one
  existing test updated for the intentional new nav entry).
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds, 32 routes (new: `/maintenance`).
