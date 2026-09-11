# Property Intelligence V1 — Phase B: Shared Live-Data Calculation Foundation

Companion to `docs/property-intelligence-v1-phase-a.md` (the audit this phase implements). No product UI, schema, or API changes in this phase — see that document for the full source-of-truth matrix and rationale; this one documents what Phase B actually built, corrected by **Phase B.1** (see that section below) before anything from this engine reaches a UI.

## What was built

Three new, pure, framework-free files under `lib/property-intelligence/`:

- **`types.ts`** — the result shape: a small generic `Metric<T>` (a value plus `status`/`source`/`period`/quality flags) instead of a bespoke type per field, and the full `PropertyPerformance` result.
- **`calculate.ts`** — the math. No new formulas: every core number calls `lib/investment-calculations.ts`'s existing `calculateNOI()`/`capRate()`/`equity()` unchanged. This file's job is deciding, from real data, whether each formula's inputs are trustworthy enough to call at all, and (Phase B.1) whether they share a compatible time period.
- **`resolve.ts`** — bridges real (already-fetched) row shapes into `calculate.ts`'s input. The only file in this module that knows a table name; `calculate.ts` never does. Reuses `lib/leases/status.ts`'s `selectCurrentLease()` and `lib/tax-center/aggregate.ts`'s `computePropertyTaxSummary()` rather than re-deriving either.

Nothing calls Supabase anywhere in this module — every function takes already-loaded rows, exactly like `lib/tax-center/aggregate.ts` and `lib/investment-calculations.ts` already do. This is what keeps the math unit-testable without mocking a database.

## Phase B.1 — the period-mixing correction

The original Phase B computed "annual NOI" as `(active lease's rent × 12) − (Tax Center's YEAR-TO-DATE operating expenses)`. That combines a full-year figure with a partial-year one and calls the result annual. It's not a trustworthy YTD figure (it isn't YTD income) and it's not a trustworthy annual figure either (the expense side isn't a full year) — false precision, exactly what this whole milestone exists to prevent. Cap Rate, built on that NOI, inherited the same problem.

**The fix**: the engine now computes two separate NOI figures instead of one blended one, and every metric carries an explicit `period` tag (`MetricPeriod` in `types.ts`) so nothing downstream can combine two incompatible periods again by accident.

- **`noiYtd`** = `actualIncomeYtd − operatingExpensesYtd`. Both inputs always come from the *same* `taxYearSummary`, so this is period-safe by construction. Never annualized. Available for most properties with any logged activity, even mid-year.
- **`noiAnnual`** = the *same* `noiYtd` figure, but only exposed once the tax year it covers is **confirmed fully elapsed**. Contract rent is never substituted in to force this metric to exist for a partial year.

```ts
// calculate.ts
export function isYearComplete(year: string, now: Date): boolean {
  const y = Number(year)
  return Number.isFinite(y) && y < now.getFullYear()
}
```

The year `now` itself falls in is **always** incomplete, even on December 31st — this avoids a fragile exact-date boundary check. A tax year only counts as a genuine annual basis once the calendar has actually moved past it (e.g. reviewing 2025 in mid-2026).

## Canonical source priority (implemented exactly per Phase A)

| Input | Priority | Notes |
|---|---|---|
| **Contract rent** | 1. Active lease's `monthly_rent` (via `selectCurrentLease`)  2. `properties.monthly_rent` fallback  3. unavailable | Fallback is tagged `estimated: true` with a note. Kept as its own, independently useful metric — **never used as an income input to NOI** (see below). |
| **Actual income (YTD or annual)** | Tax Center's resolved `grossIncome` for the tax year reviewed (`computePropertyTaxSummary`) | ALL income categories Tax Center tracks (rental income *and* any "other rental-related income" logged there) — not rent-only, never labeled "rent received." A different concept from contract rent, never blended with or derived from it. |
| **Value** | `properties.estimated_value` | `estimated: true` always — landlord-entered, never independently verified. `<= 0` reads as "not entered," matching how every other screen already treats this field. |
| **Operating expenses (YTD or annual)** | Tax Center's resolved `operatingExpenses` for the tax year reviewed (`computePropertyTaxSummary`) | The manual-replaces-tracked rule (`lib/tax-center/manual-entry.ts`) already ran before this number reaches Property Intelligence — never re-summed. |
| **Mortgage balance** | 1. Current mortgage row's `current_balance`  2. `properties.mortgage_balance` fallback  3. unavailable | Both sources tagged `potentiallyStale: true` — neither has an edit path in the app today (Phase A Section 17). |
| **Debt service (monthly P&I)** | Mortgage row's `monthly_payment`, read directly — never recomputed via amortization | No mortgage row → unavailable, not $0 (see Known Limitations). |

## Formulas (unchanged, only newly fed live, period-correct data)

```
NOI (year-to-date)      = actual income YTD − operating expenses YTD              [always period-safe]
NOI (annual)            = the SAME figure, only once its tax year is confirmed complete
Cap Rate                = annual NOI / estimated value × 100                      [never noiYtd, never contract rent]
Net Cash Flow (monthly) = annual NOI / 12 − monthly debt service                  [never noiYtd ÷ 12]
Equity                  = estimated value − mortgage balance                      [point-in-time, unaffected by the period fix]
```

Mortgage principal/interest is never part of NOI or Cap Rate. Financing only enters the picture below NOI, for Net Cash Flow.

**Why contract rent is not used as an annual-NOI income basis today**: the prompt for this correction allows it *in principle*, paired with a genuinely annual expense figure — but Tax Center's `operatingExpenses` is one blended total across ~20 categories, some of which (a known annual property-tax bill) could reasonably be treated as knowable in full at any point in the year, and others (repairs, utilities, maintenance) which genuinely only accumulate as the year happens. Building that category-by-category "is this annual-knowable" classification would be a real, separate audit Phase A never did, and guessing at it now would be exactly the kind of invented annual-expense estimate this milestone forbids. The only annual expense basis this phase trusts is a **confirmed, fully-elapsed tax year's real total** — no new classification needed, nothing invented. Revisiting a finer-grained, category-level annual/YTD split is a reasonable candidate for a future phase, not this one.

## Data-quality model

Every metric is a `Metric<T>`:

```ts
{ value: number | null, status: 'available' | 'incomplete' | 'unavailable', source: DataSource, period: MetricPeriod, estimated?: boolean, potentiallyStale?: boolean, notes?: string[] }
```

- **`unavailable`** — `value` is always `null`, `period` is `'n/a'`. Nothing to show but "Not enough data."
- **`incomplete`** — a real, computed `value`, but on inputs weak enough (a fallback rent, a suspicious `$0` expense total) that it must be shown qualified, never as a clean number — Phase A Section 7's asterisk/footnote tier.
- **`available`** — a real, directly trustworthy number for its stated `period`. May still be `estimated` (landlord-entered) and/or `potentiallyStale` (no update path today) — independent flags, not a lower tier.

`MetricPeriod` values: `point_in_time` (a balance/snapshot — value, mortgage balance, equity), `monthly_contract` / `annual_contract` (the lease's contractual rate, in either unit), `ytd_actual` (a real transactional total for a still-in-progress tax year), `annual_actual` (the same kind of total, but for a confirmed complete tax year — the only basis this engine treats as annual), `monthly_derived` (Net Cash Flow, built from an `annual_actual` NOI), and `n/a` (unavailable).

## How double counting is prevented

Property Intelligence never sums `financial_transactions` or `property_tax_records` a second time. `operatingExpensesYtd` and `actualIncomeYtd` are read verbatim from `computePropertyTaxSummary`'s already-resolved `operatingExpenses`/`grossIncome` — the exact same numbers Tax Center itself shows, computed through the exact same manual-overrides-replace-tracked rule (`lib/tax-center/manual-entry.ts`'s `computeCategoryValue`). Property Intelligence and Tax Center are therefore guaranteed to agree on a property's numbers, by construction.

## Known limitations (documented, not fixed here)

1. **Annual NOI/Cap Rate/Net Cash Flow are unavailable for most properties most of the time** — by design. They only appear once a landlord is reviewing a tax year that has fully elapsed (typically: last year, viewed any time after January 1st of the following year). A property being reviewed *during* its current tax year gets `noiYtd` (a real, useful figure) but not `noiAnnual`/`capRatePercent`/`netCashFlowMonthly` until that year is over. This is the direct, intended consequence of the Phase B.1 fix — preferable to a misleading number.
2. **"No mortgage" vs. "mortgage never entered" are indistinguishable.** `mortgages` is a child table with no rows either way — PropRoster has no explicit "this property has no financing" flag. A property with zero mortgage rows and a `$0` `properties.mortgage_balance` returns `mortgageBalance: unavailable` and `netCashFlowMonthly: unavailable` — never a `$0` debt-service assumption.
3. **Mortgage/insurance staleness is unchanged from Phase A.** Both `mortgages` and `insurance_policies` still have no edit path in the app.
4. **No category-level "annual-knowable vs. YTD-accumulating" classification exists** for Tax Center's expense categories (see the Formulas section above) — the reason contract rent isn't paired with a partial annual-expense estimate today.

## What Phase C can now consume

`computePropertyPerformance(input, now?)` returns one complete, typed `PropertyPerformance` for a property, with `noiYtd` almost always the figure available to show, and `noiAnnual`/`capRatePercent`/`netCashFlowMonthly` available once a full tax year exists. Phase C should design the property-level UI (Phase A Section 8) to show the YTD figures as the everyday case and the annual figures as a bonus once they exist — not assume Cap Rate is always present. `buildPropertyPerformanceInput()` takes a property's already-loaded rows (property, leases, current mortgage, year transactions/maintenance/tax record) and produces the engine's input directly.

## Tests

`lib/property-intelligence/calculate.test.ts` (51 tests) and `lib/property-intelligence/resolve.test.ts` (10 tests) — 61 tests total, covering the period-consistency fix directly (YTD vs. annual gating, the exact bug this phase corrects), source priority, formula correctness, double-counting prevention, missing-vs-zero handling, NaN/Infinity safety, and data-quality metadata. `npx tsc --noEmit` and `npm run build` are both clean.

## Schema changes

None. Confirms Phase A Section 17's conclusion.
