// PropRoster — Property Intelligence V1, Phase B: shared calculation
// engine.
//
// Pure, framework-free, no Supabase — every function here takes
// already-resolved inputs (see types.ts's PropertyPerformanceInput) and
// returns a typed result. This is deliberately the SAME separation
// lib/investment-calculations.ts and lib/tax-center/aggregate.ts already
// use: database fetching/source resolution lives in resolve.ts, the math
// lives here, so the math can be unit tested without mocking anything.
//
// No new formulas. Every core number reuses lib/investment-calculations.ts
// unchanged (calculateNOI/capRate/equity) — this file's only job is
// deciding, from real data, whether each formula's inputs are trustworthy
// enough to call at all (Phase A's central finding: PropRoster already had
// correct formulas, it just never fed them live data).

import { calculateNOI, capRate as calcCapRate, equity as calcEquity, num } from '../investment-calculations'
import {
  available, incomplete, unavailable,
  type ActiveLeaseInput, type Metric, type MortgageInput,
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
    return available(rent, 'active_lease', rent > 0 ? undefined : { notes: ['The active lease on file lists $0 monthly rent.'] })
  }
  const fallback = num(propertyMonthlyRentFallback)
  if (fallback > 0) {
    return available(fallback, 'property_fallback', {
      estimated: true,
      notes: ['No active lease on file — using the property\'s manually entered rent estimate, which may be stale.'],
    })
  }
  return unavailable('none', ['No active lease and no fallback rent on file.'])
}

/** contractMonthlyRent, annualized — a contractual RATE, so annualizing it is legitimate regardless of how much of the year has elapsed (Phase A "Time Periods"). Mirrors the monthly metric's status/source/notes exactly. */
export function resolveContractAnnualRent(contractMonthlyRent: Metric): Metric {
  if (contractMonthlyRent.status === 'unavailable' || contractMonthlyRent.value === null) {
    return unavailable(contractMonthlyRent.source, contractMonthlyRent.notes)
  }
  return { ...contractMonthlyRent, value: contractMonthlyRent.value * 12 }
}

/**
 * Actual cash-basis income for the current tax year to date — Tax
 * Center's already-resolved grossIncome (rental + other income,
 * tracked-or-manual-overridden), reused rather than re-summing
 * financial_transactions/rent_payments a second time (Phase A Section 5's
 * double-counting audit + Section 10's integration boundary). A genuinely
 * different concept from contract rent: a vacant stretch, a rent
 * concession, or simply "collected but not yet logged" all make this
 * differ from contractMonthlyRent x months-elapsed.
 */
export function resolveActualIncomeYtd(taxYearSummary: TaxYearSummaryInput): Metric {
  const hasAnyData = taxYearSummary.transactionCount > 0 || taxYearSummary.hasManualRecord
  if (!hasAnyData) {
    return unavailable('none', ['Nothing has been logged in Tax Center for this property yet this year.'])
  }
  return available(num(taxYearSummary.grossIncome), 'tax_center_resolved')
}

/**
 * Effective operating expenses for the current tax year to date, reused
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
 * as a clean figure.
 */
export function resolveOperatingExpensesYtd(taxYearSummary: TaxYearSummaryInput): Metric {
  const hasAnyData = taxYearSummary.transactionCount > 0 || taxYearSummary.hasManualRecord
  const expenses = num(taxYearSummary.operatingExpenses)
  if (!hasAnyData) {
    return unavailable('none', ['Nothing has been logged in Tax Center for this property yet this year.'])
  }
  if (expenses === 0) {
    return incomplete(0, 'tax_center_resolved', ['No operating expenses have been logged yet this tax year — this likely means nothing has been recorded, not that this property has no costs.'])
  }
  return available(expenses, 'tax_center_resolved')
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
 * "mortgage" doc comment in types.ts).
 */
export function resolveMortgageBalance(mortgage: MortgageInput | null, propertyMortgageBalanceFallback: number): Metric {
  if (mortgage) {
    return available(num(mortgage.currentBalance), 'mortgage_record', {
      estimated: true,
      potentiallyStale: true,
      notes: ['This balance has no ongoing update path in PropRoster today and may not reflect the current lender balance.'],
    })
  }
  const fallback = num(propertyMortgageBalanceFallback)
  if (fallback > 0) {
    return available(fallback, 'property_mortgage_balance', {
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
 * so there is nothing to resolve without one.
 */
export function resolveMonthlyDebtService(mortgage: MortgageInput | null): Metric {
  if (!mortgage) {
    return unavailable('none', ['No mortgage record on file — PropRoster cannot determine debt service. This does not necessarily mean the property has no financing.'])
  }
  const payment = num(mortgage.monthlyPayment)
  if (payment <= 0) {
    return incomplete(0, 'mortgage_record', ['A mortgage is on file but no monthly payment amount has been recorded.'])
  }
  return available(payment, 'mortgage_record', { potentiallyStale: true })
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
  return available(value, 'property_estimated_value', { estimated: true })
}

/**
 * NOI (this tax year so far, at the current contract rent) = grossIncome -
 * operatingExpensesYtd, via the existing calculateNOI() — unchanged
 * formula, only new live inputs (Phase A Section 6).
 *
 * grossIncome = contractAnnualRent + any Tax Center "other rental-related
 * income" tracked for the year — Phase A's exact formula. Financing is
 * never part of either side.
 *
 * Only computed when operatingExpensesYtd is a trustworthy 'available'
 * figure (never on an 'incomplete'/suspicious-zero expense total — that
 * would silently overstate NOI, exactly the false precision this phase
 * exists to avoid) and contract rent is at least known (available OR the
 * flagged estimated fallback). A fallback-rent-sourced NOI is itself
 * marked 'incomplete' so it carries the same caveat forward.
 */
export function resolveNOI(contractAnnualRent: Metric, otherIncomeYtd: number, operatingExpensesYtd: Metric): Metric {
  if (contractAnnualRent.status === 'unavailable' || contractAnnualRent.value === null) {
    return unavailable('derived', ['No contract rent available to calculate income.'])
  }
  if (operatingExpensesYtd.status !== 'available' || operatingExpensesYtd.value === null) {
    return unavailable('derived', operatingExpensesYtd.notes ?? ['Not enough expense data logged yet this tax year.'])
  }
  const other = num(otherIncomeYtd)
  const grossIncome = contractAnnualRent.value + other
  const noi = calculateNOI(grossIncome, operatingExpensesYtd.value)
  const notes: string[] = [`Income is the current lease's annualized contract rent${other > 0 ? ' plus other rental-related income tracked this year' : ''}; expenses are this tax year to date, not a full trailing-twelve-month figure.`]
  if (contractAnnualRent.estimated) {
    notes.push(...(contractAnnualRent.notes ?? []))
    return incomplete(noi, 'derived', notes)
  }
  return available(noi, 'derived', { notes })
}

/** Cap Rate = NOI / estimatedValue x 100, via the existing capRate(). Mirrors NOI's own confidence (available/incomplete) and additionally requires a real estimated value. */
export function resolveCapRate(noiAnnual: Metric, estimatedValue: Metric): Metric {
  if (noiAnnual.status === 'unavailable' || noiAnnual.value === null) {
    return unavailable('derived', ['Not enough income/expense data to calculate NOI.'])
  }
  if (estimatedValue.status === 'unavailable' || estimatedValue.value === null || estimatedValue.value <= 0) {
    return unavailable('derived', ['No estimated value on file to calculate Cap Rate against.'])
  }
  const pct = calcCapRate(noiAnnual.value, estimatedValue.value)
  if (pct === null || !Number.isFinite(pct)) return unavailable('derived', ['Cap Rate could not be calculated from the available data.'])
  if (noiAnnual.status === 'incomplete') return incomplete(pct, 'derived', noiAnnual.notes ?? [])
  return available(pct, 'derived', { notes: noiAnnual.notes, estimated: estimatedValue.estimated })
}

/**
 * Net Cash Flow (monthly) = NOI/12 - monthly debt service. Strictly
 * requires monthlyDebtService to be 'available' (never 'incomplete') —
 * Phase A: "Only calculate this when debt-service information is
 * sufficiently supported... do not treat missing mortgage information as
 * $0 debt service."
 */
export function resolveNetCashFlow(noiAnnual: Metric, monthlyDebtService: Metric): Metric {
  if (noiAnnual.status === 'unavailable' || noiAnnual.value === null) {
    return unavailable('derived', ['Not enough income/expense data to calculate NOI.'])
  }
  if (monthlyDebtService.status !== 'available' || monthlyDebtService.value === null) {
    return unavailable('derived', monthlyDebtService.notes ?? ['Not enough mortgage/payment data to calculate Net Cash Flow.'])
  }
  const cashFlow = noiAnnual.value / 12 - monthlyDebtService.value
  const notes = [...(noiAnnual.notes ?? [])]
  return noiAnnual.status === 'incomplete' ? incomplete(cashFlow, 'derived', notes) : available(cashFlow, 'derived', { notes })
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
  return available(value, 'derived', {
    estimated: true, // estimatedValue is always landlord-entered, so equity can never be more certain than that
    potentiallyStale: mortgageBalance.potentiallyStale,
    notes: ['Based on the property\'s entered value and its on-file mortgage balance — not independently verified against a lender or appraisal.'],
  })
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
 * completely valid result (most fields 'unavailable').
 */
export function computePropertyPerformance(input: PropertyPerformanceInput, now: Date = new Date()): PropertyPerformance {
  const estimatedValue = resolveEstimatedValue(input.estimatedValue)
  const contractMonthlyRent = resolveContractMonthlyRent(input.activeLease, input.propertyMonthlyRentFallback)
  const contractAnnualRent = resolveContractAnnualRent(contractMonthlyRent)
  const actualIncomeYtd = resolveActualIncomeYtd(input.taxYearSummary)
  const operatingExpensesYtd = resolveOperatingExpensesYtd(input.taxYearSummary)
  const noiAnnual = resolveNOI(contractAnnualRent, input.taxYearSummary.otherIncome ?? 0, operatingExpensesYtd)
  const capRatePercent = resolveCapRate(noiAnnual, estimatedValue)
  const mortgageBalance = resolveMortgageBalance(input.mortgage, input.propertyMortgageBalanceFallback)
  const monthlyDebtService = resolveMonthlyDebtService(input.mortgage)
  const netCashFlowMonthly = resolveNetCashFlow(noiAnnual, monthlyDebtService)
  const equity = resolveEquity(estimatedValue, mortgageBalance)

  return {
    propertyId: input.propertyId,
    period: { taxYear: input.taxYearSummary.year, asOf: now.toISOString().slice(0, 10) },
    estimatedValue,
    contractMonthlyRent,
    contractAnnualRent,
    actualIncomeYtd,
    operatingExpensesYtd,
    noiAnnual,
    capRatePercent,
    mortgageBalance,
    monthlyDebtService,
    netCashFlowMonthly,
    equity,
  }
}
