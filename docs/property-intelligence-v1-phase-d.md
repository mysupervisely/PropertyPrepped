# Property Intelligence V1 — Phase D: Portfolio Snapshot V1

Companion to `docs/property-intelligence-v1-phase-a.md` (audit), `docs/property-intelligence-v1-phase-b.md` (the calculation engine), and `docs/property-intelligence-v1-phase-c.md` (the individual Property Snapshot). Phase C answered "how is THIS property doing?" one property at a time. Phase D answers the Dashboard's own question — "how is my portfolio doing?" — by aggregating the exact same canonical per-property outputs. No new calculation system, no new formulas, no schema change.

## The core principle

Phase D is a pure aggregation layer over Phase C's already-vetted output. `lib/property-intelligence/portfolio.ts` contains zero financial formulas — every number it produces is a plain sum of `Metric.value` fields `lib/property-intelligence/calculate.ts` already computed and vetted (missing-vs-known-zero handling, active-lease priority, Tax Center's manual-override rules, period safety — all inherited for free, not re-implemented). If a portfolio number is ever wrong, the bug is in `calculate.ts`, never in `portfolio.ts`.

## What replaced what

The Dashboard's old Portfolio Snapshot (`totals`, a `useMemo` in `app/page.tsx`) was a second, competing calculation system:

- `totals.value`/`totals.rent`/`totals.monthlyExpenses` — raw `properties.estimated_value`/`monthly_rent`/`monthly_expenses` reduces. Missing values (`Number(null)`) silently became `0`; no active-lease priority; no financing-status confirmed-zero handling.
- `totals.income`/`totals.expenses` — a hand-filtered reduce over the whole portfolio's `transactions` array by `transaction_type` and the current year — a parallel, independently-buggy re-implementation of what `computePropertyPerformance()`'s `actualIncomeYtd`/`operatingExpensesYtd` already do correctly (Tax Center manual-override priority, the "nothing logged yet" vs. "a real $0" distinction, etc.).

All of it is gone. `totals` no longer exists anywhere in `app/page.tsx`.

## The new aggregation: `computePortfolioPerformance()`

```ts
export type PortfolioCoverage = { included: number; total: number }
export type PortfolioMetric = Metric & { coverage: PortfolioCoverage }
export type PortfolioPerformance = {
  propertyCount: number
  portfolioValue: PortfolioMetric
  monthlyRent: PortfolioMetric
  noiYtd: PortfolioMetric
}

export function computePortfolioPerformance(properties: PropertyPerformance[]): PortfolioPerformance
```

Takes an array of already-computed `PropertyPerformance` results — one per property, all for the **same current tax year** — and sums whichever properties' metric is `available`, per field:

- **`portfolioValue`** — sum of each included property's `estimatedValue`.
- **`monthlyRent`** — sum of each included property's `contractMonthlyRent` (the same active-lease-prioritized, never-derived-from-income figure Phase C already established — never YTD income ÷ months, never inferred from payments).
- **`noiYtd`** — sum of each included property's `noiYtd` (current-year actual income minus actual operating expenses, for the same tax year across every property — never annualized, never substituted with contract rent, never a prior year's figure).

`PortfolioMetric` is deliberately just `Metric` (the exact same value/status/source/period/notes shape every property-level figure already uses) plus one new field, `coverage`. This is why `metricMoney`/`metricCompactMoney`/`metricPercent` (the existing Phase C presentation helpers) work on portfolio metrics completely unchanged — no new formatting code was needed for Phase D.

### Coverage semantics

A portfolio aggregate can legitimately be built from a subset of the landlord's properties when some lack the underlying data — Phase A's "missing must never render as `$0`" rule, extended to N properties. Rather than inventing a third parallel status enum, `coverage: { included, total }` is the only new concept:

- `included === 0` → the metric itself is `'unavailable'` (`value: null`) — renders as a quiet `—`.
- `0 < included < total` → `'available'` (the sum genuinely is trustworthy for the properties it covers) — the UI shows a small coverage note ("2 of 3 valued").
- `included === total` → `'available'`, no note — a clean number, no clutter.

A property whose metric is `'unavailable'` is excluded from both the sum and `coverage.included` — it never silently contributes a `$0`. This was verified directly: a property with equal, nonzero, both-`available` YTD income and expenses legitimately contributes a real `$0` NOI (and counts toward `included`), while a property with nothing logged is excluded entirely (see `portfolio.test.ts`'s "Known zero vs. missing" describe block). Note: a *literal* `$0`/`$0` income-and-expenses pair isn't reachable through the real engine — `resolveOperatingExpensesYtd()` treats a computed `$0` expense total as `'incomplete'`, not `'available'`, on the theory that it almost always means "nothing logged yet" — so the realistic "known zero" case uses equal nonzero income/expenses instead.

### Why only these three metrics

**Portfolio Equity, Portfolio Cap Rate, and Portfolio Net Cash Flow are explicitly deferred**, per this milestone's own scope:

- Equity wasn't included because it doesn't fit cleanly into 4 primary tiles without adding a 5th — the architecture (`PortfolioMetric`/coverage) already supports aggregating it later (`sumAvailable(properties.map(p => p.equity), 'point_in_time')` would be a one-line addition) whenever a secondary-details area exists to hold it.
- Portfolio Cap Rate is **not** average-of-individual-cap-rates (that would be a different, less meaningful number) — the correct formula, if ever built, is `total qualifying annual NOI / total value of the same included properties`. Not implemented in V1 since no existing UI needs it yet.
- Portfolio Net Cash Flow is out of scope for V1 — keeps the milestone focused.

## Dashboard wiring (`app/page.tsx`)

```ts
const portfolioPerformance = useMemo(() => {
  const performanceYear = String(new Date().getFullYear())
  const propertyPerformances = properties.map((property) => {
    // ...filter transactions/leases/mortgages/maintenanceRecords/taxRecords/
    // taxCustomItems to this property, exactly like the selected-property
    // Overview tab already does for `selected` alone...
    return computePropertyPerformance(buildPropertyPerformanceInput({ ... }))
  })
  return computePortfolioPerformance(propertyPerformances)
}, [properties, transactions, leases, mortgages, maintenanceRecords, taxRecords, taxCustomItems])
```

**No new Supabase query.** Every array filtered here (`transactions`, `leases`, `mortgages`, `maintenanceRecords`, `taxRecords`, `taxCustomItems`) is already loaded portfolio-wide by `loadPortfolio()` for other sections (the property workspace, Tax Center, etc.) — this only filters per property, the same way the single-property Overview tab already does for whichever property is currently open. The property collection aggregated is exactly `properties` — the same already RLS/tenant-scoped array "My Properties" renders — never a second or different collection, so property count and coverage totals always reflect the landlord's real, authorization-scoped portfolio.

## Presentation (`app/page.tsx` + `app/globals.css`)

Four tiles, in this order: **Properties → Portfolio Value → Monthly Rent → 2026 YTD NOI**. Same quiet tile language the individual Property Snapshot already established (Phase C.3) — light neutral fill (`var(--bg)`), rounded corners, no border, no shadow — via a **separate** class family (`.portfolioSnapshotGrid`/`.portfolioSnapshotMetric`/`.portfolioSnapshotCoverageNote`), not a reuse of `.propertySnapshot*` itself, so a future change to one page's tiles is never silently coupled to the other's.

- `Portfolio Value` uses `metricCompactMoney` (abbreviated, "$850K" style) — matches Estimated Value's own treatment on the individual Property Snapshot.
- `Monthly Rent` and `2026 YTD NOI` use `metricMoney` (exact figures) — precision matters for these, same rule Phase C already established for Rent/Income/Expenses/NOI.
- A quiet `portfolioCoverageNote()` helper renders a coverage line only when a tile is genuinely partial (`0 < included < total`) — complete coverage and full unavailability both render with no extra line, so coverage language never becomes clutter on an already-clean number.
- 4 across at ≥761px, 2×2 at ≤760px (the same breakpoint this Dashboard section already used).
- No charts, graphs, gauges, trend arrows, portfolio score, investor score, or performance grade — glanceable, not an analytics panel, per this milestone's explicit design direction.

Everything else on the Dashboard (Needs Your Attention, maintenance/action rows, navigation, My Properties, the mobile bottom nav, the install prompt) is untouched.

## Tests

`lib/property-intelligence/portfolio.test.ts` (new, 11 tests) — the aggregation math itself, built through the real `computePropertyPerformance()` pipeline end to end (never a hand-typed Metric standing in for the engine): Scenario A (one complete property), Scenario B (multiple complete properties), Scenario C/D/E (partial value/rent/YTD-NOI coverage — the missing property never contributes `$0`), known-zero-vs-missing preserved at the portfolio level, all-unavailable, zero properties, negative portfolio NOI, and that the aggregate is never annualized/derived-from-income/substituted with a prior year.

`lib/dashboard/property-intelligence-v1-phase-d-wiring.test.ts` (new, 26 tests) — `app/page.tsx` wiring: the old `totals` is completely gone, `computePortfolioPerformance` is called exactly once and fed by the same per-property pipeline Phase C already uses, no new Supabase query, the four tiles render in order with the correct presentation helpers, Portfolio Equity/Cap Rate/Net Cash Flow are confirmed absent from both the UI and `portfolio.ts` itself, coverage notes appear only when genuinely partial, no analytics-panel clutter, the visual language matches Phase C.3's tile values with fully independent CSS, and the rest of the Dashboard is untouched.

`lib/dashboard/property-intelligence-v1-phase-c-wiring.test.ts`, `property-snapshot-compact-v1-wiring.test.ts`, `mobile-nav-e1-wiring.test.ts` — rescoped in place (this repo's established convention: protect the same underlying invariant with updated literals, never leave a test silently broken) for the second `computePropertyPerformance(buildPropertyPerformanceInput({` call site Phase D legitimately added, and for the Dashboard's four metrics changing from Property count/Est. Value/Monthly Income/Monthly Expenses to Properties/Portfolio Value/Monthly Rent/YTD NOI.

Targeted run (`lib/property-intelligence/`, `lib/dashboard/`, plus previously-affected suites): 633 tests passing. Full suite: 2242/2242 passing. `npx tsc --noEmit` and `npm run build` both clean.

## Visual QA

Four scenarios (2 complete properties; 3 properties with partial coverage on every tile; fully unavailable; the existing collapsed state) rendered in a static HTML mirror of the exact JSX/CSS classes, screenshotted at 390/768/1280px. No horizontal overflow at any width. 2×2 confirmed at mobile, 4-across confirmed at tablet/desktop, coverage notes appear only on the partial-coverage scenario, complete/unavailable scenarios render cleanly with no extra line.

## Remaining duplication / limitations

None identified. Portfolio Equity, Cap Rate, and Net Cash Flow remain explicitly out of scope for V1 (see above) — the aggregation architecture already supports adding Equity later as a one-line addition once a secondary-details area exists to hold it, without any restructuring.
