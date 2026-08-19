import { describe, expect, it } from 'vitest'
import {
  applyFinancingStatus,
  breakEvenOccupancy,
  buildAnalysis,
  calculateNOI,
  capRate,
  cashOnCashReturn,
  dscr,
  equity,
  grossRentMultiplier,
  mortgagePayment,
  projectAnalysis,
  remainingLoanBalance,
  type AnalysisInput,
} from './investment-calculations'

// Small helper: every numeric field in a result must be finite (no NaN/Infinity).
function assertAllFinite(value: unknown, path = 'root') {
  if (value === null || value === undefined) return
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${path} should be finite, got ${value}`).toBe(true)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertAllFinite(item, `${path}[${i}]`))
    return
  }
  if (typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) assertAllFinite(v, `${path}.${key}`)
  }
}

describe('mortgagePayment', () => {
  it('matches the standard amortization formula for a typical 30-year loan', () => {
    // $320,000 loan, 6.5% APR, 30 years -> well-known reference payment ~$2,022.62
    const payment = mortgagePayment(320000, 6.5, 30)
    expect(payment).toBeCloseTo(2022.62, 1)
  })

  it('falls back to a straight-line payment at 0% interest', () => {
    const payment = mortgagePayment(120000, 0, 30)
    expect(payment).toBeCloseTo(120000 / 360, 6)
  })

  it('is 0 for a non-positive loan amount (all-cash purchase)', () => {
    expect(mortgagePayment(0, 6.5, 30)).toBe(0)
    expect(mortgagePayment(-100, 6.5, 30)).toBe(0)
  })
})

describe('remainingLoanBalance', () => {
  it('fully amortizes to 0 at the end of the term', () => {
    const balance = remainingLoanBalance(320000, 6.5, 30, 360)
    expect(balance).toBeCloseTo(0, 4)
  })

  it('is the full principal before any payments', () => {
    expect(remainingLoanBalance(320000, 6.5, 30, 0)).toBeCloseTo(320000, 6)
  })

  it('decreases linearly at 0% interest', () => {
    const balance = remainingLoanBalance(120000, 0, 30, 120) // 10 of 30 years
    expect(balance).toBeCloseTo(120000 * (2 / 3), 6)
  })

  it('never goes negative past the loan term', () => {
    expect(remainingLoanBalance(320000, 6.5, 30, 500)).toBeCloseTo(0, 6)
  })
})

describe('core metric primitives handle edge cases without NaN/Infinity', () => {
  it('capRate is null (not Infinity) when property value is 0', () => {
    expect(capRate(10000, 0)).toBeNull()
  })

  it('cashOnCashReturn is null when no cash was invested', () => {
    expect(cashOnCashReturn(5000, 0)).toBeNull()
  })

  it('dscr is null for an all-cash deal (0 debt service)', () => {
    expect(dscr(24000, 0)).toBeNull()
  })

  it('grossRentMultiplier is null when there is no income', () => {
    expect(grossRentMultiplier(300000, 0)).toBeNull()
  })

  it('breakEvenOccupancy is null when there is no gross potential income', () => {
    expect(breakEvenOccupancy(10000, 12000, 0)).toBeNull()
  })

  it('calculateNOI and equity are simple, always-finite subtractions', () => {
    expect(calculateNOI(20000, 8000)).toBe(12000)
    expect(equity(400000, 320000)).toBe(80000)
  })
})

const baseInput: AnalysisInput = {
  purchasePrice: 350000,
  marketValue: 350000,
  units: 1,
  downPaymentMode: 'percent',
  downPaymentPercent: 20,
  interestRatePercent: 6.5,
  loanTermYears: 30,
  closingCosts: 6000,
  loanPointsPercent: 0,
  monthlyRent: 2800,
  otherMonthlyIncome: 0,
  propertyTaxesAnnual: 3600,
  insuranceAnnual: 1400,
  hoaMonthly: 0,
  managementMode: 'percent',
  managementPercent: 8,
  maintenanceMode: 'percent',
  maintenancePercent: 5,
  vacancyPercent: 5,
  utilitiesMonthly: 0,
  otherExpensesMonthly: 0,
  appreciationRatePercent: 3,
  rentGrowthRatePercent: 2,
  expenseGrowthRatePercent: 2,
}

describe('buildAnalysis — 1. standard financed rental property', () => {
  const result = buildAnalysis(baseInput)

  it('produces no NaN/Infinity anywhere in the result', () => {
    assertAllFinite(result)
  })

  it('computes loan amount and down payment from the percent down payment', () => {
    expect(result.downPaymentAmount).toBeCloseTo(70000, 6)
    expect(result.loanAmount).toBeCloseTo(280000, 6)
  })

  it('computes a positive monthly mortgage payment', () => {
    expect(result.monthlyMortgagePayment).toBeGreaterThan(0)
  })

  it('computes NOI, cap rate and cash-on-cash as expected magnitudes', () => {
    expect(result.noiAnnual).toBeGreaterThan(0)
    expect(result.capRatePercent).not.toBeNull()
    expect(result.capRatePercent as number).toBeGreaterThan(0)
    expect(result.cashOnCashReturnPercent).not.toBeNull()
  })

  it('computes a finite DSCR since the loan has debt service', () => {
    expect(result.dscr).not.toBeNull()
    expect(result.dscr as number).toBeGreaterThan(0)
  })
})

describe('buildAnalysis — down payment mode ($/%) — Pre-Launch Calculator + Billing UX Polish, Issue 3', () => {
  // Rental Property Analyzer's Down Payment field had the same display
  // bug as Home Purchase Calculator's (see
  // lib/investment-tools/evaluator-layout-order.test.ts for the shared
  // root cause) — these pin the underlying math for both modes plus the
  // zero/edge-case values called out for that page specifically.
  it('percent mode: 20% of $350,000 is $70,000 down, $280,000 financed', () => {
    const result = buildAnalysis({ ...baseInput, downPaymentMode: 'percent', downPaymentPercent: 20 })
    expect(result.downPaymentAmount).toBeCloseTo(70000, 6)
    expect(result.loanAmount).toBeCloseTo(280000, 6)
    expect(result.monthlyMortgagePayment).toBeGreaterThan(0)
  })

  it('dollar mode: a flat $70,000 down payment produces the identical loan amount and P&I as the equivalent 20% above', () => {
    const percentResult = buildAnalysis({ ...baseInput, downPaymentMode: 'percent', downPaymentPercent: 20 })
    const amountResult = buildAnalysis({ ...baseInput, downPaymentMode: 'amount', downPaymentAmount: 70000 })
    expect(amountResult.downPaymentAmount).toBe(70000)
    expect(amountResult.loanAmount).toBeCloseTo(percentResult.loanAmount, 6)
    expect(amountResult.monthlyMortgagePayment).toBeCloseTo(percentResult.monthlyMortgagePayment, 6)
  })

  it('zero down payment (percent mode): full purchase price financed, mortgage payment scales accordingly', () => {
    const result = buildAnalysis({ ...baseInput, downPaymentMode: 'percent', downPaymentPercent: 0 })
    expect(result.downPaymentAmount).toBe(0)
    expect(result.loanAmount).toBe(350000)
    expect(result.monthlyMortgagePayment).toBeGreaterThan(0)
    assertAllFinite(result)
  })

  it('zero down payment (dollar mode): same result as 0% — the two modes agree at the boundary', () => {
    const result = buildAnalysis({ ...baseInput, downPaymentMode: 'amount', downPaymentAmount: 0 })
    expect(result.downPaymentAmount).toBe(0)
    expect(result.loanAmount).toBe(350000)
    assertAllFinite(result)
  })

  it('a dollar down payment larger than the purchase price is capped, never producing a negative loan amount', () => {
    const result = buildAnalysis({ ...baseInput, downPaymentMode: 'amount', downPaymentAmount: 999999 })
    expect(result.downPaymentAmount).toBe(350000)
    expect(result.loanAmount).toBe(0)
    assertAllFinite(result)
  })
})

describe('buildAnalysis — 2. all-cash property', () => {
  const result = buildAnalysis({ ...baseInput, downPaymentMode: 'percent', downPaymentPercent: 100 })

  it('has a $0 loan amount and $0 mortgage payment', () => {
    expect(result.loanAmount).toBe(0)
    expect(result.monthlyMortgagePayment).toBe(0)
  })

  it('reports DSCR as null (N/A) rather than Infinity', () => {
    expect(result.dscr).toBeNull()
  })

  it('still computes a finite cap rate and cash-on-cash return', () => {
    assertAllFinite(result)
    expect(result.capRatePercent).not.toBeNull()
    expect(result.cashOnCashReturnPercent).not.toBeNull()
  })

  it('total cash required equals the full purchase price plus closing costs', () => {
    expect(result.totalCashRequired).toBeCloseTo(350000 + 6000, 6)
  })
})

describe('applyFinancingStatus', () => {
  it('is a byte-identical pass-through for "Financed" (existing financed-property calculations must not change)', () => {
    expect(applyFinancingStatus(baseInput, 'Financed')).toBe(baseInput)
  })

  it('is a byte-identical pass-through for "Unknown"', () => {
    expect(applyFinancingStatus(baseInput, 'Unknown')).toBe(baseInput)
  })

  it('is a byte-identical pass-through for undefined (older saved analyses that predate this field)', () => {
    expect(applyFinancingStatus(baseInput, undefined)).toBe(baseInput)
  })

  it('buildAnalysis(applyFinancingStatus(input, "Financed")) matches buildAnalysis(input) exactly', () => {
    expect(buildAnalysis(applyFinancingStatus(baseInput, 'Financed'))).toEqual(buildAnalysis(baseInput))
  })

  it('"PaidOff" reshapes the input into the same all-cash shape as a manual 100%-down entry', () => {
    const viaStatus = buildAnalysis(applyFinancingStatus(baseInput, 'PaidOff'))
    const viaManual100Down = buildAnalysis({ ...baseInput, downPaymentMode: 'percent', downPaymentPercent: 100 })
    expect(viaStatus).toEqual(viaManual100Down)
  })

  it('"PaidOff" zeroes the loan, monthly P&I and debt service, and reports DSCR as N/A (null) instead of Infinity', () => {
    const result = buildAnalysis(applyFinancingStatus(baseInput, 'PaidOff'))
    expect(result.loanAmount).toBe(0)
    expect(result.monthlyMortgagePayment).toBe(0)
    expect(result.annualDebtService).toBe(0)
    expect(result.dscr).toBeNull()
    assertAllFinite(result)
  })

  it('"PaidOff" total cash required is the full purchase price plus closing costs, with no financing assumed', () => {
    const result = buildAnalysis(applyFinancingStatus(baseInput, 'PaidOff'))
    expect(result.totalCashRequired).toBeCloseTo(baseInput.purchasePrice + (baseInput.closingCosts || 0), 6)
  })
})

describe('buildAnalysis — 3. 0% interest loan', () => {
  const result = buildAnalysis({ ...baseInput, interestRatePercent: 0 })

  it('produces a finite, straight-line mortgage payment', () => {
    assertAllFinite(result)
    expect(result.monthlyMortgagePayment).toBeCloseTo(280000 / 360, 4)
  })
})

describe('buildAnalysis — 4. negative cash flow property', () => {
  const result = buildAnalysis({
    ...baseInput,
    purchasePrice: 500000,
    marketValue: 500000,
    downPaymentPercent: 10,
    monthlyRent: 1500,
    propertyTaxesAnnual: 8000,
    insuranceAnnual: 2400,
  })

  it('reports a negative monthly and annual cash flow without erroring', () => {
    assertAllFinite(result)
    expect(result.monthlyCashFlow).toBeLessThan(0)
    expect(result.annualCashFlow).toBeLessThan(0)
  })

  it('cash-on-cash return is negative but finite', () => {
    expect(result.cashOnCashReturnPercent).not.toBeNull()
    expect(result.cashOnCashReturnPercent as number).toBeLessThan(0)
  })
})

describe('buildAnalysis — 5. zero rent', () => {
  const result = buildAnalysis({ ...baseInput, monthlyRent: 0, otherMonthlyIncome: 0 })

  it('does not produce NaN/Infinity anywhere', () => {
    assertAllFinite(result)
  })

  it('GRM and break-even occupancy are null (no income to divide by)', () => {
    expect(result.grm).toBeNull()
    expect(result.breakEvenOccupancyPercent).toBeNull()
  })

  it('cash flow is negative (all expenses, no income)', () => {
    expect(result.monthlyCashFlow).toBeLessThan(0)
  })
})

describe('buildAnalysis — 6. missing optional expenses', () => {
  const minimalInput: AnalysisInput = {
    purchasePrice: 250000,
    downPaymentMode: 'percent',
    downPaymentPercent: 20,
    interestRatePercent: 6,
    loanTermYears: 30,
    monthlyRent: 2000,
  }
  const result = buildAnalysis(minimalInput)

  it('treats every missing optional field as 0, not NaN', () => {
    assertAllFinite(result)
    expect(result.monthlyOperatingExpenses).toBe(0)
  })

  it('still computes a usable NOI and cap rate from price + rent alone', () => {
    expect(result.noiAnnual).toBeCloseTo(2000 * 12, 6)
    expect(result.capRatePercent).not.toBeNull()
  })
})

describe('buildAnalysis — 7. five-year projection', () => {
  const result = buildAnalysis(baseInput)
  const year5 = result.projections.find((row) => row.year === 5)

  it('includes a year-5 row', () => {
    expect(year5).toBeDefined()
  })

  it('appreciates the property value using the compounding assumption', () => {
    const expected = result.propertyValueForAnalysis * Math.pow(1.03, 5)
    expect(year5!.propertyValue).toBeCloseTo(expected, 2)
  })

  it('grows monthly rent using the rent growth assumption', () => {
    const expected = 2800 * Math.pow(1.02, 5)
    expect(year5!.monthlyRent).toBeCloseTo(expected, 2)
  })

  it('reduces the mortgage balance versus the original loan amount', () => {
    expect(year5!.mortgageBalance).toBeLessThan(result.loanAmount)
    expect(year5!.mortgageBalance).toBeGreaterThan(0)
  })
})

describe('buildAnalysis — 8. ten-year projection', () => {
  const result = buildAnalysis(baseInput)
  const year10 = result.projections.find((row) => row.year === 10)
  const year1 = result.projections.find((row) => row.year === 1)

  it('includes a year-10 row with all finite values', () => {
    expect(year10).toBeDefined()
    assertAllFinite(year10)
  })

  it('accumulates cumulative cash flow across years rather than resetting', () => {
    expect(year10!.cumulativeCashFlow).not.toBe(year1!.cumulativeCashFlow)
  })

  it('produces increasing equity over time as the loan amortizes and value appreciates', () => {
    expect(year10!.equity).toBeGreaterThan(year1!.equity)
  })

  it('matches a direct projectAnalysis([10]) call for the same inputs', () => {
    const direct = projectAnalysis(baseInput, result, [10])
    expect(direct[0].propertyValue).toBeCloseTo(year10!.propertyValue, 6)
  })
})

describe('buildAnalysis — zero purchase price does not throw or NaN', () => {
  it('handles a $0 purchase price gracefully', () => {
    const result = buildAnalysis({ ...baseInput, purchasePrice: 0, marketValue: 0 })
    assertAllFinite(result)
  })
})

describe('buildAnalysis — per-unit rent entries', () => {
  it('sums per-unit rents when useUnitRents is set', () => {
    const result = buildAnalysis({
      ...baseInput,
      units: 3,
      useUnitRents: true,
      unitRents: [
        { label: 'Unit A', monthlyRent: 1200 },
        { label: 'Unit B', monthlyRent: 1250 },
        { label: 'Unit C', monthlyRent: 1300 },
      ],
    })
    expect(result.monthlyGrossIncome).toBeCloseTo(1200 + 1250 + 1300, 6)
  })
})
