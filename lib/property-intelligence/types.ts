// PropRoster — Property Intelligence V1, Phase B: shared types.
//
// Phase A (docs/property-intelligence-v1-phase-a.md) audited PropRoster's
// existing financial data and concluded that no new formulas are needed —
// lib/investment-calculations.ts already implements NOI/Cap Rate/Equity/
// Cash Flow correctly. What was missing was a trustworthy way to feed
// those formulas LIVE property data, and a way for the result to say "I
// don't have enough information" instead of a misleading number.
//
// This file defines that result shape. It is intentionally small: one
// generic `Metric<T>` wrapper (a value plus enough metadata for future UI
// to decide whether/how to show it) rather than a bespoke type per field.

/**
 * Tri-state confidence a caller can act on directly:
 *   available   — a real, usable number. May still be `estimated` and/or
 *                 `potentiallyStale` (see MetricMeta) — those are
 *                 orthogonal quality flags, not a fourth status.
 *   incomplete  — a number COULD be computed, but on inputs materially
 *                 weak enough that presenting it as a clean figure would
 *                 be misleading (e.g. an expense category totaling $0
 *                 only because nothing has been logged yet, not because
 *                 costs are genuinely zero). `value` is still populated
 *                 so a future UI can choose to show it qualified (an
 *                 asterisk/footnote — see Phase A Section 7), but it must
 *                 never be presented as a clean number.
 *   unavailable — cannot be computed at all. `value` is always null.
 */
export type MetricStatus = 'available' | 'incomplete' | 'unavailable'

/**
 * Where a metric's value (or its main input) actually came from — lets a
 * future UI explain itself ("from your active lease" vs. "a manual
 * estimate") without re-deriving that from the raw data again.
 */
export type DataSource =
  | 'active_lease'
  | 'property_fallback'
  | 'tax_center_resolved'
  | 'property_estimated_value'
  | 'property_mortgage_balance'
  | 'mortgage_record'
  | 'derived'
  | 'none'

export type MetricMeta = {
  /** True when the underlying figure is landlord-entered/manual rather than independently verified (e.g. properties.estimated_value, a manually-tracked mortgage balance). Never true for a figure computed purely from transactional data. */
  estimated?: boolean
  /** True when the source is known to go stale without an ongoing update mechanism in the app today (properties.mortgage_balance / mortgages — no edit path per Phase A Section 17). */
  potentiallyStale?: boolean
  /** Short, factual notes: missing inputs, why a fallback was used, staleness caveats. Never advice, never a recommendation — matches the tone already established in lib/tax-center/readiness.ts. */
  notes?: string[]
}

/** One metric: a value (or null) plus enough metadata to trust it. */
export type Metric<T = number> = MetricMeta & {
  value: T | null
  status: MetricStatus
  source: DataSource
}

/** Builds an 'unavailable' metric — value is always null here by construction. */
export function unavailable(source: DataSource, notes?: string[]): Metric {
  return { value: null, status: 'unavailable', source, notes }
}

/** Builds an 'available' metric. */
export function available(value: number, source: DataSource, meta?: MetricMeta): Metric {
  return { value, status: 'available', source, ...meta }
}

/** Builds an 'incomplete' metric — a real value that should be shown qualified, not as a clean number (Phase A Section 7). */
export function incomplete(value: number, source: DataSource, notes: string[], meta?: Omit<MetricMeta, 'notes'>): Metric {
  return { value, status: 'incomplete', source, notes, ...meta }
}

// ---------------------------------------------------------------------------
// Resolver inputs — already-fetched/already-resolved rows only. Nothing in
// this module (or calculate.ts) ever calls Supabase; that separation is
// what keeps the math unit-testable without mocking a database, matching
// how lib/tax-center/aggregate.ts and lib/investment-calculations.ts are
// already structured.
// ---------------------------------------------------------------------------

/** The current active lease's rent-relevant fields only (already selected via lib/leases/status.ts's selectCurrentLease by the caller — this module never re-derives "which lease is current"). */
export type ActiveLeaseInput = {
  id: string
  monthlyRent: number
}

/**
 * One mortgage row's calculation-relevant fields. When a property has more
 * than one mortgage row (a real, supported case — see app/page.tsx's own
 * "+ Add mortgage"), the caller passes the one it already treats as
 * current (this app's own existing convention: rows queried
 * `.order('created_at', { ascending: false })`, most-recent-first — see
 * app/page.tsx's `selectedMortgages[0]`). This module does not re-sort or
 * guess which row is "the" mortgage.
 */
export type MortgageInput = {
  currentBalance: number
  monthlyPayment: number
}

/**
 * The current tax year's resolved totals for this ONE property, i.e.
 * exactly what lib/tax-center/aggregate.ts's computePropertyTaxSummary()
 * already returns for this property/year — reused, not re-derived, per
 * Phase A Section 10 ("Property Intelligence should treat
 * computePropertyTaxSummary's grossIncome/operatingExpenses for the
 * current tax year as its NOI inputs"). This is a deliberately small
 * projection of PropertyTaxSummary, not the whole type, so a caller can
 * build it from that function's real return value with no reshaping.
 */
export type TaxYearSummaryInput = {
  /** Four-digit tax year this summary covers, e.g. "2026". */
  year: string
  /** PropertyTaxSummary.grossIncome — effective (tracked or manual-overridden) rental + other income for the year. */
  grossIncome: number
  /** PropertyTaxSummary.operatingExpenses — effective ordinary operating expenses for the year (mortgage/CapEx/financing excluded, exactly as Tax Center already excludes them). */
  operatingExpenses: number
  /** PropertyTaxSummary.incomeByCategory['otherIncome'] — the non-rent slice of grossIncome, if any. Used only as the small additive term Phase A Section 6's NOI formula calls for; defaults to 0 when absent. */
  otherIncome?: number
  /** PropertyTaxSummary.transactionCount — 0 alongside hasManualRecord=false is this module's ONLY signal that literally nothing has been logged for this property/year yet (see Phase A Section 7 — "no operating-expense data logged at all" must read as "Not enough data," never "$0 expenses"). */
  transactionCount: number
  /** PropertyTaxSummary.hasManualRecord — true if a property_tax_records row exists for this property/year at all. */
  hasManualRecord: boolean
}

export type PropertyPerformanceInput = {
  propertyId: string
  /** properties.estimated_value. 0 is treated as "not entered" — a real property is never actually worth $0, matching Phase A Section 7's own convention. */
  estimatedValue: number
  /** properties.monthly_rent — the stale, manually-entered fallback used ONLY when no active lease exists (Phase A: "Do not silently treat stale property-level rent as equally authoritative when an active lease exists"). */
  propertyMonthlyRentFallback: number
  /** properties.mortgage_balance — the flat, possibly-stale fallback balance, used only when no mortgage row exists. */
  propertyMortgageBalanceFallback: number
  /** Already-resolved current lease, or null when the property is vacant / has no lease on file. */
  activeLease: ActiveLeaseInput | null
  /** The mortgage row this app already treats as current, or null when no mortgage row exists for this property AT ALL (schema cannot distinguish "genuinely no mortgage" from "mortgage data never entered" — see Phase A Section 17 and this module's own header comment). */
  mortgage: MortgageInput | null
  taxYearSummary: TaxYearSummaryInput
}

export type PropertyPerformancePeriod = {
  /** The tax year this snapshot's income/expense figures cover — always taxYearSummary.year, never independently recomputed (one source of truth for "what year is this"). */
  taxYear: string
  /** ISO date (YYYY-MM-DD) this snapshot was computed as of. Income/expense figures cover taxYear's January 1 through this date — i.e. YEAR TO DATE, never silently annualized (Phase A: "If annualizing partial-year transactional data would create misleading numbers, do NOT silently annualize it"). Contract rent is the one exception — it is a contractual rate, not a transaction sum, so it is legitimately annualized regardless of how much of the year has elapsed. */
  asOf: string
}

/**
 * One property's performance snapshot. Every metric is independently
 * gated — a property with only an address and an estimated value still
 * returns a valid result (most metrics 'unavailable'), never throws, never
 * NaN/Infinity, never a misleading zero standing in for "unknown."
 */
export type PropertyPerformance = {
  propertyId: string
  period: PropertyPerformancePeriod

  /** properties.estimated_value — landlord-entered, not an independently verified live valuation (Phase A Section 2/8). */
  estimatedValue: Metric

  /** The current lease's contracted monthly rent, or the stale property-level fallback when no lease exists. A CONTRACTUAL rate, distinct from actualIncomeYtd below. */
  contractMonthlyRent: Metric
  /** contractMonthlyRent x 12 — legitimately annualized because it represents a contractual rate, not a transaction sum (Phase A "Time Periods"). Same source/status/notes as contractMonthlyRent. */
  contractAnnualRent: Metric

  /** Actual cash-basis income tracked/resolved by Tax Center for the current tax year to date — a genuinely different concept from contract rent (a vacant month, a rent concession, or simply "not yet collected" all make this differ from contractMonthlyRent x months-elapsed, and this module never blends the two). */
  actualIncomeYtd: Metric

  /** Tax Center's resolved effective operating-expense total for the current tax year to date (mortgage/CapEx/financing excluded). YEAR TO DATE, not a full-year figure — see period.asOf. */
  operatingExpensesYtd: Metric

  /** grossIncome (contractAnnualRent + taxYearSummary.otherIncome) - operatingExpensesYtd, via the existing calculateNOI(). Financing is never part of either side. Because the income side is annualized contract rent while the expense side is year-to-date, this is best read as "this tax year's NOI so far, at the current contract rent" — not a stable trailing-twelve-month figure early in the year; see this metric's own notes when that matters. */
  noiAnnual: Metric
  /** noiAnnual / estimatedValue x 100, via the existing capRate(). Mortgage payments are never included in operating expenses for this figure. */
  capRatePercent: Metric

  /** The mortgage this app currently treats as this property's balance — from the current mortgage row when one exists, else the flat properties.mortgage_balance fallback. Never independently verified against a lender. */
  mortgageBalance: Metric
  /** Monthly principal + interest, read directly from mortgages.monthly_payment (never recomputed via amortization) when a mortgage row exists. */
  monthlyDebtService: Metric
  /** noiAnnual / 12 - monthlyDebtService. Only computed when BOTH noiAnnual and monthlyDebtService are usable — never assumes $0 debt service for a property with no mortgage row on file (that could mean "no mortgage" or "never entered," and this module cannot tell the difference — see mortgage's own doc comment). */
  netCashFlowMonthly: Metric

  /** estimatedValue - mortgageBalance, via the existing equity(). Only computed when both inputs are present; never treated as lender-verified. */
  equity: Metric
}
