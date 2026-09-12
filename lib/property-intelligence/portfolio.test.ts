import { describe, expect, it } from 'vitest'
import { computePropertyPerformance } from './calculate'
import { computePortfolioPerformance } from './portfolio'
import type { PropertyPerformanceInput, TaxYearSummaryInput } from './types'

// Property Intelligence V1, Phase D: Portfolio Snapshot V1 — aggregation
// layer tests. Every scenario below builds real PropertyPerformance
// objects through the exact same computePropertyPerformance() pipeline
// the individual Property Snapshot already uses (never a hand-typed
// Metric standing in for the real engine), then feeds the result to
// computePortfolioPerformance() — proving the whole path end to end, not
// just the aggregation math in isolation.

function taxSummary(overrides: Partial<TaxYearSummaryInput> = {}): TaxYearSummaryInput {
  return {
    year: '2026',
    grossIncome: 0,
    operatingExpenses: 0,
    transactionCount: 0,
    hasManualRecord: false,
    ...overrides,
  }
}

/** A property input for the CURRENT, still-in-progress tax year (2026) — the common Dashboard case: noiYtd is 'ytd_actual', never 'annual_actual'. */
function currentYearInput(overrides: Partial<PropertyPerformanceInput> = {}): PropertyPerformanceInput {
  return {
    propertyId: 'prop-1',
    estimatedValue: 0,
    propertyMonthlyRentFallback: 0,
    propertyMortgageBalanceFallback: 0,
    activeLease: null,
    mortgage: null,
    financingStatus: 'Unknown',
    taxYearSummary: taxSummary(),
    ...overrides,
  }
}

const NOW_MID_2026 = new Date('2026-06-15T00:00:00Z')

describe('Scenario A: one complete property', () => {
  it('1 property, $350K value, $2,350/mo rent, $1,850 YTD NOI — every coverage complete (no coverage note needed)', () => {
    const property = computePropertyPerformance(currentYearInput({
      propertyId: 'p1',
      estimatedValue: 350000,
      activeLease: { id: 'lease-1', monthlyRent: 2350 },
      taxYearSummary: taxSummary({ grossIncome: 2350, operatingExpenses: 500, transactionCount: 5, hasManualRecord: false }),
    }), NOW_MID_2026)

    const portfolio = computePortfolioPerformance([property])

    expect(portfolio.propertyCount).toBe(1)
    expect(portfolio.portfolioValue).toEqual({ value: 350000, status: 'available', source: 'derived', period: 'point_in_time', coverage: { included: 1, total: 1 } })
    expect(portfolio.monthlyRent).toEqual({ value: 2350, status: 'available', source: 'derived', period: 'monthly_contract', coverage: { included: 1, total: 1 } })
    expect(portfolio.noiYtd).toEqual({ value: 1850, status: 'available', source: 'derived', period: 'ytd_actual', coverage: { included: 1, total: 1 } })
  })
})

describe('Scenario B: multiple complete properties', () => {
  it('2 properties, $850K value, $5,350/mo rent, $5,850 YTD NOI', () => {
    const propertyA = computePropertyPerformance(currentYearInput({
      propertyId: 'a',
      estimatedValue: 350000,
      activeLease: { id: 'lease-a', monthlyRent: 2350 },
      taxYearSummary: taxSummary({ grossIncome: 2350, operatingExpenses: 500, transactionCount: 5, hasManualRecord: false }),
    }), NOW_MID_2026)
    const propertyB = computePropertyPerformance(currentYearInput({
      propertyId: 'b',
      estimatedValue: 500000,
      activeLease: { id: 'lease-b', monthlyRent: 3000 },
      taxYearSummary: taxSummary({ grossIncome: 5000, operatingExpenses: 1000, transactionCount: 8, hasManualRecord: false }),
    }), NOW_MID_2026)

    const portfolio = computePortfolioPerformance([propertyA, propertyB])

    expect(portfolio.propertyCount).toBe(2)
    expect(portfolio.portfolioValue.value).toBe(850000)
    expect(portfolio.monthlyRent.value).toBe(5350)
    expect(portfolio.noiYtd.value).toBe(5850)
    expect(portfolio.portfolioValue.coverage).toEqual({ included: 2, total: 2 })
    expect(portfolio.monthlyRent.coverage).toEqual({ included: 2, total: 2 })
    expect(portfolio.noiYtd.coverage).toEqual({ included: 2, total: 2 })
  })
})

describe('Scenario C: partial value coverage', () => {
  it('3 properties, only 2 have an estimated value — sums only those 2, marks coverage partial, never contributes $0 for the third', () => {
    const valued1 = computePropertyPerformance(currentYearInput({ propertyId: 'v1', estimatedValue: 300000 }), NOW_MID_2026)
    const valued2 = computePropertyPerformance(currentYearInput({ propertyId: 'v2', estimatedValue: 400000 }), NOW_MID_2026)
    const unvalued = computePropertyPerformance(currentYearInput({ propertyId: 'u1', estimatedValue: 0 }), NOW_MID_2026)
    expect(unvalued.estimatedValue.status).toBe('unavailable') // sanity: confirms the engine itself treats 0 as "not entered"

    const portfolio = computePortfolioPerformance([valued1, valued2, unvalued])

    expect(portfolio.propertyCount).toBe(3)
    expect(portfolio.portfolioValue.value).toBe(700000) // NOT 700000/3 or 0-padded
    expect(portfolio.portfolioValue.status).toBe('available')
    expect(portfolio.portfolioValue.coverage).toEqual({ included: 2, total: 3 })
  })
})

describe('Scenario D: partial rent coverage', () => {
  it('3 properties, 2 with canonical contract rent, 1 with neither a lease nor a fallback — sums only the 2 known, never infers the third', () => {
    const withLease = computePropertyPerformance(currentYearInput({ propertyId: 'r1', activeLease: { id: 'l1', monthlyRent: 2000 } }), NOW_MID_2026)
    const withFallback = computePropertyPerformance(currentYearInput({ propertyId: 'r2', propertyMonthlyRentFallback: 2700 }), NOW_MID_2026)
    const noRent = computePropertyPerformance(currentYearInput({ propertyId: 'r3' }), NOW_MID_2026)
    expect(noRent.contractMonthlyRent.status).toBe('unavailable')

    const portfolio = computePortfolioPerformance([withLease, withFallback, noRent])

    expect(portfolio.monthlyRent.value).toBe(4700)
    expect(portfolio.monthlyRent.coverage).toEqual({ included: 2, total: 3 })
  })
})

describe('Scenario E: partial YTD NOI coverage', () => {
  it('3 properties, 2 with valid current-year YTD NOI, 1 with nothing logged — sums only the 2 available, never manufactures the third', () => {
    const withData1 = computePropertyPerformance(currentYearInput({
      propertyId: 'n1',
      taxYearSummary: taxSummary({ grossIncome: 2000, operatingExpenses: 400, transactionCount: 4 }),
    }), NOW_MID_2026)
    const withData2 = computePropertyPerformance(currentYearInput({
      propertyId: 'n2',
      taxYearSummary: taxSummary({ grossIncome: 3000, operatingExpenses: 900, transactionCount: 6 }),
    }), NOW_MID_2026)
    const noData = computePropertyPerformance(currentYearInput({ propertyId: 'n3' }), NOW_MID_2026) // transactionCount 0, hasManualRecord false
    expect(noData.noiYtd.status).toBe('unavailable')

    const portfolio = computePortfolioPerformance([withData1, withData2, noData])

    expect(portfolio.noiYtd.value).toBe(1600 + 2100) // (2000-400) + (3000-900)
    expect(portfolio.noiYtd.coverage).toEqual({ included: 2, total: 3 })
  })
})

describe('Known zero vs. missing is preserved at the portfolio level', () => {
  it('a property with equal, nonzero, both-available YTD income and expenses legitimately contributes a real $0 NOI — it counts toward coverage, unlike an unavailable property', () => {
    // Note: operating expenses of literally $0 are themselves 'incomplete'
    // by calculate.ts's own rule (resolveOperatingExpensesYtd — a $0
    // expense total most often means "nothing logged," not "no costs" —
    // see that function's doc comment), so a genuinely zero-but-KNOWN NOI
    // through the real engine looks like equal nonzero income/expenses,
    // not a literal 0/0 — this is the realistic version of that case.
    const zeroNoi = computePropertyPerformance(currentYearInput({
      propertyId: 'z1',
      taxYearSummary: taxSummary({ grossIncome: 800, operatingExpenses: 800, transactionCount: 3 }),
    }), NOW_MID_2026)
    expect(zeroNoi.noiYtd).toMatchObject({ value: 0, status: 'available' })

    const missing = computePropertyPerformance(currentYearInput({ propertyId: 'm1' }), NOW_MID_2026)
    expect(missing.noiYtd.status).toBe('unavailable')

    const portfolio = computePortfolioPerformance([zeroNoi, missing])

    // The known $0 counts (included=1, sum=0) — it must NOT be
    // indistinguishable from "both missing" (which would also sum to a
    // vacuous 0 but with included=0 and status 'unavailable').
    expect(portfolio.noiYtd).toEqual({ value: 0, status: 'available', source: 'derived', period: 'ytd_actual', coverage: { included: 1, total: 2 } })
  })

  it('all properties unavailable for a metric -> the portfolio metric itself is unavailable (never a fabricated $0), coverage 0 of N', () => {
    const p1 = computePropertyPerformance(currentYearInput({ propertyId: 'x1' }), NOW_MID_2026)
    const p2 = computePropertyPerformance(currentYearInput({ propertyId: 'x2' }), NOW_MID_2026)

    const portfolio = computePortfolioPerformance([p1, p2])

    expect(portfolio.portfolioValue).toEqual({ value: null, status: 'unavailable', source: 'derived', period: 'n/a', coverage: { included: 0, total: 2 } })
    expect(portfolio.monthlyRent.status).toBe('unavailable')
    expect(portfolio.noiYtd.status).toBe('unavailable')
  })
})

describe('Edge cases', () => {
  it('zero properties in the portfolio -> propertyCount 0, every metric unavailable with 0 of 0 coverage, never NaN/undefined', () => {
    const portfolio = computePortfolioPerformance([])
    expect(portfolio.propertyCount).toBe(0)
    expect(portfolio.portfolioValue).toEqual({ value: null, status: 'unavailable', source: 'derived', period: 'n/a', coverage: { included: 0, total: 0 } })
    expect(portfolio.monthlyRent.status).toBe('unavailable')
    expect(portfolio.noiYtd.status).toBe('unavailable')
  })

  it('a negative portfolio YTD NOI sums correctly (expenses exceeding income across the portfolio) — never clamped to 0 or hidden', () => {
    const losing = computePropertyPerformance(currentYearInput({
      propertyId: 'l1',
      taxYearSummary: taxSummary({ grossIncome: 500, operatingExpenses: 2000, transactionCount: 4 }),
    }), NOW_MID_2026)
    const profitable = computePropertyPerformance(currentYearInput({
      propertyId: 'l2',
      taxYearSummary: taxSummary({ grossIncome: 3000, operatingExpenses: 500, transactionCount: 4 }),
    }), NOW_MID_2026)

    const portfolio = computePortfolioPerformance([losing, profitable])

    expect(portfolio.noiYtd.value).toBe(-1500 + 2500) // 1000, still worth asserting the negative one is real
    expect(losing.noiYtd.value).toBe(-1500)
  })

  it('never annualizes, never derives rent from YTD income, never substitutes prior-year NOI — each aggregate is a pure sum of the SAME-named per-property field, nothing else', () => {
    const property = computePropertyPerformance(currentYearInput({
      propertyId: 'g1',
      estimatedValue: 200000,
      activeLease: { id: 'lg', monthlyRent: 1500 },
      taxYearSummary: taxSummary({ grossIncome: 9000, operatingExpenses: 1000, transactionCount: 10 }),
    }), NOW_MID_2026)

    const portfolio = computePortfolioPerformance([property])

    // Monthly rent is the contract rate, NOT income/12 (9000/12 = 750) and
    // NOT income itself (9000).
    expect(portfolio.monthlyRent.value).toBe(1500)
    // NOI is YTD actual (9000-1000=8000), not annualized, not the
    // property's noiAnnual (which is 'unavailable' mid-year regardless).
    expect(property.noiAnnual.status).toBe('unavailable')
    expect(portfolio.noiYtd.value).toBe(8000)
  })

  it('the noiYtd aggregate is tagged ytd_actual for the common in-progress-year Dashboard case — same period every included property already carries, never silently relabeled', () => {
    const property = computePropertyPerformance(currentYearInput({
      propertyId: 'p-period',
      taxYearSummary: taxSummary({ grossIncome: 1000, operatingExpenses: 200, transactionCount: 2 }),
    }), NOW_MID_2026)
    expect(property.noiYtd.period).toBe('ytd_actual')

    const portfolio = computePortfolioPerformance([property])
    expect(portfolio.noiYtd.period).toBe('ytd_actual')
  })
})
