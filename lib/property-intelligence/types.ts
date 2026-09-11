// PropRoster — Property Intelligence V1, Phase B (corrected in Phase B.1):
// shared types.
//
// Phase A (docs/property-intelligence-v1-phase-a.md) audited PropRoster's
// existing financial data and concluded that no new formulas are needed —
// lib/investment-calculations.ts already implements NOI/Cap Rate/Equity/
// Cash Flow correctly. What was missing was a trustworthy way to feed
// those formulas LIVE property data, and a way for the result to say "I
// don't have enough information" instead of a misleading number.
//
// Phase B.1 correction: the original Phase B combined an ANNUALIZED
// contract rent (a full-year figure) with YTD (partial-year) tracked
// expenses and called the result "annual NOI." Those are two different
// time periods — the result was neither a trustworthy YTD figure nor a
// trustworthy annual one. This file now makes period an explicit part of
// every metric (`MetricPeriod`) and calculate.ts computes two distinct
// NOI figures instead of one blended one — see noiYtd/noiAnnual below.

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
 *
 * 'financing_status_confirmed' (Phase C.2) marks a mortgage balance/
 * debt-service figure of exactly $0 that the landlord explicitly
 * confirmed via properties.financing_status ('Paid Off'/'No Mortgage') —
 * a KNOWN zero, distinct from every other source above, none of which
 * can ever legitimately resolve to a confirmed zero on their own (a
 * missing mortgage row/balance is 'unavailable', never $0 — see
 * resolveMortgageBalance's own doc comment in calculate.ts).
 */
export type DataSource =
  | 'active_lease'
  | 'property_fallback'
  | 'tax_center_resolved'
  | 'property_estimated_value'
  | 'property_mortgage_balance'
  | 'mortgage_record'
  | 'financing_status_confirmed'
  | 'derived'
  | 'none'

/**
 * Explicit time-basis tag — the Phase B.1 fix. Every metric says which of
 * these it is; nothing downstream may combine two metrics whose periods
 * are incompatible (that mistake — annualized contract rent minus YTD
 * expenses — is exactly what Phase B.1 corrects).
 *
 *   point_in_time    — a balance/snapshot as of today, not a flow over a
 *                       period (estimatedValue, mortgageBalance, equity).
 *   monthly_contract — a monthly CONTRACTUAL rate (contractMonthlyRent) —
 *                       not a transaction total.
 *   annual_contract  — that same contractual rate, annualized
 *                       (contractAnnualRent). Legitimate to annualize
 *                       because it's a rate, not a transaction sum — but
 *                       it must never be combined with a YTD/partial-year
 *                       transactional total (that is the bug this phase
 *                       fixes).
 *   ytd_actual       — a real, resolved transactional total for the tax
 *                       year currently being reviewed, covering January 1
 *                       of that year through `period.asOf`. May cover a
 *                       full year in substance once that year has fully
 *                       elapsed (see `period.isYearComplete`), but is
 *                       still tagged ytd_actual — annual_actual (below)
 *                       is the one other metrics are allowed to treat as
 *                       a genuine annual basis.
 *   annual_actual    — a CONFIRMED, fully-elapsed tax year's real total
 *                       (`period.isYearComplete === true`). The only
 *                       actual-data basis this engine treats as "annual"
 *                       — never a partial year, never annualized/prorated
 *                       from one.
 *   monthly_derived  — a monthly figure derived FROM an annual_actual
 *                       basis (netCashFlowMonthly = annual NOI / 12 -
 *                       monthly debt service).
 *   n/a              — no period applies; the metric is unavailable.
 */
export type MetricPeriod =
  | 'point_in_time'
  | 'monthly_contract'
  | 'annual_contract'
  | 'ytd_actual'
  | 'annual_actual'
  | 'monthly_derived'
  | 'n/a'

export type MetricMeta = {
  /** True when the underlying figure is landlord-entered/manual rather than independently verified (e.g. properties.estimated_value, a manually-tracked mortgage balance). Never true for a figure computed purely from transactional data. */
  estimated?: boolean
  /** True when the source is known to go stale without an ongoing update mechanism in the app today (properties.mortgage_balance / mortgages — no edit path per Phase A Section 17). */
  potentiallyStale?: boolean
  /** Short, factual notes: missing inputs, why a fallback was used, staleness caveats, period caveats. Never advice, never a recommendation — matches the tone already established in lib/tax-center/readiness.ts. */
  notes?: string[]
}

/** One metric: a value (or null), a period tag, and enough metadata to trust it. */
export type Metric<T = number> = MetricMeta & {
  value: T | null
  status: MetricStatus
  source: DataSource
  period: MetricPeriod
}

/** Builds an 'unavailable' metric — value/period are always null/'n/a' by construction. */
export function unavailable(source: DataSource, notes?: string[]): Metric {
  return { value: null, status: 'unavailable', source, period: 'n/a', notes }
}

/** Builds an 'available' metric with an explicit period. */
export function available(value: number, source: DataSource, period: MetricPeriod, meta?: MetricMeta): Metric {
  return { value, status: 'available', source, period, ...meta }
}

/** Builds an 'incomplete' metric — a real value that should be shown qualified, not as a clean number (Phase A Section 7). */
export function incomplete(value: number, source: DataSource, period: MetricPeriod, notes: string[], meta?: Omit<MetricMeta, 'notes'>): Metric {
  return { value, status: 'incomplete', source, period, notes, ...meta }
}

/**
 * Phase C.2: properties.financing_status — mirrors the exact values
 * app/page.tsx's FINANCING_STATUS_OPTIONS already offers and
 * supabase/schema.sql's properties_financing_status_check constraint
 * already enforces (`check (financing_status is null or financing_status
 * in ('Active Mortgage', 'Paid Off', 'No Mortgage', 'Unknown'))`). Not a
 * new financing-status system — the same one, reused.
 */
export type FinancingStatus = 'Active Mortgage' | 'Paid Off' | 'No Mortgage' | 'Unknown'

const KNOWN_FINANCING_STATUSES: readonly FinancingStatus[] = ['Active Mortgage', 'Paid Off', 'No Mortgage', 'Unknown']

/**
 * Defensive normalization at the engine boundary: null, undefined, or any
 * value outside the known set collapses to 'Unknown' — the exact same
 * "explicit, honest default" rule the column's own edit form already
 * documents ("a blank/never-set mortgage field must never be silently
 * read as 'Paid Off' or 'No Mortgage'"). This is what actually keeps a
 * schema-legal-but-unexpected string from ever accidentally triggering
 * Paid Off/No Mortgage semantics below.
 */
export function normalizeFinancingStatus(value: string | null | undefined): FinancingStatus {
  return (KNOWN_FINANCING_STATUSES as readonly string[]).includes(value ?? '') ? (value as FinancingStatus) : 'Unknown'
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
 * One tax year's resolved totals for this ONE property, i.e. exactly what
 * lib/tax-center/aggregate.ts's computePropertyTaxSummary() already
 * returns for this property/year — reused, not re-derived, per Phase A
 * Section 10. `grossIncome` includes EVERY income category Tax Center
 * tracks (rental income AND any "other rental-related income" logged
 * there) — it is not rent-only, and calculate.ts's own doc comments say
 * so explicitly rather than mislabeling it "rent received."
 */
export type TaxYearSummaryInput = {
  /** Four-digit tax year this summary covers, e.g. "2026". */
  year: string
  /** PropertyTaxSummary.grossIncome — effective (tracked or manual-overridden) income for the year, ALL income categories combined (rental + other). */
  grossIncome: number
  /** PropertyTaxSummary.operatingExpenses — effective ordinary operating expenses for the year (mortgage/CapEx/financing excluded, exactly as Tax Center already excludes them). */
  operatingExpenses: number
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
  /**
   * Phase C.2: properties.financing_status, already normalized (see
   * normalizeFinancingStatus). 'Paid Off'/'No Mortgage' let the engine
   * treat mortgage balance/debt service as a CONFIRMED $0 rather than
   * 'unavailable' — resolving the "no mortgage vs. never entered"
   * ambiguity Phase A Section 17/Phase C flagged as a future opportunity,
   * for the real subset of properties where the landlord has actually
   * said so. 'Active Mortgage' and 'Unknown' change nothing — the
   * pre-Phase-C.2 mortgage-row/fallback/unavailable behavior applies
   * exactly as before.
   */
  financingStatus: FinancingStatus
  /**
   * The tax year being reviewed — typically the current calendar year (a
   * still-in-progress, YTD period), but may also be a completed prior
   * year (e.g. a landlord reviewing "last year's" performance from Tax
   * Center's own year selector). Whichever year is passed, calculate.ts
   * derives `isYearComplete` from it (year < the calendar year `now`
   * falls in) — it is never assumed complete just because a caller
   * labeled it that way.
   */
  taxYearSummary: TaxYearSummaryInput
}

export type PropertyPerformancePeriod = {
  /** The tax year taxYearSummary covers — always taxYearSummary.year, never independently recomputed (one source of truth for "what year is this"). */
  taxYear: string
  /** ISO date (YYYY-MM-DD) this snapshot was computed as of. */
  asOf: string
  /**
   * True only when `taxYear` has fully elapsed relative to `asOf` (i.e.
   * `asOf` falls in a LATER calendar year than `taxYear`) — the current,
   * in-progress calendar year is always `false`, even on December 31st,
   * to avoid a fragile exact-date boundary check. This is the ONLY
   * condition under which this engine treats actual income/expense
   * totals as a genuine annual basis (annual_actual) rather than a
   * partial-year one (ytd_actual) — see noiAnnual/capRatePercent/
   * netCashFlowMonthly below.
   */
  isYearComplete: boolean
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
  /** contractMonthlyRent x 12 — legitimately annualized because it represents a contractual rate, not a transaction sum. NOT the same thing as actual annual income, and never combined with YTD expenses to produce NOI (Phase B.1 fix). Same source/status/notes as contractMonthlyRent. */
  contractAnnualRent: Metric

  /** Actual, Tax-Center-resolved income for the tax year reviewed, to date — ALL income categories Tax Center tracks (rental + other), not rent-only. A genuinely different concept from contract rent. Tagged 'annual_actual' instead of 'ytd_actual' when period.isYearComplete is true. */
  actualIncomeYtd: Metric
  /** Tax Center's resolved effective operating-expense total for the tax year reviewed, to date (mortgage/CapEx/financing excluded). Tagged 'annual_actual' instead of 'ytd_actual' when period.isYearComplete is true. */
  operatingExpensesYtd: Metric
  /** actualIncomeYtd - operatingExpensesYtd, from the SAME period — always safe to compute whenever both inputs are available, regardless of whether that period is a partial or complete year. Never annualized. */
  noiYtd: Metric

  /** The mortgage this app currently treats as this property's balance — from the current mortgage row when one exists, else the flat properties.mortgage_balance fallback. Never independently verified against a lender. */
  mortgageBalance: Metric
  /** Monthly principal + interest, read directly from mortgages.monthly_payment (never recomputed via amortization) when a mortgage row exists. */
  monthlyDebtService: Metric

  /** estimatedValue - mortgageBalance, via the existing equity(). Only computed when both inputs are present; never treated as lender-verified. */
  equity: Metric

  /**
   * NOI for a CONFIRMED, fully-elapsed tax year only (period.isYearComplete
   * === true) — the same actualIncomeYtd/operatingExpensesYtd figures,
   * just relabeled once their period is confirmed to be a genuine full
   * year. Unavailable for the common case of a still-in-progress current
   * year: PropRoster has no reliable annual expense basis for a partial
   * year today (Phase B.1 — see docs/property-intelligence-v1-phase-b.md
   * for why contract rent is not substituted in to force this metric to
   * appear).
   */
  noiAnnual: Metric
  /** noiAnnual / estimatedValue x 100, via the existing capRate(). Only when noiAnnual is itself available — never derived from noiYtd or from contract rent. */
  capRatePercent: Metric
  /** noiAnnual / 12 - monthlyDebtService. Only when BOTH noiAnnual (a confirmed annual figure) and monthlyDebtService are available — never derived by dividing noiYtd by 12. */
  netCashFlowMonthly: Metric
}
