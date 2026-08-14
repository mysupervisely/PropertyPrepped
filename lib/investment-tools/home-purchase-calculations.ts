// PropRoster Milestone: Investment Tools 2.0 — Home Purchase Calculator.
//
// Pure, framework-free math (Part 6) — no React, no Supabase, no DOM —
// mirroring the same testable-core pattern already used by
// lib/investment-calculations.ts (Rental Property Analyzer). Reuses that
// module's mortgagePayment()/num() rather than re-implementing amortization
// math a second, subtly-different way.
//
// Deliberately excludes every rental-investment concept (rent, vacancy,
// property management, NOI, cap rate, cash-on-cash, DSCR) — a primary-
// residence buyer should never be asked about any of them (Part 6).

import { mortgagePayment, num } from '../investment-calculations'

export type PercentOrAmountMode = 'percent' | 'amount'

export type HomePurchaseInput = {
  purchasePrice: number
  downPaymentMode: PercentOrAmountMode
  downPaymentPercent?: number
  downPaymentAmount?: number
  interestRatePercent: number
  loanTermYears: number
  propertyTaxesAnnual?: number
  homeInsuranceAnnual?: number
  hoaMonthly?: number
  /** Optional, plain monthly dollar amount — 0/omitted means no PMI. */
  pmiMonthly?: number
  closingCostsMode?: PercentOrAmountMode
  closingCostsPercent?: number
  closingCostsAmount?: number
}

export type HomePurchaseResult = {
  downPaymentAmount: number
  loanAmount: number
  principalAndInterestMonthly: number
  propertyTaxMonthly: number
  insuranceMonthly: number
  pmiMonthly: number
  hoaMonthly: number
  /** Part 6: "Then prominently: ESTIMATED TOTAL MONTHLY PAYMENT." */
  totalMonthlyPayment: number
  closingCostsAmount: number
  /** downPaymentAmount + closingCostsAmount. */
  cashNeededToClose: number
  /** null only when purchasePrice is not usable (<=0) — never a fabricated ratio. */
  loanToValuePercent: number | null
}

/**
 * Resolves the full Home Purchase Calculator output (Part 6) from a
 * form-shaped input. This is the single function the calculator's UI
 * calls; every field is independently testable via the exported types
 * above and lib/investment-calculations.ts's own exports (mortgagePayment,
 * num) that this builds on.
 */
export function buildHomePurchaseAnalysis(input: HomePurchaseInput): HomePurchaseResult {
  const purchasePrice = num(input.purchasePrice)

  const downPaymentAmount = input.downPaymentMode === 'amount'
    ? Math.min(num(input.downPaymentAmount), purchasePrice > 0 ? purchasePrice : num(input.downPaymentAmount))
    : purchasePrice * (num(input.downPaymentPercent) / 100)
  const loanAmount = Math.max(0, purchasePrice - downPaymentAmount)

  const principalAndInterestMonthly = mortgagePayment(loanAmount, num(input.interestRatePercent), num(input.loanTermYears) || 30)
  const propertyTaxMonthly = num(input.propertyTaxesAnnual) / 12
  const insuranceMonthly = num(input.homeInsuranceAnnual) / 12
  const pmiMonthly = num(input.pmiMonthly)
  const hoaMonthly = num(input.hoaMonthly)
  const totalMonthlyPayment = principalAndInterestMonthly + propertyTaxMonthly + insuranceMonthly + pmiMonthly + hoaMonthly

  const closingCostsAmount = input.closingCostsMode === 'amount'
    ? num(input.closingCostsAmount)
    : purchasePrice * (num(input.closingCostsPercent) / 100)
  const cashNeededToClose = downPaymentAmount + closingCostsAmount

  const loanToValuePercent = purchasePrice > 0 ? (loanAmount / purchasePrice) * 100 : null

  return {
    downPaymentAmount,
    loanAmount,
    principalAndInterestMonthly,
    propertyTaxMonthly,
    insuranceMonthly,
    pmiMonthly,
    hoaMonthly,
    totalMonthlyPayment,
    closingCostsAmount,
    cashNeededToClose,
    loanToValuePercent,
  }
}
