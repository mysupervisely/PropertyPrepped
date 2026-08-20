// PropRoster Milestone 21: Realtor Connect V1 — calculator context
// snapshots.
//
// Section 6: "Do not make the user retype information already entered
// into the calculator... Do not fabricate missing values. Store/send
// only fields that are actually available." Both builders below are pure
// (no DOM/network/React) and only ever include a field when the
// underlying value is a real, finite number (or non-empty string) — a
// field the user never entered, or one the calculator couldn't compute
// (e.g. DSCR/cap rate are `null` for an all-cash purchase), is simply
// omitted from the snapshot rather than sent as 0/"" placeholder data.

import type { AnalysisInput, AnalysisResult } from '../investment-calculations'
import { resolveMonthlyRent, num } from '../investment-calculations'
import type { HomePurchaseInput, HomePurchaseResult } from '../investment-tools/home-purchase-calculations'
import type { LeadAnalysisSnapshot } from './types'

function numOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Rounds to the nearest cent — snapshot values are for a human reading an email/admin table, not further computation. */
function money(value: number | null | undefined): number | undefined {
  const n = numOrUndefined(value)
  return n === undefined ? undefined : Math.round(n * 100) / 100
}

function percent(value: number | null | undefined): number | undefined {
  const n = numOrUndefined(value)
  return n === undefined ? undefined : Math.round(n * 100) / 100
}

export function buildRentalAnalyzerLeadSnapshot(address: string, input: AnalysisInput, result: AnalysisResult): LeadAnalysisSnapshot {
  const purchasePrice = num(input.purchasePrice)
  const downPaymentPercent = purchasePrice > 0 ? (result.downPaymentAmount / purchasePrice) * 100 : undefined

  return {
    source: 'rental_analyzer',
    propertyAddress: address.trim() || undefined,
    purchasePrice: purchasePrice > 0 ? money(purchasePrice) : undefined,
    downPaymentAmount: money(result.downPaymentAmount),
    downPaymentPercent: percent(downPaymentPercent),
    loanAmount: money(result.loanAmount),
    interestRatePercent: num(input.interestRatePercent) > 0 ? percent(num(input.interestRatePercent)) : undefined,
    estimatedRentMonthly: money(resolveMonthlyRent(input)) || undefined,
    operatingExpensesMonthly: money(result.monthlyOperatingExpenses),
    noiAnnual: money(result.noiAnnual),
    monthlyCashFlow: money(result.monthlyCashFlow),
    capRatePercent: percent(result.capRatePercent),
    cashOnCashReturnPercent: percent(result.cashOnCashReturnPercent),
    dscr: numOrUndefined(result.dscr) !== undefined ? Math.round((result.dscr as number) * 100) / 100 : undefined,
  }
}

export function buildHomePurchaseLeadSnapshot(address: string, input: HomePurchaseInput, result: HomePurchaseResult): LeadAnalysisSnapshot {
  const purchasePrice = num(input.purchasePrice)
  const downPaymentPercent = purchasePrice > 0 ? (result.downPaymentAmount / purchasePrice) * 100 : undefined

  return {
    source: 'home_purchase',
    propertyAddress: address.trim() || undefined,
    purchasePrice: purchasePrice > 0 ? money(purchasePrice) : undefined,
    downPaymentAmount: money(result.downPaymentAmount),
    downPaymentPercent: percent(downPaymentPercent),
    loanAmount: money(result.loanAmount),
    interestRatePercent: num(input.interestRatePercent) > 0 ? percent(num(input.interestRatePercent)) : undefined,
    estimatedMonthlyPayment: money(result.totalMonthlyPayment),
    propertyTaxMonthly: money(result.propertyTaxMonthly) || undefined,
    insuranceMonthly: money(result.insuranceMonthly) || undefined,
    hoaMonthly: money(result.hoaMonthly) || undefined,
    closingCostsAmount: money(result.closingCostsAmount),
    cashNeededToClose: money(result.cashNeededToClose),
  }
}
