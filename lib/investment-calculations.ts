// PropPrepped Milestone 7: Investment Tools
//
// Pure, framework-free financial math for the Property Evaluator. Nothing in
// this file touches React, Supabase, or the DOM, so it can be unit tested in
// isolation and reused by a future public/unauthenticated calculator route.
//
// All monetary figures are plain numbers (USD). Internal math keeps full
// floating point precision; rounding for display happens in the UI layer.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Coerces any input into a finite number, defaulting missing/invalid values to 0. */
export function num(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Division that never produces NaN/Infinity. Returns `fallback` (default null) when the denominator is not usable. */
function safeDiv(numerator: number, denominator: number, fallback: number | null = null): number | null {
  if (!Number.isFinite(denominator) || denominator === 0) return fallback
  const result = numerator / denominator
  return Number.isFinite(result) ? result : fallback
}

// ---------------------------------------------------------------------------
// Core math primitives (Section J)
// ---------------------------------------------------------------------------

/**
 * Standard amortizing loan payment (principal + interest only; no escrow).
 * M = P * r(1+r)^n / ((1+r)^n - 1), with graceful handling of 0% interest
 * and non-positive loan amounts.
 */
export function mortgagePayment(loanAmount: number, annualRatePercent: number, termYears: number): number {
  const principal = num(loanAmount)
  const n = Math.round(num(termYears) * 12)
  if (principal <= 0 || n <= 0) return 0
  const r = num(annualRatePercent) / 100 / 12
  if (r === 0) return principal / n
  const factor = Math.pow(1 + r, n)
  if (!Number.isFinite(factor) || factor === 1) return principal / n
  const payment = (principal * (r * factor)) / (factor - 1)
  return Number.isFinite(payment) ? payment : 0
}

/**
 * Remaining balance on a standard amortizing loan after `monthsElapsed` payments.
 * B = P(1+r)^k - M * [((1+r)^k - 1) / r]
 */
export function remainingLoanBalance(loanAmount: number, annualRatePercent: number, termYears: number, monthsElapsed: number): number {
  const principal = num(loanAmount)
  const n = Math.round(num(termYears) * 12)
  if (principal <= 0 || n <= 0) return 0
  const k = Math.min(Math.max(Math.round(num(monthsElapsed)), 0), n)
  const r = num(annualRatePercent) / 100 / 12
  if (r === 0) return Math.max(0, principal - (principal / n) * k)
  const payment = mortgagePayment(principal, annualRatePercent, termYears)
  const factor = Math.pow(1 + r, k)
  const balance = principal * factor - payment * ((factor - 1) / r)
  return Number.isFinite(balance) ? Math.max(0, balance) : 0
}

/** Net Operating Income = annual gross (scheduled) income - annual operating expenses (mortgage excluded). */
export function calculateNOI(annualGrossIncome: number, annualOperatingExpenses: number): number {
  return num(annualGrossIncome) - num(annualOperatingExpenses)
}

/** Cap rate (%) = NOI / property value. Null when value is not usable ("N/A" in the UI). */
export function capRate(noiAnnual: number, propertyValue: number): number | null {
  const pct = safeDiv(num(noiAnnual), num(propertyValue))
  return pct === null ? null : pct * 100
}

/** Cash-on-cash return (%) = annual cash flow / total cash invested. Null when nothing was invested. */
export function cashOnCashReturn(annualCashFlow: number, totalCashInvested: number): number | null {
  const pct = safeDiv(num(annualCashFlow), num(totalCashInvested))
  return pct === null ? null : pct * 100
}

/** Debt Service Coverage Ratio = NOI / annual debt service. Null for all-cash deals (no debt service). */
export function dscr(noiAnnual: number, annualDebtService: number): number | null {
  return safeDiv(num(noiAnnual), num(annualDebtService))
}

/** Gross Rent Multiplier = purchase price / annual gross income. Null when there is no income to divide by. */
export function grossRentMultiplier(purchasePrice: number, annualGrossIncome: number): number | null {
  return safeDiv(num(purchasePrice), num(annualGrossIncome))
}

/** Break-even occupancy (%) = (operating expenses + debt service) / gross potential income. */
export function breakEvenOccupancy(annualOperatingExpenses: number, annualDebtService: number, annualGrossPotentialIncome: number): number | null {
  const pct = safeDiv(num(annualOperatingExpenses) + num(annualDebtService), num(annualGrossPotentialIncome))
  return pct === null ? null : pct * 100
}

/** Equity = current/market value - outstanding loan balance. */
export function equity(propertyValue: number, loanBalance: number): number {
  return num(propertyValue) - num(loanBalance)
}

// ---------------------------------------------------------------------------
// Full analysis input/output (Section B, D)
// ---------------------------------------------------------------------------

export type UnitRent = { label: string; monthlyRent: number }

export type AnalysisInput = {
  // Property
  purchasePrice: number
  marketValue?: number
  units?: number

  // Financing
  downPaymentMode: 'percent' | 'amount'
  downPaymentPercent?: number
  downPaymentAmount?: number
  interestRatePercent: number
  loanTermYears: number
  closingCosts?: number
  loanPointsPercent?: number

  // Income
  useUnitRents?: boolean
  monthlyRent?: number
  unitRents?: UnitRent[]
  otherMonthlyIncome?: number

  // Expenses (all optional; missing = 0)
  propertyTaxesAnnual?: number
  insuranceAnnual?: number
  hoaMonthly?: number
  managementMode?: 'percent' | 'amount'
  managementPercent?: number
  managementAmountMonthly?: number
  maintenanceMode?: 'percent' | 'amount'
  maintenancePercent?: number
  maintenanceAmountMonthly?: number
  vacancyPercent?: number
  utilitiesMonthly?: number
  otherExpensesMonthly?: number

  // Projection assumptions
  appreciationRatePercent?: number
  rentGrowthRatePercent?: number
  expenseGrowthRatePercent?: number
}

export type YearProjection = {
  year: number
  propertyValue: number
  mortgageBalance: number
  equity: number
  monthlyRent: number
  annualCashFlow: number
  cumulativeCashFlow: number
}

export type AnalysisResult = {
  // Financing
  downPaymentAmount: number
  loanAmount: number
  monthlyMortgagePayment: number
  annualDebtService: number
  loanPointsCost: number
  totalCashRequired: number

  // Income
  monthlyGrossIncome: number
  annualGrossIncome: number
  vacancyLossMonthly: number

  // Expenses
  monthlyOperatingExpenses: number
  annualOperatingExpenses: number

  // Core metrics
  noiAnnual: number
  capRatePercent: number | null
  monthlyCashFlow: number
  annualCashFlow: number
  cashOnCashReturnPercent: number | null
  dscr: number | null
  grm: number | null
  breakEvenOccupancyPercent: number | null
  equityAtPurchase: number
  propertyValueForAnalysis: number

  projections: YearProjection[]
}

const PROJECTION_YEARS = [1, 5, 10]

/** Resolves the scheduled monthly rent total, whether entered as one figure or as per-unit rents. */
export function resolveMonthlyRent(input: AnalysisInput): number {
  if (input.useUnitRents && input.unitRents && input.unitRents.length) {
    return input.unitRents.reduce((sum, unit) => sum + num(unit.monthlyRent), 0)
  }
  return num(input.monthlyRent)
}

function resolvePercentOrAmount(mode: 'percent' | 'amount' | undefined, percent: number | undefined, amount: number | undefined, base: number): number {
  if (mode === 'amount') return num(amount)
  return base * (num(percent) / 100)
}

/**
 * Resolves a full form-shaped input (with $/% toggles, optional fields, unit
 * rent breakdowns, etc.) into every metric described in Milestone 7 section B,
 * plus a Year 1 / 5 / 10 projection (section D). This is the single function
 * the Property Evaluator UI calls; everything above is exported separately so
 * each formula can also be unit tested on its own.
 */
export function buildAnalysis(input: AnalysisInput): AnalysisResult {
  const purchasePrice = num(input.purchasePrice)
  const marketValue = num(input.marketValue) > 0 ? num(input.marketValue) : purchasePrice
  const propertyValueForAnalysis = marketValue > 0 ? marketValue : purchasePrice

  // Financing
  const downPaymentAmount = input.downPaymentMode === 'amount'
    ? Math.min(num(input.downPaymentAmount), purchasePrice > 0 ? purchasePrice : num(input.downPaymentAmount))
    : purchasePrice * (num(input.downPaymentPercent) / 100)
  const loanAmount = Math.max(0, purchasePrice - downPaymentAmount)
  const monthlyPI = mortgagePayment(loanAmount, num(input.interestRatePercent), num(input.loanTermYears) || 30)
  const annualDebtService = monthlyPI * 12
  const loanPointsCost = loanAmount * (num(input.loanPointsPercent) / 100)
  const totalCashRequired = downPaymentAmount + num(input.closingCosts) + loanPointsCost

  // Income
  const rentTotal = resolveMonthlyRent(input)
  const otherIncome = num(input.otherMonthlyIncome)
  const monthlyGrossIncome = rentTotal + otherIncome
  const annualGrossIncome = monthlyGrossIncome * 12

  // Expenses
  const taxesMonthly = num(input.propertyTaxesAnnual) / 12
  const insuranceMonthly = num(input.insuranceAnnual) / 12
  const hoaMonthly = num(input.hoaMonthly)
  const managementMonthly = resolvePercentOrAmount(input.managementMode, input.managementPercent, input.managementAmountMonthly, rentTotal)
  const maintenanceMonthly = resolvePercentOrAmount(input.maintenanceMode, input.maintenancePercent, input.maintenanceAmountMonthly, rentTotal)
  const vacancyLossMonthly = rentTotal * (num(input.vacancyPercent) / 100)
  const utilitiesMonthly = num(input.utilitiesMonthly)
  const otherExpensesMonthly = num(input.otherExpensesMonthly)

  const monthlyOperatingExpenses = taxesMonthly + insuranceMonthly + hoaMonthly + managementMonthly + maintenanceMonthly + vacancyLossMonthly + utilitiesMonthly + otherExpensesMonthly
  const annualOperatingExpenses = monthlyOperatingExpenses * 12

  // Core metrics
  const noiAnnual = calculateNOI(annualGrossIncome, annualOperatingExpenses)
  const monthlyCashFlow = noiAnnual / 12 - monthlyPI
  const annualCashFlow = monthlyCashFlow * 12

  const result: AnalysisResult = {
    downPaymentAmount,
    loanAmount,
    monthlyMortgagePayment: monthlyPI,
    annualDebtService,
    loanPointsCost,
    totalCashRequired,
    monthlyGrossIncome,
    annualGrossIncome,
    vacancyLossMonthly,
    monthlyOperatingExpenses,
    annualOperatingExpenses,
    noiAnnual,
    capRatePercent: capRate(noiAnnual, propertyValueForAnalysis),
    monthlyCashFlow,
    annualCashFlow,
    cashOnCashReturnPercent: cashOnCashReturn(annualCashFlow, totalCashRequired),
    dscr: dscr(noiAnnual, annualDebtService),
    grm: grossRentMultiplier(purchasePrice, annualGrossIncome),
    breakEvenOccupancyPercent: breakEvenOccupancy(annualOperatingExpenses, annualDebtService, annualGrossIncome),
    equityAtPurchase: equity(propertyValueForAnalysis, loanAmount),
    propertyValueForAnalysis,
    projections: [],
  }

  result.projections = projectAnalysis(input, result)
  return result
}

/**
 * Builds the Year 1 / 5 / 10 projection table. Growth assumptions compound
 * annually and default to 0 (flat) when not supplied, so an analysis with no
 * assumptions entered still returns a valid, non-NaN projection.
 */
export function projectAnalysis(input: AnalysisInput, base: AnalysisResult, years: number[] = PROJECTION_YEARS): YearProjection[] {
  const appreciation = num(input.appreciationRatePercent) / 100
  const rentGrowth = num(input.rentGrowthRatePercent) / 100
  const expenseGrowth = num(input.expenseGrowthRatePercent) / 100
  const termYears = num(input.loanTermYears) || 30
  const rentTotal = resolveMonthlyRent(input)
  const otherIncome = num(input.otherMonthlyIncome)

  const maxYear = years.length ? Math.max(...years) : 0
  const yearly: YearProjection[] = []
  let cumulativeCashFlow = 0

  for (let year = 1; year <= maxYear; year++) {
    const propertyValue = base.propertyValueForAnalysis * Math.pow(1 + appreciation, year)
    const mortgageBalance = remainingLoanBalance(base.loanAmount, num(input.interestRatePercent), termYears, year * 12)
    const monthlyRentYear = rentTotal * Math.pow(1 + rentGrowth, year)
    const monthlyOtherYear = otherIncome * Math.pow(1 + rentGrowth, year)
    const monthlyExpensesYear = base.monthlyOperatingExpenses * Math.pow(1 + expenseGrowth, year)
    const annualCashFlowYear = (monthlyRentYear + monthlyOtherYear - monthlyExpensesYear - base.monthlyMortgagePayment) * 12
    cumulativeCashFlow += annualCashFlowYear

    yearly.push({
      year,
      propertyValue,
      mortgageBalance,
      equity: propertyValue - mortgageBalance,
      monthlyRent: monthlyRentYear,
      annualCashFlow: annualCashFlowYear,
      cumulativeCashFlow,
    })
  }

  return years.map((year) => yearly.find((row) => row.year === year)).filter((row): row is YearProjection => Boolean(row))
}

// ---------------------------------------------------------------------------
// Financing status (QA Cleanup Bundle, items 5-7) — an explicit choice
// between "Mortgage / Loan", "Paid Off / No Mortgage" and "Unknown / Not
// Entered", so a blank/unentered mortgage field is never silently read as
// proof a property has no debt.
// ---------------------------------------------------------------------------

export type FinancingStatus = 'Financed' | 'PaidOff' | 'Unknown'

/**
 * Applies an explicit financing-status choice to a raw AnalysisInput before
 * it reaches buildAnalysis(). 'Financed', 'Unknown', and undefined (older
 * saved analyses that predate this field) all pass every financing field
 * through completely unchanged — so existing financed-property calculations
 * are byte-identical to before this existed (see the "byte-identical
 * pass-through" tests below). Only 'PaidOff' changes anything: it models
 * the purchase as 100% cash (down payment = full purchase price), the exact
 * same shape as the pre-existing "all-cash property" test case below —
 * which drives loanAmount to 0 and therefore monthlyMortgagePayment /
 * annualDebtService to 0 through the existing, unchanged math in
 * buildAnalysis()/mortgagePayment(). dscr() already returns null (rendered
 * as "N/A") whenever annualDebtService is 0, so no new
 * Infinity/divide-by-zero handling is needed here — the math already did
 * the right thing; this only decides which inputs reach it.
 */
export function applyFinancingStatus(input: AnalysisInput, financingStatus: FinancingStatus | undefined): AnalysisInput {
  if (financingStatus !== 'PaidOff') return input
  return {
    ...input,
    downPaymentMode: 'amount',
    downPaymentAmount: num(input.purchasePrice),
    interestRatePercent: 0,
    loanPointsPercent: 0,
  }
}

// ---------------------------------------------------------------------------
// Deal score (Section C) — descriptive only, never framed as advice.
// ---------------------------------------------------------------------------

export type DealIndicatorRating = 'Strong' | 'Moderate' | 'Weak' | 'N/A'

export type DealIndicator = {
  label: string
  rating: DealIndicatorRating
  detail: string
}

function rate(value: number | null, strongAt: number, moderateAt: number): DealIndicatorRating {
  if (value === null || !Number.isFinite(value)) return 'N/A'
  if (value >= strongAt) return 'Strong'
  if (value >= moderateAt) return 'Moderate'
  return 'Weak'
}

/**
 * Produces plain-language indicators for the analysis summary. Thresholds
 * are common investor rules of thumb, not guarantees — the UI is required to
 * frame this as "based on the assumptions entered," never as advice.
 */
export function buildDealIndicators(result: AnalysisResult): DealIndicator[] {
  return [
    {
      label: 'Monthly Cash Flow',
      rating: result.monthlyCashFlow >= 200 ? 'Strong' : result.monthlyCashFlow >= 0 ? 'Moderate' : 'Weak',
      detail: `${result.monthlyCashFlow >= 0 ? 'Positive' : 'Negative'} cash flow based on the income and expenses entered.`,
    },
    {
      label: 'Cap Rate',
      rating: rate(result.capRatePercent, 7, 4),
      detail: 'Net operating income relative to the property value entered.',
    },
    {
      label: 'Cash-on-Cash Return',
      rating: rate(result.cashOnCashReturnPercent, 8, 4),
      detail: 'Annual cash flow relative to the total cash required to purchase.',
    },
    {
      label: 'DSCR',
      rating: result.dscr === null ? 'N/A' : rate(result.dscr, 1.25, 1),
      detail: result.dscr === null ? 'No debt service — this deal is modeled as an all-cash purchase.' : 'Net operating income relative to the annual mortgage payment.',
    },
    {
      label: 'Initial Equity',
      rating: result.equityAtPurchase > 0 ? (result.equityAtPurchase / (result.propertyValueForAnalysis || 1) >= 0.2 ? 'Strong' : 'Moderate') : 'Weak',
      detail: 'Estimated equity at purchase based on the market value entered.',
    },
  ]
}
