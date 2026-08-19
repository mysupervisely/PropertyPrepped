import { describe, expect, it } from 'vitest'
import { buildHomePurchaseAnalysis, type HomePurchaseInput } from './home-purchase-calculations'

function baseInput(overrides: Partial<HomePurchaseInput> = {}): HomePurchaseInput {
  return {
    purchasePrice: 400000,
    downPaymentMode: 'percent',
    downPaymentPercent: 20,
    interestRatePercent: 6.5,
    loanTermYears: 30,
    propertyTaxesAnnual: 4800,
    homeInsuranceAnnual: 1800,
    hoaMonthly: 0,
    pmiMonthly: 0,
    closingCostsMode: 'percent',
    closingCostsPercent: 3,
    ...overrides,
  }
}

describe('buildHomePurchaseAnalysis — down payment / loan amount', () => {
  it('computes a 20% down payment and the remaining loan amount', () => {
    const result = buildHomePurchaseAnalysis(baseInput())
    expect(result.downPaymentAmount).toBe(80000)
    expect(result.loanAmount).toBe(320000)
  })

  it('supports a dollar-amount down payment', () => {
    const result = buildHomePurchaseAnalysis(baseInput({ downPaymentMode: 'amount', downPaymentAmount: 50000 }))
    expect(result.downPaymentAmount).toBe(50000)
    expect(result.loanAmount).toBe(350000)
  })

  it('never lets a dollar down payment exceed the purchase price', () => {
    const result = buildHomePurchaseAnalysis(baseInput({ downPaymentMode: 'amount', downPaymentAmount: 999999 }))
    expect(result.downPaymentAmount).toBe(400000)
    expect(result.loanAmount).toBe(0)
  })
})

describe('buildHomePurchaseAnalysis — 0% interest', () => {
  it('produces a flat principal/term payment with no interest component, never NaN/Infinity', () => {
    const result = buildHomePurchaseAnalysis(baseInput({ interestRatePercent: 0 }))
    expect(result.principalAndInterestMonthly).toBeCloseTo(320000 / 360, 6)
    expect(Number.isFinite(result.principalAndInterestMonthly)).toBe(true)
  })
})

describe('buildHomePurchaseAnalysis — PMI on/off', () => {
  it('adds PMI to the total monthly payment when provided', () => {
    const withPmi = buildHomePurchaseAnalysis(baseInput({ pmiMonthly: 150 }))
    const withoutPmi = buildHomePurchaseAnalysis(baseInput({ pmiMonthly: 0 }))
    expect(withPmi.pmiMonthly).toBe(150)
    expect(withPmi.totalMonthlyPayment - withoutPmi.totalMonthlyPayment).toBeCloseTo(150, 6)
  })

  it('defaults PMI to 0 (not NaN, not required) when omitted entirely', () => {
    const { pmiMonthly, ...rest } = baseInput()
    const result = buildHomePurchaseAnalysis(rest as any)
    expect(result.pmiMonthly).toBe(0)
  })
})

describe('buildHomePurchaseAnalysis — HOA', () => {
  it('adds monthly HOA dues straight through to the total payment', () => {
    const withHoa = buildHomePurchaseAnalysis(baseInput({ hoaMonthly: 275 }))
    expect(withHoa.hoaMonthly).toBe(275)
    const withoutHoa = buildHomePurchaseAnalysis(baseInput({ hoaMonthly: 0 }))
    expect(withHoa.totalMonthlyPayment - withoutHoa.totalMonthlyPayment).toBeCloseTo(275, 6)
  })
})

describe('buildHomePurchaseAnalysis — closing costs', () => {
  it('computes closing costs as a percentage of purchase price by default', () => {
    const result = buildHomePurchaseAnalysis(baseInput({ closingCostsMode: 'percent', closingCostsPercent: 3 }))
    expect(result.closingCostsAmount).toBe(12000)
  })

  it('supports a flat dollar closing-costs amount', () => {
    const result = buildHomePurchaseAnalysis(baseInput({ closingCostsMode: 'amount', closingCostsAmount: 9500 }))
    expect(result.closingCostsAmount).toBe(9500)
  })

  it('cash needed to close = down payment + closing costs', () => {
    const result = buildHomePurchaseAnalysis(baseInput({ closingCostsMode: 'amount', closingCostsAmount: 9500 }))
    expect(result.cashNeededToClose).toBe(result.downPaymentAmount + 9500)
  })
})

describe('buildHomePurchaseAnalysis — total monthly payment composition', () => {
  it('sums P&I + property tax + insurance + PMI + HOA, nothing else, nothing missing', () => {
    const result = buildHomePurchaseAnalysis(baseInput({ pmiMonthly: 120, hoaMonthly: 50 }))
    const expectedTotal = result.principalAndInterestMonthly + result.propertyTaxMonthly + result.insuranceMonthly + result.pmiMonthly + result.hoaMonthly
    expect(result.totalMonthlyPayment).toBeCloseTo(expectedTotal, 6)
  })

  it('converts annual property tax and insurance into monthly figures', () => {
    const result = buildHomePurchaseAnalysis(baseInput({ propertyTaxesAnnual: 6000, homeInsuranceAnnual: 2400 }))
    expect(result.propertyTaxMonthly).toBe(500)
    expect(result.insuranceMonthly).toBe(200)
  })
})

describe('buildHomePurchaseAnalysis — loan-to-value', () => {
  it('computes LTV as loanAmount / purchasePrice * 100', () => {
    const result = buildHomePurchaseAnalysis(baseInput({ downPaymentPercent: 20 }))
    expect(result.loanToValuePercent).toBeCloseTo(80, 6)
  })

  it('returns null (never a fabricated ratio) when purchase price is not usable', () => {
    const result = buildHomePurchaseAnalysis(baseInput({ purchasePrice: 0 }))
    expect(result.loanToValuePercent).toBeNull()
  })
})

describe('buildHomePurchaseAnalysis — regression: $855,000 purchase, closing-costs percent (Issue 2)', () => {
  // During QA an $855,000 purchase showed ~$273,600 in estimated closing
  // costs and was flagged as "clearly incorrect." It wasn't a math bug:
  // $273,600 is exactly 32% of $855,000 — mathematically correct for
  // whatever percent was actually entered. The real defect (see
  // evaluator-layout-order.test.ts) was a display bug that made the
  // percent input's own typed value invisible, which is what let a
  // mistyped "32" (instead of an intended "3.2") go unnoticed. These two
  // cases pin both ends of that distinction so a future regression in
  // either the math OR the decimal-point handling is caught immediately.
  it('32% of $855,000 is $273,600 — confirms the formula itself was never wrong', () => {
    const result = buildHomePurchaseAnalysis(baseInput({ purchasePrice: 855000, closingCostsMode: 'percent', closingCostsPercent: 32 }))
    expect(result.closingCostsAmount).toBe(273600)
  })

  it('3.2% of $855,000 is $27,360 — the actually-intended value stays distinct from 32%, i.e. the decimal point is never silently dropped', () => {
    const result = buildHomePurchaseAnalysis(baseInput({ purchasePrice: 855000, closingCostsMode: 'percent', closingCostsPercent: 3.2 }))
    expect(result.closingCostsAmount).toBe(27360)
  })

  it('cash needed to close reflects whichever closing-costs value was actually entered, not a mix of the two', () => {
    const at32 = buildHomePurchaseAnalysis(baseInput({ purchasePrice: 855000, downPaymentMode: 'percent', downPaymentPercent: 20, closingCostsMode: 'percent', closingCostsPercent: 32 }))
    expect(at32.cashNeededToClose).toBe(171000 + 273600) // 20% down + 32% closing costs
    const at3_2 = buildHomePurchaseAnalysis(baseInput({ purchasePrice: 855000, downPaymentMode: 'percent', downPaymentPercent: 20, closingCostsMode: 'percent', closingCostsPercent: 3.2 }))
    expect(at3_2.cashNeededToClose).toBe(171000 + 27360)
  })
})

describe('buildHomePurchaseAnalysis — never produces NaN/Infinity for any field', () => {
  it('handles a fully empty/zeroed input gracefully', () => {
    const result = buildHomePurchaseAnalysis({ purchasePrice: 0, downPaymentMode: 'percent', interestRatePercent: 0, loanTermYears: 0 })
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'number') expect(Number.isFinite(value), `${key} should be finite`).toBe(true)
    }
  })
})
