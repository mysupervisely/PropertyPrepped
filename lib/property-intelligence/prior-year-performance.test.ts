import { describe, expect, it } from 'vitest'
import { computePropertyPerformance, selectPriorYearPerformance } from './calculate'
import type { PropertyPerformanceInput, TaxYearSummaryInput } from './types'

// Property Intelligence V1, Phase C.2 — Part 2: most recent qualifying
// completed year. selectPriorYearPerformance() is the one place this
// decision is made — it reuses computePropertyPerformance()'s own
// noiAnnual as the sole "does this year qualify" gate (never a second,
// parallel data-sufficiency rule) and never mutates/grows the candidate
// list it's given (a caller-supplied, BOUNDED lookback).

const NOW_MID_2026 = new Date('2026-06-15T00:00:00Z')

function taxSummary(overrides: Partial<TaxYearSummaryInput> = {}): TaxYearSummaryInput {
  return { year: '2026', grossIncome: 0, operatingExpenses: 0, transactionCount: 0, hasManualRecord: false, ...overrides }
}

function inputFor(year: string, overrides: Partial<PropertyPerformanceInput> = {}): PropertyPerformanceInput {
  return {
    propertyId: 'p1',
    estimatedValue: 400000,
    propertyMonthlyRentFallback: 0,
    propertyMortgageBalanceFallback: 0,
    activeLease: { id: 'l1', monthlyRent: 2500 },
    mortgage: { currentBalance: 280000, monthlyPayment: 1800 },
    financingStatus: 'Unknown',
    taxYearSummary: taxSummary({ year, ...overrides.taxYearSummary }),
    ...overrides,
  }
}

/** A year with real, sufficient data — will always qualify. */
function qualifyingYear(year: string) {
  return inputFor(year, { taxYearSummary: taxSummary({ year, grossIncome: 30000, operatingExpenses: 9000, transactionCount: 24 }) })
}

/** A year with nothing logged at all — never qualifies. */
function emptyYear(year: string) {
  return inputFor(year, { taxYearSummary: taxSummary({ year, grossIncome: 0, operatingExpenses: 0, transactionCount: 0, hasManualRecord: false }) })
}

describe('1-2. Current-year metrics remain YTD actual, never annualized (unaffected by this feature)', () => {
  it('computePropertyPerformance for the CURRENT year is untouched by selectPriorYearPerformance existing at all', () => {
    const current = computePropertyPerformance(inputFor('2026', { taxYearSummary: taxSummary({ year: '2026', grossIncome: 5000, operatingExpenses: 1200, transactionCount: 4 }) }), NOW_MID_2026)
    expect(current.actualIncomeYtd.period).toBe('ytd_actual')
    expect(current.noiYtd.status).toBe('available')
    expect(current.noiAnnual.status).toBe('unavailable') // still true — Phase C.2 doesn't change the current-year call at all
    expect(current.actualIncomeYtd.value).toBe(5000) // never contract rent x months, never annualized
  })
})

describe('3. The most recent qualifying completed year is selected', () => {
  it('when both 2025 and 2024 qualify, 2025 (more recent, listed first) wins', () => {
    const result = selectPriorYearPerformance([qualifyingYear('2025'), qualifyingYear('2024')], NOW_MID_2026)
    expect(result?.period.taxYear).toBe('2025')
  })
})

describe('4. A newer incomplete/insufficient year can be skipped for an older qualifying year', () => {
  it('2025 has nothing logged (never qualifies) — 2024 (real data) is selected instead', () => {
    const result = selectPriorYearPerformance([emptyYear('2025'), qualifyingYear('2024')], NOW_MID_2026)
    expect(result?.period.taxYear).toBe('2024')
  })

  it('a 2025 with only a suspicious $0 expense total (incomplete, not available) is also skipped in favor of 2024', () => {
    const suspiciousZero = inputFor('2025', { taxYearSummary: taxSummary({ year: '2025', grossIncome: 24000, operatingExpenses: 0, transactionCount: 12 }) })
    const result = selectPriorYearPerformance([suspiciousZero, qualifyingYear('2024')], NOW_MID_2026)
    expect(result?.period.taxYear).toBe('2024')
  })
})

describe('5. Full-year Annual NOI uses same-period actual income and operating expenses', () => {
  it('noiAnnual = actualIncomeYtd - operatingExpensesYtd, both from the SAME selected year, never mixed with a different year or contract rent', () => {
    const result = selectPriorYearPerformance([qualifyingYear('2025')], NOW_MID_2026)
    expect(result?.actualIncomeYtd.value).toBe(30000)
    expect(result?.operatingExpensesYtd.value).toBe(9000)
    expect(result?.noiAnnual.value).toBe(21000)
    expect(result?.noiAnnual.period).toBe('annual_actual')
  })
})

describe('6. Cap Rate uses valid annual NOI and Estimated Value', () => {
  it('capRatePercent is available once a qualifying year is selected, and matches noiAnnual/estimatedValue exactly', () => {
    const result = selectPriorYearPerformance([qualifyingYear('2025')], NOW_MID_2026)
    expect(result?.capRatePercent.status).toBe('available')
    expect(result?.capRatePercent.value).toBeCloseTo((21000 / 400000) * 100, 6)
  })
})

describe('7. Net Cash Flow uses valid annual NOI and valid debt-service information', () => {
  it('netCashFlowMonthly is available once both the selected year\'s NOI and a real mortgage payment exist', () => {
    const result = selectPriorYearPerformance([qualifyingYear('2025')], NOW_MID_2026)
    expect(result?.netCashFlowMonthly.status).toBe('available')
    expect(result?.netCashFlowMonthly.value).toBeCloseTo(21000 / 12 - 1800, 6)
  })

  it('stays unavailable when the selected year qualifies for NOI but no mortgage data exists — never invents a payment', () => {
    const noMortgage = qualifyingYear('2025')
    const result = selectPriorYearPerformance([{ ...noMortgage, mortgage: null }], NOW_MID_2026)
    expect(result?.noiAnnual.status).toBe('available')
    expect(result?.netCashFlowMonthly.status).toBe('unavailable')
  })
})

describe('15. MetricPeriod remains correct on the selected prior-year result', () => {
  it('every field carries the same period tags computePropertyPerformance already guarantees for a complete year', () => {
    const result = selectPriorYearPerformance([qualifyingYear('2025')], NOW_MID_2026)
    expect(result?.actualIncomeYtd.period).toBe('annual_actual')
    expect(result?.operatingExpensesYtd.period).toBe('annual_actual')
    expect(result?.noiAnnual.period).toBe('annual_actual')
    expect(result?.capRatePercent.period).toBe('annual_actual')
    expect(result?.netCashFlowMonthly.period).toBe('monthly_derived')
    expect(result?.estimatedValue.period).toBe('point_in_time')
  })
})

describe('17. The selected year carries the correct year label', () => {
  it('period.taxYear reflects exactly the year that was selected, not the current year or any other candidate', () => {
    const result = selectPriorYearPerformance([emptyYear('2025'), qualifyingYear('2024'), qualifyingYear('2023')], NOW_MID_2026)
    expect(result?.period.taxYear).toBe('2024')
  })
})

describe('18. No qualifying completed year fails quietly, never with fake numbers', () => {
  it('returns null when every candidate is empty/insufficient — not a crash, not a fabricated result', () => {
    const result = selectPriorYearPerformance([emptyYear('2025'), emptyYear('2024'), emptyYear('2023')], NOW_MID_2026)
    expect(result).toBeNull()
  })

  it('returns null for an empty candidate list', () => {
    expect(selectPriorYearPerformance([], NOW_MID_2026)).toBeNull()
  })
})

describe('Defensive: never selects the current, still-in-progress year even if a caller mistakenly includes it', () => {
  it('a "candidate" for the current year (2026) is skipped even though it has real data — isYearComplete is re-checked internally, not trusted from the caller', () => {
    const currentYearMistake = inputFor('2026', { taxYearSummary: taxSummary({ year: '2026', grossIncome: 30000, operatingExpenses: 9000, transactionCount: 24 }) })
    const result = selectPriorYearPerformance([currentYearMistake, qualifyingYear('2025')], NOW_MID_2026)
    expect(result?.period.taxYear).toBe('2025')
  })

  it('a future year is also skipped', () => {
    const result = selectPriorYearPerformance([qualifyingYear('2027'), qualifyingYear('2025')], NOW_MID_2026)
    expect(result?.period.taxYear).toBe('2025')
  })
})

describe('Bounded, not unbounded: this function never fetches or grows its own input list', () => {
  it('is a pure function over exactly the candidates it is given — the same 2-candidate list always produces the same result', () => {
    const candidates = [emptyYear('2025'), qualifyingYear('2024')]
    const a = selectPriorYearPerformance(candidates, NOW_MID_2026)
    const b = selectPriorYearPerformance(candidates, NOW_MID_2026)
    expect(a).toEqual(b)
  })
})
