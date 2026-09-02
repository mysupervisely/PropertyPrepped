# PROP ROSTER — Tenant Connect + Maintenance Coordination
## M1: Foundation Repair + Unified Maintenance Schema

Status: **foundation-only, not deployed, not merged.** This document is
the M1 record. The M0 architecture document
(`docs/tenant-connect-maintenance-coordination-m0.md`, branch
`claude/tenant-connect-maintenance-coordination-m0`) remains the
governing long-range design; nothing here supersedes it — this document
records what M1 actually built, why, and what it deliberately left for
later milestones.

Branch: `claude/tenant-connect-maintenance-m1-foundation`, based on
`origin/main` at `e5d198ca61f2738d5c147e99f2bfb5f8b7085c75` (unchanged
since M0 — verified via `git merge-base` before any work began).

---

## 1. The tenant_requests production gap

**Finding.** `supabase/milestone-24-tenant-connect-v1.sql` defines
`public.tenant_requests`, its two tenant-facing views
(`tenant_property_view`, `tenant_lease_view`), their backing
`SECURITY DEFINER` functions, and a full RLS policy set. The file's own
header states it was written and reviewed but never successfully applied
to production. Confirmed independently: `supabase/schema.sql` — the
"fresh install" file every other milestone is folded into — had zero
references to `tenant_requests` before this milestone
(`grep -n "tenant_requests" supabase/schema.sql` returned no matches on
the pre-M1 file).

Meanwhile, application code has shipped against this table
unconditionally the whole time: `components/tenant-connect/
TenantRequestsPanel.tsx`, `app/tenant/page.tsx`, `app/api/tenant-connect/
notify/route.ts`, and the owner-side `app/page.tsx` all query
`tenant_requests` directly. In production today, every one of those
reads/writes fails (the table doesn't exist) — Tenant Connect's
tenant-submitted-request feature has been silently broken since it
shipped.

**Why M24 wasn't simply run verbatim.** Two independent checks first:

- **Staleness.** Every column/table `milestone-24-tenant-connect-v1.sql`
  depends on (`leases.rent_due_day`, `user_subscriptions.plan`'s legacy
  values, `tenant_property_access`, `property_conversations`) still
  exists, unchanged, in the current schema. The design itself is not
  stale.
- **Category vocabulary.** M24's original `tenant_requests.category`
  CHECK used six display-string values (`'Plumbing'`, `'HVAC'`, etc.).
  The M1 brief specifies a different, stable, machine-readable taxonomy.
  Since `tenant_requests` has zero rows in production (it was never
  applied), this is the one and only moment that column's vocabulary can
  be set without a live-data migration.

Given that, re-running M24 verbatim would have meant either shipping
know-to-be-wrong category values (locking in a live-data migration for a
later milestone), or hand-patching the file in place and losing its
value as a historical record of the original design intent (which
`lib/tenant-connect/tenant-connect-v1-wiring.test.ts` also asserts
against directly, byte-for-byte).

**Remediation:** `supabase/milestone-24-tenant-connect-v1.sql` is
preserved **untouched**, byte-for-byte — both as the historical record
and because the wiring test depends on its exact text.
`supabase/milestone-25-maintenance-coordination-foundation.sql` is a
**new**, reconciled, forward-only migration that recreates the same
table/view/function design with the corrected category vocabulary, plus
new M2-compatibility scaffolding and an audit log (below).

## 2. Canonical maintenance-request model decision

Neither `maintenance_requests` (Milestone 6, landlord-only manual log,
may already hold real production rows) nor `tenant_requests`
(tenant-submitted, zero production rows) becomes canonical over the
other in M1. They represent genuinely different origins — a distinction
M24's own header comment already drew. Forcing a physical merge now
would mean either an in-place rewrite of a table that may hold real
landlord data for zero M1 application benefit, or inventing a new
unified table nothing reads or writes yet — both fail "minimal migration
risk" and "smallest coherent foundation."

**Decision:** `tenant_requests` is canonical for **tenant-submitted**
requests; `maintenance_requests` remains canonical for **landlord-logged**
requests. Whether a future milestone (M3, the natural landlord
command-center candidate) presents these as one unified inbox — via a
read-time view/union, or an eventual physical unification once real
usage patterns are known — is **left open as a product-owner decision**,
not decided here.

## 3. Schema changes (`supabase/milestone-25-maintenance-coordination-foundation.sql`)

All statements are additive/idempotent (`create table if not exists`,
`drop policy if exists` before `create policy`, `drop constraint if
exists` before `add constraint`), matching every prior milestone's
convention. Folded verbatim into `supabase/schema.sql` (the fresh-install
file) under a "Milestone 25" banner, replacing nothing that existed
before it — diffed against `origin/main`'s `schema.sql` to confirm zero
bytes changed anywhere before that new section.

- **Section A** — `public.tenant_requests`. Same shape as M24's design
  (property/owner/tenant_access/conversation FKs, immutable
  title/description/category/FKs after insert via a `BEFORE UPDATE`
  trigger, owner may change `status` only), new category CHECK:
  `heating_ac | plumbing | toilet | electrical | appliance | lock_door |
  leak_water | other`. RLS: tenant INSERT-only (never the owner — the
  owner's own logging path is the separate `maintenance_requests`
  table), owner SELECT/UPDATE(status-only), tenant SELECT own.
- **Section B** — `is_active_tenant_of_property()` /
  `is_active_tenant_of_lease()` (`SECURITY DEFINER`) and
  `tenant_property_view` / `tenant_lease_view` — identical column sets
  to M24's design, the only tenant read path to properties/leases (base
  tables carry zero tenant-facing SELECT policy).
- **Section C** (new, M2 scaffolding only) — `maintenance_intake_sessions`
  and `maintenance_intake_answers`. No M1 application code reads or
  writes either table. See §5.
- **Section D** (new) — `maintenance_audit_log`, append-only, written
  exclusively by a `SECURITY DEFINER` trigger on `tenant_requests`
  (`AFTER INSERT OR UPDATE`) — zero client-facing INSERT/UPDATE/DELETE
  policy at all. See §7.
- **Section E** (new, pre-existing bug fix) — `owner_has_tenant_connect()`
  plan-list correction. See §4.

**Explicitly not created**: `maintenance_access_windows`, any
appointment/quote/authorization table, a provider-token table, any
change to `maintenance_requests`, `property_contacts`, or
`property_contact_links`.

## 4. A second, pre-existing bug found and fixed: `owner_has_tenant_connect()`

This is **not** the tenant_requests gap. It's a separate, real,
currently-live bug this milestone's own hands-on RLS testing surfaced.

`public.owner_has_tenant_connect(uuid)` (Milestone 10, live in
production) gates every Tenant Connect write — inviting a tenant,
starting a conversation, posting a message. It's supposed to mirror
`lib/billing/entitlements.ts`'s `TENANT_CONNECT_ENABLED` map exactly (its
own header comment says so). It doesn't:

```
-- SQL (stale):      plan in ('portfolio', 'portfolio_pro', 'owner')
-- TS  (current):    manage: true, automate: true, portfolio: true,
--                    portfolio_pro: true, owner: true
```

`manage` and `automate` are the current, live Launch Pricing top-tier
plan names. The TS entitlement layer already grants them Tenant Connect
(and the frontend UI reflects that); the SQL function does not. **Today,
in real production, a landlord on the current "Manage" or "Automate"
plan sees Tenant Connect enabled in the app, but every actual database
write — inviting a tenant, starting a conversation, posting a message —
is silently rejected by RLS.**

This was found, not guessed: this milestone's RLS test fixture
(`supabase/tests/milestone-25-rls.test.sql`) deliberately used
`plan = 'manage'` — the real current plan — rather than copying
`milestone-24-rls.test.sql`'s fixture, which happens to use the legacy
`'portfolio'` value and so never exercises this path. Running the new
test against a real local Postgres instance loaded from the full
`supabase/schema.sql` reproduced the failure directly (`new row violates
row-level security policy for table "property_conversations"` on a plan
the app itself treats as fully entitled).

**Fix (Section E):** `create or replace function
public.owner_has_tenant_connect(...)`, extending the plan list to
`('portfolio', 'portfolio_pro', 'owner', 'manage', 'automate')` — an
exact match to the existing, unchanged TS map. This grants nothing new
(those owners are already billed and told they have Tenant Connect); it
only makes the database agree. Framed as a correction, not new scope —
the M1 brief's own "reuse the existing entitlement architecture unless
the audit demonstrates a concrete technical reason not to" clause, with
the concrete reason being this reproducible failure.

Also added, for internal consistency and matching the existing
downgrade-safety pattern `property_messages_insert` already uses: an
`owner_has_tenant_connect(owner_id)` re-check in
`tenant_requests_insert_tenant`'s `WITH CHECK` (M24's original design
omitted this) and in both new `maintenance_intake_*_insert_tenant`
policies.

## 5. RLS / security model

Verified two ways: static line-by-line review, and a real local Postgres
16 run — the full `supabase/schema.sql` (all milestones, 3433 lines)
loaded with **zero errors**, then `supabase/tests/milestone-25-rls.test.sql`
run against it inside a rolled-back transaction (no state persisted).
Result: **19/19 PASS assertions across 8 sections, zero REGRESSION, zero
unexpected ERROR.**

Sections covered (fixture prefix `251`/`252`, deliberately distinct from
M24's `241` prefix so both files can run in the same session):

1. New category vocabulary accepted; old M24 vocabulary rejected.
2. Cross-tenant and cross-owner isolation on `tenant_requests`.
3. Owner update is status-only — category/title stay locked.
4. `maintenance_intake_sessions`/`answers` — tenant create/read own,
   forged-FK rejection, cross-tenant denial, owner read-only,
   append-only answers.
5. `maintenance_audit_log` — auto-write on both INSERT and UPDATE
   triggers, direct client INSERT/UPDATE rejection, cross-owner
   isolation.
6. Revoked tenant denied.
7. Anonymous and unrelated-signed-in-user denial across every new table.
8. Tenant-private-data isolation re-verified (base tables + view column
   exclusion) — unchanged from M24's own design.

**Tenant access model:** a tenant can read/write only `tenant_requests`
rows tied to their own `Active` `tenant_property_access` row; the
matching `tenant_access_id`/`property_id`/`conversation_id` triple is
re-verified in the INSERT policy itself (scalar-subquery equality, not
bare-column EXISTS, to avoid column-shadowing bugs — the same pattern
M24 established). No path exists from a tenant session to another
tenant's request, another property, landlord financial data, PropCrew
contacts, or any private landlord document — none of those tables
changed, and the new tables' RLS never references them.

**Landlord access model:** an owner sees only requests where
`owner_id = auth.uid()`, and can only ever change `status` (locked by a
`BEFORE UPDATE` trigger that force-restores every other column,
regardless of what the UPDATE statement sent).

**Cross-account/property isolation:** explicitly tested (test sections
2, 5e, 7b) and passing — a signed-in user with no ownership/tenancy
relationship reads zero rows anywhere this migration adds.

**Provider access:** none exists. No provider-facing policy, role, or
token table was added — per the M1 brief, this is deliberately deferred
to M5.

**Service role:** untouched. No new service-role bypass was added; the
only privilege escalation introduced is the existing `SECURITY DEFINER`
pattern already used throughout the schema (`is_active_tenant_of_*`,
`owner_has_tenant_connect`), applied the same way to
`maintenance_audit_log_write()`.

## 6. Maintenance access windows — deferred

Per the brief's own conditional ("if... required to avoid later
migration churn, it may be created now"): **not created in M1.** No
structural reason requires it before M2 actually consumes it, and
creating it now would add a table nothing reads or writes, which is
exactly the "prematurely build" pattern the brief warns against
elsewhere. Left for M2, with the explicit constraint (already recorded
in the M0 document and repeated here) that it must represent
tenant-provided availability/preference only — never legal right of
entry, statutory notice compliance, waiver, or automatic provider
authorization.

## 7. Category taxonomy

`lib/maintenance/categories.ts` (new) — the single source of truth:
stable, machine-readable ids (`heating_ac`, `plumbing`, `toilet`,
`electrical`, `appliance`, `lock_door`, `leak_water`, `other`), separate
`{id, label}` pairs, a `maintenanceCategoryLabel()` lookup that never
throws (falls back to the raw id for an unrecognized value), and a
`isMaintenanceCategoryId()` type guard. `lib/tenant-connect/types.ts`
re-exports these under their original names
(`TENANT_REQUEST_CATEGORIES`/`TenantRequestCategory`) so no existing
import site needed restructuring beyond the category *values*
themselves. `lib/maintenance/categories.test.ts` includes a direct
cross-check that the TS id list exactly matches the SQL migration's
CHECK constraint text, so the two can never silently drift.

No category-specific intake trees were built — the taxonomy is data
only.

## 8. Resolved-during-intake preparation

`maintenance_intake_sessions.outcome` (`resolved_in_intake |
escalated_to_dispatch | escalated_urgent | abandoned`) is where this
fact will live once M2 ships real intake. `tenant_requests.status`
itself is deliberately **unchanged** (`New | In Progress | Resolved`,
same three values as M24) — no `'Urgent'` value was added, since no M1
code path would ever set it, and adding an enum value nothing writes
yet is exactly the same "prematurely build" pattern being avoided.
`escalated_urgent` on the session's `outcome` column already satisfies
the brief's literal requirement to "make room to store... urgent/safety
escalation outcome" without that asymmetry.

`maintenance_intake_answers.safety_class` (`safe_observation |
safe_simple_action | professional_diagnosis_required |
urgent_escalation`) mirrors the M0 architecture's four-way safety
classification (§6.1/§7 of the M0 document) per-answer, so a future
audit of "did we ever ask a tenant to do something unsafe" is a real,
queryable question.

No M1 application code writes to either table — this is pure schema
scaffolding for M2, gated behind RLS that already enforces the same
tenant-owns-this-request boundary as `tenant_requests` itself (verified
in RLS test section 4).

**One explicit hardening item flagged for M2, not fixed here**:
`maintenance_intake_sessions_update_tenant` is not column-locked by an
immutable-fields trigger the way `tenant_requests` is, because no code
writes here yet in M1 — there's no live behavior to lock down. M2 should
add that trigger (locking everything except `completed_at`/`outcome`)
before shipping the real intake UI.

## 9. Maintenance-history canonical-record recommendation

Restated from the M0 architecture, scoped to M1: **no implementation in
M1, no data model added.** The M0 document's `maintenance_records`
concept (property-history "this happened on this property" ledger) and
a closed `tenant_requests`/`maintenance_requests` row are not the same
thing — a request is a workflow instance with its own lifecycle; a
maintenance-history record is a durable, retrospective fact about the
property.

**Recommendation for the future milestone that implements this** (not
decided or built here): **(B)** — closure of a maintenance coordination
request should *generate/reference* a separate durable history record,
not treat the request row itself as the permanent historical artifact.
Reasoning: a request row is optimized for RLS around one active tenancy
and one owner and carries workflow-shaped columns (`status`,
`tenant_access_id`, conversation linkage) that don't belong in a
property's permanent record once the tenancy that generated them has
ended; a property's maintenance history needs to survive tenant
turnover, RLS scoped to *property* rather than *tenancy*, and a shape
matching whatever `maintenance_records`/property-history convention
already exists elsewhere in the schema. This avoids two canonical
copies of the same fact and keeps `tenant_requests` free to stay
workflow-shaped. No table was created for this in M1 — flagged as an
open design item for whichever milestone actually implements request
closure behavior.

## 10. Entitlements

Maintenance Coordination is treated as part of Tenant Connect for V1, as
directed. No new plan, no new billing entitlement was introduced.
`owner_has_tenant_connect()` gates every new write the same way it
already gates `property_conversations`/`property_messages` — the one
change made (§4) is a correction to match entitlements that already
exist in the TS layer, not a new entitlement.

## 11. TENANT_CONNECT_FROM_EMAIL audit

- **Expected by app code:** yes — `lib/tenant-connect/notify.ts`'s
  `isTenantConnectEmailConfigured()` requires both `RESEND_API_KEY` and
  `TENANT_CONNECT_FROM_EMAIL` to be set before any Tenant Connect email
  is sent.
- **Repo/deployment evidence of configuration:** `.env.example` lists
  `TENANT_CONNECT_FROM_EMAIL` **commented out** (an example/placeholder
  value, not an active default). No other repo file sets or references
  a real value — deployment environment variables themselves are not
  and should not be present in this repository, so this audit cannot
  and does not confirm whether the variable is actually set in
  production; only that the code path expects it and the repo shows no
  evidence either way beyond the example file.
- **Behavior if absent:** safe no-op. `sendTenantConnectEmail()` returns
  `{ sent: false, reason: 'not_configured' }`, logs server-side only,
  and never throws — the underlying DB write (invite, request, status
  update) always completes first and is never rolled back by an email
  failure. This is the same non-throwing contract as
  `lib/realtor-leads/notify.ts`.
- **Hardening needed:** none identified. The existing gated,
  non-throwing pattern already handles "unset" safely; this milestone
  did not add any new email send path (`buildNewRequestEmail()` was
  changed only to convert the category id to its display label before
  interpolation — see `lib/tenant-connect/notify.test.ts`'s new negative
  assertion that the raw machine id never reaches recipient-facing
  copy).
- No secret value was read, invented, or written anywhere in this
  milestone.

## 12. Phone / SMS / AI cost guidance — recorded, not implemented

No code changes in any of these areas. Recorded per the brief:

- **Phone/masked calling:** V1 must avoid masked-call infrastructure;
  any future phone-number exposure must be deliberate and
  permission-aware; future architecture must leave room for
  masked/call-routing without committing to a vendor now. Nothing in
  M1's schema forecloses this — no phone column was added anywhere.
- **SMS:** vendor selection deferred to the future notification
  milestone. No SMS infrastructure exists anywhere in this codebase; no
  vendor (Twilio or otherwise) is assumed or referenced in any code
  added this milestone.
- **AI cost guidance:** deferred; no external pricing provider was
  selected or integrated.

## 13. Provider token — product-owner direction recorded for M5

Not implemented. Recorded, per the brief, for the milestone that
eventually builds provider access: request-scoped; hashed at rest;
revocable; regeneratable; expiring (~7 days target, subject to M5's own
review); never grants access to the full landlord/property account.

## 14. Existing-behavior compatibility

- **Tenant Connect (M10):** `tenant_property_access`,
  `property_conversations`, `property_messages`,
  `property_message_attachments`, `property_conversation_reads` — zero
  bytes changed (confirmed by diffing `schema.sql` against
  `origin/main` up to the pre-M25 boundary: identical except trailing
  whitespace before the new section). The one behavioral change,
  `owner_has_tenant_connect()`'s plan list, is a `create or replace`
  **fix**, not a structural change to any of these tables/policies —
  and it can only ever let a currently-blocked write through; it cannot
  newly deny anything that worked before.
- **Maintenance (M6) — `maintenance_requests`:** untouched. No column,
  policy, or trigger changed. `assigned_contact_id` (nullable FK to
  `property_contacts`) remains exactly as it was.
- **PropCrew (M6/M11) — `property_contacts`,
  `property_contact_links`, `propcrew_contact_id`:** untouched. Nothing
  in this migration references or alters any of these tables. The new
  taxonomy/audit-log/intake tables carry no FK to PropCrew.
- **Invite/accept flow (`accept_tenant_invite()`):** untouched —
  unchanged in `schema.sql`, not referenced by any new object.
- **Attachments/read markers (`property_message_attachments`,
  `property_conversation_reads`):** untouched, same as above.

## 15. Migration safety review

Answered for every schema change in
`supabase/milestone-25-maintenance-coordination-foundation.sql`
(Sections A–E), since none has been applied to production:

1. **Could this destroy existing production data?** No. Every statement
   is `create table if not exists` / `create or replace function` /
   `drop policy if exists` + `create policy`. Nothing drops a table,
   drops a column, or narrows a CHECK constraint on a table that could
   hold rows. `tenant_requests` never existed in production, so its
   CHECK constraint choice carries zero live-data risk.
2. **Could it lock users out of existing Tenant Connect?** No — the only
   change to an existing, live object is `owner_has_tenant_connect()`,
   and the change strictly *widens* the accepted plan list (adds
   `manage`/`automate`; removes nothing). No existing caller that
   currently passes can newly fail.
3. **Could it expose tenant data across properties/accounts?** No —
   verified by both static policy review and a real RLS test run (§5)
   with explicit cross-tenant/cross-owner/anonymous denial assertions,
   all passing.
4. **Could deployment ordering create a period where production code
   references missing schema?** Only if applied — and it has not been.
   If/when this is deployed: applying this migration is what makes the
   already-shipped, currently-failing application code start working;
   there is no ordering hazard the other direction (deploying the SQL
   first is safe even before any app-code change, since no application
   code changed shape in this milestone — the TS types were only
   narrowed from a generic string union to the same values with a
   machine-readable spelling).
5. **Is rollback possible at the application level if deployment
   fails?** Yes for Sections A–D — the file's own header documents the
   exact reverse-order `drop` sequence. Section E (the entitlement fix)
   is deliberately excluded from that rollback list — reverting it would
   re-introduce the live Manage/Automate-plan bug, not undo new scope;
   if a rollback of A–D is ever needed, Section E's `create or replace`
   should be left applied on its own.
6. **Does any change require manual production intervention?** No.
   Every statement is a normal, idempotent DDL statement runnable
   through the same migration path as every prior milestone.

**No material risk identified.** Nothing in this migration was applied
to any live database — see §16.

## 16. Deferred items (confirmed untouched in M1)

SMS, AI cost guidance, provider discovery, provider secure links,
quotes, scheduling, owner authorization UI, Service Thread provider
participation, Tenant Turnover, Lease Builder, native apps, marketplace
functionality, payments, `maintenance_access_windows`, guided intake UI
/ troubleshooting trees, provider tokens, PropCrew company/person
evolution (M4). None of these has any code, schema, or documentation
change in this branch beyond the M0 document's own prior mentions.

## 17. Legal / security items still requiring future review

- Tenant availability windows (`maintenance_access_windows`, once built
  in M2) must be reviewed against applicable landlord-entry notice law
  before any UI implies scheduling authority from a tenant-submitted
  window.
- Provider token exposure model (M5) needs an explicit security review
  once request-scoped tokens are actually implemented — the ~7-day
  expiry target is a starting point, not a final decision.
- Phone-number/masked-call exposure (deferred) needs a deliberate
  permission model before any real phone number is ever surfaced to a
  provider.
- Whether `TENANT_CONNECT_FROM_EMAIL` is actually configured in the live
  production environment could not be verified from this repository and
  should be confirmed by whoever has deployment access, separately from
  this milestone.

## 18. Deployment sequencing (if/when authorized — not done in M1)

1. Apply `supabase/milestone-25-maintenance-coordination-foundation.sql`
   to production (creates `tenant_requests` + views/functions + intake
   scaffolding + audit log, and fixes `owner_has_tenant_connect()`).
   Safe to apply on its own — no application code deploy is required
   alongside it, since the currently-deployed frontend already expects
   this exact table/column shape (it was just missing).
2. No further ordering constraint exists — the frontend does not need a
   simultaneous redeploy, because nothing in the currently-deployed
   frontend changed shape; it was already coded against `tenant_requests`
   and the original six-value category strings would only appear from
   a UI that itself hasn't shipped a selector for them (the shipped
   `app/tenant/page.tsx` on `origin/main`, prior to this branch, does
   not yet exist — confirmed: this branch is the first to touch that
   file's category selector).
3. This migration was **not** applied to production as part of M1 —
   explicit product-owner authorization is required first.

## 19. Recommended M2 starting point

Guided Maintenance Intake, built directly on the Section C scaffolding
already in place: `maintenance_intake_sessions` /
`maintenance_intake_answers` exist and are RLS-correct; M2's job is the
actual intake tree content/UI, wiring the session's `outcome` to
`tenant_requests` (e.g., auto-setting status or triggering the
landlord-facing "resolved in intake" affordance), and adding the
immutable-fields trigger on `maintenance_intake_sessions` flagged in §8
before any real write path ships.

## 20. Product-owner decisions genuinely required before M2

- Whether/how `maintenance_requests` and `tenant_requests` should ever
  present as one unified landlord inbox (§2) — read-time view/union vs.
  eventual physical merge, and when.
- The maintenance-history canonical-record approach (§9) — confirm or
  revise the (B) recommendation before any milestone implements request
  closure behavior.
- Confirmation that `TENANT_CONNECT_FROM_EMAIL` is (or will be) actually
  set in the production environment, since M1 cannot verify this from
  the repository.
- Authorization to actually apply
  `supabase/milestone-25-maintenance-coordination-foundation.sql` to
  production (separate from, and required before, any M2 work that
  depends on `tenant_requests` existing there).
