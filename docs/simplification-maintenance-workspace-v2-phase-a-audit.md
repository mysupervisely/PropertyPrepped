# PropRoster Simplification + Maintenance Workspace V2 — Phase A: Audit + Plan

No product code changed in this phase. This document is the deliverable.

Branch: `claude/proproster-simplification-maintenance-workspace-v2`
Baseline: `main` @ `57ed746822f649eecbc375109856413419afb664` (PR #60 merged/deployed).

## 1. Typography audit

- `app/globals.css` `body` sets `font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` — **but no font is ever actually loaded** (`app/layout.tsx` has no `next/font` import, no Google Fonts `<link>`, no local font file). "Inter" only renders if the visiting device happens to have it installed system-wide, which is rare. In practice almost every visitor already gets the system UI font (San Francisco on Apple devices, Segoe UI on Windows, Roboto on Android) via the fallback chain. This is arguably fine — system fonts are a legitimate, zero-cost, Apple-adjacent choice — but the stack currently *pretends* to be Inter-first without delivering it.
- **No serif usage anywhere.** Grepped the whole stylesheet for `font-family`: exactly one rule sets body text (above), a handful set `ui-monospace, SFMono-Regular, Menlo, monospace` for code blocks (correct, intentional), and every form input uses `font-family: inherit`. There is no serif audit finding to fix — the concern in the brief doesn't apply here.
- **Font-weight sprawl:** 7 distinct values in active use — `400, 500, 600, 650, 700, 750, 800` — with unclear, inconsistent semantics (650 and 700 are both used for "emphasized label," 700/750/800 all show up on headings/eyebrows). A clean system typically needs 3: regular (400), medium/semibold (~600), bold (700).
- **Letter-spacing sprawl:** mix of fixed-`px` and relative-`em` values (`-2px`, `-1px`, `-0.7px`, `-0.6px`, `-0.5px`, `-0.4px`, `-.3px`, `-0.02em`, `-0.025em`, plus positive values for uppercase eyebrows: `.02em`–`.04em`, `.2px`–`1.4px`). One rule's own in-file comment (`h1` in globals.css) already documents that a fixed-px value under a responsive `clamp()` font-size caused a real mobile bug once — i.e. this inconsistency has already caused a shipped defect, not just a style-purity concern.
- **406 `font-size` declarations** in `globals.css` — expected for an app this size, but consistent with "no defined type scale": sizes look chosen per-component rather than drawn from a small reusable set.
- **16 `text-transform: uppercase` rules** (mostly `.eyebrow`-style section labels) — not excessive on its own, but combined with 7 weights and inconsistent letter-spacing, eyebrows/labels currently carry more visual weight than the content below them in places.
- No component-level typography audit was done beyond this (out of scope for Phase A — see Phase B).

## 2. Navigation / UX audit

**Global authenticated nav** (`components/AuthNavMenu.tsx`, `AuthHeader.tsx`): a hamburger menu, already pared down once before (Property-First Simplification V2). Top-level: Dashboard, Documents, **Maintenance**, Tax Center, PropCrew, Investment Tools, then Profile/Pricing de-emphasized, plus (from PR #60) a conditional Tenant Portal link for dual-role accounts. This list is already reasonably short — not the main problem.

**Property-level nav** (`app/page.tsx`):
```
Tab:            Overview | Rent | Details | PropCrew | Documents | Tax
Rent sub-tab:      Lease | Ledger | Tenant
Details sub-tab: Mortgage | Insurance | Maintenance | Systems | Ownership
```
A single property already exposes **6 top-level tabs + 8 sub-tab destinations** (14 total landing states). The specific, real discoverability problem: a property's own maintenance work lives at **Details → Maintenance** — two clicks deep, behind a tab name ("Details") that gives no hint maintenance is there. Rent → Tenant is a second stop a landlord could plausibly expect maintenance to live (it doesn't overlap in data, but it does overlap in a landlord's mental model of "tenant stuff").

**Mobile breakpoint sprawl:** 60 `@media` rules across **15 different breakpoint values** (380/390/430/460/480/560/620/700/720/760/800/900/960/961/980px) — no shared scale. Each fix has been correct and narrowly scoped in isolation, but there's no consistent "phone / tablet / desktop" system to reason about going forward.

## 3. Maintenance entry points — verified, not assumed

This is the one area where the brief's framing needed correcting against what the code actually does. **M3.1 (`docs/tenant-connect-m3.1-maintenance-workflow-unification.md`) already did most of this consolidation**, in response to the exact same complaint (real-device testing found two overlapping maintenance concepts). Verified in code, this session:

| Surface | What it actually is today |
|---|---|
| `/maintenance` (Command Center) | Portfolio-wide inbox. Reads canonical `maintenance_requests` (same rows every property uses), renders the shared `MaintenanceCaseDetail` component. |
| Property → **Details → Maintenance** | THE property-scoped maintenance hub. Same canonical table, same enrichment (`lib/maintenance/command-center.ts`), same `MaintenanceCaseDetail` component. Active Requests + a separate, durable Service History (`maintenance_records` — repairs/vendors/costs — a genuinely different concern, not maintenance coordination). |
| Property → **Rent → Tenant** | **No longer a maintenance UI.** M3.1 already narrowed this to Tenant Connect invite/status + the tenant's own conversation thread only, with an explicit pointer: *"Maintenance requests ... are managed from Details → Maintenance."* |
| `/propcrew` | Portfolio-wide contact directory (create/manage providers). Assignment itself happens contextually inside `MaintenanceCaseDetail`'s own "Assigned PropCrew contact" dropdown — `/propcrew` is not a competing maintenance system, it's where the CONTACTS come from. |
| Provider page (`/provider/[token]`), propose-appointment/confirm routes | Scheduling surfaces, correctly separate (external, unauthenticated provider identity vs. landlord dashboard) — not a duplicate landlord-facing experience. |

**Conclusion: there is exactly one canonical maintenance data model and one shared detail component already.** The real problem is not "multiple competing maintenance systems" — it's (a) **navigation depth/discoverability** (Details → Maintenance is non-obvious), and (b) **`MaintenanceCaseDetail` itself is dense** — it currently renders category/priority/source badges, tenant availability, entry preference, a PropCrew assignment `<select>`, outreach status text, appointment proposal + Confirm/Decline buttons, and a status `<select>`, all visible at once, with no progressive disclosure. And (c), the biggest concrete logic gap:

**`nextActionFor()` (`lib/maintenance/command-center.ts`) predates Provider Outreach V1 / Scheduling V1 and has not been extended.** It only branches on `status` + whether a contact is assigned:
```ts
if (status === 'Completed') return 'completed'
if (status === 'Scheduled') return 'scheduled'
if (status === 'In Progress') return 'in_progress'
return assigned_contact_id ? 'awaiting_review' : 'assign_provider'
```
It has no idea whether outreach was ever sent, whether the provider accepted/declined/asked a question, or whether a proposed appointment is sitting there awaiting a landlord decision — all real states `maintenance_provider_outreach`/`maintenance_appointments` already track. Today, once a contact is assigned, the UI just says "Review and start progress" regardless of which of those states is actually true. **This is the concrete, load-bearing fix Maintenance Workspace V2 needs** — extending this one function's state machine, not inventing UI from nothing.

## 4. Recommended simplified information architecture (directional, not final)

Keep it evolutionary — the brief's suggested `Home / Rent / Maintenance / Property` is close to right, but "Rent" and "Property" need a real boundary check before renaming anything (Rent already contains Lease + Ledger + Tenant-Connect-status; Details contains Mortgage/Insurance/Systems/Ownership — genuinely different audiences: money-in vs. property-record-keeping). Proposed direction to validate in Phase D/E, not decide now:

```
Home          — dashboard, unchanged in spirit (Needs Your Attention / Upcoming / My Properties)
Rent          — Lease, Ledger, (Tenant Connect status/conversation folds in here or stays a clearly-labeled sub-item)
Maintenance   — property-scoped view of the SAME canonical workspace /maintenance already is portfolio-wide
                (i.e. surface it as a top-level property tab, not buried in Details)
Property      — Mortgage / Insurance / Systems / Ownership / Overview facts (the current "Details" + "Overview" merged)
Documents     — unchanged
Tax           — unchanged (or folds under Property, needs validation against how often it's used standalone)
PropCrew      — unchanged, contextual + standalone
```
The one concrete, low-risk, high-value move visible right now: **promote Maintenance from a Details sub-tab to its own top-level property tab**, pointing at the exact same component/data that already exists. That alone resolves most of the discoverability complaint without moving any other tab.

## 5. Proposed Maintenance Workspace V2 — layout and next-action logic

Extend `NextAction` (currently 5 values) to cover the states that already exist in the data:

```
assign_provider          — Submitted, no contact assigned
ready_to_contact         — Submitted, contact assigned, no outreach sent yet
awaiting_provider        — outreach sent, not yet accepted/declined
provider_declined        — outreach declined or needs_information (landlord must act)
awaiting_proposal        — provider accepted, no appointment proposed yet
confirm_or_decline       — a proposed appointment is pending landlord decision
scheduled                — confirmed appointment, work not yet started
in_progress
completed
```
Each maps to exactly one prominent primary action (matching the brief's own worked examples — "Assign provider," "Contact Mike," "Confirm appointment"), with the current state rendered as a short status line above it, not a stepper. Secondary actions (Decline/Request another time, reassign, mark In Progress manually) stay visually quieter, matching the existing `.secondary` button treatment already in the design system.

Progressive disclosure candidates already identified in the current markup: the full tenant intake description/safety flags, provider-response history (outreach status text), and the status `<select>` (advanced/manual override) all belong behind a "Details" or "More" affordance — **never** the availability/entry-preference safety information itself, which the brief explicitly says must stay visible.

## 6. Typography / design-system direction (proposal, not applied)

- Collapse font-weight to 3 tokens (`--weight-regular: 400`, `--weight-medium: 600`, `--weight-bold: 700`) and migrate call sites gradually — do not do this as a single giant find/replace across 130+ occurrences in one PR.
- Either (a) load Inter properly via `next/font/google` (Next's own build-time self-hosted font optimization — not a "heavy dependency," no runtime request to Google, this is the technically-correct way to keep the brand's chosen typeface), or (b) drop "Inter" from the stack entirely and commit to the system-font chain that's already the de facto reality. Recommendation: (a), since Inter was presumably a deliberate brand choice and the cost of doing it right is low — but this is a real decision for you, not mine to make unilaterally.
- Define a small type-scale as CSS custom properties (e.g. `--text-xs/sm/base/lg/xl/display`) so new/touched components stop inventing one-off sizes; existing sizes migrate opportunistically as components are touched in Phases C–E, not in one sweep.
- Normalize letter-spacing to the existing `em`-relative convention only (drop the remaining fixed-`px` values) — this doubles as a real, already-precedented bug fix (the `h1`/`clamp()` interaction documented in the file itself).
- Wordmark (`components/Wordmark.tsx`, `.wordmarkProp` / `.wordmarkRoster` two-tone treatment) is explicit-color, not inherited from body font-family — it keeps its brand distinction regardless of any UI font change. No action needed there.

## 7. Components that can be reused as-is

`MaintenanceCaseDetail`, `lib/maintenance/command-center.ts` (enrichment/sorting), `lib/maintenance/availability.ts`/`appointments.ts` (all pure logic, already well-tested), the provider outreach send/response routes, the propose-appointment/confirm routes, `TenantConnectStatusCard`, the tenant portal (`app/tenant/page.tsx`) and its lease-document route, `/propcrew` directory, `AuthNavMenu`/`AuthHeader` shell. None of this needs rebuilding — V2 is primarily a **presentation and next-action-logic layer** on top of data/authorization that already works and was just real-device-validated.

## 8. Components/screens to consolidate or retire

- Nothing needs deleting. Rent → Tenant's copy already correctly redirects to Details → Maintenance (M3.1) — worth revisiting once Maintenance becomes a top-level tab (Phase D), so the pointer text stays accurate.
- `/rent-ledger` is already a "compatibility route, no longer primary nav" per its own existing comment — leave as-is, not this milestone's concern.

## 9. Mobile-specific recommendations (directional)

- Consolidate the 15 ad-hoc breakpoints toward a small shared scale as components are touched (not a blanket rewrite).
- `MaintenanceCaseDetail`'s current stacked-sections layout is already reasonably mobile-friendly (no horizontal scroll issues found); the main mobile win is the same one as desktop — less simultaneous content, one clear primary action button full-width on phone per existing `.primary`/`.secondary` conventions already used elsewhere (e.g. Tenant Portal).
- Left-edge clipping on the authenticated landlord dashboard (already deferred) may naturally resolve once spacing tokens are normalized in Phase B — no separate fix planned, consistent with the instruction not to chase it directly.

## 10. Phased implementation plan

- **Phase B — Typography + foundational visual system.** Font-loading decision, weight/letter-spacing token consolidation, type-scale tokens. CSS-only, additive tokens first, migrate call sites opportunistically. Lowest risk, unlocks everything visual after it.
- **Phase C — Maintenance Workspace V2 core.** Extend `nextActionFor()`'s state machine (pure logic, fully unit-testable, zero schema change — every input already exists in `maintenance_provider_outreach`/`maintenance_appointments`). Redesign `MaintenanceCaseDetail`'s layout around current-state + one primary action + progressive disclosure, reusing existing sub-components/data as-is.
- **Phase D — Consolidate maintenance entry points/navigation.** Promote Maintenance to a top-level property tab (pointing at the same component Details → Maintenance already renders); update Rent → Tenant's pointer copy; keep `/maintenance` portfolio view and `/propcrew` as they are.
- **Phase E — Dashboard/property simplification.** Apply the Phase B visual system to the dashboard and remaining property tabs; evaluate the `Home/Rent/Maintenance/Property` grouping for real (not just Maintenance).
- **Phase F — Mobile polish + regression validation.** Sweep the consolidated breakpoint scale across touched surfaces; full regression pass (existing wiring-test convention) before considering any further merge.

This sequence matches the codebase's own dependency order: Phase C (logic) doesn't require Phase B (visuals) to be done first, but doing typography first means Phase C's new UI is built directly against the target visual system instead of being restyled twice.

## 11. Risks / regressions to protect against

- `nextActionFor()` is read by both the Command Center and every property's Details → Maintenance — a change there affects both surfaces at once; needs full existing-test-suite coverage plus new cases before it ships (Phase C).
- `MaintenanceCaseDetail` is shared across `/maintenance` and `app/page.tsx` — any layout change must preserve every prop/behavior both callers depend on (assignment, outreach, availability, appointment actions) — verified this session, not assumed.
- Nothing in this milestone should touch RLS, `tenant_property_access`, `accept_tenant_invite()`, provider tokens, or any migration — all untouched in Phase A, and none of the proposed phases require schema changes (the next-action extension is pure derivation from existing columns).
- Font-family/weight changes touch effectively the whole app visually — needs a broad manual pass (screenshots or real-device spot checks) before merge, even though no logic changes.
