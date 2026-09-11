// PropRoster — Property Intelligence V1, Phase B (corrected in Phase B.1):
// shared calculation engine.
//
// Pure, framework-free, no Supabase — every function here takes
// already-resolved inputs (see types.ts's PropertyPerformanceInput) and
// returns a typed result. This is deliberately the SAME separation
// lib/investment-calculations.ts and lib/tax-center/aggregate.ts already
// use: database fetching/source resolution lives in resolve.ts, the math
// lives here, so the math can be unit tested without mocking anything.
//
// No new formulas. Every core number reuses lib/investment-calculations.ts
// unchanged (calculateNOI/capRate/equity) — this file's job is deciding,
// from real data, whether each formula's inputs are trustworthy enough to
// call at all, AND (Phase B.1) whether they share a compatible time period.
//
// --- Phase B.1 correction -------------------------------------------------
// The original version of this file computed "annual NOI" as
// (annualized contract rent) - (Tax Center's YEAR-TO-DATE operating
// expenses). That mixes a full-year figure with a partial-year one and
// called the result annual — exactly the false precision this whole
// milestone exists to avoid, and exactly what Cap Rate (which requires a
// real annual NOI) would then have silently inherited.
//
// The fix: this file now computes TWO NOI figures instead of one blended
// one.
//   - noiYtd   = actualIncomeYtd - operatingExpensesYtd, always the SAME
//                period (whatever period taxYearSummary covers). Never
//                annualized.
//   - noiAnnual = the SAME figure, but ONLY exposed once
//                `period.isYearComplete` confirms taxYearSummary actually
//                covers a full, fully-elapsed tax year. Contract rent is
//                deliberately NOT substituted in to force this metric to
//                exist for a partial year — see
//                docs/property-intelligence-v1-phase-b.md for the
//                reasoning (Tax Center has no reliable per-category
//                "this is a known annual figure regardless of elapsed
//                time" classification today; inventing one would be
//                exactly the kind of estimate this phase forbids).
// Cap Rate and Net Cash Flow now both key off noiAnnual only — never
// noiYtd, never contract rent.

import { calculateNOI, capRate as calcCapRate, equity as calcEquity, num } from '../investment-calculations'
import {
  available, incomplete, unavailable,
  type ActiveLeaseInput, type FinancingStatus, type Metric, type MortgageInput,
  type PropertyPerformance, type PropertyPerformanceInput, type TaxYearSummaryInput,
} from './types'

// ---------------------------------------------------------------------------
// Individual resolvers — exported separately so each source-priority rule
// is directly unit-testable, not just observable through the combined
// result.
// ---------------------------------------------------------------------------

/**
 * Contract rent: the current lease's monthly_rent when a lease exists,
 * else the stale properties.monthly_rent fallback — Phase A's exact
 * priority rule, already precedented by rental-analyzer/page.tsx's own
 * prefill logic. Never silently treats the fallback as equally
 * authoritative: it is tagged `estimated` with an explicit note.
 */
export function resolveContractMonthlyRent(activeLease: ActiveLeaseInput | null, propertyMonthlyRentFallback: number): Metric {
  if (activeLease) {
    const rent = num(activeLease.monthlyRent)
    // A real, entered value on an active lease — $0 is a genuine possible
    // fact (e.g. a family member paying no rent) and is not second-guessed
    // here; it is still "available," just worth a note for context.
    return available(rent, 'active_lease', 'monthly_contract', rent > 0 ? undefined : { notes: ['The active lease on file lists $0 monthly rent.'] })
  }
  const fallback = num(propertyMonthlyRentFallback)
  if (fallback > 0) {
    return available(fallback, 'property_fallback', 'monthly_contract', {
      estimated: true,
      notes: ['No active lease on file — using the property\'s manually entered rent estimate, which may be stale.'],
    })
  }
  return unavailable('none', ['No active lease and no fallback rent on file.'])
}

/** contractMonthlyRent, annualized — a contractual RATE, so annualizing it is legitimate regardless of how much of the year has elapsed. Mirrors the monthly metric's status/source/notes exactly. NEVER used as an income input to noiAnnual (Phase B.1) — kept only as its own, independently useful figure. */
export function resolveContractAnnualRent(contractMonthlyRent: Metric): Metric {
  if (contractMonthlyRent.status === 'unavailable' || contractMonthlyRent.value === null) {
    return unavailable(contractMonthlyRent.source, contractMonthlyRent.notes)
  }
  return { ...contractMonthlyRent, value: contractMonthlyRent.value * 12, period: 'annual_contract' }
}

/**
 * Actual income for the tax year reviewed, to date — Tax Center's already-
 * resolved grossIncome (ALL income categories it tracks: rental income
 * AND any "other rental-related income," tracked-or-manual-overridden),
 * reused rather than re-summing financial_transactions/rent_payments a
 * second time (Phase A Section 5's double-counting audit + Section 10's
 * integration boundary). This is NOT rent-only — it is labeled "income,"
 * never "rent received." A genuinely different concept from contract
 * rent: a vacant stretch, a rent concession, or simply "collected but not
 * yet logged" all make this differ from contractMonthlyRent x
 * months-elapsed.
 *
 * Tagged 'annual_actual' instead of 'ytd_actual' when the tax year has
 * fully elapsed (isYearComplete) — same real number, just relabeled once
 * its period is confirmed complete.
 */
export function resolveActualIncomeYtd(taxYearSummary: TaxYearSummaryInput, isYearComplete: boolean): Metric {
  const hasAnyData = taxYearSummary.transactionCount > 0 || taxYearSummary.hasManualRecord
  const period = isYearComplete ? 'annual_actual' : 'ytd_actual'
  if (!hasAnyData) {
    return unavailable('none', ['Nothing has been logged in Tax Center for this property yet this year.'])
  }
  return available(num(taxYearSummary.grossIncome), 'tax_center_resolved', period)
}

/**
 * Effective operating expenses for the tax year reviewed, to date, reused
 * directly from Tax Center's own manual-overrides-replace-tracked
 * resolution (lib/tax-center/manual-entry.ts's computeCategoryValue) —
 * never a second, independently-summed expense total, which is what
 * actually prevents double counting between the ledger and Tax Center's
 * manual entries (Phase A Section 5/10).
 *
 * A computed $0 is only trusted as "available" when there is other
 * evidence the landlord is actually using the ledger/Tax Center for this
 * property/year (Phase A Section 7: "a true zero-expense property is
 * implausible and almost always means nothing logged yet"). Otherwise it
 * is 'incomplete' — a real number, but one that must never be presented
 * as a clean figure, and never allowed to feed noiYtd/noiAnnual.
 *
 * Tagged 'annual_actual' instead of 'ytd_actual' once the tax year has
 * fully elapsed — see resolveActualIncomeYtd's own doc comment.
 */
export function resolveOperatingExpensesYtd(taxYearSummary: TaxYearSummaryInput, isYearComplete: boolean): Metric {
  const hasAnyData = taxYearSummary.transactionCount > 0 || taxYearSummary.hasManualRecord
  const expenses = num(taxYearSummary.operatingExpenses)
  const period = isYearComplete ? 'annual_actual' : 'ytd_actual'
  if (!hasAnyData) {
    return unavailable('none', ['Nothing has been logged in Tax Center for this property yet this year.'])
  }
  if (expenses === 0) {
    return incomplete(0, 'tax_center_resolved', period, ['No operating expenses have been logged yet this tax year — this likely means nothing has been recorded, not that this property has no costs.'])
  }
  return available(expenses, 'tax_center_resolved', period)
}

/**
 * The mortgage balance this app currently treats as authoritative: the
 * current mortgage row's balance when one exists (Phase A: "prefer the
 * most recent mortgage row"), else the flat properties.mortgage_balance
 * fallback. Neither source has an edit path once entered (Phase A Section
 * 17) — both are flagged `potentiallyStale`.
 *
 * A $0 balance with NO mortgage row on file is deliberately treated as
 * 'unavailable', not "paid off": supabase/schema.sql's mortgages table
 * has no way to distinguish "this property genuinely has no mortgage"
 * from "a mortgage was simply never entered" (both look identical — zero
 * rows). Never guess between them (Phase A Section 17 / this module's own
 * "mortgage" doc comment in types.ts) — UNLESS the landlord has actually
 * told us, via financingStatus (Phase C.2). 'Paid Off'/'No Mortgage'
 * checked FIRST: a landlord's explicit confirmation is more trustworthy
 * than a leftover/stale mortgage row that should have been removed, and
 * resolves this exact ambiguity for the real subset of properties where
 * it's been set. 'Active Mortgage' and 'Unknown' change nothing below —
 * the pre-Phase-C.2 behavior applies exactly as before, never assuming a
 * zero balance from a missing mortgage row on its own.
 */
export function resolveMortgageBalance(mortgage: MortgageInput | null, propertyMortgageBalanceFallback: number, financingStatus: FinancingStatus): Metric {
  if (financingStatus === 'Paid Off' || financingStatus === 'No Mortgage') {
    return available(0, 'financing_status_confirmed', 'point_in_time', {
      notes: [`This property is marked "${financingStatus}" — mortgage balance is a confirmed $0, not an assumption.`],
    })
  }
  if (mortgage) {
    return available(num(mortgage.currentBalance), 'mortgage_record', 'point_in_time', {
      estimated: true,
      potentiallyStale: true,
      notes: ['This balance has no ongoing update path in PropRoster today and may not reflect the current lender balance.'],
    })
  }
  const fallback = num(propertyMortgageBalanceFallback)
  if (fallback > 0) {
    return available(fallback, 'property_mortgage_balance', 'point_in_time', {
      estimated: true,
      potentiallyStale: true,
      notes: ['No mortgage record on file — this reflects the property\'s manually entered balance, which may not be current.'],
    })
  }
  return unavailable('none', ['No mortgage record and no balance on file — PropRoster cannot tell whether this property has financing.'])
}

/**
 * Monthly principal + interest, read directly from mortgages.monthly_payment
 * — never recomputed via amortization (Phase A: "a field already stored,
 * not derived"). Requires an actual mortgage row; the flat
 * properties.mortgage_balance fallback carries no payment figure at all,
 * so there is nothing to resolve without one — UNLESS financingStatus
 * (Phase C.2) confirms there is genuinely no debt to service at all. Same
 * precedence/reasoning as resolveMortgageBalance above: an explicit Paid
 * Off/No Mortgage confirmation is checked first and produces a KNOWN
 * $0, never assumed from an Active Mortgage or Unknown status alone.
 */
export function resolveMonthlyDebtService(mortgage: MortgageInput | null, financingStatus: FinancingStatus): Metric {
  if (financingStatus === 'Paid Off' || financingStatus === 'No Mortgage') {
    return available(0, 'financing_status_confirmed', 'monthly_contract', {
      notes: [`This property is marked "${financingStatus}" — monthly debt service is a confirmed $0, not an assumption.`],
    })
  }
  if (!mortgage) {
    return unavailable('none', ['No mortgage record on file — PropRoster cannot determine debt service. This does not necessarily mean the property has no financing.'])
  }
  const payment = num(mortgage.monthlyPayment)
  if (payment <= 0) {
    return incomplete(0, 'mortgage_record', 'monthly_contract', ['A mortgage is on file but no monthly payment amount has been recorded.'])
  }
  return available(payment, 'mortgage_record', 'monthly_contract', { potentiallyStale: true })
}

/**
 * Estimated value straight from properties.estimated_value. 0 (the
 * column's not-null default) is treated as "not entered" — a real
 * property is never actually worth $0 — matching every other read of
 * this field elsewhere in the app (Phase A Section 2).
 */
export function resolveEstimatedValue(estimatedValue: number): Metric {
  const value = num(estimatedValue)
  if (value <= 0) return unavailable('none', ['No estimated value has been entered for this property.'])
  return available(value, 'property_estimated_value', 'point_in_time', { estimated: true })
}

/**
 * noiYtd = actualIncomeYtd - operatingExpensesYtd, via the existing
 * calculateNOI() — unchanged formula, only new live inputs (Phase A
 * Section 6). Both inputs are guaranteed to cover the SAME period by
 * construction (they both come from the same taxYearSummary), so this is
 * always period-safe — unlike the pre-Phase-B.1 version, contract rent is
 * never involved here at all.
 *
 * Only computed when BOTH inputs are a trustworthy 'available' figure —
 * never on an 'incomplete'/suspicious-zero expense total (that would
 * silently overstate NOI) and never when income is unavailable.
 */
export function resolveNoiYtd(actualIncomeYtd: Metric, operatingExpensesYtd: Metric): Metric {
  if (actualIncomeYtd.status !== 'available' || actualIncomeYtd.value === null) {
    return unavailable('derived', actualIncomeYtd.notes ?? ['Not enough income data logged yet this tax year.'])
  }
  if (operatingExpensesYtd.status !== 'available' || operatingExpensesYtd.value === null) {
    return unavailable('derived', operatingExpensesYtd.notes ?? ['Not enough expense data logged yet this tax year.'])
  }
  const noi = calculateNOI(actualIncomeYtd.value, operatingExpensesYtd.value)
  return available(noi, 'derived', actualIncomeYtd.period)
}

/**
 * Annual NOI — the SAME noiYtd figure, exposed only once its underlying
 * period is a CONFIRMED, fully-elapsed tax year (isYearComplete). This is
 * the Phase B.1 fix in one function: no contract rent, no YTD expenses
 * pretending to be annual — either the period genuinely covers a full
 * year, or this metric is unavailable.
 */
export function resolveNoiAnnual(noiYtd: Metric, isYearComplete: boolean): Metric {
  if (!isYearComplete) {
    return unavailable('derived', ['This tax year is still in progress — PropRoster does not yet have a full year of data to calculate annual NOI. See NOI (year to date) instead.'])
  }
  if (noiYtd.status === 'unavailable' || noiYtd.value === null) {
    return unavailable('derived', noiYtd.notes ?? ['Not enough data for a complete tax year to calculate annual NOI.'])
  }
  return available(noiYtd.value, 'derived', 'annual_actual', { notes: ['Based on this property\'s complete, actual income and expenses for the full tax year.'] })
}

/** Cap Rate = NOI / estimatedValue x 100, via the existing capRate(). Requires a genuine annual NOI (never noiYtd, never contract rent) and a real estimated value. */
export function resolveCapRate(noiAnnual: Metric, estimatedValue: Metric): Metric {
  if (noiAnnual.status !== 'available' || noiAnnual.value === null) {
    return unavailable('derived', noiAnnual.notes ?? ['A confirmed annual NOI is required to calculate Cap Rate.'])
  }
  if (estimatedValue.status === 'unavailable' || estimatedValue.value === null || estimatedValue.value <= 0) {
    return unavailable('derived', ['No estimated value on file to calculate Cap Rate against.'])
  }
  const pct = calcCapRate(noiAnnual.value, estimatedValue.value)
  if (pct === null || !Number.isFinite(pct)) return unavailable('derived', ['Cap Rate could not be calculated from the available data.'])
  return available(pct, 'derived', 'annual_actual', { estimated: estimatedValue.estimated })
}

/**
 * Net Cash Flow (monthly) = annual NOI/12 - monthly debt service. Requires
 * BOTH a genuine annual NOI (never noiYtd — dividing a partial-year NOI
 * by 12 would misrepresent it as a monthly run rate) and a strictly
 * 'available' monthly debt service (Phase A: "Only calculate this when
 * debt-service information is sufficiently supported... do not treat
 * missing mortgage information as $0 debt service").
 */
export function resolveNetCashFlow(noiAnnual: Metric, monthlyDebtService: Metric): Metric {
  if (noiAnnual.status !== 'available' || noiAnnual.value === null) {
    return unavailable('derived', noiAnnual.notes ?? ['A confirmed annual NOI is required to calculate Net Cash Flow.'])
  }
  if (monthlyDebtService.status !== 'available' || monthlyDebtService.value === null) {
    return unavailable('derived', monthlyDebtService.notes ?? ['Not enough mortgage/payment data to calculate Net Cash Flow.'])
  }
  const cashFlow = noiAnnual.value / 12 - monthlyDebtService.value
  return available(cashFlow, 'derived', 'monthly_derived', { notes: noiAnnual.notes })
}

/**
 * Equity = estimatedValue - mortgageBalance, via the existing equity().
 * Only when BOTH inputs are present (never treats a missing input as
 * zero); carries forward whichever estimated/potentiallyStale flags its
 * inputs already had — this is never described as lender-verified equity
 * (Phase A: value is landlord-entered, mortgage balance may be stale).
 */
export function resolveEquity(estimatedValue: Metric, mortgageBalance: Metric): Metric {
  if (estimatedValue.status === 'unavailable' || estimatedValue.value === null) {
    return unavailable('derived', ['No estimated value on file.'])
  }
  if (mortgageBalance.status === 'unavailable' || mortgageBalance.value === null) {
    return unavailable('derived', ['No mortgage balance available — see mortgageBalance for why.'])
  }
  const value = calcEquity(estimatedValue.value, mortgageBalance.value)
  return available(value, 'derived', 'point_in_time', {
    estimated: true, // estimatedValue is always landlord-entered, so equity can never be more certain than that
    potentiallyStale: mortgageBalance.potentiallyStale,
    notes: ['Based on the property\'s entered value and its on-file mortgage balance — not independently verified against a lender or appraisal.'],
  })
}

/**
 * Whether `year` has fully elapsed relative to `now` — the ONLY condition
 * under which this engine treats actual income/expense totals as a
 * genuine annual basis. The year `now` itself falls in is ALWAYS
 * "incomplete," even on December 31st, to avoid a fragile exact-date
 * boundary check (types.ts's PropertyPerformancePeriod.isYearComplete).
 */
export function isYearComplete(year: string, now: Date): boolean {
  const y = Number(year)
  return Number.isFinite(y) && y < now.getFullYear()
}

// ---------------------------------------------------------------------------
// Combined snapshot
// ---------------------------------------------------------------------------

/**
 * Computes one property's full performance snapshot from already-resolved
 * inputs. Never throws, never returns NaN/Infinity, never substitutes a
 * misleading zero for "unknown" — every field independently degrades to
 * 'unavailable'/'incomplete' per its own resolver above. A brand-new
 * property with only an address and an estimated value still returns a
 * completely valid result (most fields 'unavailable'). It is completely
 * normal and expected for noiAnnual/capRatePercent/netCashFlowMonthly to
 * be 'unavailable' for a property being reviewed mid-year — see
 * docs/property-intelligence-v1-phase-b.md.
 */
export function computePropertyPerformance(input: PropertyPerformanceInput, now: Date = new Date()): PropertyPerformance {
  const yearComplete = isYearComplete(input.taxYearSummary.year, now)

  const estimatedValue = resolveEstimatedValue(input.estimatedValue)
  const contractMonthlyRent = resolveContractMonthlyRent(input.activeLease, input.propertyMonthlyRentFallback)
  const contractAnnualRent = resolveContractAnnualRent(contractMonthlyRent)
  const actualIncomeYtd = resolveActualIncomeYtd(input.taxYearSummary, yearComplete)
  const operatingExpensesYtd = resolveOperatingExpensesYtd(input.taxYearSummary, yearComplete)
  const noiYtd = resolveNoiYtd(actualIncomeYtd, operatingExpensesYtd)
  const noiAnnual = resolveNoiAnnual(noiYtd, yearComplete)
  const capRatePercent = resolveCapRate(noiAnnual, estimatedValue)
  const mortgageBalance = resolveMortgageBalance(input.mortgage, input.propertyMortgageBalanceFallback, input.financingStatus)
  const monthlyDebtService = resolveMonthlyDebtService(input.mortgage, input.financingStatus)
  const netCashFlowMonthly = resolveNetCashFlow(noiAnnual, monthlyDebtService)
  const equity = resolveEquity(estimatedValue, mortgageBalance)

  return {
    propertyId: input.propertyId,
    period: { taxYear: input.taxYearSummary.year, asOf: now.toISOString().slice(0, 10), isYearComplete: yearComplete },
    estimatedValue,
    contractMonthlyRent,
    contractAnnualRent,
    actualIncomeYtd,
    operatingExpensesYtd,
    noiYtd,
    mortgageBalance,
    monthlyDebtService,
    equity,
    noiAnnual,
    capRatePercent,
    netCashFlowMonthly,
  }
}

// ---------------------------------------------------------------------------
// Phase C.2: most recent qualifying completed year
// ---------------------------------------------------------------------------

/**
 * Selects the most recent, fully-elapsed prior tax year with enough
 * actual data to produce a trustworthy annual NOI, and returns that
 * year's full PropertyPerformance — or null when none of the supplied
 * candidates qualify (a quiet "no prior year available," never a
 * fabricated number).
 *
 * `candidateInputs` should already be ordered most-recent-year-first — a
 * caller-supplied, BOUNDED lookback (app/page.tsx's Phase C.2 wiring
 * uses the last 3 calendar years; see docs/property-intelligence-v1-
 * phase-c.md), never unbounded history. This function does not load any
 * data itself and never grows that list — it only decides, using the
 * exact same computePropertyPerformance() as everything else in this
 * module, which one (if any) is good enough to call "full-year
 * performance."
 *
 * "Qualifies" is deliberately NOT a second, parallel data-sufficiency
 * rule — it reuses computePropertyPerformance()'s own noiAnnual as the
 * single source of truth for "is this a confirmed, trustworthy annual
 * NOI," exactly the same gate resolveNoiAnnual/resolveActualIncomeYtd/
 * resolveOperatingExpensesYtd already enforce (a year with zero
 * transactions and no manual record, or only a suspicious $0 expense
 * total, never qualifies). Defensively re-checks isYearComplete itself
 * (rather than trusting the caller) so this function can never be misused
 * to select the current, still-in-progress year.
 */
export function selectPriorYearPerformance(candidateInputs: PropertyPerformanceInput[], now: Date = new Date()): PropertyPerformance | null {
  for (const input of candidateInputs) {
    if (!isYearComplete(input.taxYearSummary.year, now)) continue
    const candidate = computePropertyPerformance(input, now)
    if (candidate.noiAnnual.status === 'available') return candidate
  }
  return null
}
