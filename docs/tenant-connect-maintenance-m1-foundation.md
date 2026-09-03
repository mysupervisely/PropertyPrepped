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

---

# M1.1 ADDENDUM — Canonical Maintenance Case + Safe Production Integration

Everything above this line is the original M1 record, preserved
unchanged. This addendum documents M1.1, which resolved the one open
item M1 explicitly deferred (§2, §20): whether `maintenance_requests`
and `tenant_requests` should ever unify.

Branch: `claude/tenant-connect-maintenance-m1-1-integration`, based
directly on M1's own tip (`cc1e770`) — main had not advanced beyond
`e5d198c` since M0/M1, so M1.1 branches from M1 itself rather than a
fresh `origin/main` checkout, preserving M1's history exactly.

## A1. The product-owner decision

A broken AC is one maintenance case regardless of who reported it — the
source of a request is metadata, not a reason to run two permanent
maintenance coordination engines. `public.maintenance_requests` becomes
the single canonical maintenance case; `public.tenant_requests` becomes
the tenant's own intake/submission record, linked 1:1 to the case it
creates. No third maintenance entity was introduced.

## A2. Why `maintenance_requests`, not `tenant_requests`, is the case

Repository-audit-driven, not naming preference:

1. `maintenance_requests` already carries a real case lifecycle
   (`priority`, a 4-state `status` machine: Submitted/Scheduled/In
   Progress/Completed) that predates this milestone and is already
   read/written by the landlord dashboard (`app/page.tsx`) today.
2. `maintenance_requests.assigned_contact_id` (Milestone 11) is already
   a live FK to `property_contacts` (PropCrew) — exactly the future
   provider-assignment anchor this milestone needed, already built and
   unused, waiting for this.
3. `maintenance_requests` may already hold real production data (live
   since Milestone 6); `tenant_requests` has zero rows anywhere.
   Pointing the empty new table at the already-populated one is
   strictly lower-risk than the reverse.
4. The landlord's existing maintenance list (`app/page.tsx`) already
   queries every `maintenance_requests` row it owns. A tenant-originated
   case appears there automatically — zero new landlord UI required in
   this milestone.

## A3. Final role of `maintenance_requests`

Canonical maintenance case for every origin (tenant and landlord alike).
Gains one additive column (`source text not null default 'landlord'
check (source in ('tenant', 'landlord'))`) and one narrowed INSERT
policy (`and source = 'landlord'`, closing the "landlord hand-crafts a
row claiming source=tenant" gap — cosmetic-only, since no shipped UI
ever sent `source` and no code trusts it for privilege decisions).
Every pre-existing column, row, and the DELETE/UPDATE policies are
byte-for-byte unchanged. `assigned_contact_id` (future provider
assignment) needed no change — it already exists.

## A4. Final role of `tenant_requests`

Tenant-safe intake/submission record — unchanged in every respect from
M1 except one new column, `maintenance_request_id`, and one line added
to the pre-existing `tenant_requests_lock_immutable_fields()` trigger to
lock it. The tenant never gains any privilege on `maintenance_requests`
itself, at any level — every effect on that table happens exclusively
inside the new `SECURITY DEFINER` trigger.

## A5. Relationship / linkage

`tenant_requests.maintenance_request_id` (FK, `on delete restrict`,
backed by a `UNIQUE` index) — set exclusively by a new `BEFORE INSERT`
trigger, `tenant_requests_create_maintenance_case()`. The trigger:

1. Derives `tenant_name`/`tenant_email` server-side from the caller's
   own active `tenant_property_access` row (joined to `leases` for the
   name when a lease is linked) — never client-supplied.
2. Inserts exactly one new `maintenance_requests` row
   (`source = 'tenant'`, `status = 'Submitted'`, `priority = 'Normal'`,
   title/description copied from the submission) in the SAME statement
   as the `tenant_requests` insert.
3. Sets `NEW.maintenance_request_id` to the freshly created case's id
   before the row is ever written or RLS-checked.

This is fully transactional by construction — no RPC, no client-side
multi-step sequencing, no window where a `tenant_requests` row exists
without its case (or vice versa). Verified hands-on in
`supabase/tests/milestone-26-rls.test.sql` §1.

## A6. Duplicate-case prevention

Structural, not conventional: the trigger fires exactly once per
`tenant_requests` INSERT statement, and a UNIQUE index on
`tenant_requests.maintenance_request_id` makes two submissions ever
sharing one case physically impossible. Verified hands-on (§2 of the new
test — confirms the index is real, and that two distinct submissions
get two distinct cases). "Duplicate" at the human level (a tenant
submitting the same real-world issue twice) is a UX/product concern
(e.g. a debounced submit button), explicitly out of scope — M1.1 builds
no intake UI.

## A7. Tenant/landlord privilege boundary (unchanged from M1's model, extended)

The tenant still never touches `maintenance_requests` directly, at any
privilege level — verified explicitly (§3 of the new test: a tenant's
direct `SELECT` against their own linked case returns zero rows). The
landlord reads a tenant-originated case through the SAME, unmodified
`maintenance_requests_select_own` policy that has existed since
Milestone 6 (§4). Cross-property and cross-owner isolation re-verified
for both tables together (§8). Anon and unrelated-signed-in-user denial
re-verified (§9).

## A8. Entitlement verification

Traced `lib/billing/plans.ts`'s canonical `PlanId` union
(`'free' | 'organize' | 'manage' | 'automate' | 'investor' | 'portfolio'
| 'portfolio_pro' | 'owner'`) and `lib/billing/entitlements.ts`'s
`TENANT_CONNECT_ENABLED` map and `ENTITLED_STATUSES` set
(`'active', 'trialing', 'past_due'`) directly, byte-for-byte, against
`owner_has_tenant_connect()`'s current body (fixed in M1). Confirmed —
not assumed — that the plan list `('portfolio', 'portfolio_pro',
'owner', 'manage', 'automate')` exactly matches every plan the TS map
marks `true`, with every `false` plan correctly excluded. No further
change was needed or made to `owner_has_tenant_connect()` in M1.1.

Added a genuinely new, hands-on negative case beyond M1's own
verification: a Free-plan owner with **no `user_subscriptions` row at
all** — the exact "brand-new Free account that has never touched
Stripe" scenario the function's own comment describes — correctly
blocks their tenant from even starting a conversation, let alone
submitting a request (§10 of the new test). This is a different failure
mode than M1's fix (a legacy-vs-current plan NAME mismatch); this
confirms the "no row" path independently.

## A9. Where future concepts attach (documented, none built here)

Anchored to the canonical case (`maintenance_requests.id` — lifecycle
concerns independent of origin): future provider assignment
(`assigned_contact_id`, already exists), future appointments, quotes,
owner authorizations, and Service Thread provider-participation events
— each its own future table with a `maintenance_request_id` FK, never
columns bolted onto `maintenance_requests` itself, never one shared
status enum.

Anchored to the tenant's own intake record (`tenant_requests.id` —
source-specific, tenant-only concepts a landlord-reported case will
never have): guided-intake sessions/answers (already anchored here since
M1, unchanged); future tenant-provided availability
(`maintenance_access_windows`, still not created — no structural need
yet) should key off `tenant_requests.id`/`tenant_access_id`, reachable
from the case only transitively through `maintenance_request_id`.

## A10. Maintenance-history strategy (confirmed, not re-decided)

`public.maintenance_records` (Milestone 6) already exists as the
property's durable, completed-service ledger — a separate, already-built
concept from the active case. This confirms M1's own (B) recommendation
by the existing table's mere presence: closure of a `maintenance_requests`
case should eventually generate/reference a `maintenance_records` row,
not treat the case row itself as the permanent historical artifact. Not
implemented in M1.1 — no code writes that linkage yet, and
`maintenance_records` gains no new column here — flagged for whichever
milestone actually builds request-closure behavior.

## A11. Status-machine independence (re-affirmed)

`tenant_requests.status` (tenant-facing: New/In Progress/Resolved) and
`maintenance_requests.status` (case lifecycle:
Submitted/Scheduled/In Progress/Completed) remain two separate, narrow
state machines — no giant unified enum was built, per M0's own
principle, re-affirmed by the M1.1 brief. Whether/how they should ever
sync (e.g. a case marked Completed flips the tenant's own request to
Resolved) is an open product question for whichever milestone builds the
landlord-review experience — not decided or implemented here.

## A12. Schema changes (`supabase/milestone-26-canonical-maintenance-case.sql`)

- `maintenance_requests`: `+ source text not null default 'landlord'
  check (source in ('tenant', 'landlord'))`, an index on it, and a
  narrowed `maintenance_requests_insert_own` WITH CHECK.
- `tenant_requests`: `+ maintenance_request_id uuid references
  maintenance_requests(id) on delete restrict` (nullable at the DB
  level — see A14), a UNIQUE index, and a plain index.
- New function + trigger: `tenant_requests_create_maintenance_case()`
  (`SECURITY DEFINER`, `BEFORE INSERT` on `tenant_requests`).
- `create or replace` of `tenant_requests_lock_immutable_fields()`
  (Milestone 25's own function) adding one line to lock the new column.

Folded verbatim into `supabase/schema.sql` under a "Milestone 26"
banner — diffed against M1's own `schema.sql` to confirm zero bytes
changed anywhere before that new section (pure append).

## A13. Application changes

- `lib/maintenance/source.ts` (new) — the `MaintenanceRequestSource`
  vocabulary (`'tenant' | 'landlord'`), mirroring
  `lib/maintenance/categories.ts`'s established pattern, with a test
  that cross-checks its values against the SQL CHECK constraint's exact
  text.
- `lib/tenant-connect/types.ts` — `TenantRequest` gains
  `maintenance_request_id: string | null`.
- No UI changes. The landlord's existing maintenance list
  (`app/page.tsx`) requires no code change to start showing
  tenant-originated cases — it already selects every `maintenance_requests`
  row it owns.

## A14. Why `maintenance_request_id` is nullable at the DB level

Despite being logically required for every row inserted through the
normal path (the trigger always sets it), the column is deliberately
**not** `NOT NULL`. This is a conservative deployment-safety choice: if
this migration is ever applied some time after `milestone-25` rather
than in the same operation, any `tenant_requests` row created in that
gap would predate this trigger and would otherwise make a `NOT NULL`
constraint fail the whole migration. The UNIQUE index still fully
prevents two `tenant_requests` rows from ever sharing one case
regardless (Postgres unique indexes permit multiple `NULL`s). See A16
for why this gap is expected to be empty in practice.

## A15. `ON DELETE RESTRICT` — a deliberate, tested behavior change

A landlord can no longer delete a `maintenance_requests` case that has a
linked `tenant_requests` row (verified: §7a of the new test — rejected
with `foreign_key_violation`). A purely landlord-created case (no linked
`tenant_requests` row) remains exactly as deletable as it always was
(§7b). This is a deliberate protection — a landlord cannot silently
erase a tenant's own submission history — consistent with the
retire-via-status/append-only ethos already established elsewhere in
this schema (`tenant_requests` itself has no DELETE policy at all).

## A16. Migration safety review

1. **Could this destroy existing production data?** No. Every
   statement is additive (`add column if not exists`, `create or
   replace function`, `drop policy if exists` + `create policy`,
   idempotent constraint/index creation). `source`'s `NOT NULL DEFAULT
   'landlord'` backfills every existing `maintenance_requests` row
   automatically and correctly (all pre-M1.1 rows are landlord-logged,
   since `tenant_requests` never existed before M1) — no `UPDATE`
   statement touches any existing row.
2. **Could this modify existing maintenance records unexpectedly?** No
   — no existing column's value or meaning changes; the only new
   behavioral change (`ON DELETE RESTRICT`, A15) only ever affects a
   case that gains a `tenant_requests` link *after* this migration —
   impossible for any pre-existing row today.
3. **Could it expose tenant data?** No — verified explicitly (§8 of the
   new test, cross-property and cross-owner).
4. **Could it expose landlord-private data?** No — the tenant gains
   zero privilege on `maintenance_requests` at any level (§3).
5. **Could it break existing Tenant Connect?** No — `milestone-25`'s
   full RLS suite re-run after this migration still passes 19/19 with
   zero regressions (re-verified hands-on, not assumed).
6. **Could it break existing PropCrew?** No — `property_contacts` /
   `property_contact_links` / `assigned_contact_id` are untouched by
   this file.
7. **Could it break existing landlord maintenance records?** No — see
   1/2 above; `maintenance_requests_select_own` /
   `_update_own` / `_delete_own` are byte-for-byte unchanged, and
   `_insert_own`'s narrowing cannot reject any request a real landlord
   client has ever sent (none has ever set `source`).
8. **Could deployment ordering create an application/schema mismatch?**
   Only if this file and `milestone-25` are deployed apart — see A17.
   Deployed together (as recommended), there is no intermediate window:
   `tenant_requests` and its case-linkage exist simultaneously from the
   application's perspective, with no application code change required
   at all (the frontend already only ever inserts into `tenant_requests`
   directly; the case row is entirely server-derived).
9. **Is application rollback possible if deployment fails?** Yes — see
   this file's own header's rollback section; every statement has a
   documented reverse.
10. **Does anything require destructive SQL?** No.
11. **Does anything require manual production intervention?** No, as an
    additive migration — but see A17/A18 for whether this session is
    authorized/equipped to actually run it.

**No material risk identified.**

## A17. Deployment sequencing

**Recommended: apply `milestone-25-maintenance-coordination-foundation.sql`
and `milestone-26-canonical-maintenance-case.sql` together, in the same
operation.** Both are additive/idempotent, so applying them as one
combined script (or two scripts run back-to-back with no real traffic
in between) removes any question of an intermediate window. Since
`tenant_requests` itself has never existed in production, there is no
existing tenant traffic that could hit the gap A14 describes — the
gap is only a theoretical concern if the two files are deliberately
deployed apart with real usage in between, which is not the plan.

No application code deploy is required alongside either file: the
currently-deployed frontend already expects `tenant_requests` to exist
in exactly this shape (it was simply missing); this milestone's own
`lib/tenant-connect/types.ts` change is a type-level addition only,
compiled into whatever frontend build is deployed whenever that
normally happens — not a hard dependency of the migration itself.

## A18. Production migration status — NOT APPLIED

**This session has no established, authorized tooling to apply a
migration to the production database.** Verified before considering
any production action: no `netlify.toml`, no Supabase CLI
configuration directory, no CI/CD workflow files
(`.github/workflows/`) in this repository, and no
`SUPABASE_*`/`DATABASE_URL`-shaped environment variables present in
this session's environment. There is no safe, authorized path in this
session to execute SQL against the production database at all — not a
risk judgment call, a plain absence of access/tooling.

Per the milestone's own explicit instruction ("If production migration
cannot be safely applied using established authorized project tooling:
STOP. Do not pretend it was deployed. Report the exact manual step
required."), **no production SQL was run, and no deploy occurred.**

**Exact manual step required**, if/when a human with production
Supabase access authorizes this: apply
`supabase/milestone-25-maintenance-coordination-foundation.sql` followed
immediately by `supabase/milestone-26-canonical-maintenance-case.sql`
(or the two concatenated into one script) via the project's normal
Supabase migration path (Supabase Studio's SQL editor, or `supabase db
push`/the CLI against the linked project — whichever this project
normally uses; this session found no repository evidence of which one
that is, since no Supabase CLI config or CI workflow exists in the
repo). No separate application deploy is required (A17).

## A19. Production smoke test — not performed

Not applicable — no deployment occurred (A18), so there is nothing new
to smoke-test in production. The full local-Postgres verification (A16
items 5-7, and the complete `milestone-26-rls.test.sql` run, A20 below)
is the closest verification this session could safely and honestly
perform without production access.

## A20. Tests added / results

- `lib/maintenance/source.ts` + `lib/maintenance/source.test.ts` (3
  tests: exact vocabulary, guard function, cross-check against the SQL
  CHECK constraint text).
- `supabase/tests/milestone-26-rls.test.sql` (new) — 15 PASS assertions
  across 10 sections, run against a real local Postgres 16 instance
  loaded from the complete `schema.sql` (M1 through M1.1, 3771 lines,
  zero load errors), inside a rolled-back transaction (verified 0 rows
  left behind in either `maintenance_requests` or `tenant_requests`
  afterward). Zero REGRESSION lines, zero unexpected ERROR lines.
- `supabase/tests/milestone-25-rls.test.sql` re-run, unmodified, against
  the same M1.1-updated schema — still 19/19 PASS, zero regressions,
  confirming M1.1 did not disturb M1's own behavior.
- `supabase/tests/milestone-24-rls.test.sql` re-run — still exactly
  10/10 of its category-vocabulary-independent assertions pass (the
  same expected, documented incompatibility from M1 remains and is
  unchanged by M1.1).
- Full JS/TS suite: 73 files / 1070 tests (1067 carried over + 3 new),
  all passing.
- `npx tsc --noEmit`: clean.
- `npm run build`: succeeds, all 31 routes.
- No lint script exists in this repository (`package.json` defines
  `dev`/`build`/`start`/`test` only) — confirmed accurately, not
  assumed.

## A21. Deferred items confirmed untouched in M1.1

Per this milestone's explicit scope list: no guided maintenance UI, no
intake trees, no AI troubleshooting/cost guidance, no external pricing
research, no SMS (inbound or outbound), no provider secure links,
accounts, or discovery, no quotes, no scheduling, no owner-authorization
UI, no Service Thread provider participation, no native apps, no Tenant
Turnover, no Lease Builder, no payments/rent collection, no marketplace,
no smart locks, no masked calling. Also confirmed untouched, per the
interrupting product-direction discussion's own explicit carve-out:
Property Intelligence, dynamic cap-rate functionality, financial trend
functionality, Rent Follow-Up, scheduled rent reminders — none of these
has any code, schema, or documentation change in this branch.

## A22. Open items for M2 (and beyond)

- Whether/how `tenant_requests.status` and `maintenance_requests.status`
  should ever sync (A11) — left for the milestone that builds the
  landlord-review experience.
- Request-closure → `maintenance_records` linkage (A10) — left for
  whichever milestone builds closure behavior.
- Production migration authorization and execution (A18) — a human with
  Supabase production access must run the two migration files via this
  project's actual Supabase deployment path (not discoverable from this
  repository).
