# Tenant Connect + Maintenance Coordination — M0 Architecture

**Status:** Architecture / product-design only. Nothing in this document has been implemented. No migration has been run. No production behavior has changed.

**Branch:** `claude/tenant-connect-maintenance-coordination-m0`
**Base:** `origin/main` @ `e5d198ca61f2738d5c147e99f2bfb5f8b7085c75`
**Supersedes:** an earlier, less detailed M0 prompt in this same working session. That earlier prompt was **not executed** — no branch, file, or code exists from it. This document is the only M0 deliverable.

**Product principle carried through this whole document:**
> "Tenant reports it. PropRoster helps get it resolved." — PropRoster automates *coordination*, not *relationships*. The landlord remains in control of every consequential decision (provider selection, contacting an outside party, approving a quote, authorizing spend) unless a future, explicitly configured automation rule says otherwise. Human-to-human conversation (a phone call) must always remain easy, with its outcome captured back into the system afterward.

---

## Table of contents

1. [Current-state audit](#1-current-state-audit)
2. [Existing reusable architecture](#2-existing-reusable-architecture)
3. [Current gaps](#3-current-gaps)
4. [Product principles](#4-product-principles)
5. [Actors / roles](#5-actors--roles)
6. [Guided Maintenance Intake architecture](#6-guided-maintenance-intake-architecture)
7. [Safety model](#7-safety-model)
8. [Tenant availability model](#8-tenant-availability-model)
9. [Structured request model](#9-structured-request-model)
10. [AI cost-guidance architecture](#10-ai-cost-guidance-architecture)
11. [Owner pre-authorization model](#11-owner-pre-authorization-model)
12. [PropCrew selection](#12-propcrew-selection)
13. [Provider outreach](#13-provider-outreach)
14. [Provider secure-link model](#14-provider-secure-link-model)
15. [Scheduling](#15-scheduling)
16. [Professional diagnosis](#16-professional-diagnosis)
17. [Quote model](#17-quote-model)
18. [Real-time approval flow](#18-real-time-approval-flow)
19. [Call Landlord / Call Technician model](#19-call-landlord--call-technician-model)
20. [Service Thread](#20-service-thread)
21. [Completion / property history](#21-completion--property-history)
22. [PropCrew company/individual architecture](#22-propcrew-companyindividual-architecture)
23. [Notifications](#23-notifications)
24. [Security / RLS](#24-security--rls)
25. [Audit trail](#25-audit-trail)
26. [State machines](#26-state-machines)
27. [AI boundaries](#27-ai-boundaries)
28. [Provider-discovery integration boundary](#28-provider-discovery-integration-boundary)
29. [Legal / safety / compliance flags](#29-legal--safety--compliance-flags)
30. [V1 scope](#30-v1-scope)
31. [Deferred scope](#31-deferred-scope)
32. [Tenant Turnover future boundary](#32-tenant-turnover-future-boundary)
33. [Lease Builder future boundary](#33-lease-builder-future-boundary)
34. [Recommended implementation milestones](#34-recommended-implementation-milestones)
35. [Product-owner decisions required before implementation](#35-product-owner-decisions-required-before-implementation)
36. [Testing strategy](#36-testing-strategy)

---

## 1. Current-state audit

Everything in this section was verified directly against `origin/main` — `supabase/schema.sql`, the per-milestone `supabase/milestone-*.sql` files, and the application code under `lib/`, `components/`, and `app/`. Nothing below is inferred from an earlier conceptual discussion.

### 1.1 Properties, landlords, leases, rent

- `public.properties` — one row per property, `owner_id` FK to `auth.users`, strict `owner_id = auth.uid()` RLS. Carries valuation/financial fields (`estimated_value`, `mortgage_balance`, `monthly_rent`, `purchase_price`, `monthly_expenses`) that must never reach a tenant.
- `public.leases` — `tenant_name`/`tenant_email` are **plain text fields**, not a foreign key to any tenant account. A lease and a `tenant_property_access` row (below) are only loosely connected: `tenant_property_access.lease_id` is a nullable FK an owner sets when inviting, but nothing enforces `leases.tenant_email` matching `tenant_property_access.tenant_email`.
- `public.rent_payments` — landlord-recorded rent ledger, `rent_period`/`amount`/`payment_method`, optional link to a `financial_transactions` row it created. No tenant-facing write path; this is a landlord bookkeeping table, not a tenant payment system.
- `public.property_systems` — HVAC/roof/water heater/etc. inventory per property, with `warranty_expiration`, `last_service_date`, and a nullable `propcrew_contact_id` linking a system to the PropCrew provider who installed/services it. **This is a real, existing signal for future "which provider has serviced this system before" matching** — see [§12](#12-propcrew-selection).
- Property Timeline (`lib/property-timeline/derive-timeline.ts`) is **not a table** — it is fully derived client-side from `leases`, `mortgages`, `insurance_policies`, `maintenance_records`, `financial_transactions`, and `property_systems`. This is the established precedent for "history" in this codebase: derive it from the real transactional tables, don't duplicate it into a parallel history table.

### 1.2 Existing maintenance capability — two disconnected systems

There are **two separate "maintenance request" concepts already in the schema today**, and they do not talk to each other:

**(a) `public.maintenance_requests` (Milestone 6, live in production)**
```
id, property_id, owner_id, tenant_name, tenant_email, title, description,
priority ('Low'|'Normal'|'High'|'Urgent'),
status ('Submitted'|'Scheduled'|'In Progress'|'Completed'),
assigned_contact_id → property_contacts (nullable, added in Milestone 11)
created_at
```
- `tenant_name`/`tenant_email` are **plain text**, not a link to a real tenant account.
- RLS: `select`/`insert`/`update`/`delete` are **all owner-only** (`owner_id = auth.uid()`). **There is no tenant write path on this table at all.** This is the landlord's own manual log of a request they received by phone, text, or in person — not tenant self-service.
- `assigned_contact_id` already exists as a nullable FK to `property_contacts` (PropCrew), added specifically as a forward-compatible hook ("Section 15 prep: Tenant Connect + PropCrew future integration boundary" in `schema.sql`) — no automation/matching logic was ever built against it.

**(b) `public.tenant_requests` (Milestone 24 — "Tenant Connect V1")**
```
id, property_id, owner_id, tenant_access_id, conversation_id,
category ('Plumbing'|'Electrical'|'HVAC'|'Appliance'|'General Maintenance'|'Other'),
title, description, status ('New'|'In Progress'|'Resolved'),
created_at, updated_at
```
- Tenant-submittable: RLS lets the **active tenant** on a `tenant_property_access` row INSERT (never the owner — that's `maintenance_requests`' job); the owner may only UPDATE `status` (a `BEFORE UPDATE` trigger, `tenant_requests_lock_immutable_fields()`, force-restores every other column regardless of what the UPDATE statement supplies).
- 1:1-backed by a `property_conversations` row (`conversation_id`, unique index) — the request's message thread is that conversation's `property_messages`, reusing Milestone 10's messaging infrastructure wholesale rather than building a second one.
- Ships with two column-limited read views, `tenant_property_view` (`id, address, city` only) and `tenant_lease_view` (`id, tenant_name, monthly_rent, start_date, end_date, rent_due_day` only) — the deliberate fix for RLS's row-level-only limitation: `properties`/`leases` carry landlord-financial columns a row-level policy cannot hide, so tenant reads go through these two narrow views instead, and the base tables have **no tenant-facing SELECT policy at all**.

**⚠️ CRITICAL FINDING — this migration has never been applied to production.** `supabase/milestone-24-tenant-connect-v1.sql`'s own header states, verbatim:
> "MIGRATION NOT APPLIED TO PRODUCTION — revised in place after the Round 6 final safety review (production fixture check confirmed this migration had never successfully run — public.tenant_requests still does not exist there...)"

And `supabase/schema.sql` — the file every other milestone explicitly folds itself into ("mirrors milestone-X.sql exactly, appended here for a single fresh-project run") — **does not define `tenant_requests`, `tenant_property_view`, `tenant_lease_view`, `is_active_tenant_of_property()`, or `is_active_tenant_of_lease()` at all.** A `grep` for `tenant_requests` across `schema.sql` returns zero matches.

Meanwhile, shipped application code already queries this nonexistent table unconditionally:
- `components/tenant-connect/TenantRequestsPanel.tsx` (the landlord-side Requests inbox) — `supabase.from('tenant_requests').select(...)`, `.update(...)`.
- `app/tenant/page.tsx` — the tenant portal's own request list and submission form.
- `app/api/tenant-connect/notify/route.ts` — the `new_request`/`landlord_update` notification paths.
- `app/page.tsx` — a dashboard-level query.

**In production today, every one of these code paths is almost certainly failing (or silently returning empty) against a table that does not exist.** This is not a hypothetical gap to design around — it is a live discrepancy between shipped UI and shipped schema that predates this M0 milestone. See [§35](#35-product-owner-decisions-required-before-implementation) — resolving this is a **prerequisite decision**, not a Maintenance Coordination design question, and it should almost certainly be the very first thing M1 does (see [§34](#34-recommended-implementation-milestones)).

**(c) `public.maintenance_records` (Milestone 5)** — a third, unrelated table: the landlord's own **completed-work log** (service_date, vendor, cost, optional linked `financial_transaction_id`). This is retrospective bookkeeping, not a live request-coordination object, and Property Timeline already derives from it. It is a reasonable model for what a *closed* Maintenance Coordination request should eventually contribute to the property's permanent record, but it is not itself part of the live workflow.

### 1.3 Tenant Connect (Milestone 10, live in production)

The actual, live, applied Tenant Connect foundation:

- `owner_has_tenant_connect(uuid)` — `SECURITY DEFINER` SQL function, the single place the plan/entitlement check lives. Mirrors `lib/billing/entitlements.ts`'s `TENANT_CONNECT_ENABLED` map: `true` for `manage`, `automate`, and the legacy `portfolio`/`portfolio_pro`/internal `owner` plans; `false` for `free`, `organize`, `investor`. Every Tenant Connect write policy re-checks this on every write (not just at creation), so a plan downgrade stops new writes immediately without hiding existing data.
- `tenant_property_access` — the invite/accept relationship. `tenant_user_id` is nullable until acceptance (no `auth.users` row to reference at invite time); `status` is `Invited → Active → Revoked`; acceptance is a `SECURITY DEFINER` function (`accept_tenant_invite`) doing a single atomic conditional UPDATE (closing a real TOCTOU race an earlier two-step version had); a partial unique index enforces one live (non-Revoked) relationship per `(property_id, lower(tenant_email))`.
- `property_conversations` — property-scoped conversation between the owner and one tenant relationship, typed (`General`/`Maintenance`/`Lease`/`Question`/`Other`), status `Open`/`Closed`, with a **nullable `maintenance_request_id` FK into the old `maintenance_requests` table** (an owner can manually formalize a conversation into a tracked item — never set by a tenant).
- `property_messages` — the thread. `sender_user_id`/`sender_role` are **never client-supplied**; a `BEFORE INSERT` trigger (`derive_message_sender_role()`) derives both from `auth.uid()` and real conversation membership. No UPDATE/DELETE policy — messages are immutable once posted.
- `property_message_attachments` + the private `tenant-connect-attachments` storage bucket — image attachments, folder-scoped by `conversation_id`, readable by both real participants (checked via conversation membership, not a bare per-uploader folder check like the older `property-documents`/`property-photos` buckets use).
- `property_conversation_reads` — per-user last-read marker for an unread indicator.

This messaging layer (`property_conversations`/`property_messages`/attachments/reads) is **directly reusable as the mechanical backbone of the Service Thread** ([§20](#20-service-thread)) — it already has the right shape (typed conversation, immutable message log, attachments, per-user read state) for "structured events + limited communication," it just needs a structured-event layer added on top and its participant model extended beyond owner/tenant to include a provider.

### 1.4 PropCrew (Milestones 6 + 11)

- `property_contacts` (Milestone 6) — `name`, `business_name` (nullable), `role` (free-text category, e.g. "Handyman", "HVAC" — not a formal enum), `phone`, `email`, `website`, `notes`, tied to one `property_id`.
- Milestone 11 evolved this into "PropCrew" **without creating a new table** — two additive changes:
  1. `would_use_again` (`YES`/`POSSIBLY`/`NO`) + `experience_note` — private reuse-preference fields, deliberately never called a "review"/"rating"/"feedback" anywhere in the UI copy (`components/PropCrewPanel.tsx`, `lib/propcrew/reuse-preference.ts`'s `PROPCREW_PRIVACY_DISCLOSURE = 'Private — never shared with the provider.'`).
  2. `property_contact_links` — a join table so one contact can be associated with **multiple** properties (Part 10 of the M11 spec), since `property_contacts.property_id` stays a single FK for backward compatibility.
- **There is currently no distinction between an individual provider and a company provider, and no concept of a "contact person" separate from the provider entity.** `Independent Handyman / Jose Rodriguez` and `Breeze Air` (a company, contact `Joseph Bartow`) are both just one `property_contacts` row with a `name` and an optional `business_name` — there is no way today to attach a second contact person (a dispatcher, a different technician) to the same provider, and no "preferred service-request contact" concept. See [§22](#22-propcrew-companyindividual-architecture) for the proposed evolution.
- `maintenance_requests.assigned_contact_id` (nullable FK, added in M11) is the only existing hook toward "assign a maintenance request to a PropCrew provider" — unused by any code path today.
- `property_systems.propcrew_contact_id` (nullable FK) already lets a landlord record which PropCrew provider services a given HVAC/roof/etc. system — a real, existing signal for future "suggest the provider who's serviced this before" matching.

### 1.5 Documents, photos, notifications, audit

- `property_documents` / `property_photos` — private, owner-folder-scoped Storage buckets (`property-documents`, `property-photos`), each with a DB row for metadata/authorization. `property_documents.property_id` is nullable (Smart Upload can analyze before a property is confirmed).
- `document_analyses` — AI-extracted structured data per document (see AI infra below), versioned, owner-scoped.
- `ai_usage_events` — **append-only** usage/audit log (input/output token counts per AI call). No UPDATE or DELETE policy exists on it — immutability is enforced by the *absence* of a policy, not a flag. This is the one existing precedent for an audit-log table in this schema, and the pattern (no UPDATE/DELETE policy = immutable by construction) is exactly what a future maintenance audit trail should copy.
- **There is no generic `audit_log` table anywhere in the schema.** Every other "history" need in this codebase is either (a) derived client-side from live transactional tables (Property Timeline) or (b) an append-only table like `ai_usage_events`. There is no existing precedent for a single cross-entity audit-event table.
- Notifications: **no in-app notification table/tray exists**. The only "notification" infrastructure today is transactional email, sent synchronously from a client action via one API route per feature (`app/api/tenant-connect/notify/route.ts`, `app/api/realtor-leads/route.ts`'s notify path) — never a queue, never a background job.

### 1.6 Communication infrastructure

- **Email:** [Resend](https://resend.com)'s HTTP API, via a **plain `fetch`, no SDK dependency** — the established pattern in `lib/realtor-leads/notify.ts` (first) and `lib/tenant-connect/notify.ts` (copy of the same pattern). Both:
  - Gate on env vars (`RESEND_API_KEY` + a feature-specific `*_FROM_EMAIL`); when unconfigured, sending is a safe, logged no-op — never a thrown error, never blocks the caller's UI (the DB write always happens first; the notify call is fire-and-forget afterward).
  - Never echo user-supplied body text into the notification — the email content is always rebuilt server-side from a re-fetched, RLS-authorized row, never trusted from the request body.
  - **`TENANT_CONNECT_FROM_EMAIL` is a new env var this codebase added but which the completion report flagged as needing to actually be set in production** — worth re-verifying alongside the `tenant_requests` gap above, since if it was never set, Tenant Connect email was never live either, independent of the schema gap.
- **SMS: does not exist anywhere in this codebase.** No Twilio, no other SMS provider, no phone-verification flow, no outbound-SMS abstraction of any kind. This is a **net-new integration** Maintenance Coordination will need — see [§23](#23-notifications).
- **In-app notifications:** none. No notification table, no "bell" UI, no read/unread tray beyond the narrow `property_conversation_reads` marker described above.

### 1.7 AI infrastructure

- Provider: **Anthropic**, via `@anthropic-ai/sdk`, one server-only route (`app/api/document-intelligence/analyze/route.ts`, Node runtime, `ANTHROPIC_API_KEY` never reaches the browser).
- Model selection is a **verified allow-list**, not a free-form string (`lib/document-intelligence/model-config.ts`'s `VERIFIED_MODELS`) — an unrecognized override fails fast rather than being forwarded unexamined to the API. Same discipline should apply to any new AI usage (guided-intake classification, cost-guidance research, provider-discovery drafting).
- Usage is metered and entitlement-gated: `ai_usage_events` records every call; `lib/billing/entitlements.ts`'s `aiAllowanceRemaining()` enforces a monthly cap per plan (unlimited for legacy paid plans, metered for `manage`).
- **Everything the current AI infrastructure does is document/image extraction** (`analyzeDocument()` reading a PDF/image and returning structured fields). There is no existing pattern for a multi-turn structured-intake conversation, a "research current local pricing" call, or a provider-discovery search — all three are net-new AI usage shapes Maintenance Coordination will need, though they should be built on the *same* provider abstraction, model-verification discipline, and usage-tracking convention.

### 1.8 External data-provider pattern (directly relevant precedent)

Two existing swappable-provider abstractions are the house style to replicate for anything Maintenance Coordination needs from outside services:

- `lib/valuation/provider.ts` — `PropertyValuationProvider` interface, backed by RentCast (preferred) or ATTOM, selected purely by which API key is present. `isValuationProviderConfigured()` gates every caller; when neither is configured, the UI shows "Property valuation data is not configured yet." and **never fabricates a number**. This is the exact shape a future "local repair-pricing research" provider (for [§10](#10-ai-cost-guidance-architecture)) or a "local-business search" provider (for [§28](#28-provider-discovery-integration-boundary)) should follow.
- `lib/address/provider.ts` — Mapbox-backed address search/geocoding, same "one interface, swappable adapter, graceful unconfigured state" shape. Property location geocoding already exists and is reusable as-is for any future "search near the property" feature.

### 1.9 Authentication, authorization, RLS conventions

Every table in this schema follows the same, extremely consistent set of conventions — these should be treated as **house rules**, not merely observed patterns, for anything Maintenance Coordination adds:

1. **`owner_id` ownership check on every table**, `(select auth.uid()) = owner_id`, on every policy — `select`/`insert`/`update`/`delete` separately.
2. **Write policies re-verify every FK's ownership**, not just `owner_id` — e.g. `property_id` must resolve to a property the same `owner_id` owns; a plain FK only proves the row exists, never that it's *yours*.
3. **`SECURITY DEFINER` helper functions** (always returning a single boolean, always re-deriving `auth.uid()`/`auth.jwt()` internally, never accepting a caller-supplied identity) are the mechanism whenever a policy on table A needs to check a fact that lives behind table B's own RLS — this is what breaks RLS recursion (`owner_has_tenant_connect`, `is_active_tenant_of_property`, `is_active_tenant_of_lease`) and is exactly the mechanism a provider-token check will need ([§14](#14-provider-secure-link-model)).
4. **`BEFORE INSERT`/`BEFORE UPDATE` triggers derive server-controlled columns**, overwriting anything the client supplied — `derive_message_sender_role()`, `tenant_requests_lock_immutable_fields()`. Never trust a client-submitted "who sent this" or "which fields changed."
5. **Column-limited views, not column-level GRANTs**, whenever one role (tenant) needs a narrower column set than another role (owner) sharing the same Postgres role (`authenticated`) — `tenant_property_view`/`tenant_lease_view`.
6. **Append-only tables have no UPDATE/DELETE policy** — immutability by omission (`ai_usage_events`, `property_messages`, `property_message_attachments`).
7. **"Retire via status, never DELETE"** — `tenant_property_access.status = 'Revoked'`, `property_conversations.status = 'Closed'`, `tenant_requests.status = 'Resolved'`. No DELETE policy exists on any of these tables. History is never destroyed.
8. **Partial unique indexes enforce "one live X"** without blocking re-creation after retirement — `tenant_property_access_live_unique ... where status <> 'Revoked'`.
9. Every migration is **additive and idempotent** (`create table if not exists`, `add column if not exists`, `drop policy if exists` before every `create policy`) so re-running a file against a database that already has some of it applied is always safe.

---

## 2. Existing reusable architecture

Summarized from §1 — this is what Maintenance Coordination should build *on top of*, not duplicate:

| Need | Reuse |
|---|---|
| Tenant identity / property relationship | `tenant_property_access` (as-is) |
| Tenant plan gating | `owner_has_tenant_connect()` (as-is, or a new sibling `owner_has_maintenance_coordination()` if this becomes a distinct entitlement — see [§35](#35-product-owner-decisions-required-before-implementation)) |
| Tenant-safe restricted reads | The `tenant_property_view`/`tenant_lease_view` pattern (once actually applied — [§1.2](#12-existing-maintenance-capability--two-disconnected-systems)) |
| Message thread mechanics | `property_conversations` + `property_messages` + `property_message_attachments` + `property_conversation_reads` (extended — see [§20](#20-service-thread)) |
| Sender-role integrity | `derive_message_sender_role()`-style `BEFORE INSERT` trigger, extended to a third role (`Provider`) |
| PropCrew provider records | `property_contacts` + `property_contact_links` (evolved — see [§22](#22-propcrew-companyindividual-architecture)) |
| Landlord→provider assignment hook | `maintenance_requests.assigned_contact_id` (pattern to carry forward onto the new request entity) |
| Provider-service history signal | `property_systems.propcrew_contact_id` |
| Closed-request permanent record | `maintenance_records` + Property Timeline's derive-from-live-tables pattern |
| Email | `lib/realtor-leads/notify.ts` / `lib/tenant-connect/notify.ts`'s Resend-via-fetch pattern, extended with new templates |
| AI provider discipline | `lib/document-intelligence/provider.ts` + `model-config.ts`'s verified-model-list pattern |
| External data provider shape | `lib/valuation/provider.ts`'s swappable-adapter + graceful-unconfigured pattern |
| Address/location | `lib/address/provider.ts` (Mapbox) |
| Entitlement plumbing | `lib/billing/entitlements.ts`'s per-plan capability map |
| RLS conventions | §1.9's nine house rules, applied to every new table |

---

## 3. Current gaps

Everything below is **missing**, not merely "not yet built out further":

1. **`tenant_requests` (and its two supporting views/functions) is not applied to production.** This is the load-bearing gap — see [§1.2](#12-existing-maintenance-capability--two-disconnected-systems) and [§35](#35-product-owner-decisions-required-before-implementation).
2. **No unified request entity.** `maintenance_requests` (owner-logged) and `tenant_requests` (tenant-submitted, unapplied) are two separate tables with no shared identity, no shared status vocabulary, and no path for one to become the other.
3. **No provider participant in the messaging model.** `property_messages.sender_role` is a hard `CHECK (sender_role in ('Owner', 'Tenant'))` — a provider cannot post into a thread today without a schema change.
4. **No provider identity/authentication mechanism at all.** No secure-link/token table, no provider-facing route, no concept of "access scoped to exactly one request, no account required."
5. **No individual/company distinction, no multi-contact-per-provider model, no "preferred dispatch contact"** — see [§22](#22-propcrew-companyindividual-architecture).
6. **No quote/estimate object.** Nothing in the schema represents "a provider proposed $X for this work" as a distinct, versionable, auditable record.
7. **No authorization/approval object.** Nothing represents "the landlord authorized up to $X" or "the landlord approved this specific $X quote" as a first-class, timestamped, auditable record — `maintenance_requests.status` is a bare four-value enum with no monetary or approval concept at all.
8. **No structured intake/observation model.** Nothing captures "tenant answered: thermostat set to COOL, set point 72°F, current temp 79°F" as structured data — `tenant_requests.description` is one free-text field.
9. **No availability/scheduling model.** No table represents a tenant's offered time windows, a provider's proposed inspection slots, or a confirmed appointment.
10. **No SMS capability of any kind** — see [§1.6](#16-communication-infrastructure).
11. **No in-app notification tray/table** — every notification today is a synchronous, fire-and-forget email tied to one specific client action.
12. **No urgent/safety escalation path.** `maintenance_requests.priority` includes `'Urgent'` as a string value, but nothing distinguishes "landlord should look at this eventually" from "this needs immediate escalation, do not proceed through the ordinary flow."
13. **No generic audit-log table** — only the narrower `ai_usage_events` precedent exists ([§1.5](#15-documents-photos-notifications-audit)).
14. **No AI usage pattern beyond document extraction** — no structured multi-turn intake, no external pricing-research call, no provider-discovery search.
15. **No local service-pricing data source** — the two existing external-data providers (RentCast/ATTOM, Mapbox) are real-estate valuation and geocoding respectively; neither has any repair/service pricing data.

---

## 4. Product principles

Restated from the brief, made concrete against this codebase's own conventions:

1. **Landlord control is structural, not advisory.** Every consequential step (contact a provider, approve a quote, authorize spend above a threshold) requires an explicit landlord action recorded as a first-class row with a timestamp and an actor — the same way `tenant_property_access`'s acceptance is a `SECURITY DEFINER` function that fully re-derives identity rather than trusting client state, every authorization/approval action in Maintenance Coordination must be a server-verified write, never a status string a client can set to whatever it wants.
2. **AI assists, never decides.** Everywhere AI participates ([§27](#27-ai-boundaries)), its output is advisory (a suggested category, a cost *range*, a draft message) and is stored as a distinctly-labeled record, never silently merged into a landlord-authored or provider-authored field.
3. **Distinguish reported symptom → structured observation → AI assessment → professional diagnosis → landlord decision**, at the data-model level, not just in UI copy — [§9](#9-structured-request-model), [§16](#16-professional-diagnosis).
4. **Least privilege everywhere.** A provider's access token unlocks exactly one request's exact permitted actions — never the landlord's account, never other properties, never other requests, never (by default) another participant's raw phone number or email — [§14](#14-provider-secure-link-model), [§19](#19-call-landlord--call-technician-model).
5. **History is never destroyed.** Every existing table in this schema retires rows via a status column, never a DELETE — Maintenance Coordination's tables follow the identical convention.
6. **SMS/email are entry points; the web experience is where the workflow actually happens.** A provider or tenant never has to "download an app" to participate — they tap a link and land on a scoped, mobile-first web page.
7. **PropCrew stays a private directory, never a marketplace.** Provider discovery ([§28](#28-provider-discovery-integration-boundary)) grows a landlord's own private list; it is never a shared/public network between landlords.
8. **Don't overbuild V1.** One complete, safe, useful maintenance loop (tenant reports → landlord authorizes → provider fixes → landlord closes) before any AI categorization, smart matching, or provider discovery.

---

## 5. Actors / roles

| Actor | Has a `auth.users` row? | Identity mechanism | Scope |
|---|---|---|---|
| **Landlord (owner)** | Yes | Standard Supabase auth | Everything they own — properties, tenants, PropCrew, requests, quotes, authorizations |
| **Tenant** | Yes, once they accept an invite | `tenant_property_access` (existing) | Exactly their own active tenancy — their unit's requests, their own thread messages, their own availability |
| **Provider (company or individual)** | **No account in V1** | A scoped, expiring secure-link token (new — [§14](#14-provider-secure-link-model)) | Exactly the one request the link was issued for, and only the actions appropriate to its current state |
| **Provider contact person** (dispatcher, technician) | Same as Provider — no account | Same token mechanism, optionally attributed to a named contact within the provider entity | Same scope as Provider, for the same request |
| **PropRoster (the system)** | N/A | Server-side, `SECURITY DEFINER` functions / service routes | Orchestrates state transitions, sends notifications, invokes AI assistance — never authorizes spend or hires anyone on its own authority |

A provider **may** later create a real account (deferred — [§31](#31-deferred-scope)); V1 assumes they never do.

---

## 6. Guided Maintenance Intake architecture

**Goal:** the tenant reports a *symptom* ("AC is not cooling"); PropRoster asks a short, category-specific, safety-bounded sequence of questions to turn that into structured observations *before* anything is sent to a landlord or provider.

### 6.1 Shape

- A **category** is chosen first (`Heating/AC`, `Plumbing`, `Toilet`, `Electrical`, `Appliance`, `Lock/Door`, `Leak/Water`, `Other`) — this reuses/extends `tenant_requests.category`'s existing enum (today: `Plumbing`, `Electrical`, `HVAC`, `Appliance`, `General Maintenance`, `Other`; needs `Toilet`, `Lock/Door`, and `Leak/Water` split out as their own categories per the brief, or kept as sub-categories — a product-owner call, [§35](#35-product-owner-decisions-required-before-implementation)).
- Each category owns a **fixed, versioned question tree** (not an open-ended AI conversation) — a small number of yes/no or short-answer questions, each tagged with a **safety class**:
  - `SAFE_OBSERVATION` — "Is air coming from the vents?" (look, don't touch)
  - `SAFE_SIMPLE_ACTION` — "Is the thermostat set to COOL?" / "would you like to try replacing the filter with one you have on hand?" (a reversible, no-tool, no-risk action)
  - `PROFESSIONAL_DIAGNOSIS_REQUIRED` — anything past the safe-observation/safe-action boundary short-circuits straight to "a professional needs to look at this," no further questions asked
  - `URGENT_ESCALATION` — any branch that reaches a safety-hazard answer stops the flow entirely and routes to [§7](#7-safety-model)
- AI's role here ([§27](#27-ai-boundaries)) is **narrow**: (a) map the tenant's free-text initial description to the closest matching category/branch start point, (b) interpret a free-text answer into one of the fixed question tree's expected values when the tenant doesn't use the exact button/option. AI **never invents a new question at runtime** and never proposes an action outside the pre-authored, safety-reviewed tree for that category.

### 6.2 Explicit safety boundary (non-negotiable, per the brief)

The question tree authoring process must never include, for any category:
- Opening electrical panels/equipment, testing voltage, touching capacitors
- Removing HVAC equipment access panels, handling refrigerant, diagnosing compressor internals
- Placing hands in a garbage disposal
- Any electrical repair action
- Any plumbing action with meaningful flooding risk
- Unsafe ladder/height work
- Any gas-system work
- Any other action a reasonable person would consider hazardous without training

This is a **content-authoring rule**, enforceable by review, not something the schema can mechanically guarantee — flagged explicitly in [§29](#29-legal--safety--compliance-flags) as requiring a real safety review pass on every question tree before it ships, not just at M0.

### 6.3 Resolution before dispatch

If the tenant confirms a `SAFE_SIMPLE_ACTION` resolved the issue (e.g., thermostat was in HEAT, tenant switched it, confirms cooling now works), the request is marked resolved **through intake**, never dispatched to a provider. This must be a **distinct, visible fact** on the request record (see [§9.3](#93-resolution-through-intake)) — not silently indistinguishable from a request a provider closed out.

### 6.4 Proposed new tables (not created in M0)

```
maintenance_intake_sessions
  id, request_id, category, tree_version,
  started_at, completed_at, outcome ('escalated_to_dispatch' | 'resolved_in_intake' | 'escalated_urgent' | 'abandoned')

maintenance_intake_answers
  id, session_id, question_key, safety_class, answer_value (jsonb), answered_at
```
Kept as a **separate, append-only pair of tables**, not columns bolted onto the request itself — a request may only ever have one canonical current state, but its intake session is inherently a multi-step log, and keeping it separate means the question-tree content/schema can evolve (new categories, new questions, tree versioning) without ever touching the request table itself.

---

## 7. Safety model

A conservative, deterministic (not AI-judgment-based) escalation trigger list, evaluated at **every** intake answer, not just at submission:

- Any `URGENT_ESCALATION`-tagged answer, at any point in the tree, immediately halts ordinary troubleshooting.
- Trigger categories (non-exhaustive, to be finalized in a real safety-review pass): fire/smoke, gas smell, active electrical arcing/sparking or burning-electrical smell, uncontrolled major water leak/flooding, any tenant-reported "I feel unsafe" signal.
- On trigger: (a) the tenant sees prominent, unambiguous safety messaging (e.g., "If you smell gas, leave the property and call your gas utility / 911. Do not use light switches or your phone inside." — content that itself needs a real safety/legal review, not AI-authored at request time); (b) the landlord is notified **immediately** via the highest-urgency channel available ([§23](#23-notifications)); (c) the request is placed in a distinct `urgent_escalation` state ([§26](#26-state-machines)), never left sitting in the ordinary quote/dispatch pipeline; (d) every step is written to the audit trail ([§25](#25-audit-trail)).
- **AI never makes the final call alone.** The trigger list is a fixed, reviewed set of keywords/branches, not a model's live judgment of "is this urgent" — a model may assist in *routing* free text to a known trigger, but the trigger set itself is authored and reviewed by a human, and any request that reaches an `URGENT_ESCALATION` branch is escalated deterministically, not probabilistically.
- PropRoster **never** tells a tenant it has determined there is no emergency — the absence of a triggered escalation is not communicated as "confirmed safe," only as "continuing with the standard request flow."

---

## 8. Tenant availability model

Collected at initial submission (not deferred to a later "when can someone come by" round-trip), and passed to the provider in the **initial** outreach message so a scheduling round-trip is the exception, not the default.

### 8.1 Shape

```
maintenance_access_windows
  id, request_id,
  starts_at, ends_at,                       -- one contiguous window
  presence ('tenant_present' | 'authorized_other_present' | 'other_arrangement'),
  presence_note text,                        -- e.g. name of the authorized other person
  created_at
```
A request has zero-or-more of these at submission (the tenant may skip and be asked later — never a hard requirement to submit a request). `presence` deliberately does **not** imply a legal right of entry — see [§8.2](#82-access-consent-is-recorded-never-legally-determined).

### 8.2 Access/consent is *recorded*, never legally determined

PropRoster **captures** that a tenant offered a window and how they said they'd be accommodated (present themselves / another authorized person / another arrangement e.g. lockbox). PropRoster does **not** assert this constitutes sufficient legal notice or consent for entry under any given jurisdiction's landlord-tenant law — that determination is explicitly out of scope and flagged in [§29](#29-legal--safety--compliance-flags). The data model should also allow (future, not V1) an explicit **entry-notice record** — "landlord gave tenant N hours' notice on [date]" — as a distinct fact from "tenant offered this window," since many jurisdictions require the former regardless of the latter.

### 8.3 Provider consumption

When a provider needs an inspection, they are shown the tenant's already-submitted windows first ([§15](#15-scheduling)) and select a compatible one; only if none work does an additional scheduling round-trip begin.

---

## 9. Structured request model

### 9.1 Distinct record types (the brief's explicit requirement)

The data model must keep these **conceptually and physically distinct**, never collapsed into one free-text blob:

| Record | What it holds | Authored by |
|---|---|---|
| **Tenant-reported symptom** | The tenant's own words, verbatim, immutable after submission (same "never edited after submission" rule `tenant_requests.description` already has) | Tenant |
| **Tenant observations** | Structured intake answers ([§6](#6-guided-maintenance-intake-architecture)) | Tenant (guided by the fixed question tree) |
| **AI assessment** | A suggested category + a plain-language one-line assessment ("HVAC service likely required") — always labeled as AI-generated, never presented as a diagnosis | AI, reviewed by nothing before display (advisory-only, hence explicit labeling) |
| **AI cost guidance** | A price *range* with a confidence label, distinctly NOT a quote — [§10](#10-ai-cost-guidance-architecture) | AI |
| **Professional diagnosis** | What the provider determined on inspection ("failed capacitor") | Provider |
| **Provider quote** | A specific dollar amount tied to a diagnosis | Provider |
| **Landlord authorization / approval** | What the landlord actually authorized/approved, and when | Landlord |
| **Actual invoice** | What was actually billed at completion | Provider |

### 9.2 Proposed core table

```
maintenance_requests_v2   -- name TBD; see §34/§35 on migration strategy
  id, property_id, owner_id,
  origin ('tenant_submitted' | 'landlord_logged'),
  tenant_access_id uuid null,              -- set iff origin = tenant_submitted
  conversation_id uuid not null,           -- the request's Service Thread, always created
  category text not null,
  urgency_flag boolean not null default false,   -- set only via the deterministic safety trigger, §7
  symptom_text text not null,              -- immutable after insert, same trigger pattern as tenant_requests today
  ai_suggested_category text null,
  ai_assessment_text text null,
  state text not null,                     -- §26 state machine
  assigned_provider_id uuid null references property_contacts(id),
  created_at, updated_at
```
This deliberately **replaces**, rather than sits beside, both `maintenance_requests` and `tenant_requests` — see [§34](#34-recommended-implementation-milestones) for why a genuine unification (not a third parallel table) is recommended, and the migration considerations that come with it (existing rows in both tables need a mapping story).

### 9.3 Resolution through intake

A boolean-ish fact, not a guess: `state = 'resolved_in_intake'` plus a reference to the `maintenance_intake_sessions` row and which `SAFE_SIMPLE_ACTION` resolved it — this is what lets a landlord later see "this didn't need a service call, and here's exactly why," both as a UX nicety and as a genuine, auditable claim (never inferred after the fact from an empty dispatch history, which would be indistinguishable from "nobody ever looked at this").

---

## 10. AI cost-guidance architecture

### 10.1 What this is, and is not

**Cost guidance** is a *range*, with a confidence label, explicitly distinguished from a **quote** (a specific number a real provider is proposing to charge). It exists to help a landlord decide a pre-authorization ceiling ([§11](#11-owner-pre-authorization-model)) *before* a provider is even involved — never to represent a promise of what repair will actually cost.

### 10.2 Research layer, not model memory

Per the brief, this must not simply be "ask the model what an AC repair usually costs" — that has no grounding in current, local pricing and no provenance. The architecture needed:

- A **new external-data provider abstraction**, following the exact shape of `lib/valuation/provider.ts` ([§1.8](#18-external-data-provider-pattern-directly-relevant-precedent)): an interface, a swappable backing source, an `isConfigured()` gate, and a hard rule of **never fabricating a number when unconfigured** — the UI must say "cost guidance is not available yet," never guess.
- **No such data source is currently integrated in this codebase.** This is genuinely new integration work (a service-pricing data API, or a web-search-grounded research call with cited sources), not a wiring exercise against something that already exists. This should not be assumed solvable by "just ask Claude" — a real data source (an external API, or a retrieval-augmented search step with source citations) needs to be selected and its accuracy/coverage evaluated before this feature ships, which is why it sits in V1.1/V2, not V1 ([§30](#30-v1-scope)/[§31](#31-deferred-scope)).
- Inputs: property location (existing geocoding, [§1.8](#18-external-data-provider-pattern-directly-relevant-precedent)), category, structured intake observations, and — once historical data exists — the landlord's own past repairs and the specific provider's own past pricing on this landlord's properties (both genuinely available later, from tables this document proposes, never at V1 launch when no history exists yet).

### 10.3 Proposed shape (future, not V1)

```
maintenance_cost_guidance
  id, request_id,
  range_low numeric, range_high numeric, currency,
  confidence ('low'|'moderate'|'high'),
  basis_summary text,          -- plain-language "based on X local data points"
  source_refs jsonb,           -- citations, never opaque
  model_provider, model_name,  -- same discipline as document_analyses
  created_at
```

### 10.4 Boundary

AI cost guidance **never** becomes a landlord authorization on its own — a landlord must take an explicit action ([§11](#11-owner-pre-authorization-model)) informed by, but distinct from, this number.

---

## 11. Owner pre-authorization model

**This is the single most structurally significant new concept in the whole brief** — it is what makes real-time in-person approval ([§18](#18-real-time-approval-flow)) possible without the landlord babysitting the dashboard.

### 11.1 Proposed table

```
maintenance_authorizations
  id, request_id, granted_by (landlord user_id),
  mode ('amount_ceiling' | 'require_approval' | 'contact_me_first'),
  max_amount numeric null,     -- set iff mode = 'amount_ceiling'
  currency text default 'USD',
  scope text not null,         -- free text or structured note on what this covers
  created_at, expires_at null, revoked_at null,
  consumed_amount numeric null,     -- what was actually spent under it
  consumed_at timestamptz null,
  superseded_by uuid null references maintenance_authorizations(id)  -- if a later request/approval replaces it
```

### 11.2 Rules

- **One active authorization per request at a time.** A new authorization on the same request supersedes the prior one (`superseded_by`), never overwrites it in place — the full history of what was authorized, when, stays intact (same "retire, never destroy" convention as everywhere else in this schema).
- Creating/revoking an authorization is **landlord-only**, same ownership-check pattern as every other write in this schema.
- `mode = 'require_approval'` and `mode = 'contact_me_first'` are functionally similar (both mean "no ceiling exists, every proposed cost needs a live decision") but kept as **distinct values** because the UX/notification treatment differs — `contact_me_first` should bias toward a phone call ([§19](#19-call-landlord--call-technician-model)) before even a digital approval request is sent, `require_approval` is comfortable with an async digital approve/decline.
- Authorization is **request-specific in V1** — the brief's "future landlord maintenance rules" (standing rules like "routine repairs auto-authorized up to $250") are explicitly deferred ([§24 of the brief / §31 here](#31-deferred-scope)); V1 only ever asks "for *this* request, what's your ceiling?"

### 11.3 Consumption logic (real-time evaluation, not a background job)

At the moment a provider submits a diagnosed cost ([§16](#16-professional-diagnosis)/[§17](#17-quote-model)), the server compares it against the request's currently-active authorization:
- `proposed_amount <= max_amount` (mode `amount_ceiling`) → work may proceed under the existing authorization; the landlord gets an **informational** notification, not an approval request ([§18.1](#181-within-authorization)).
- Otherwise → an approval request is created and the landlord is notified with urgency ([§18.2](#182-above-authorization)).

This comparison must happen **server-side**, inside the same write that records the provider's diagnosed cost — never client-computed and merely displayed, since the provider-facing secure-link page ([§14](#14-provider-secure-link-model)) is an untrusted client by construction.

---

## 12. PropCrew selection

- PropRoster surfaces candidate `property_contacts` rows matching the request's category (and, once populated, weighted by `property_systems.propcrew_contact_id` — "this provider has serviced this exact system before" is a strong, already-modelable signal).
- The landlord sees suggestion(s), never an automatic assignment. Explicit UI affordances: **Contact [Provider]** / **Choose someone else** / **Handle myself**.
- No outreach occurs until the landlord explicitly authorizes contact — this authorization itself should be a recorded action (who clicked "contact," when), feeding [§25](#25-audit-trail).
- If no category match exists in PropCrew: the no-match fallback ([§28](#28-provider-discovery-integration-boundary)).

---

## 13. Provider outreach

### 13.1 Content

The **first** message to a provider should contain everything needed to respond usefully without a back-and-forth, reusing data already collected rather than asking the provider to re-request it:

- Property/service location (only what's needed to arrive — not the landlord's full address book of financial data)
- Category + tenant-reported symptom + structured observation summary ([§9.1](#91-distinct-record-types-the-briefs-explicit-requirement))
- Authorized photos/video, if any
- Tenant availability windows ([§8](#8-tenant-availability-model))
- Access/presence information
- The current owner authorization amount, if one exists, stated plainly ("If diagnosed repair fits within $400, you may proceed. Above that, contact us before continuing.")
- A single secure link ([§14](#14-provider-secure-link-model))

### 13.2 Channel

SMS and/or email, per the brief's V1 priority. SMS requires net-new infrastructure ([§1.6](#16-communication-infrastructure), [§23](#23-notifications)) — this is real integration work, not configuration of something already present.

### 13.3 No account required

The provider never signs up. The link *is* the credential ([§14](#14-provider-secure-link-model)).

---

## 14. Provider secure-link model

This is the section needing the most new security design — nothing like it exists in this codebase today (every existing actor authenticates via real Supabase auth).

### 14.1 Proposed table

```
maintenance_provider_tokens
  id, request_id,
  provider_contact_id uuid references property_contacts(id),
  contact_person_name text null,      -- optional, if a specific named individual (§22) was targeted
  token_hash text not null unique,    -- store a HASH, never the raw token (same discipline as any secret)
  issued_at, expires_at,
  revoked_at null,
  last_used_at null,
  single_use_action text null,        -- for actions that should only ever be taken once (see 14.3)
  created_at
```

### 14.2 Properties

- The **raw token** is only ever in the SMS/email link itself and briefly in the provider's browser — never stored in plaintext server-side, never logged. Verification hashes the presented token and compares against `token_hash`.
- **Expiration is mandatory** — a reasonable default (e.g., 14–30 days from issuance, or tied to the request's own lifecycle — closed/cancelled requests should expire their tokens immediately) — a genuine product-owner call ([§35](#35-product-owner-decisions-required-before-implementation)).
- **Revocation** is a landlord-triggered action (e.g., reassigning the provider) — sets `revoked_at`, checked on every use alongside `expires_at`.
- Access via this token is **scoped to exactly one request** — the token grants no visibility into any other property, request, or the landlord's account in any form. This is enforced the same way `SECURITY DEFINER` functions enforce every other narrow-access rule in this schema: a function (`verify_provider_token(token, request_id)` or similar) that returns a boolean and is the *only* mechanism any provider-facing route/RLS check consults.
- **Action scoping by request state**: the secure page must only ever offer the actions valid for the request's *current* state (Accept/Decline only while `provider_contact_pending`; submit-diagnosis only once past scheduling; etc.) — both as UI (don't render invalid actions) and as a server-side check (reject an action attempted out of sequence), never client-trusted state.
- **One provider link per request** in V1 (the brief's "one request only per provider link") — if the request is reassigned to a different provider, the old token is revoked and a new one issued to the new provider, never reused.

### 14.3 What the provider page can and cannot do

Can (per current request state): view the scoped request summary, accept/decline/request-inspection, propose availability, submit a diagnosis + quote, mark complete, upload an invoice/photos, tap "Call Landlord."

Cannot, ever: see the landlord's other properties, other requests, PropCrew list, financials, or any tenant's contact info beyond what's explicitly surfaced for this one request (and even then, see [§19.3](#193-phone-number-exposure-a-real-open-question) on whether raw numbers are exposed at all in V1).

---

## 15. Scheduling

### 15.1 Proposed tables

```
maintenance_appointments
  id, request_id, kind ('inspection' | 'repair'),
  status ('proposed' | 'confirmed' | 'declined' | 'completed' | 'cancelled'),
  confirmed_window_id uuid null references maintenance_access_windows(id),
  created_by ('provider' | 'landlord' | 'tenant'),
  created_at, updated_at

maintenance_appointment_proposals
  id, appointment_id,
  starts_at, ends_at,
  proposed_by ('provider'),
  responded_by ('tenant') null,
  response ('accepted' | 'declined') null,
  responded_at null
```

### 15.2 Flow

1. Provider first checks the tenant's already-submitted `maintenance_access_windows` ([§8](#8-tenant-availability-model)) — if one is compatible, the provider selects it directly and the appointment moves straight to `confirmed`, no proposal round needed.
2. Only if none of the tenant's windows work does the provider create `maintenance_appointment_proposals` rows; the tenant is notified and responds; a matched slot confirms the appointment.
3. The landlord can see scheduling status at any time (read-only unless they intervene) — this is purely visibility, not a required approval step, since scheduling itself is not a spend decision.

---

## 16. Professional diagnosis

A **distinct record from the quote**, per the brief's explicit requirement ([§9.1](#91-distinct-record-types-the-briefs-explicit-requirement)):

```
maintenance_diagnoses
  id, request_id, provider_contact_id,
  summary text not null,           -- "Failed capacitor"
  submitted_at,
  -- never auto-merged into ai_assessment_text or symptom_text
```
Explicitly labeled and displayed as "Professional diagnosis" everywhere it appears, never blended visually or structurally with the tenant's symptom, the AI's assessment, or the AI's cost guidance.

---

## 17. Quote model

```
maintenance_quotes
  id, request_id, diagnosis_id null,       -- null for a remote quote given before any inspection
  provider_contact_id,
  quote_type ('remote' | 'post_inspection' | 'revised'),
  amount numeric not null, currency default 'USD',
  labor_amount numeric null, material_amount numeric null,   -- optional breakdown, if the provider supplies one
  notes text,
  attached_document_id uuid null references property_documents(id),
  status ('pending' | 'approved' | 'declined' | 'expired' | 'superseded'),
  expires_at null,
  decline_reason text null,
  superseded_by uuid null references maintenance_quotes(id),
  created_at,
  decided_by uuid null,                -- the landlord user_id who approved/declined
  decided_at null,
  decision_channel ('digital' | 'phone_recorded')   -- §19: a verbally-approved decision is still recorded here
```

- **Immutable history**: a revised quote is a *new* row (`superseded_by` on the old one), never an in-place edit — preserves "what was proposed, what was approved, when" exactly as the brief requires.
- `decision_channel = 'phone_recorded'` is what makes [§19](#19-call-landlord--call-technician-model)'s "the conversation happened by phone, but the decision is still captured digitally" concrete: a landlord (or an authorized staff action on their behalf, V1 has no such delegation though) enters the outcome of a call directly against this row after the fact.
- **Never auto-approved.** Every `status = 'approved'` row has a real `decided_by`/`decided_at` — there is no code path where PropRoster sets this on its own.

---

## 18. Real-time approval flow

### 18.1 Within authorization

When a provider submits a diagnosis + quote and the amount is `<=` the request's active `maintenance_authorizations.max_amount`:
- The quote is marked `approved` **immediately**, `decided_by` = the authorization's own `granted_by`, `decision_channel = 'digital'` (the earlier standing authorization *is* the approval, retroactively attributed — this is a deliberate modeling choice: the authorization event already was the landlord's decision, so no second "approval" event is invented).
- The provider sees "Within owner authorization — proceed."
- The landlord receives an **informational** notification (not an action request) — "proceeding under your prior authorization," with a still-available "Call Technician" affordance if they want to intervene anyway.

### 18.2 Above authorization

- The quote is created `status = 'pending'`.
- Provider sees "Owner approval required" with options: **Submit for approval** / **Call Landlord** / **Request callback**.
- Landlord gets an urgent, real-time notification (SMS-first — see [§23](#23-notifications)) with **Approve** / **Decline** / **Call Technician** / **View details**.
- **Concurrency**: if the landlord approves via the digital flow at the same moment a phone call also resolves it, the second write must be a no-op against an already-`approved`/`declined` row (the same "conditional UPDATE ... where status = 'pending'" idiom `tenant_property_access`'s own TOCTOU fix already established in this schema) — never allow two conflicting decisions to both "win."

### 18.3 Never assume desktop presence

Every real-time step above must work end-to-end via SMS + a mobile web link — the brief is explicit that landlords will not be sitting inside the dashboard, and this needs to shape notification content (a full "Approve $875?" decision, not just a generic "you have an update" ping) as much as the underlying data model.

---

## 19. Call Landlord / Call Technician model

### 19.1 Both directions

- Landlord-facing: **Call Technician**, shown wherever a technician is (or was recently) engaged with the request.
- Provider-facing: **Call Landlord**, shown at any point past provider-selection.
- **Request Callback**: an async alternative to an immediate call, from either side — creates a lightweight callback-requested event in the Service Thread, notifies the other party.

### 19.2 The call itself is out-of-band; its outcome is captured back in

PropRoster does not (in V1) place or record the call — it only exposes a `tel:` link and, afterward, a place to record what was decided ([§17](#17-quote-model)'s `decision_channel = 'phone_recorded'`).

### 19.3 Phone-number exposure — a real open question

The brief explicitly asks for this to be evaluated, not assumed. Two options, with tradeoffs:

- **V1: direct known numbers.** Simplest to build; the landlord's real number is already in `auth.users`/`user_profiles`, a provider's is already in `property_contacts.phone`. Risk: once exposed, a landlord's personal cell number is now known to every provider ever contacted, with no way to later "unshare" it — this is a real, not hypothetical, privacy tradeoff given `property_contacts.phone` today has no provenance or consent tracking at all.
- **Future: masked call-routing.** A proxy number connects the two parties without either seeing the other's real number (the way ride-share/delivery apps do this) — meaningfully more infrastructure (a telephony provider, call-routing logic, session management) and explicitly **not V1-scoped** per the brief's own framing ("evaluate whether V1 should use direct known contact numbers or a future masked/call-routing model").

**Recommendation for M1+ planning purposes (not a decision made here):** ship V1 with direct numbers but make the exposure an explicit, visible, revocable fact in the UI (e.g., "Your phone number will be shared with Breeze Air for this request" shown before the landlord ever authorizes contact) rather than a silent side effect — this keeps V1 simple while not pretending the tradeoff doesn't exist. **This still needs explicit product-owner sign-off** — see [§35](#35-product-owner-decisions-required-before-implementation).

---

## 20. Service Thread

### 20.1 Reuse, extended

The mechanical backbone is exactly `property_conversations` + `property_messages` + `property_message_attachments` + `property_conversation_reads` ([§1.3](#13-tenant-connect-milestone-10-live-in-production)), with two structural extensions:

1. **A third sender role.** `property_messages.sender_role`'s `CHECK` constraint needs `'Provider'` added (`CHECK (sender_role in ('Owner', 'Tenant', 'Provider'))`), and `derive_message_sender_role()` needs a third branch verifying the sender against a valid, unexpired `maintenance_provider_tokens` row for that conversation's request — not `auth.uid()`, since a provider has no such id in V1. This is the one place the existing trigger's "derive from `auth.uid()`" assumption needs to change shape (a provider's "identity" for this purpose is *the verified token*, not a Supabase user).
2. **A structured-event layer alongside free-text messages.** The brief is explicit this is "NOT primarily a generic group chat" — structured events ("Provider contacted," "Inspection confirmed," "Estimate submitted: $625," "Landlord approved: $625") need to render inline with any free-text messages, in one chronological feed, but should be **distinct rows from `property_messages`**, not stringified into message text (which would make them un-queryable/un-testable as data). Proposed:
   ```
   maintenance_thread_events
     id, request_id, conversation_id,
     event_type text not null,     -- enum, not free text — see below
     actor ('landlord'|'tenant'|'provider'|'system'),
     payload jsonb,                -- structured detail specific to event_type
     created_at
   ```
   `event_type` should be a fixed, reviewed enum matching real state transitions ([§26](#26-state-machines)) — `request_submitted`, `provider_contacted`, `provider_accepted`, `inspection_confirmed`, `diagnosis_submitted`, `quote_submitted`, `quote_approved`, `work_started`, `work_completed`, `invoice_uploaded`, `request_closed`, etc. — generated **by the same server-side code that performs each transition**, never independently authored, so the thread can never drift from the request's actual recorded history.

### 20.2 Participant permissions

- **Landlord**: full read of every event and message on their own request's thread.
- **Tenant**: reads events relevant to their own request (all of them, in V1 — there's no proposed reason to hide any event from the tenant on their own request), posts free-text messages, cannot post structured events directly (those are always system-generated from a real action).
- **Provider (via token)**: reads/posts scoped to exactly this one request's thread — same "no structured events, only the actions that generate them" rule.
- No participant ever sees another participant's raw contact info **through the thread itself** merely by being a member — see [§19.3](#193-phone-number-exposure-a-real-open-question) for the separate, narrower question of whether it's exposed elsewhere in the flow.

---

## 21. Completion / property history

- Provider actions at completion: mark complete, add notes, upload invoice (`property_documents`, reusing the existing document pipeline — no new document store needed), upload photos (reusing `property_photos` or a maintenance-scoped equivalent bucket, TBD).
- Tenant sees a completion status (from the unified request's `state`, [§26](#26-state-machines)).
- Landlord closes the request — a final, explicit action (`state = 'closed'`), not an automatic transition the moment a provider marks work done, preserving the brief's "landlord remains in control of... request closure."
- **Permanent record**: following the Property Timeline precedent ([§1.1](#11-properties-landlords-leases-rent)) — the closed request, its diagnosis, its approved quote, its invoice, and its thread should be **derivable into the existing timeline view**, not copied into a second "history" table. A closed request could also optionally create a `maintenance_records` row (the existing completed-work log table) for consistency with the landlord's other completed-work history, if the product-owner wants both surfaces to show the same thing — a real product decision, not an architecture requirement either way.

---

## 22. PropCrew company/individual architecture

### 22.1 The gap, precisely

Today, `property_contacts` conflates three things that need to be separable: **the provider entity** (who the request is assigned to), **a contact person** (who a message/call reaches), and **a phone/email pair** (which may differ per contact person). `Independent Handyman / Jose Rodriguez` happens to need only one of each; `Breeze Air` needs one provider entity and (per the brief's own example) three contact people — Joseph (owner), Sarah (dispatcher), Mike (technician) — with one of them (Sarah) marked as the **preferred service-request destination**.

### 22.2 Proposed smallest-safe evolution (not created in M0)

Rather than a new parallel table, **evolve `property_contacts` again**, the same way Milestone 11 evolved it into PropCrew without creating a new table:

```
alter table property_contacts add column provider_kind text
  check (provider_kind in ('individual', 'company')) default 'individual';
```

Add one new table for the (currently non-existent) multi-contact-per-company case:

```
property_contact_people
  id, provider_id uuid not null references property_contacts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  title text,                       -- 'Owner' | 'Dispatcher' | 'Technician' | free text
  phone text, email text,
  is_preferred_dispatch boolean not null default false,
  created_at
)
-- partial unique index: at most one is_preferred_dispatch = true per provider_id
```

- For `provider_kind = 'individual'`, `property_contacts`' own existing `name`/`phone`/`email` columns remain the single source of truth — **no `property_contact_people` row is required or created**, exactly matching the brief's "for an independent handyman, the provider and primary contact may effectively be the same person."
- For `provider_kind = 'company'`, `property_contacts.name`/`phone`/`email` become the company's own general/fallback contact info, and zero-or-more `property_contact_people` rows represent named individuals. `is_preferred_dispatch` (at most one `true` per provider, enforced by a partial unique index — the same idiom `tenant_property_access_live_unique` already uses) is what a maintenance request's outreach should target by default.
- **A maintenance request is assigned to the provider entity** (`property_contacts.id`, matching `maintenance_requests.assigned_contact_id`'s existing shape) — never permanently to one `property_contact_people` row. Which person actually handled a given request (who accepted, who was on-site) is instead recorded per-event/per-token ([§14](#14-provider-secure-link-model)'s `contact_person_name`, [§20.1](#201-reuse-extended)'s `actor` on thread events), not as a foreign key on the request itself.
- This evolution is **additive and backward-compatible** — every existing `property_contacts` row defaults to `provider_kind = 'individual'`, which is exactly how it already behaves today (a single name/phone/email, no sub-contacts), so nothing about the current PropCrew UI or Reel #3's own use of this data changes.

---

## 23. Notifications

### 23.1 What's genuinely new vs. reused

- **Reused as-is**: the Resend-via-fetch email pattern, its gate/no-throw/no-echo discipline ([§1.6](#16-communication-infrastructure)).
- **Genuinely new**: SMS, entirely — no provider, no abstraction, no phone-verification exists today. This needs the same discipline as every other integration in this codebase: a swappable-provider interface (even if only one real backend is wired at first — Twilio is the obvious default given ubiquity, but this is a real vendor decision, not an architecture one, and explicitly **not chosen or wired in M0** per the milestone's own instruction), a hard `isConfigured()` gate, non-throwing failure handling, and **never inventing message content beyond a server-rebuilt template**, matching the email pattern exactly.
- **Genuinely new**: any in-app notification tray — none exists. V1 can likely launch without one (email + SMS covering every transactional need), deferring an in-app tray to V1.1/V2 unless a specific event needs it sooner.

### 23.2 Event → channel matrix (proposed, not final — needs product sign-off)

| Event | Tenant | Landlord | Provider |
|---|---|---|---|
| Request submitted | — | Email (+ in-app once it exists) | — |
| Resolved during intake | Email confirmation | Email (low-priority) | — |
| Urgent escalation | Prominent in-app warning at submission | **SMS**, immediately | — |
| Provider outreach sent | — | Email confirmation | **SMS + email** (the entry point) |
| Provider accepted/declined | Email (status update) | Email | — |
| Inspection scheduling needed | **SMS** (needs their action) | — | — |
| Inspection confirmed | Email | Email | — |
| Technician en route / onsite | Email or SMS (TBD — likely SMS, time-sensitive) | Email | — |
| Diagnosis + within-authorization | — | Email (**informational**, not action-required) | — |
| Diagnosis + above-authorization (approval needed) | — | **SMS**, immediately, action-required | Immediate in-page state change |
| Call/callback requested | — | **SMS** | **SMS** |
| Work completed | Email | Email | — |
| Invoice uploaded | — | Email | — |
| Request closed | Email | — | — |

### 23.3 Avoiding spam

- **Transactional vs. informational** distinction should be a real field on whatever notification-sending abstraction is built (not just a convention), so a future "notification preferences" feature ([§31](#31-deferred-scope)) has something concrete to gate.
- No event should generate more than one notification per channel per occurrence — e.g., a landlord within-authorization notification is sent once, not re-sent on every subsequent thread message about the same diagnosis.
- Idempotency: sending must be safe to retry (e.g., a webhook redelivery, a route retried after a timeout) without double-sending — needs an idempotency key per (event, recipient) pair, a real testing requirement ([§36](#36-testing-strategy)).

---

## 24. Security / RLS

Every new table follows [§1.9](#19-authentication-authorization-rls-conventions)'s nine house rules without exception. The specific new mechanisms this feature needs, beyond what already exists:

1. **Provider access is not `auth.uid()`-based at all.** Every existing RLS policy in this schema assumes a Supabase-authenticated caller. Provider-facing routes ([§14](#14-provider-secure-link-model)) instead run as a **server route** that verifies the presented token itself (hash comparison + expiry + revocation check) and then acts using a scoped, elevated (`SECURITY DEFINER`-equivalent server-side) capability limited to exactly that one request — never a direct client-side Supabase RLS session for the provider. This is a genuinely different security shape from everything else in this codebase and needs its own careful design pass at implementation time, not just "add another RLS policy."
2. **A new `owner_has_maintenance_coordination()`-style entitlement gate** (or reuse of `owner_has_tenant_connect()`, if the product-owner decides Maintenance Coordination ships as part of the same entitlement rather than a separate one — [§35](#35-product-owner-decisions-required-before-implementation)), following `owner_has_tenant_connect()`'s exact `SECURITY DEFINER` shape.
3. **Tenant exposure boundary, explicit and re-verified in every new tenant-facing query**: never `estimated_value`, `mortgage_balance`, `purchase_price`, `monthly_expenses`, equity/investment-analysis data, tax data, private landlord-only documents, the full PropCrew list, or any other property/request the tenant isn't a party to. Any new tenant-facing read must go through a column-limited view (the `tenant_property_view`/`tenant_lease_view` pattern) if the underlying table has any landlord-only columns at all — never a bare RLS policy on the raw table, for exactly the reason the M24 migration's own Round 6 review caught.
4. **Provider exposure boundary**: never the landlord's full account, full property record, other requests, other properties, PropCrew list, or tenant contact info beyond what's explicitly part of this one request's outreach payload.
5. **Reassignment**: changing `assigned_provider_id` on a request must (a) revoke the old provider's token immediately, (b) issue a new one to the new provider, (c) record the reassignment as an audit event — never a bare column UPDATE with no side effects.
6. **Tenancy termination**: when `tenant_property_access.status` flips to `Revoked` (existing mechanism, unchanged), that tenant's read/write access to every Maintenance Coordination row tied to their `tenant_access_id` must end immediately, the same way it already does for `property_conversations`/`property_messages` today — new policies must re-derive this the same relational way, never a bare `owner_id`/`tenant_id` check with no status re-verification.
7. **Request closure**: closing a request should not delete or hide it — it becomes read-only history (state = `closed`), consistent with every other "retire, don't delete" table in this schema.

---

## 25. Audit trail

No generic audit-log table exists today ([§1.5](#15-documents-photos-notifications-audit)) — this feature needs one, following the `ai_usage_events` precedent (append-only, no UPDATE/DELETE policy) rather than inventing a new pattern:

```
maintenance_audit_log
  id, request_id,
  actor_kind ('landlord'|'tenant'|'provider'|'system'|'ai'),
  actor_id text null,           -- user_id, provider_token id, or 'system'/model name
  action text not null,         -- fixed enum, mirrors maintenance_thread_events' event_type where applicable
  detail jsonb,
  created_at
```

This is **distinct from** `maintenance_thread_events` ([§20.1](#201-reuse-extended)) even though the two will overlap heavily in practice: the thread is a **user-facing** narrative (rendered in the Service Thread UI, only the events relevant to participants); the audit log is a **complete, unfiltered** record of every consequential write (including ones no participant needs to see rendered inline, e.g. a token-verification failure, a rate-limit hit, an AI call's model/token usage). Every authorization/approval/quote-decision write specifically ([§11](#11-owner-pre-authorization-model), [§17](#17-quote-model), [§18](#18-real-time-approval-flow)) must write an audit row in the **same transaction** as the decision itself, not as a best-effort afterthought.

---

## 26. State machines

Per the brief's explicit instruction to keep this small and avoid "a giant fragile status enum," this is split into **four separate state concerns**, each with its own narrow vocabulary, rather than one mega-enum trying to represent everything:

### 26.1 Request state (the top-level `state` column)

```
submitted
  → guided_intake              (if intake not yet complete)
  → resolved_in_intake          [terminal-ish; can still be reopened → landlord_review, a real product question]
  → landlord_review
  → provider_selection
  → provider_contacted
  → provider_declined           → provider_selection (loop back)
  → scheduling                  (covers both "need inspection" and "need repair visit" — see §26.2 for the appointment-level detail)
  → diagnosis_pending
  → quote_pending                (diagnosis submitted, quote awaiting the within/above-authorization branch)
  → approval_required            (above-authorization only)
  → approved                     (either mode — see §18)
  → work_in_progress
  → work_completed
  → closed
  → cancelled                    (landlord- or system-initiated, from most states)
  → urgent_escalation            (can be entered from ANY state, per §7 — this is the one state reachable as an interrupt, not just a forward transition)
```

### 26.2 Appointment state (per `maintenance_appointments` row, §15) — separate from request state

`proposed → confirmed → completed`, or `proposed → declined`, or `→ cancelled`. A request can have multiple appointments over its life (inspection, then a separate repair visit) — this is exactly why it's a **sub-state**, not a top-level request state: collapsing it into the request's own state would force one request-state value to represent "which of possibly several appointments are we talking about," which is the "giant fragile enum" the brief warns against.

### 26.3 Quote state (per `maintenance_quotes` row, §17) — separate

`pending → approved | declined | expired | superseded`. Multiple quotes can exist per request over time (a remote quote, then a revised post-inspection one) — same reasoning as appointments.

### 26.4 Authorization state (per `maintenance_authorizations` row, §11) — separate

Active / revoked / superseded / (implicitly) consumed — tracked via its own `revoked_at`/`superseded_by`/`consumed_at` columns rather than a single enum, since more than one of these facts can be true in sequence over the row's life.

### 26.5 What's an *event*, not a state (per the brief's explicit ask)

Things like "provider contacted," "inspection availability requested," "technician onsite," "invoice uploaded" are **`maintenance_thread_events`** ([§20.1](#201-reuse-extended)), not top-level request states — they're narrative/audit facts that happen *within* a state (usually `provider_contacted` or `work_in_progress`), not states themselves. This is the concrete answer to the brief's "identify sub-state/event models that should NOT be represented as top-level request states."

---

## 27. AI boundaries

| Appropriate | NOT appropriate |
|---|---|
| Summarizing a tenant's free-text initial description | Presenting an uncertain diagnosis as fact |
| Selecting/routing the correct guided-intake branch from that description | Giving repair instructions beyond the pre-authored, safety-reviewed question tree |
| Interpreting a free-text intake answer into a fixed expected value | Authorizing spend of any kind, at any amount |
| Suggesting a service category | Hiring/selecting a provider on its own authority |
| Identifying missing information in a request | Determining legal property-entry rights or compliance |
| Researching current local pricing (grounded, cited — §10) | Exposing private information across the tenant/provider/landlord boundary |
| Matching a request to a PropCrew category (and, later, a specific provider via `property_systems` history) | Acting as the sole/final safety-escalation decision-maker (§7 — the trigger list is human-authored) |
| Drafting (never sending) provider outreach copy for landlord review | Silently merging AI output into a tenant-, provider-, or landlord-authored field |
| Summarizing a submitted quote for a landlord's quick read | Representing an AI cost-guidance range as a guaranteed price |
| Future: provider discovery research (§28) | Autonomously contacting a discovered provider |

Every AI-generated value is stored in its own distinctly-labeled column/table ([§9.1](#91-distinct-record-types-the-briefs-explicit-requirement)) and rendered with a visible "AI" provenance label wherever it's shown to any actor — never presented indistinguishably from a human-authored fact.

---

## 28. Provider-discovery integration boundary

**Architected here; explicitly not implemented in M0 or V1.**

### 28.1 The boundary point

When PropCrew has no category match, the landlord sees three options: **Find someone for me** / **Add someone I know** / **Handle myself**. "Find someone for me" is the only one requiring new infrastructure (a local-business search/discovery step); the other two are just a manual PropCrew-add flow that already exists in spirit today.

### 28.2 Proposed shape (future)

Following the `lib/valuation/provider.ts` swappable-adapter pattern exactly:

```
interface LocalProviderDiscoveryProvider {
  readonly name: string
  search(params: { location, category, radiusMiles? }): Promise<DiscoveredProviderCandidate[]>
}
```
`DiscoveredProviderCandidate` carries the brief's listed signals (category match, residential-service flag, service area, business status, hours, rating/review signals, website, contact methods, licensing info where reliably available) — **sourced from a real external data provider** (e.g., a places/business-listing API), never fabricated by an LLM. This is a genuinely new vendor integration, not something to wire in M1.

### 28.3 The hard boundary

- AI may **research and rank** candidates; it never selects one.
- The landlord reviews candidates, selects one, and **explicitly approves contacting them** — an authorization action of the exact same shape as PropCrew contact-authorization ([§12](#12-propcrew-selection)), just with a discovered candidate instead of an existing `property_contacts` row.
- Once approved, a discovered provider enters the **identical** maintenance-coordination workflow as any PropCrew provider — same secure-link mechanism, same thread, same quote/authorization model. No parallel "external provider" workflow.
- **After successful completion**, "Would you use this provider again?" → **Add to PropCrew** creates a real `property_contacts` row from the discovery candidate's data — this is explicitly how a landlord's *private* PropCrew grows over time, never a shared/public directory. No other landlord ever sees another landlord's discovered-and-added provider.

---

## 29. Legal / safety / compliance flags

Explicit, non-exhaustive list of items that need real legal/safety review **before** any related implementation, not just careful engineering:

1. **Guided-intake question trees** — every category's questions/actions need a genuine safety review pass (not just an engineering read of "does this seem risky"), ideally by someone with relevant domain knowledge (HVAC/electrical/plumbing safety), before any tree ships to a real tenant.
2. **Urgent-escalation messaging content** — what PropRoster tells a tenant during a fire/gas/electrical/flooding trigger is safety-critical copy; needs review, not AI-authored at request time and not engineering-authored without input from someone qualified to write emergency guidance.
3. **Property access / entry rights** — PropRoster records that a tenant offered a window and how presence is arranged; it explicitly does **not** determine whether that constitutes sufficient legal notice/consent for entry under any given jurisdiction's landlord-tenant law. This varies by state/locality and needs real legal input before any "PropRoster says it's OK to enter" framing could ever be considered (and probably never should be — the safer permanent architecture is "PropRoster records consent signals; it never asserts legal sufficiency").
4. **Owner pre-authorization as a substitute for real-time consent** — is a standing dollar-ceiling authorization, set before a technician is even dispatched, legally sufficient authorization for a contractor to perform work, in the relevant jurisdictions? This is a contracts/consumer-protection question, not just a UX one.
5. **Phone number exposure** ([§19.3](#193-phone-number-exposure-a-real-open-question)) — privacy-policy and consent implications of sharing a landlord's or provider's real phone number with the other party.
6. **Provider secure-link liability** — a provider taking action (accepting a job, submitting a diagnosis) via an unauthenticated link raises questions about non-repudiation (can a provider later dispute they were the one who accepted?) worth a legal/product read, especially once real money (quote approvals) is involved.
7. **AI cost-guidance disclaimers** — the range must be presented with unambiguous "not a quote, not a guarantee" language; worth legal review of exact wording, especially once it visibly influences a landlord's authorization ceiling.
8. **Data retention** — how long provider tokens, quotes, diagnoses, and thread content are retained, especially after a tenancy or provider relationship ends, is a policy decision this document does not make.

---

## 30. V1 scope

The brief is explicit: get **one complete, safe, useful maintenance loop working** before advanced AI/discovery. Concretely, V1 is:

- Guided Maintenance Intake, for a **small, hand-authored set of categories** (HVAC and one or two others to start — not all categories from day one), including the safe-observation/safe-action/professional-required/urgent-escalation classification and resolution-through-intake.
- Tenant availability collection at submission.
- Structured request summary (symptom / observations / AI assessment — assessment can be a simple rule-based category mapper initially, not necessarily a full AI call, if that's a faster, lower-risk V1 path — a real scoping call for M1).
- Owner pre-authorization (request-specific ceiling / require-approval / contact-me-first).
- PropCrew selection + explicit contact authorization.
- Provider outreach via SMS and/or email, secure expiring link, no account required.
- Provider response (quote remotely / need inspection / decline).
- Scheduling using tenant-submitted windows first.
- Professional diagnosis + quote, distinct records.
- Real-time within/above-authorization branching, including the digital approve/decline flow.
- Call Landlord / Call Technician (direct numbers, with clear disclosure).
- Completion (notes, invoice, photos) and landlord closure.
- Service Thread (structured events + messages, three-way participant model).
- The full security/RLS/audit model needed to make all of the above safe.
- **Fixing the `tenant_requests` production gap** ([§1.2](#12-existing-maintenance-capability--two-disconnected-systems)) is a prerequisite, not optional V1 scope — nothing above can safely build on a broken foundation.

**Explicitly NOT V1** (see [§31](#31-deferred-scope) for the full list): AI cost-guidance research layer (needs a real external data source decision first), full AI-driven category classification (a simpler rule-based mapper may suffice initially), smart PropCrew matching beyond the existing `property_systems` signal, provider discovery, standing landlord automation rules, masked call-routing, in-app notification tray.

---

## 31. Deferred scope

Explicitly future, not designed in depth here, per the brief's own "additional future PropRoster pillars" framing:

- AI-assisted local provider discovery (architected as a boundary, [§28](#28-provider-discovery-integration-boundary); not built)
- Provider accounts / claimed business profiles
- Multiple simultaneous quotes from different providers on the same request
- Landlord standing automation rules ("routine repairs auto-authorized up to $250," "always contact me above $500")
- Smart-lock integration
- External provider networks (i.e., anything resembling a marketplace between landlords — explicitly ruled out, not just unbuilt)
- Voice calling / masked call-routing infrastructure
- Payments (of any kind — quote approval is not payment processing; this schema has zero payment-rail concepts and this document introduces none)
- Contractor marketplace/network concepts generally
- In-app notification tray
- Notification preference center
- Two-way inbound SMS reply handling (V1 is outbound SMS + a web link; an inbound-SMS webhook/parsing layer is a real, separate piece of infrastructure)
- **Tenant Turnover** ([§32](#32-tenant-turnover-future-boundary))
- **Lease Builder** ([§33](#33-lease-builder-future-boundary))

---

## 32. Tenant Turnover future boundary

Documented as a future product direction only, per the brief's explicit instruction not to design or implement it here.

Potential future lifecycle: tenant notice/lease ending → move-out planning → move-out instructions → property inspection → condition documentation → security-deposit/damage documentation support → cleaning → repairs (likely reusing this very Maintenance Coordination architecture for turnover-driven repairs) → PropCrew coordination → make-ready checklist → property ready → next tenancy.

Two things worth flagging now, for whoever scopes that future milestone: (1) turnover-triggered repairs are a natural, likely reuse of the request/quote/authorization/provider machinery this document proposes, not a reason to build a second one; (2) **no legal conclusions about security-deposit deductions or move-out deadlines should ever be made by PropRoster** — state-specific requirements need their own compliance review, exactly as flagged for entry-notice/consent above ([§29](#29-legal--safety--compliance-flags)).

---

## 33. Lease Builder future boundary

Documented as a future product direction only, per the brief's explicit instruction not to design or implement it here.

Potential future capability: AI-assisted lease drafting from structured data already in PropRoster (landlord, property, tenant, rent, deposit, dates, utilities, pets, rules, selected optional provisions). The brief's own explicit, non-negotiable requirement for whenever this is scoped: PropRoster must never present an AI-generated lease as attorney-approved or guaranteed legally compliant; any future lease experience must prominently communicate that it's a draft, that PropRoster is not providing legal advice, that laws vary by state/locality, that the draft may be missing provisions required for a given property/situation, and that the landlord should have it reviewed by a qualified attorney before use. The brief itself recommends preferring legally-reviewed, jurisdiction-specific **template** foundations over unrestricted AI generation of legal language, with AI's role limited to populating/explaining/organizing within those template boundaries. **This document recommends a dedicated legal/compliance architecture milestone before any Lease Builder implementation begins** — this is not a milestone Maintenance Coordination's own M1–M11 sequence should absorb.

---

## 34. Recommended implementation milestones

The brief's own suggested M1–M11 shape is a reasonable starting point, but the actual audit changes the safest **first** step: fixing the pre-existing `tenant_requests` production gap has to happen before or alongside foundational schema work, not after it, since M1's own "foundational schema" work will otherwise be built on top of a codebase where the shipped Tenant Requests UI is already silently broken.

**M1 — Foundation repair + unified request schema.** Resolve the `tenant_requests` gap (apply the migration as-is, or supersede it directly with the new unified request table from [§9.2](#92-proposed-core-table) — a real scoping decision, since building the new table might make more sense than applying the old one and migrating off it days later). Ship the state machine ([§26](#26-state-machines)), the audit log ([§25](#25-audit-trail)), and the RLS conventions for all of it. No UI changes yet beyond what's needed to unbreak the existing Tenant Requests inbox.

**M2 — Tenant Connect maintenance submission**, rebuilt/verified against the M1 foundation: category selection, Guided Maintenance Intake for a small starter category set ([§6](#6-guided-maintenance-intake-architecture)), safety escalation ([§7](#7-safety-model)), tenant availability collection ([§8](#8-tenant-availability-model)), structured request summary ([§9](#9-structured-request-model)).

**M3 — Landlord maintenance command center**: request inbox/detail, PropCrew suggestion + contact authorization ([§12](#12-propcrew-selection)), owner pre-authorization ([§11](#11-owner-pre-authorization-model)).

**M4 — PropCrew provider/company evolution** ([§22](#22-propcrew-companyindividual-architecture)): `provider_kind`, `property_contact_people`, preferred-dispatch-contact.

**M5 — Provider secure-link workflow** ([§14](#14-provider-secure-link-model)): token issuance/verification, the provider-facing scoped page, accept/decline/inspection-needed.

**M6 — Inspection/tenant scheduling** ([§15](#15-scheduling)).

**M7 — Quotes + landlord approval, including real-time within/above-authorization branching** ([§16](#16-professional-diagnosis)–[§18](#18-real-time-approval-flow)).

**M8 — Service Thread + notifications, including new SMS infrastructure** ([§20](#20-service-thread), [§23](#23-notifications)) — SMS is called out as its own milestone-sized chunk of work deliberately, since it's genuinely new vendor integration, not incremental extension of anything that exists.

**M9 — Completion / invoice / property history** ([§21](#21-completion--property-history)).

**M10 — AI assistance**: intake-branch routing/interpretation, category suggestion, and (only once a real pricing data source is selected and evaluated) cost guidance ([§10](#10-ai-cost-guidance-architecture)) — this milestone should probably be split further once M0's data-source question ([§35](#35-product-owner-decisions-required-before-implementation)) is answered.

**M11 — Provider-discovery fallback** ([§28](#28-provider-discovery-integration-boundary)).

Each milestone should ship independently reviewable, independently testable, and — per this whole engagement's established practice — never merged/deployed without explicit approval.

---

## 35. Product-owner decisions required before implementation

These are genuine decisions, not implementation details — M1 should not start until at least items 1–4 are answered:

1. **The `tenant_requests` production gap** ([§1.2](#12-existing-maintenance-capability--two-disconnected-systems)): apply the existing unapplied migration as an interim fix, or skip straight to the new unified request schema? Either is defensible; they have different migration/rollback risk profiles.
2. **`TENANT_CONNECT_FROM_EMAIL`**: confirm whether this env var was ever actually set in production — if not, Tenant Connect transactional email has never been live either, independent of the schema gap, and that's worth knowing before Maintenance Coordination adds more email templates on the same pattern.
3. **Entitlement structure**: does Maintenance Coordination ship under the existing `owner_has_tenant_connect()` gate (same plans), or as its own, possibly narrower, entitlement? This affects `lib/billing/entitlements.ts` and every new RLS policy's gating function.
4. **Category taxonomy**: keep `tenant_requests`' existing six categories, or adopt the brief's finer-grained list (splitting out Toilet, Lock/Door, Leak/Water)? Changing this later means a real data migration on every existing request row.
5. **Phone-number exposure model for V1** ([§19.3](#193-phone-number-exposure-a-real-open-question)): direct real numbers with disclosure, or hold V1 until a masked-routing option exists? This document's non-binding recommendation is direct-with-disclosure, but it's the product owner's call.
6. **Provider-token lifetime/expiration policy** ([§14.2](#142-properties)): a fixed duration, or tied to request lifecycle state?
7. **SMS vendor selection**: this document deliberately does not choose one (per the milestone's own instruction not to wire a provider in M0) — needs a real vendor evaluation (cost, deliverability, compliance) before M8.
8. **AI cost-guidance data source**: what real external pricing data (or grounded-search-with-citations approach) will back [§10](#10-ai-cost-guidance-architecture)? No existing integration covers this; a real evaluation is needed before M10's cost-guidance slice can be scoped concretely.
9. **Resolved-during-intake reopening**: should a tenant (or landlord) be able to reopen a request that was marked resolved through guided intake, if the issue recurs? Not addressed by this document's state machine as a distinct transition — needs a decision before M2.
10. **Does a closed Maintenance Coordination request also create a `maintenance_records` row**, for consistency with the landlord's existing completed-work log, or does Property Timeline derive from the new tables directly instead? ([§21](#21-completion--property-history).)

---

## 36. Testing strategy

Future implementation must cover, at minimum (mirroring this codebase's existing RLS-test-against-a-real-database discipline, e.g. `supabase/tests/milestone-12-rls.test.sql`, not just policy-text review):

- **Isolation**: landlord A cannot read/write landlord B's requests, authorizations, quotes, or threads, under any FK combination. Tenant A cannot read/write tenant B's request even on the same property. Cross-property denial for every new table.
- **Provider token isolation**: a valid token for request X grants zero access to request Y, even on the same property/provider. Expired tokens are rejected. Revoked tokens are rejected immediately, not eventually. A token cannot be used to enumerate/probe other requests.
- **Guided-intake branching**: every category's question tree resolves correctly for both `resolved_in_intake` and `escalated_to_dispatch` paths; safety-classified questions never present a disallowed action.
- **Urgent escalation**: triggers on every designated keyword/branch; correctly short-circuits ordinary flow; landlord notification fires reliably; audit trail is complete.
- **Authorization limits**: an above-ceiling quote is never auto-approved; an at-or-below-ceiling quote is correctly auto-approved with correct `decided_by` attribution; a revoked/expired authorization is never consumable.
- **Concurrent approval attempts**: simultaneous digital-approve and phone-recorded-approve on the same quote resolve to exactly one winning decision, never both, never neither, never a corrupted state.
- **Quote revision history**: superseding a quote never loses the prior row; `superseded_by` chains are correct and queryable.
- **Scheduling permissions**: only the request's real tenant can respond to an appointment proposal; only the request's real provider (via valid token) can propose one.
- **Document/photo access**: invoices/photos uploaded by a provider are readable by the landlord and (where appropriate) the tenant, never by an unrelated party, never by an expired provider token.
- **Provider reassignment**: old token is fully revoked (zero residual access) the instant a new provider is assigned; audit trail records the reassignment.
- **Company/contact-person behavior**: a request assigned to a company provider correctly surfaces the preferred-dispatch contact by default; company-level fallback contact works when no preferred contact is set; an individual provider's simpler shape is unaffected.
- **State transitions**: every legal transition in [§26.1](#261-request-state-the-top-level-state-column) is reachable and correctly gated; illegal transitions (e.g., `approved → provider_selection`) are rejected server-side, not just hidden in the UI.
- **Notification idempotency**: retried/duplicate triggers of the same event never double-send.
- **Audit completeness**: every authorization/approval/quote-decision write has a corresponding, same-transaction audit row; no code path can write a decision without one.
- **Existing-feature non-regression**: every existing Tenant Connect (M10) and PropCrew (M6/M11) test continues to pass unmodified — this feature extends, never rewrites, those foundations.

---

*End of M0 architecture document. No implementation, migration, merge, or deploy has occurred as part of this milestone.*
