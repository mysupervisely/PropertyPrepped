# Tenant Connect + Maintenance Coordination — M3: Landlord Maintenance Command Center V1

Milestone 28. Turns the canonical `public.maintenance_requests` case
list — both tenant-submitted (via Guided Intake, M2) and
landlord-logged — into an operational landlord workspace: a status
summary, a case list, and a detail view with the V1 landlord actions.
No new table, column, or migration. Property-photo upload work (V1–V3
of that separate investigation) was explicitly out of scope for this
milestone and was not touched.

## Pre-coding audit (done before any code was written)

**A. Current entry point.** Two separate, overlapping UIs, both
squeezed into the Rent tab's "Tenant" sub-tab:
1. A flat inline list in `app/page.tsx` reading `maintenance_requests`
   directly (title, priority pill, a "Tenant" badge, a raw status
   `<select>`, a delete button) — no structured intake data, no safety
   info, no attachments, no PropCrew assignment.
2. `TenantRequestsPanel` (Tenant Connect V1, unchanged internals),
   reading `tenant_requests` — a message-thread view with its OWN
   `New`/`In Progress`/`Resolved` status control, entirely independent
   of the flat list above.

**B/C. Current queries/list UI.** `loadPortfolio()` already fetches
`maintenance_requests`, `tenant_requests`, `property_contacts`
portfolio-wide (no new query added by this milestone).

**D. Current detail visibility.** Neither UI showed: guided-intake
structured observations, safety escalation outcome, tenant photo
attachments, or PropCrew assignment. The tenant's original description
text (already a structured, labeled summary — see below) was the only
detail shown, and only in the flat list, not the thread view.

**E. Current status controls.** Two independently-writable status
columns with **no synchronization**: the flat list wrote
`maintenance_requests.status` (`Submitted`/`Scheduled`/`In
Progress`/`Completed`); `TenantRequestsPanel` wrote
`tenant_requests.status` (`New`/`In Progress`/`Resolved`) — confirming
M1.1's own open question in code: "Landlord case = completed, tenant
portal = submitted forever" was a real, reproducible gap.

**F. Tenant-originated data available.** `maintenance_intake_sessions`
(`outcome`: `resolved_in_intake` / `escalated_to_dispatch` /
`escalated_urgent` / `abandoned`) and `maintenance_intake_answers`
(`question_key`, `safety_class`, `answer_value`) already exist and are
already populated by M2's Guided Intake — nothing landlord-facing ever
read either table before this milestone. Tenant photos are already
stored via the existing `property_message_attachments` /
`tenant-connect-attachments` architecture (Guided Intake attaches them
to the intake's own first message) — no separate attachment mechanism
exists or was needed.

**G. What was missing for M3.** A single, polished, landlord-facing
case list; a real detail view showing intake/safety/attachments; status
change actions; priority editing; PropCrew assignment; and the M1.1
sync fix.

**Architectural conflict found (reported before working around it, per
the M3 brief's own instruction):** `PropertySubTab` already had a
`'Maintenance'` value — the Details tab's service-history/repair-log
sub-tab (`maintenance_records`, a completely different table: repairs,
vendors, costs, receipts). Adding a second, different "Maintenance"
concept as a new top-level tab would have collided with it, making
navigation MORE confusing, not less — the opposite of the brief's own
goal. **Resolution:** the sub-tab's internal key is unchanged (nothing
that types/navigates/searches by `'Maintenance'` as a `PropertySubTab`
had to move); only its **displayed label**, at its one render site and
its one Quick Actions button, changed to **"Service History"**. This
freed the plain word "Maintenance" for the new, more operationally
important top-level tab. Zero schema/type changes.

## Navigation

Preferred nav in the brief was "Rent | Tenant Connect | Maintenance."
Implemented as **one** new top-level tab, not two:

- `Tab` type gained `'Maintenance'`: `'Overview' | 'Rent' |
  'Maintenance' | 'Details' | 'PropCrew' | 'Documents' | 'Tax'` (6 → 7
  tabs). `.tabs`'s CSS grid updated from `repeat(6,...)` to
  `repeat(7,...)`; the mobile 3-per-row breakpoint is unchanged
  (3+3+1 rows instead of 3+3).
- A separate top-level **"Tenant Connect"** tab was deliberately NOT
  added — growing to 8 top-level tabs on an already tab-dense,
  mobile-first property workspace was judged worse than the brief's
  own "do not add a global navigation system" and "do not overcrowd"
  guidance. Instead, "Tenant Connect" stays exactly where its
  eyebrow/heading already said it was — inside the Maintenance tab,
  as `TenantRequestsPanel`'s own section, right below the Command
  Center.
- Rent's old "Tenant Requests" sub-tab is now just **"Tenant"** —
  its maintenance-case content moved out; `TenantConnectStatusCard`
  (lease/tenant-access status, unrelated to maintenance) is all that's
  left there, which is what it actually is.

## Maintenance Command Center

New component: `components/tenant-connect/MaintenanceCommandCenter.tsx`.
Mounted in the new `activeTab === 'Maintenance'` section, fed
`requests`/`tenantRequests`/`contacts` already loaded and
property-filtered by `loadPortfolio()` — no new query for the list
itself. On opening a case with a linked `tenant_requests` row, it makes
exactly one further query round-trip: the latest
`maintenance_intake_sessions.outcome` for that request, plus that
conversation's attachments (signed URLs, same bucket/RLS
`TenantRequestsPanel` already uses).

**Summary tiles:** Needs Review / Open / In Progress / Completed —
computed by `lib/maintenance/status.ts#summarizeMaintenanceCaseCounts()`,
a pure, unit-tested function.

**Status presentation** (`presentMaintenanceStatus()`), matching the
brief's "map the UI cleanly to the existing status model... a
presentation mapping, not schema churn": the real DB status is never
renamed —

| DB `status` | DB `source` | Displayed as | Summary bucket |
|---|---|---|---|
| Submitted | tenant | Needs Review | Needs Review |
| Submitted | landlord | Open | Open |
| Scheduled | either | Scheduled | In Progress |
| In Progress | either | In Progress | In Progress |
| Completed | either | Completed | Completed |

**Case detail** shows, only when the underlying data actually exists
(never fabricated): status, reported-by + timestamp, the tenant's
report (`maintenance_requests.description` — already a structured,
labeled block: Guided Intake's `buildSummary()` already renders
`"TITLE\n\nTenant observations:\n- Label: value..."`, so this single
field IS the labeled observations list, not raw free text — a second,
separately-queried "OBSERVATIONS" section built from raw
`maintenance_intake_answers` rows was deliberately not added, since it
would only re-derive the same labels with less mature formatting and
require importing every category's question-tree label lookup into
this component for no new information), a Safety section (only if an
intake `outcome` exists — see below), attachments (only if any exist),
a priority selector, a PropCrew assignment selector, and the status
action buttons.

**Data distinctions preserved** (Section 5 of the brief): tenant
symptom/report is shown as exactly what the tenant/system produced,
never reworded; there is no PropRoster assessment, professional
diagnosis, or landlord-note section in this pass — none of those exist
in the current architecture, and none were fabricated to fill the gap.

## Status sync — the M1.1 open question, closed (no migration)

`lib/maintenance/status.ts#syncedTenantRequestStatus()` maps a new
`maintenance_requests.status` to what the linked `tenant_requests.status`
should become:

- `Submitted` → `New`
- `Scheduled` / `In Progress` → `In Progress`
- `Completed` → `Resolved`

`MaintenanceCommandCenter`'s `changeStatus()` writes the canonical case
first; only on success does it look up the linked `tenant_requests` row
(if one exists — landlord-only cases have none) and write the synced
status, then fires the same `notifyTenantConnect(..., 'landlord_update',
...)` call `TenantRequestsPanel`'s own status change already sends, so
a tenant gets the identical notification regardless of which UI the
landlord used. This is a **client-side, two-write, best-effort sync**
(the second write is logged, not thrown, on failure) — not a DB
trigger — deliberately, per the brief's "no schema churn unless
genuinely required": nothing here needed a migration, and centralizing
every status-changing code path in this one component (the old
`updateRequestStatus()`/flat list is retired) means there is now
exactly one place that can ever change a case's status, closing the
"two independently editable sources of truth" gap by construction, not
by database enforcement. A DB trigger remains the more airtight future
option if a second status-writing code path is ever added — flagged
below as deferred, not built speculatively now.

**A genuinely useful side effect, not engineered in:**
`maintenance_audit_log_write()` (Milestone 25) is an `AFTER UPDATE`
trigger on `tenant_requests` itself. The sync write above therefore
produces a real, structured `maintenance_audit_log` row
(`action: 'status_changed'`) for every tenant-originated case status
change, automatically — Section 13's audit-log requirement, satisfied
by an existing trigger, zero new schema.

## PropCrew assignment (Section 8)

`assignContact()` writes only `maintenance_requests.assigned_contact_id`
(already RLS-verified to belong to the same owner —
`maintenance_requests_update_own`'s existing `with check`). No
notification, no outreach, no scheduling, no marketplace — the UI
itself says "Internal organization only — nothing is sent to this
contact." Nothing else was touched.

## Audit log — what could and couldn't be added (no new schema)

`maintenance_audit_log.request_id` is a **foreign key to
`tenant_requests`, not `maintenance_requests`**, and the table has **no
INSERT/UPDATE/DELETE policy for `authenticated` at all** — only the
SECURITY DEFINER trigger above can ever write to it. Consequences,
confirmed by reading `supabase/schema.sql` directly (not assumed):

- Tenant-originated case status changes ARE audited, for free, via the
  sync write's trigger (above).
- **PropCrew assignment is never audited in V1** — no trigger fires for
  a plain `maintenance_requests` update, and no policy would let a
  client insert an audit row directly even if the code tried to.
- **A landlord-only case's status change is never audited** — it has no
  linked `tenant_requests` row for the trigger to fire on.

Both are real, schema-imposed limits, not omissions — closing them
would require a new migration (e.g., a trigger on `maintenance_requests`
itself, or a narrow INSERT policy), which this milestone deliberately
does not add without a demonstrated need beyond "would be nice."

## Completion → maintenance history (Section 11)

**Decision: A (canonical case only) for V1.** `maintenance_records`
(the Details tab's service-history log) is a genuinely different
concept — vendor/cost/receipt-bearing completed work — with no existing
column linking it back to a `maintenance_requests` case, and no
description of "which repair record corresponds to which case" exists
anywhere in the current schema. Auto-creating a `maintenance_records`
row on "Mark Completed" would require guessing a vendor/cost that was
never captured and inventing a new linking column — real schema churn
this milestone's brief explicitly says not to force. Marking a case
Completed updates only the canonical case (and its tenant-facing
mirror, per the sync above). A durable `maintenance_requests` →
`maintenance_records` link is flagged below as a real, well-motivated
M4+ candidate, not built here.

## Files changed

- `lib/maintenance/status.ts` (new) — presentation/status-mapping,
  status-sync mapping, reopen constant. Pure, no Supabase/React.
- `lib/maintenance/status.test.ts` (new) — 11 tests.
- `components/tenant-connect/MaintenanceCommandCenter.tsx` (new) — the
  Command Center itself.
- `lib/maintenance/command-center-wiring.test.ts` (new) — 15 tests.
- `lib/maintenance/command-center-security.test.ts` (new) — 9
  source-read RLS regression tests against `supabase/schema.sql`.
- `app/page.tsx` — `Tab`/`tabs` gains `'Maintenance'`; old flat
  maintenance list, `updateRequestStatus()`, `removeRequest()`, and
  `categoryByMaintenanceRequestId` retired; `TenantRequestsPanel`
  relocated from Rent to the new Maintenance tab; Details' Maintenance
  sub-tab and its Quick Actions button relabeled to "Service History"
  (key unchanged); Rent's "Tenant" sub-tab relabeled from "Tenant
  Requests" to "Tenant"; new `selectedTenantRequests` derived var.
- `app/globals.css` — `.tabs` grid `repeat(6,...)` → `repeat(7,...)`
  (+ updated comments); new, small rule set for the Command Center's
  summary tiles/case-detail sections/safety-note tones — everything
  else reuses `.maintenanceList`/`.maintenanceRow`/`.tenantRequestRow`/
  `.statusPill`/`.financialStats`/`.modal`/
  `.tenantConnectBubbleAttachments` as-is.
- Three pre-existing tests updated for the intentional 6→7 tab change
  and the flat-list retirement: `lib/dashboard/property-first-
  navigation.test.ts`, `lib/dashboard/property-profile-mobile-
  redesign-v2.test.ts`, `lib/dashboard/property-profile-mobile-
  polish-v3.test.ts`, `lib/tenant-connect/tenant-connect-v1-wiring.
  test.ts`.

## Schema / migration

**None.** Every table, column, policy, and trigger this milestone
relies on already existed before this pass. No SQL was written, and
none was applied.

## Security re-audit (Section 14)

- Landlord: every read/write in the new component goes through the
  caller's own RLS-scoped Supabase client — confirmed no service-role
  key, no direct `fetch('/api/...')` bypass, and every `.update()`
  targets exactly one already-owner-scoped table
  (`maintenance_requests`, `tenant_requests`).
- Tenant: `property_contacts` (PropCrew) has no tenant-facing policy at
  all — confirmed by reading every `property_contacts_*` policy in
  `schema.sql`. A tenant cannot read the PropCrew directory, cannot see
  another case's data (every relevant `select` policy is
  owner-or-own-active-tenant-scoped), and cannot mutate
  `maintenance_requests` directly (its only insert/update policies
  require `owner_id = auth.uid()`, which a tenant's own uid can never
  satisfy for a property they don't own) or `tenant_requests`'s status
  (`tenant_requests_update_owner` is owner-only; no tenant-facing
  UPDATE policy exists on that table at all).
- Provider: unchanged, zero access, not addressed by this milestone.

## Human/legal/safety review still needed

The Safety section surfaces `maintenance_intake_sessions.outcome`
through a small, fixed, literal copy table
(`OUTCOME_COPY` in `MaintenanceCommandCenter.tsx`) — four short,
factual sentences describing what the ALREADY-REVIEWED (per M2's own
`urgent.ts` disclaimer) intake outcome was, with no new safety
guidance authored and no AI-generated interpretation. This still
deserves the same human/legal/safety sign-off M2's own guidance copy
was flagged as needing before reaching real tenants at scale — this
milestone does not introduce new safety-critical wording, but it does
surface existing safety-classification data to a new landlord-facing
audience for the first time, which is worth that same review pass
covering.

## Deferred to a future milestone (not built here)

- Landlord-private notes on a case (would require new schema — no
  compelling reason found to bypass the "audit first" mandate for V1).
- A `maintenance_requests` ↔ `maintenance_records` durable link for
  completion → property history (Section 11, Decision A above).
- Audit-logging PropCrew assignment and landlord-only-case status
  changes (would require a new trigger or INSERT policy on
  `maintenance_audit_log`/`maintenance_requests`).
- Hardening `property_contacts_insert_own`/`_update_own` and
  `maintenance_requests_insert_own`/`_update_own`'s `assigned_contact_id`
  check the way `property_documents`' policies already verify
  `property_id` ownership (a real, pre-existing gap noticed while
  auditing `schema.sql`, unrelated to this milestone's own scope —
  `maintenance_requests`'s `assigned_contact_id` check IS already
  ownership-verified; this note is about a narrower, separate gap on
  `property_contacts` itself accepting any `property_id` on insert
  without similarly checking it belongs to the same owner — flagged
  for a future security-hardening pass, not fixed here since it's
  unrelated to M3's own feature surface).
- Everything explicitly listed as out of scope in the M3 brief itself
  (provider outreach, scheduling, quotes, SMS/email, AI diagnosis/cost
  guidance, Call Technician/Request Callback, etc.) — none of it was
  started, and no placeholder buttons for any of it were added to
  production UI, per the brief's own explicit instruction.

## Recommendation for the next controlled milestone

M4 candidate: PropCrew provider outreach V1 (the first real "Next
action" — e.g. "Request quote" or "Contact provider" — scoped
narrowly: one safe, reversible action, no scheduling, no payment, no
marketplace), OR the `maintenance_requests` ↔ `maintenance_records`
completion-to-history link flagged above, whichever the product owner
judges more valuable next. Both are clean, additive extensions of what
M3 already built; neither requires revisiting this milestone's own
architecture.
