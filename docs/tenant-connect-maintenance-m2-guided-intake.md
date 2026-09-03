# PROP ROSTER — Maintenance Coordination M2: Guided Maintenance Intake V1

Status: built on its own branch, not merged, not deployed, no production
SQL run. Builds entirely on the M1/M1.1 schema already live in
production (PR #51, merged) — this milestone adds zero new tables,
columns, or migrations.

Branch: `claude/tenant-connect-maintenance-m2-guided-intake`, based on
`main` at `b08c92e198dc37e0dfaec12e77726502d10ec524` (the M1/M1.1 merge
commit).

---

## Part 1 — Post-merge Tenant Connect entry-point audit (Phase A)

**Finding: not a regression.** Tenant Connect has never been global
navigation — it is deliberately property-level and lease-scoped,
exactly as M10's original design intended, and that architecture is
preserved here.

**A. Where a landlord reaches Tenant Connect today:** select a property
→ **Rent tab → "Tenant Requests" sub-tab** (only shown when the
property's type is `Rental Property`). `TenantConnectStatusCard`
(invite/connection status, scoped to the property's current lease) and
`TenantRequestsPanel` (the tenant-submitted requests list/thread) both
render there — `app/page.tsx`, `rentSubTab === 'Tenant'`.

**B. Classification:** property-level AND lease-level, never global.
`TenantConnectStatusCard` always renders a "Tenant Connect" heading in
one of three states (locked/no-lease/full) — it is never silently
absent — but only inside that specific sub-tab, and only for a Rental
Property.

**C. Expected vs. regression:** **expected.** The likely reason the
product owner didn't see it: the Rent sub-tab button itself is labeled
**"Tenant Requests,"** not "Tenant Connect" — the literal phrase "Tenant
Connect" only appears once you're inside the status card, one level
deeper. This is a naming/discoverability observation, not a defect, and
per this milestone's explicit instruction ("do not change UI merely
because 'Tenant Connect' is not a global nav item... if intentionally
property-level or contextual, preserve that architecture") **no UI was
changed for this** — flagged here for product-owner awareness only.

**D. Reasonable landlord path exists:** yes — invite/connect
(`TenantConnectStatusCard`), connection status (same card, 3-state
label), and requests/messages (`TenantRequestsPanel`, full thread with
reply) are all present and functional at that one location.

**E. Client-side plan gating:** traced the full chain —
`useSubscription()` → `resolveEffectivePlan()` → `entitlementsFor(plan)
.tenantConnect` → `TENANT_CONNECT_ENABLED[plan]`. Confirmed a single
source of truth (no duplicate/stale gating logic anywhere else in the
codebase) and confirmed it correctly includes `manage`/`automate`,
matching the already-fixed `owner_has_tenant_connect()`. **No gating bug
found, no fix made.**

No narrow fix was required or made in Phase A.

---

## Part 2 — M2 architecture

**Core principle, enforced by construction:** the tenant reports
symptoms; PropRoster only structures what they report. No AI call
exists anywhere in `lib/maintenance/intake/` — every question, branch,
and urgent trigger is a plain, versioned, human-authored TypeScript
data structure (`lib/maintenance/intake/definitions/*.ts`).

### Schema — audited, none required

Before writing any code, audited whether M1/M1.1's schema already
supports M2. It does, completely:

- `tenant_requests` — the tenant's immutable submission record. Its
  `title`/`description` become the structured summary text (built
  client-side, deterministically, by `engine.ts`'s `buildSummary()`).
- `maintenance_requests` — the canonical case, auto-created by the
  M26 `tenant_requests_create_maintenance_case()` trigger. **This
  module never inserts into `maintenance_requests` directly** —
  verified by a dedicated test (`submit.test.ts`).
- `maintenance_intake_sessions` / `maintenance_intake_answers` — created
  and populated by `submit.ts`, exactly the M25 scaffolding built for
  this moment.

**One real constraint this drove the design around:**
`maintenance_intake_sessions.request_id` is `NOT NULL REFERENCES
tenant_requests(id)` — a session cannot exist before its
`tenant_requests` row does. So the guided intake walk happens entirely
in local component state (no DB writes) until the tenant reaches the
end and taps submit; only then does `submit.ts` create, in order:
conversation → message (the structured summary) → `tenant_requests`
(which the M26 trigger turns into the canonical case) →
`maintenance_intake_sessions` → `maintenance_intake_answers` →
(optional) photo uploads. **No new migration was created.**

### Intake engine (`lib/maintenance/intake/`)

- `types.ts` — `IntakeTree`/`IntakeStep`/`IntakeQuestion`/`IntakeOption`.
  Every step's `next(answers)` is a pure function of prior answers.
- `engine.ts` — `getNextStepId()` (the ONE place urgent routing is
  decided — an urgent-flagged option always wins over a step's own
  `next()`, so no tree definition can forget to escalate correctly),
  `answeredStepsInOrder()`, `buildSummary()`, `deriveTitle()`.
- `urgent.ts` — the five urgent-reason guidance blocks (fire/smoke, gas
  smell, electrical hazard, major flooding, general hazard) — canned,
  conservative copy; never instructs touching/shutting off/repairing
  anything; always names 911 for a real emergency; never claims
  PropRoster is an emergency service.
- `definitions/*.ts` — one file per canonical category, each with a
  `version` string (e.g. `heating_ac-v1`) mirrored into
  `maintenance_intake_sessions.tree_version` at submission time.
- `submit.ts` — the single write path (see above).
- `draft.ts` — localStorage-only resume support (see below).

**AI extension point, not built:** `buildSummary()` returns plain
structured `{label: value}` text. A future milestone could feed that
same structured data to a model for nicer prose — but nothing here
requires it; the intake fully functions with zero AI involvement today.

### Categories implemented

All 8 canonical ids (`lib/maintenance/categories.ts`, unchanged):
`heating_ac`, `plumbing`, `toilet`, `electrical`, `appliance`,
`lock_door`, `leak_water`, `other`. Machine ids are never shown to the
tenant — only `maintenanceCategoryLabel()`'s display labels.

### Heating/AC — the flagship flow

The "AC is running but not cooling" branch matches the M2 brief's own
example question-by-question (thermostat mode → set temp → current temp
→ airflow → supply-air feel → filter → outdoor-unit observed-only-from-
-a-distance → visible water/ice → unusual sound → unusual smell), and a
dedicated test walks exactly the brief's example answers and asserts
the resulting structured summary matches the brief's own example
output. The tree never asks about the compressor and never asks the
tenant to approach or touch the outdoor unit — asserted directly by
test. Six other symptom branches (no airflow, won't turn on, heating
not working, water/ice, unusual sound, unusual smell, something else)
are intentionally shallower, per the brief.

### Other categories

Each conservative V1 tree per the brief's own bullet list (fixture/
issue-type/severity for Plumbing; clog/overflow/running/leak for
Toilet; affected/symptom with sparking+burning-smell escalation for
Electrical, never panel work; appliance type/powers-on/error-code/leak/
smell for Appliance; door/issue/security-concern for Lock/Door; source/
active/amount/spreading/room for Leak/Water with major-flooding
escalation; a deterministic yes/no safety gate + free-text description/
location/severity for Other, since a catch-all category has no
structured symptom taxonomy to embed urgent options into naturally).

### Urgent safety path

Deterministic only — an `IntakeOption.urgentReason` field, checked once
in `engine.ts`'s `getNextStepId()`, is the sole trigger mechanism. No
AI ever decides whether something is an emergency. Verified triggers
exist in Heating/AC (gas/burning smell, major water), Electrical
(sparking, burning smell), Leak/Water (heavy/flowing), Plumbing (heavy
active leak), Toilet (active overflow), Appliance (major leak, gas
smell), and Other (explicit yes/no gate) — 11 distinct trigger cases,
each with a dedicated regression test. On escalation: the tenant sees
canned safety guidance (never instructing any physical intervention),
is told PropRoster is not an emergency service, and can still continue
to submit the report (`outcome: 'escalated_urgent'`) — nothing is lost.

### Forbidden-action regression guard

A dedicated test scans every prompt/help-text/option-label string
across all 8 trees for a blocklist of actual dangerous ACTION phrases
(open the panel, test voltage, touch the capacitor, handle refrigerant,
reach into the disposal, climb a ladder/roof, disassemble, flip/open the
breaker, shut off the gas, relight the pilot, etc.) — deliberately
phrase-based rather than noun-based, so a legitimate option label like
"Garbage disposal" (an appliance TYPE) doesn't false-positive against a
ban on "reach into the disposal" (an ACTION).

### Photos

Reuses the **existing** `tenant-connect-attachments` Storage bucket and
`property_message_attachments` table (M10) exactly as-is — zero new
upload architecture, zero schema change. Photos captured during intake
are held as in-memory `File` objects and uploaded only at final
submission, scoped under `<conversation_id>/...`, attached to the
initial (structured-summary) message — the same RLS
(conversation-membership + `owner_has_tenant_connect()`) already
protecting every other Tenant Connect attachment protects these too.

**Real gap found and fixed (not new scope, a genuine pre-existing bug):**
uploaded attachments were never actually rendered anywhere — neither
the landlord's thread view (`TenantRequestsPanel.tsx`) nor the tenant's
own thread view (`app/tenant/page.tsx`) fetched or displayed
`property_message_attachments` at all, for ANY attachment, tenant- or
landlord-sent, predating this milestone entirely. Without fixing this,
"photos/evidence if safely supported" (Section 11) would silently not
work end to end despite uploading successfully. Fixed in both files:
after loading a thread, attachment rows are fetched and each rendered
via a short-lived signed URL (`createSignedUrl`, 1 hour — the same
established pattern already used for documents/photos elsewhere in the
app), scoped to a small thumbnail in the message bubble it belongs to.

**Video — deferred, documented, not built.** The bucket's
`allowed_mime_types` is image-only (`image/jpeg|png|webp|heic|heif`);
extending it to video (and likely raising the 15MB size cap) is a real,
small, additive schema-adjacent change this milestone chose NOT to make
silently — flagged for a future, reviewed migration rather than an
undocumented shortcut.

### Mobile-first UX

`components/tenant-connect/GuidedIntake.tsx` — one question per screen,
large tap targets (48px+ option tiles, matching this app's existing
44px-minimum convention), plain language throughout (no HVAC/plumbing/
electrical jargon), Back support at every step, a running step counter,
a review screen before submission (structured summary shown verbatim,
plus an optional free-text "anything else?" note), and resume support.
Replaces the old plain category/title/description form at this exact
call site — the "Other" tree's own free-text description step already
covers what that form did, so keeping both would be the "giant form"
duplication Section 9 explicitly warns against.

**Resume, and why it's localStorage-only:** covered above (schema
constraint) — `lib/maintenance/intake/draft.ts` provides pure,
independently-tested `draftStorageKey()`/`serializeDraft()`/
`parseDraft()`; the component wraps the actual `localStorage` calls in
try/catch so a private-browsing tab or disabled storage degrades to "no
resume offered," never a broken intake.

### Title derivation — a bug found and fixed during development

Initial implementation naively used "whatever the first answered step
was" as the landlord-facing title. For several categories the first
question is a scoping question, not a symptom (Plumbing asks "which
fixture?" first; Electrical asks "what's affected?" first), and for
"Other" the first question is literally the yes/no urgent safety gate —
which would have produced a title of "Yes" or "No". Fixed by adding an
explicit `titleStepId` to every `IntakeTree` (validated by a dedicated
test that it never points at a bare safety-gate-shaped step) and a
`deriveTitle()` engine function that reads that specific step's answer,
falling back to the category's own display label if unanswered, and
truncating an overly long free-text answer for the title specifically
(the full text still appears in the description).

### Submission → canonical case

`submit.ts`'s `submitGuidedIntake()` is the single write path,
end-to-end tested with a purpose-built fake Supabase client (not a
general mock library — records every call so assertions can inspect
exact sequencing): exactly one conversation, one initial message, one
`tenant_requests` row, one `maintenance_intake_sessions` row (correct
`tree_version`/`outcome`), one `maintenance_intake_answers` row per
answered step (correct `question_key`/`safety_class`), zero direct
`maintenance_requests` inserts ever, photos scoped under the correct
conversation id, and a failed conversation/tenant_requests insert stops
the whole sequence (no partial/orphaned case), while a failed
intake-session write does NOT roll back or hide the already-submitted
request (same non-throwing-side-effect principle `notify.ts` already
documents for email).

### Landlord visibility (minimum only, per Section 11)

No new landlord UI was built beyond what M1.1's architecture already
delivers automatically, plus two small additions:

1. **Automatic, zero-code:** because `maintenance_requests` is the
   canonical case for every origin, a tenant-originated case already
   appears in the landlord's existing Rent > Tenant "+ Log request"
   list — including the FULL structured summary as `description` (the
   M26 trigger copies `tenant_requests.description` into the case
   verbatim) — with no code change required.
2. **Added:** a small "Tenant" badge on that list's rows where
   `source = 'tenant'`, so a landlord can visually distinguish
   tenant-submitted cases from their own manual log entries.
3. **Added:** the attachment-rendering fix above, so photos are actually
   visible (in `TenantRequestsPanel`, the adjacent panel on the exact
   same screen, which already shows the full thread/description/status
   for tenant-originated requests specifically).

Explicitly NOT built: any cross-link from a `maintenance_requests` row
back to its `tenant_requests`/conversation detail (the landlord already
reaches the same case's full detail via the adjacent, pre-existing
`TenantRequestsPanel` on the same screen), any Maintenance Command
Center, any provider dispatch, quotes, scheduling, or authorization UI.

---

## Security / RLS findings

**No new migration, so no new RLS surface was created.** All of M2's
guarantees rest entirely on the M25/M26 RLS policies already verified
and live in production. Re-ran all three existing suites, unmodified,
against the identical (unchanged) `schema.sql` as a regression check:
`milestone-25-rls.test.sql` 19/19 PASS, `milestone-26-rls.test.sql`
15/15 PASS, `milestone-24-rls.test.sql` 10/10 of its still-applicable
assertions PASS — zero regressions, confirming M2's application-layer
code introduces no new database-level exposure.

Application-layer guarantees added this milestone (tested in
`submit.test.ts` and `definitions.test.ts`, not just documented):

- Tenant never gains any privilege on `maintenance_requests` — `submit.ts`
  never inserts into it (M26's trigger is the only writer).
- Exactly one canonical case per submission, structurally guaranteed by
  M26's unique index — re-verified in this milestone's own tests.
- No client-supplied `owner_id`/`property_id`/`tenant_access_id` is
  ever trusted for privilege decisions beyond what the caller's own
  RLS-scoped session already permits — this module inserts the values
  the CALLER already has (from their own `tenant_property_access` row),
  never accepts them as free-form input from a different actor.
- Every `SECURITY DEFINER` function this milestone relies on
  (`tenant_requests_create_maintenance_case()`, from M1.1) already uses
  `set search_path = public` — unchanged, re-verified by reading the
  live migration file.
- No service-role key appears anywhere in this milestone's code — every
  new file uses the caller's own RLS-scoped `SupabaseClient`, same as
  every pre-existing Tenant Connect surface.
- Uploads are scoped to the correct conversation (folder-prefix RLS,
  M10, unchanged) — verified by test that the upload path is prefixed
  with the actual conversation id created for that submission.

---

## Deferred items (confirmed untouched)

PropCrew company/person evolution, provider secure links, provider
marketplace/discovery, SMS (any), appointment scheduling, tenant
availability windows, quotes, repair authorizations, real-time
above-limit approval, Service Thread provider participation, AI local
cost estimates, autonomous diagnosis, autonomous vendor selection, rent
collection, Rent Follow-Up automation, Property Intelligence, Tenant
Turnover, lease builder, native mobile app, broad dashboard redesign,
video upload (documented blocker above), any cross-link/unification UI
between `tenant_requests` and `maintenance_requests` beyond what M1.1
already built automatically.

## Items for human/legal/safety review

- The urgent-guidance copy (`urgent.ts`) was written conservatively but
  has not been reviewed by anyone with actual safety/legal expertise —
  recommend a real review before this reaches real tenants, especially
  the electrical and gas guidance.
- The "Other" category's deterministic safety gate (a single upfront
  yes/no question) is a coarser net than the other categories' embedded
  triggers — worth a product decision on whether that's sufficient long
  term.
- Whether the "Tenant Requests" sub-tab should ever be relabeled or
  cross-linked to make "Tenant Connect" more discoverable (Phase A,
  Part C) is a product decision, not made here.
