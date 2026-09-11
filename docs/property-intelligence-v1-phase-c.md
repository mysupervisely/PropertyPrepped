# Property Intelligence V1 — Phase C: Property Overview Snapshot

Companion to `docs/property-intelligence-v1-phase-a.md` (audit) and `docs/property-intelligence-v1-phase-b.md` (the calculation engine, corrected by Phase B.1). This phase surfaces that engine on the property page — no new calculations, no schema changes, no portfolio/dashboard/homepage changes.

## Where it appears

`app/page.tsx`, the property Overview tab (`activeTab === 'Overview'`) — the same "at a glance" surface that already shows property facts, financial details, and rent/tenant context. The new **Property Snapshot** card is the first thing in that tab, above the pre-existing "Financial details"/"Property facts" panels. It does not touch the property hero (Value/Mortgage/Equity/Rent/Tax, visible on every tab) or any other tab.

## Primary metrics (always visible when Overview is open)

**Property Snapshot**: Estimated Value, Estimated Equity, Monthly Rent — three `.financialStat` cards, one row.

**YTD Performance** (labeled with the tax year, e.g. "2026", in small muted text — never visually dominant): Income, Expenses, NOI — the same card pattern, a second row.

## Progressive disclosure — "View performance"

A native `<details>/<summary>` (collapsed by default, zero new JS — the same pattern already used for the dashboard's Recent Activity), revealing: YTD NOI, Cap Rate, Net Cash Flow, Mortgage Balance, Contract Annual Rent. Quiet, conditional one-line notes appear only when relevant:

- Cap Rate unavailable → "Available after a complete year of income and expense data."
- Net Cash Flow unavailable → "Available when complete annual performance and debt-service data are available."
- Mortgage Balance present → "Based on the mortgage balance saved in PropRoster." (always shown when a balance is available — both its possible sources are permanently flagged `potentiallyStale` by the engine)
- Monthly Rent came from the property-level fallback, not an active lease → "Based on the property's saved rent estimate — no active lease on file."
- Equity unavailable → "Add a property value and mortgage balance to estimate equity."

## Empty/missing metric behavior

Every number on this card passes through one of two tiny, presentation-only helpers in `app/page.tsx`:

```ts
function metricMoney(metric: Metric, suffix = ''): string {
  if (metric.status !== 'available' || metric.value === null) return '—'
  return `${money(metric.value)}${suffix}`
}
function metricPercent(metric: Metric): string {
  if (metric.status !== 'available' || metric.value === null) return '—'
  return `${metric.value.toFixed(1)}%`
}
```

`incomplete` renders the same as `unavailable` — a quiet `—`, never a qualified number with an asterisk. This is a deliberate Phase C simplification: only `operatingExpensesYtd` can realistically be `incomplete` on this card (a suspicious `$0` with other data present), and it doesn't warrant a second visual treatment for one case. No developer-facing word (`available`/`incomplete`/`unavailable`/`estimated`/`potentiallyStale`) is ever shown to the user — each is translated into either silence (a clean number, no caption) or one of the quiet notes above. Negative NOI/Net Cash Flow use the pre-existing, subtle `.metricTone-bad` class (the same one Appreciation already uses) — a muted red-brown, never an alarming banner.

## How the Phase B.1 engine is consumed

No formula is written in `app/page.tsx`. The property Overview already loads everything the engine needs — `selectedLeases`, `selectedMortgages` (already queried `.order('created_at', {ascending: false})`, so `[0]` is the exact same "current mortgage" the Mortgage tab already treats as authoritative), `selectedTransactions`, `selectedMaintenance`, `selectedTaxRecords`, `selectedTaxCustomItems` — filtered to the current calendar year and passed straight into:

```ts
const performance = computePropertyPerformance(buildPropertyPerformanceInput({
  property: selected,
  leases: selectedLeases,
  currentMortgage: selectedMortgages[0] || null,
  yearTransactions: selectedTransactions.filter((tx) => tx.transaction_date.startsWith(performanceYear)),
  yearMaintenanceRecords: selectedMaintenance.filter((m) => m.service_date.startsWith(performanceYear)),
  taxRecord: performanceYearTaxRecord,
  yearCustomItems: performanceYearCustomItems,
  year: performanceYear,
}))
```

No new Supabase query. `lib/property-intelligence/resolve.ts` and `calculate.ts` do 100% of the source resolution and math; `app/page.tsx` only assembles their input and renders their output. `calculateNOI`/`capRate`/`equity` (`lib/investment-calculations.ts`) are never imported into `app/page.tsx` — enforced by a dedicated test (see Tests below).

## Mobile

`.performanceStats.financialStats` (the reused `.financialStats` card pattern, restyled to 3-across) collapses to a single stacked column at `≤560px` — 3 items don't divide evenly into 2, so a full stack reads more cleanly than an awkward 2+1 wrap. Verified with real headless-Chromium screenshots at 320/390/430/1280px across all 5 representative data states (see Visual QA) — no horizontal overflow at any width.

## Known UX/data limitation surfaced by this phase

**Annual NOI, Cap Rate, and Net Cash Flow will rarely appear in practice**, because this Overview snapshot always builds the engine's input for the *current* calendar year — and per Phase B.1, those three metrics only become available once their underlying tax year is fully elapsed. A landlord will see YTD NOI year-round, but Cap Rate/Net Cash Flow/annual NOI stay `—` until PropRoster has a genuinely complete prior tax year of data for that property. This is intended, correct behavior (the entire point of Phase B.1), not a bug — but it does mean this phase's own Scenario D (a property with a complete year of data) cannot be demonstrated live today without a real property that has crossed a calendar year boundary in PropRoster; it was verified by computing the engine directly with a completed prior-year input (see Visual QA).

**A newly-discovered opportunity, not acted on in this phase**: `properties.financing_status` (`'Active Mortgage' | 'Paid Off' | 'No Mortgage' | 'Unknown'`, added by an earlier milestone) is not read by the Phase B.1 engine at all. If a landlord has explicitly marked a property `'Paid Off'` or `'No Mortgage'`, the engine could in principle treat mortgage balance as a confirmed `$0` instead of `unavailable` — resolving the "no mortgage vs. never entered" ambiguity documented as a known limitation in Phase B.1, for a real, existing subset of properties. This would be an engine change (Phase B.2-style), not a UI one, and is out of scope here — flagged for a future phase to evaluate.

## Tests

`lib/dashboard/property-intelligence-v1-phase-c-wiring.test.ts` (18 tests, new) — source-read guards (the same no-jsdom convention every other `app/page.tsx` test in this repo uses) covering: primary metrics render with correct labels; Monthly Rent uses `contractMonthlyRent` (never actual income, never a raw property field); missing metrics never render as `$0`/`0%`; YTD labels are never confused with "Annual"; Cap Rate/Net Cash Flow are read verbatim from the engine, never hardcoded; Estimated Equity's explanation is quiet and conditional; the disclosure is a plain `<details>`, no new JS state; no formula is written in the Property Snapshot section; `app/page.tsx` never imports the raw calculation primitives; no new Supabase query was added; the mobile breakpoint exists; the design system's existing classes are reused, never new ones invented.

`lib/dashboard/property-profile-mobile-polish-v3.test.ts` — one pre-existing guard ("no cap-rate formula was ever written in this file") rescoped from file-wide to the pre-existing Financial Details card specifically, since Phase C now legitimately *displays* a Cap Rate figure elsewhere (read from the engine, not calculated).

Targeted run: `lib/dashboard/`, `lib/property-intelligence/` — **398 tests pass**. `npx tsc --noEmit` and `npm run build` are both clean.

## Visual QA

Representative data states (A: full current-year data; B: value+rent only, no lease/mortgage/financials; C: lease + YTD data, no mortgage; D: a complete prior tax year, unlocking Cap Rate/Net Cash Flow; E: negative YTD NOI) were computed with the real engine (`computePropertyPerformance`) and rendered in a static HTML mirror of the exact JSX/CSS classes, screenshotted via headless Chromium at 320/390/430/1280px. No horizontal overflow at any width or scenario. One real spacing issue was found and fixed during this pass: two quiet notes landing back-to-back (a fallback-rent note immediately followed by the equity-explanation note, Scenario B) read as one run-on caption — `.propertyPerformanceNote + .propertyPerformanceNote { margin-top: 8px; }` now separates them.

## Phase C.1 — Unified Property Snapshot

A pass over the actual production property page on mobile found that Phase C's own Property Snapshot had landed as a FOURTH place showing financial numbers, alongside the pre-existing hero metric strip (Value/Mortgage/Equity/Rent/Tax, on every tab), the pre-existing "Financial details" card, and the Investment Analysis button — several of them overlapping or, in one case, outright contradicting each other. Phase C.1 consolidates all of that into ONE authoritative snapshot and fixes the contradiction at its root. No prior-year/full-year Annual NOI work, no `financing_status` integration, and no Phase D scope was started — those remain exactly as scoped below.

### The hero is now identity-only

The five-metric `.heroMetrics` row (Value/Mortgage/Equity/Rent/Tax) is removed from the property hero entirely. The hero now shows only photo, address, city, occupancy/rent status, and the Edit/Investment Analysis actions — every financial number lives in exactly one place, the Property Snapshot on the Overview tab. The naive `equity` local (`estimated_value − mortgage_balance`, no unavailable handling) that fed the old hero strip is deleted; nothing replaced it, because the hero no longer shows equity at all — the Property Snapshot's `performance.equity` is the only equity figure on the page now.

### The unified Property Snapshot — final hierarchy

One card, four tiers, in this order:

1. **Primary** — Estimated Value, Estimated Equity, Monthly Rent (unchanged from Phase C).
2. **YTD Performance** — Income, Expenses, NOI, labeled with the tax year (unchanged from Phase C).
3. **Secondary/contextual** (new) — Mortgage Balance and Purchase Price + Appreciation, in a quiet `.detailRows` list (the same plain label/value pattern used elsewhere on the page) rather than another `.financialStat` grid, so it visibly reads as supporting context, not more headline numbers. Mortgage Balance moved here from inside "View performance" (no longer buried behind a click); Purchase Price and Appreciation moved here from the old Financial Details card, using the exact same `appreciationFor()` calculation, unchanged — just relabeled "Appreciation (est.)" so it's never mistaken for an appraisal.
4. **"View performance"** (refined) — Cap Rate, Net Cash Flow, Contract Annual Rent. YTD NOI and Mortgage Balance were removed from this disclosure since Phase C.1 now shows both above it — the disclosure only ever holds figures that aren't shown anywhere else on the card.

### What happened to the old "Financial details" card (field-by-field)

- **Monthly property expenses, Annual property tax, HOA** — editable property-level inputs, not performance figures. Kept, unchanged, under a card renamed **"Expenses & tax"** (same CSS class, `financialDetailsCard`, just relabeled) to make that distinction clear.
- **Purchase price, Appreciation** — moved into the Property Snapshot's secondary row (see above). Same calculation, not duplicated, not recreated.
- **"Estimated cash flow"** (`selected.monthly_rent − selected.monthly_expenses`) — **retired from presentation entirely.** It was a second, non-engine "cash flow" concept sitting next to the Phase B.1 engine's period-safe Net Cash Flow and YTD NOI, and would have kept contradicting them indefinitely. The `monthlyCashFlow` local was deleted. The underlying `monthly_rent`/`monthly_expenses` data and Edit capability are untouched — only this one competing display is gone.
- **Property facts** (beds/baths/sqft/year built/lot size/purchase date) — untouched, stays in its own separate card, never folded into the financial metric grid.

### The "Rent Unknown" contradiction — root cause and fix

The production screenshot showed "Occupied / Rent Unknown" status pills next to a separately-displayed "Rent $2,350/mo" figure — a real contradiction. Root cause, confirmed by reading `lib/rent-ledger/status.ts` in full: `RentStatus.Unknown` means the payment **due date** can't be determined (`lease.rent_due_day` missing) — it has nothing to do with whether the rent **amount** is known (`expectedAmount`, from `lease.monthly_rent`, is populated correctly even when status is `'Unknown'`). That function is correct for its own purpose (payment tracking, used elsewhere in the app too) and was **not modified**.

The fix is presentation-only: a single `rentAmountKnown = performance.contractMonthlyRent.status === 'available'` const, computed once, gates the pill at both places it appears — the hero's status pills and the "Rent & tenant" panel's rent row. `Rent {status}` never renders when `status === 'Unknown'` AND the canonical rent amount is known; it still renders normally for every other status (Due/Paid/Partial/Overdue/Upcoming), and for a genuinely unknown rent amount too. This reuses Property Intelligence's existing canonical rent resolution rather than inventing a second, competing rule — exactly as required.

### Investment Analysis — de-emphasized, not rebuilt

The hero's Investment Analysis link changed from a bordered `.secondary` button (equal visual weight with Edit) to a quiet brand-color text link (`.heroInvestmentLink`), reusing the exact same treatment as the dashboard's existing `.needsAttentionViewAll` "View all" pattern (border: 0, transparent background, brand-color text, small trailing chevron). Destination and functionality are byte-for-byte unchanged — still the one `/investment-tools/property-evaluator` link on the page.

### Missing-data behavior

Unchanged from Phase C: every metric on the card renders through `metricMoney`/`metricPercent`, which return a quiet "—" for anything not `available`, never a fabricated `$0`. The new secondary row follows the same rule (`metricMoney(performance.mortgageBalance)`).

### PWA install banner vs. bottom nav

Investigated per the user's report of a mobile collision. `body.hasBottomNav .installHint { bottom: calc(64px + env(safe-area-inset-bottom) + 12px); }` already exists in `app/globals.css` (added earlier, in Maintenance Workspace V2 Phase D.1) and `AuthHeader` — which mounts on the property page — mounts `MobileBottomNav`, which sets `body.hasBottomNav`. A headless-Chromium check at 320/390/430px (real viewport screenshots, not full-page composites, since Playwright's full-page capture doesn't correctly represent `position: fixed` elements) confirmed a clean ~19px gap between the install hint's bottom edge and the bottom nav's top edge at every width — no overlap with the nav or with page content. No code change was made; this reads as a deploy-lag mismatch between production and this branch rather than a current bug. If the user can reproduce a collision on a build that includes this commit, that would need a fresh screenshot to diagnose further — flagged, not fixed blind.

### Mobile

Verified at 320/390/430/1280px with a static HTML mirror reproducing the exact production scenario (Estimated Value $350,000, Purchase Price $150,000, Monthly Rent $2,350, Monthly property expenses $100, Occupied, no reliable tax-year data, no mortgage entered) plus the existing Phase C scenarios. No horizontal overflow at any width. The card no longer reads as "snapshot + another snapshot + another financial card" — one coherent block, then two small reference cards (Expenses & tax, Property facts), then Rent & tenant, Notes/Timeline, Quick Actions.

### Tests

`lib/dashboard/property-intelligence-v1-phase-c-wiring.test.ts` — updated in place for the new internal shape (secondary row, refined disclosure); still 22 tests, all Phase-C invariants preserved.

`lib/dashboard/property-intelligence-v1-phase-c1-unified-snapshot.test.ts` (new, 22 tests) — hero is identity-only; Investment Analysis de-emphasis; the rent-status fix at both locations, with `lib/rent-ledger/status.ts` confirmed untouched; the retired Estimated cash flow; the renamed/slimmed Expenses & tax card; Property Facts stays separate; tabs/Edit/Notes/Timeline/Quick Actions all intact.

`lib/dashboard/property-profile-mobile-polish-v3.test.ts`, `property-profile-mobile-redesign-v2.test.ts`, `financial-details-cta-removal.test.ts` — rescoped in place (the repo's established convention: protect the same underlying invariant with updated literals, never leave a test silently broken) since all three contained literal assertions about the now-removed `.heroMetrics` strip and the old Financial Details card content.

Targeted run (`lib/dashboard/`, `lib/property-intelligence/`, plus the other `app/page.tsx`-reading suites checked for collateral breakage): all passing. `npx tsc --noEmit` and `npm run build` both clean.

### Remaining duplication / limitations

None identified within this phase's scope. The known Phase C limitation (Annual NOI/Cap Rate/Net Cash Flow rarely populate mid-year, by Phase B.1 design) is unchanged and still applies. `financing_status` integration and prior-year/full-year Annual NOI work remain explicitly out of scope, as does Phase D (dashboard Portfolio Snapshot).

## Recommended Phase D scope

Per Phase A Section 9/18: add Net Cash Flow to the dashboard's Portfolio Snapshot (`Properties · Estimated Value · Monthly Income · Monthly Expenses · Net Cash Flow`), aggregating each property's already-computed `PropertyPerformance` — summing only `available` values, never averaging Cap Rate across properties (portfolio Cap Rate, if ever built, is `total portfolio NOI / total portfolio value`, not an average — and is explicitly not required for V1 per Phase A). No new per-property calculation work; Phase C already produces the numbers to sum.
