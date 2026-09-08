# Tenant Connect + Maintenance Coordination — M3.1: Property Maintenance Workflow Unification

Follow-up to M3 (`docs/tenant-connect-m3-landlord-command-center.md`),
driven by real-iPhone owner testing of PR #56. M3 built a genuinely good
Command Center, but testing found two overlapping maintenance concepts
that felt disconnected — this milestone connects them without inventing
a third data model or a schema migration.

## Exact root cause of the overlapping maintenance UX

`public.maintenance_records.status` (Milestone 6) has **no CHECK
constraint** — it is free text. The property-level "Log service"/
Service History form (`app/page.tsx`'s `showModuleForm === 'Maintenance'`)
has always offered `Completed / Scheduled / In progress / Needs
follow-up`. Meanwhile, PropWatch's "Open Maintenance" section
(`lib/dashboard/attention.ts`'s `buildOpenMaintenanceItems`, and
`app/page.tsx`'s `openMaintenanceCount`) treated **any** row whose
`status !== 'Completed'` as active, open work.

The result: a genuinely finished historical repair — e.g. "Freon and
capacitor" / Breezy Air / $500 — tagged `In progress` (whether by a
user re-picking that option, or any other path that produces that
value) looked, in PropWatch, **identical to real, actionable open
work**. That's exactly the wrong signal once M3 gave "active,
actionable work" its own proper home: canonical
`public.maintenance_requests`. `maintenance_records` was never meant to
represent ongoing coordination — it's the durable service-history
ledger (repairs, vendors, costs, receipts, financial linkage) — but its
status field's overlapping vocabulary with `maintenance_requests.status`
(`Submitted/Scheduled/In Progress/Completed`) made the two tables read,
in the UI, as one ambiguous "is this open or not" concept.

**No schema migration was needed or applied to fix this** — the fix is
entirely a data-SOURCE change, not a data-shape change (see "PropWatch
maintenance normalization" below).

## Architecture: one lifecycle, two clearly-labeled sections, no new table

```
Tenant OR landlord reports an issue
  → canonical maintenance_requests row (source='tenant'|'landlord')
  → landlord reviews (Property Maintenance hub / portfolio Command Center)
  → PropCrew may be assigned (assigned_contact_id)
  → status moves through Submitted → Scheduled/In Progress → Completed
  → Completed requests stay visible (Command Center's own History section) —
    NOT auto-converted into maintenance_records (see "Completion boundary" below)
```

`maintenance_records` remains its own, separate, durable service-history
ledger — untouched in schema, untouched in its existing rows, still
reachable, still linkable to Financials exactly as before.

## 1. Property-level Maintenance hub

`Details → Maintenance` (`app/page.tsx`, `propertySubTab === 'Maintenance'`)
is now THE property Maintenance destination:

- **Active Requests** (top) — the exact same enriched canonical
  `maintenance_requests` list M3 built (urgency badge, source badge,
  category for tenant-originated rows, status control, PropCrew
  "Manage" action) — previously mounted under `Rent → Tenant`, moved
  here because real-device testing found that location insufficiently
  discoverable. A **"+ New Maintenance Request"** button sits at the
  top of the whole hub.
- **Service History** (below, its own clearly-separated header) — the
  pre-existing `maintenance_records` list and its "+ Log service
  record" form (same table, same fields, same Financials linkage,
  relabeled from "+ Add maintenance" for clarity — nothing about how it
  writes data changed).

`Rent → Tenant` keeps exactly what's genuinely tenant-relationship-
specific — `TenantConnectStatusCard` (invite status) and
`TenantRequestsPanel` (the tenant's own conversation thread) — with a
one-line pointer to Details → Maintenance for actual request
management. No functionality was removed from the app; it moved to a
more discoverable, unified home.

## 2. Landlord-created maintenance request

New shared component: `components/maintenance/NewMaintenanceRequestModal.tsx`
— mounted from both the property hub (property pre-selected, hidden)
and the portfolio Command Center (`app/maintenance/page.tsx`, property
chosen first — Section 2's "portfolio-level entry that first asks the
property"). Writes to the **same** canonical `maintenance_requests`
table every other flow already uses — `source` defaults to `'landlord'`
at the DB layer (Milestone 26); no parallel work-order model.

Fields: property (fixed or selectable), title, description, priority,
initial status, and an **optional** "on behalf of the current tenant"
toggle. **Tenant information is never required** — pure logic in
`lib/maintenance/new-request.ts` (`isNewMaintenanceRequestValid`,
`buildNewMaintenanceRequestPayload`, 12 dedicated tests) proves a
request with a title alone is always valid, and that an unattached
request gets the honest placeholder `tenant_name = 'Landlord'` — never a
fabricated tenant — satisfying `maintenance_requests.tenant_name`'s
NOT NULL constraint without inventing a person. A landlord can report
"AC not cooling" on a vacant property with zero tenant fields touched.

## 3. Tenant request entry / prefill

When the selected property has a **current** lease (`lib/leases/status.ts`'s
`selectCurrentLease` — the exact same derivation the rest of the app
already uses for occupancy and "Current Lease," never a second one),
the modal offers "This is on behalf of the current tenant ({name})."
Checking it prefills tenant name/email from `normalizeTenants(lease)` —
reviewable and editable before saving, never silently submitted. Tenant
phone (`leases.tenant_phone`) is shown as read-only context ("Phone on
file: …") since `maintenance_requests` has no column to persist it —
deliberately not silently written anywhere it doesn't belong (see
"Schema limitations" below for why this wasn't turned into a migration).
No duplicate tenant record is ever created — this reads the existing
`leases` row only, never writes to `leases`/`tenant_property_access`.

## 4/5. Active Requests vs Service History, and the completion boundary

Responsibilities, going forward:
- **`maintenance_requests`** = active, actionable coordination work —
  the Command Center's own domain.
- **`maintenance_records`** = durable historical service/repair
  information — unchanged, untouched, still fully functional.

**Completion → Service History is intentionally deferred, not built.**
A completed `maintenance_requests` case stays exactly what it is — a
completed canonical case, visible in the property hub's "Completed
requests" tile and the Command Center's own History section (both
pre-existing M3 mechanics, unmodified). It is **not** auto-converted or
materialized into a `maintenance_records` row: doing that safely (matching
vendor/cost/receipt fields that `maintenance_requests` doesn't collect,
deciding whether to overwrite-or-append, deciding what happens on a
later status change) is real M9-shaped scope this milestone's brief
explicitly says not to prematurely build. The landlord is never asked
to enter the same information twice — nothing here doubles data entry.
The **intended future boundary** — completion should eventually
generate/reference a `maintenance_records` row (matching M1.1's own
"(B), not (A)" answer to this exact open question) — is documented here
for whichever future milestone builds it, not implemented.

## 6. PropCrew

Fully preserved, byte-for-byte, from M3 — `MaintenanceCaseDetail.tsx`
(the shared assign/change/remove UI) was not modified by this
milestone. Assignment still means "the landlord's own intended-provider
decision" only — no message sent, no token, no scheduling implied
(re-verified by this milestone's own new wiring tests, not just
inspection). Manual PropCrew creation remains the only way to add a
contact — no iPhone contact-import work was done here.

## 7. Portfolio Command Center

Preserved, untouched in its core mechanics — the ONLY M3.1 addition is
a "+ New Maintenance Request" button (Section 2's ask) using the same
shared modal/save path. Since property-level and portfolio-level views
both read/write the identical `maintenance_requests` table via the
identical `enrichMaintenanceCases`/`sortCasesForCommandCenter` pure
functions (M3, unmodified), a landlord-created request appears in both
places automatically — never a separate copy, by construction.

## 8. PropWatch maintenance normalization (the M3.1 core fix)

`lib/dashboard/attention.ts` gains `buildOpenMaintenanceRequestItems()` —
same shape/contract as the existing `buildOpenMaintenanceItems()`
(kept, unmodified, not deleted — no destructive removal of working
code), but its input type has no `service_date`/`vendor`/`cost` fields
at all, making it structurally impossible to feed it a
`maintenance_records` row by accident. `app/page.tsx`'s
`openMaintenanceItems` (PropWatch) and `openMaintenanceCount` (property
cards) both now read from **canonical, active `maintenance_requests`
cases** — the exact same `active` definition (`status !== 'Completed'`)
the Command Center itself uses — so PropWatch and the Command Center
can never disagree about what counts as open, and a `maintenance_records`
row's free-text status can never again make a finished historical
repair look like open work. No existing `maintenance_records` row's
data was touched or rewritten.

## 9. Occupancy — inspected, confirmed correct, NO CHANGE MADE

`app/page.tsx` already, consistently, uses `lib/leases/status.ts`'s
`deriveOccupancy()`/`selectCurrentLease()` for every occupancy
determination in the app (the property workspace badge, and every
portfolio property card) — one tested, deterministic source of truth,
not two. `deriveOccupancy()`'s own contract: Occupied requires a lease
whose derived status is `Active` or `Expiring Soon` (today falls within
`[start_date, end_date)`); no such lease (and no upcoming/unknown one
either) yields Vacant. The tested behavior "a property with no lease
shows Vacant, and correctly flips to Occupied once a valid current
lease is entered" is **exactly the intended, correct behavior of this
existing, already-tested module** — not a bug. No code was changed for
this item.

## Schema limitations discovered — documented, NOT migrated

Two gaps were found; neither was applied without owner review, per this
milestone's own instruction.

**1. `maintenance_requests` has no `category` column.** Only
`tenant_requests` does (M1's own deliberate design — see
`supabase/milestone-25-maintenance-coordination-foundation.sql`'s
header). A landlord-created request therefore has no dedicated category
field in this milestone — its title/description already carry that
information in free text ("AC not cooling" is self-describing), so this
is not a functional blocker, but category parity between tenant- and
landlord-originated requests is incomplete. **Proposed migration (NOT
applied):**
```sql
alter table public.maintenance_requests add column if not exists category text;
-- Nullable, no CHECK constraint added here — matching lib/maintenance/
-- categories.ts's existing vocabulary would be a follow-up decision,
-- not assumed. Backward-compatible: every existing row gets NULL,
-- nothing existing changes meaning.
```
RLS implication: none — no new policy needed (a plain nullable column
addition doesn't change any existing policy's behavior).
Backward-compatibility: fully additive, zero risk to existing rows.
Why code-only is insufficient: there is genuinely no column to write
a category into without one.

**2. `maintenance_requests` has no phone column for the tenant contact.**
`leases.tenant_phone` exists and IS shown to the landlord (read-only)
during request creation, but there is nowhere on the canonical case to
persist it. **Proposed migration (NOT applied):**
```sql
alter table public.maintenance_requests add column if not exists tenant_phone text;
```
Same backward-compatibility/RLS profile as above (nullable, additive,
no policy change needed). Deferred rather than applied — a landlord can
already see the phone number at request-creation time from the lease
itself; persisting a second copy onto the case wasn't judged necessary
to unblock M3.1's actual UX gap.

Neither statement has been run against any database or added to any
`supabase/*.sql` file.

## Confirmation: no unauthorized migration was applied

Confirmed — `git diff` against the M3 commit contains zero `.sql` files
of any kind. Every fix in this milestone is application-code-only.

## Security / RLS review

Every new/modified query continues to rely entirely on the same
pre-existing, pre-audited RLS policies M3 already used
(`maintenance_requests_select_own/insert_own/update_own`,
`leases_select_own`, `property_contacts_select_own`,
`property_contact_links_select_own`) — no explicit `owner_id` filter
added client-side (RLS is the actual boundary), no service-role key, no
elevated client anywhere. `owner_id` on every new insert is always the
caller's own `user.id` (never client-suppliable). The shared
`NewMaintenanceRequestModal` never queries Supabase itself — same
"dumb, props-only" pattern `MaintenanceCaseDetail` already established —
so it cannot leak data beyond whatever its caller already fetched under
RLS. Verified by a dedicated new test file
(`lib/maintenance/command-center-m3-1-wiring.test.ts`'s "Security"
block), not just inspection. Landlords can still only create/manage
requests for properties they own (RLS-enforced); tenants gain zero new
access — nothing built in this milestone is tenant-facing.

## Files changed

- `lib/maintenance/new-request.ts` (new) — pure landlord-request
  creation/validation logic.
- `lib/maintenance/new-request.test.ts` (new, 12 tests).
- `components/maintenance/NewMaintenanceRequestModal.tsx` (new) —
  shared form, mounted from both entry points.
- `lib/dashboard/attention.ts` — additive:
  `buildOpenMaintenanceRequestItems()` (the PropWatch fix); the
  pre-existing `buildOpenMaintenanceItems()` is untouched/still exported.
- `lib/dashboard/attention.test.ts` — 5 new tests for the new function.
- `app/page.tsx` — restructured Details > Maintenance into the Active
  Requests + Service History hub; simplified Rent > Tenant; new
  `saveNewMaintenanceRequest()`; `openMaintenanceItems`/
  `openMaintenanceCount` repointed at canonical cases; removed the
  legacy `showRequestForm`/`requestDraft`/`saveRequest()` (fully
  superseded by the new shared modal — same underlying insert,
  improved form).
- `app/maintenance/page.tsx` — additive: portfolio-level "+ New
  Maintenance Request" (fetches `leases` for prefill; new
  `saveNewRequest()`).
- `app/globals.css` — additive only (two small new class hooks).
- `lib/tenant-connect/tenant-connect-v1-wiring.test.ts` — one
  assertion updated for the intentional `showRequestForm` → shared
  modal replacement.
- `lib/maintenance/command-center-m3-1-wiring.test.ts` (new, 25 tests)
  — the full M3.1 wiring/security/mobile-UX coverage.

## Testing

- `npm test` — 93 test files, 1449 tests, all passing (42 new tests
  across `new-request.test.ts`, `attention.test.ts`'s additions, and
  `command-center-m3-1-wiring.test.ts`; 1 existing test updated for the
  intentional legacy-form replacement).
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds, 32 routes (unchanged — `/maintenance`
  already existed from M3).

## Explicit deferred items

M4 PropCrew company/person evolution, PropCrew iPhone contact import,
M5 provider secure link/outreach, M6 scheduling, M7 quotes/approval,
real-time onsite authorization, M8 Service Thread/SMS, full M9
completion/history automation beyond this milestone's boundary, M10 AI
automation, provider discovery, payments, rent collection, Smart
Upload Structured Data V1, Smart Upload X-close fix, Snapshot/Property
Intelligence, lease builder, turnover, unrelated dashboard redesign,
and the two schema additions documented above (category, tenant_phone
on `maintenance_requests`) — proposed, not applied.
