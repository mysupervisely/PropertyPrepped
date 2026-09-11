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

## Recommended Phase D scope

Per Phase A Section 9/18: add Net Cash Flow to the dashboard's Portfolio Snapshot (`Properties · Estimated Value · Monthly Income · Monthly Expenses · Net Cash Flow`), aggregating each property's already-computed `PropertyPerformance` — summing only `available` values, never averaging Cap Rate across properties (portfolio Cap Rate, if ever built, is `total portfolio NOI / total portfolio value`, not an average — and is explicitly not required for V1 per Phase A). No new per-property calculation work; Phase C already produces the numbers to sum.
