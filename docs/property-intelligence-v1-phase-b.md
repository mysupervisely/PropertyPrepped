# Property Intelligence V1 — Phase B: Shared Live-Data Calculation Foundation

Companion to `docs/property-intelligence-v1-phase-a.md` (the audit this phase implements). No product UI, schema, or API changes in this phase — see that document for the full source-of-truth matrix and rationale; this one documents what Phase B actually built.

## What was built

Three new, pure, framework-free files under `lib/property-intelligence/`:

- **`types.ts`** — the result shape: a small generic `Metric<T>` (a value plus `status`/`source`/quality flags) instead of a bespoke type per field, and the full `PropertyPerformance` result.
- **`calculate.ts`** — the math. No new formulas: every core number calls `lib/investment-calculations.ts`'s existing `calculateNOI()`/`capRate()`/`equity()` unchanged. This file's job is deciding, from real data, whether each formula's inputs are trustworthy enough to call at all.
- **`resolve.ts`** — bridges real (already-fetched) row shapes into `calculate.ts`'s input. The only file in this module that knows a table name; `calculate.ts` never does. Reuses `lib/leases/status.ts`'s `selectCurrentLease()` and `lib/tax-center/aggregate.ts`'s `computePropertyTaxSummary()` rather than re-deriving either.

Nothing calls Supabase anywhere in this module — every function takes already-loaded rows, exactly like `lib/tax-center/aggregate.ts` and `lib/investment-calculations.ts` already do. This is what keeps the math unit-testable without mocking a database.

## Canonical source priority (implemented exactly per Phase A)

| Input | Priority | Notes |
|---|---|---|
| **Contract rent** | 1. Active lease's `monthly_rent` (via `selectCurrentLease`)  2. `properties.monthly_rent` fallback  3. unavailable | Fallback is tagged `estimated: true` with a note — never silently equal-confidence to a lease. |
| **Actual income (YTD)** | Tax Center's resolved `grossIncome` for the current tax year (`computePropertyTaxSummary`) | A different concept from contract rent — never blended with or derived from it. |
| **Value** | `properties.estimated_value` | `estimated: true` always — landlord-entered, never independently verified. `<= 0` reads as "not entered," matching how every other screen already treats this field. |
| **Operating expenses** | Tax Center's resolved `operatingExpenses` for the current tax year (`computePropertyTaxSummary`) | The manual-replaces-tracked rule (`lib/tax-center/manual-entry.ts`) already ran before this number reaches Property Intelligence — never re-summed. |
| **Mortgage balance** | 1. Current mortgage row's `current_balance`  2. `properties.mortgage_balance` fallback  3. unavailable | Both sources tagged `potentiallyStale: true` — neither has an edit path in the app today (Phase A Section 17). |
| **Debt service (monthly P&I)** | Mortgage row's `monthly_payment`, read directly — never recomputed via amortization | No mortgage row → unavailable, not $0 (see Known Limitations). |

## Formulas (unchanged, only newly fed live data)

```
NOI (this tax year so far)  = (active lease's annualized rent + Tax Center "other income") − Tax Center's operating expenses YTD
Cap Rate                    = NOI / estimated value × 100
Net Cash Flow (monthly)     = NOI / 12 − monthly debt service
Equity                      = estimated value − mortgage balance
```

Mortgage principal/interest is never part of NOI or Cap Rate. Financing only enters the picture below NOI, for Net Cash Flow — exactly the separation Phase A audited and this milestone required.

**A deliberate asymmetry, documented rather than hidden**: the income side of NOI is the current lease's rent, legitimately *annualized* because it's a contractual rate; the expense side is Tax Center's real, *year-to-date* total, never annualized (annualizing partial-year transactional data would be misleading). Early in a tax year this means NOI compares a full year of contract income against only a few months of logged costs. `noiAnnual`'s own `notes` say this explicitly, and its status downgrades to `incomplete` whenever the rent side came from the fallback (not an active lease) — never presented as more certain than it is.

## Data-quality model

Every metric is a `Metric<T>`:

```ts
{ value: number | null, status: 'available' | 'incomplete' | 'unavailable', source: DataSource, estimated?: boolean, potentiallyStale?: boolean, notes?: string[] }
```

- **`unavailable`** — `value` is always `null`. Nothing to show but "Not enough data."
- **`incomplete`** — a real, computed `value`, but on inputs weak enough (a fallback rent, a suspicious `$0` expense total) that it must be shown qualified, never as a clean number — this is Phase A Section 7's asterisk/footnote tier, represented here so a future UI doesn't have to reverse-engineer trustworthiness from the raw data again.
- **`available`** — a real, directly trustworthy number. May still be `estimated` (landlord-entered) and/or `potentiallyStale` (no update path today) — those are independent flags, not a lower tier.

## How double counting is prevented

Property Intelligence never sums `financial_transactions` or `property_tax_records` a second time. `operatingExpensesYtd` and `actualIncomeYtd` are read verbatim from `computePropertyTaxSummary`'s already-resolved `operatingExpenses`/`grossIncome` — the exact same numbers Tax Center itself shows, computed through the exact same manual-overrides-replace-tracked rule (`lib/tax-center/manual-entry.ts`'s `computeCategoryValue`). Property Intelligence and Tax Center are therefore guaranteed to agree on a property's numbers, by construction, because they read the same resolved totals rather than two independent derivations.

## Known limitations (documented, not fixed here)

1. **"No mortgage" vs. "mortgage never entered" are indistinguishable.** `mortgages` is a child table with no rows either way — PropRoster has no explicit "this property has no financing" flag (unlike Investment Tools' own manual `FinancingStatus` for what-if scenarios, which doesn't apply to real properties). A property with zero mortgage rows and a `$0` `properties.mortgage_balance` returns `mortgageBalance: unavailable` and `netCashFlowMonthly: unavailable` — **never** a `$0` debt-service assumption. This was an explicit requirement this phase, not an oversight; fixing it for real would need either a schema flag or a UI-level "no mortgage" declaration, neither built here.
2. **Mortgage/insurance staleness is unchanged from Phase A.** Both `mortgages` and `insurance_policies` still have no edit path in the app — any balance this engine reports is only as fresh as the last insert/delete.
3. **NOI's income/expense period mismatch** (documented above) is inherent to combining a contractual rate with real transactional data, per Phase A's own formula — not something Phase B introduced or can resolve without a different formula (out of scope here).
4. **`property_tax_records`-only properties with no `financial_transactions` at all** still resolve correctly (Tax Center's manual fields alone are enough), but a property with genuinely nothing logged anywhere returns `unavailable` for every income/expense-derived metric — by design.

## What Phase C can now consume

`computePropertyPerformance(input, now?)` returns one complete, typed `PropertyPerformance` for a property. Phase C (Property Intelligence snapshot UI, per Phase A Section 8) can call `buildPropertyPerformanceInput()` with a property's already-loaded rows (property, leases, current mortgage, year transactions/maintenance/tax record) and render the result directly — every field already carries the metadata needed to show either a clean number or "Not enough data," with no further trustworthiness logic needed in the UI layer itself.

## Tests

`lib/property-intelligence/calculate.test.ts` (44 tests) and `lib/property-intelligence/resolve.test.ts` (9 tests) — 53 tests total, covering source priority, formula correctness, double-counting prevention, missing-vs-zero handling, NaN/Infinity safety, data-quality metadata, and period separation. `npx vitest run` (full suite): 118 files / 2015 tests pass. `npx tsc --noEmit` and `npm run build` are both clean.

## Schema changes

None. Confirms Phase A Section 17's conclusion — Phase B needed no migration.
