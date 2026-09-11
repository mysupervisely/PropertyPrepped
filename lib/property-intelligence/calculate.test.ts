import { describe, expect, it } from 'vitest'
import {
  computePropertyPerformance,
  isYearComplete,
  resolveActualIncomeYtd,
  resolveCapRate,
  resolveContractAnnualRent,
  resolveContractMonthlyRent,
  resolveEquity,
  resolveEstimatedValue,
  resolveMonthlyDebtService,
  resolveMortgageBalance,
  resolveNetCashFlow,
  resolveNoiAnnual,
  resolveNoiYtd,
  resolveOperatingExpensesYtd,
} from './calculate'
import type { Metric, PropertyPerformanceInput, TaxYearSummaryInput } from './types'

// Small helper, same convention as lib/investment-calculations.test.ts's
// own assertAllFinite: every numeric field in a result must be finite, and
// null is always a valid value (that's how "unknown" is represented — it
// must never silently decay into NaN/Infinity/0).
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

/** A fully-populated input for a COMPLETE prior tax year (2025), reviewed as of mid-2026 — the one case this engine treats as a genuine annual basis. */
function completeYearInput(overrides: Partial<PropertyPerformanceInput> = {}): PropertyPerformanceInput {
  return {
    propertyId: 'prop-1',
    estimatedValue: 400000,
    propertyMonthlyRentFallback: 0,
    propertyMortgageBalanceFallback: 0,
    activeLease: { id: 'lease-1', monthlyRent: 2500 },
    mortgage: { currentBalance: 280000, monthlyPayment: 1800 },
    taxYearSummary: taxSummary({ year: '2025', grossIncome: 30000, operatingExpenses: 9000, transactionCount: 24, hasManualRecord: false }),
    ...overrides,
  }
}

const NOW_MID_2026 = new Date('2026-06-15T00:00:00Z')

const availableMetric = (value: number): Metric => ({ value, status: 'available', source: 'derived', period: 'annual_actual' })
const unavailableMetric: Metric = { value: null, status: 'unavailable', source: 'derived', period: 'n/a' }

// ---------------------------------------------------------------------------
// isYearComplete — the Phase B.1 gate everything else keys off
// ---------------------------------------------------------------------------

describe('isYearComplete', () => {
  it('the current calendar year is never complete, even on December 31st', () => {
    expect(isYearComplete('2026', new Date('2026-12-31T23:59:59Z'))).toBe(false)
  })

  it('a prior calendar year is complete', () => {
    expect(isYearComplete('2025', new Date('2026-01-01T00:00:01Z'))).toBe(true)
  })

  it('a future year is not complete', () => {
    expect(isYearComplete('2027', NOW_MID_2026)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Contract rent — source priority (unaffected by the Phase B.1 fix, still
// covered directly)
// ---------------------------------------------------------------------------

describe('resolveContractMonthlyRent — source priority', () => {
  it('active lease rent takes priority over property fallback rent', () => {
    const metric = resolveContractMonthlyRent({ id: 'lease-1', monthlyRent: 2200 }, 1800)
    expect(metric.value).toBe(2200)
    expect(metric.source).toBe('active_lease')
    expect(metric.period).toBe('monthly_contract')
  })

  it('property fallback rent is used when no active lease exists', () => {
    const metric = resolveContractMonthlyRent(null, 1800)
    expect(metric.value).toBe(1800)
    expect(metric.source).toBe('property_fallback')
    expect(metric.estimated).toBe(true)
  })

  it('is unavailable when neither an active lease nor a fallback rent exists', () => {
    const metric = resolveContractMonthlyRent(null, 0)
    expect(metric.value).toBeNull()
    expect(metric.status).toBe('unavailable')
  })
})

// ---------------------------------------------------------------------------
// 8. Contract annual rent remains available independently
// ---------------------------------------------------------------------------

describe('8. Contract annual rent remains available independently', () => {
  it('annualizes the monthly figure and is tagged annual_contract, independent of any income/expense data', () => {
    const monthly = resolveContractMonthlyRent({ id: 'l1', monthlyRent: 2500 }, 0)
    const annual = resolveContractAnnualRent(monthly)
    expect(annual.value).toBe(30000)
    expect(annual.status).toBe('available')
    expect(annual.period).toBe('annual_contract')
  })

  it('is available even when no Tax Center data exists at all for the property/year', () => {
    const monthly = resolveContractMonthlyRent({ id: 'l1', monthlyRent: 2500 }, 0)
    const annual = resolveContractAnnualRent(monthly)
    expect(annual.status).toBe('available')
  })

  it('stays unavailable only when the monthly figure itself is unavailable', () => {
    const monthly = resolveContractMonthlyRent(null, 0)
    const annual = resolveContractAnnualRent(monthly)
    expect(annual.value).toBeNull()
    expect(annual.status).toBe('unavailable')
  })
})

// ---------------------------------------------------------------------------
// 9. Actual YTD income stays distinct from contract annual rent
// ---------------------------------------------------------------------------

describe('9. Actual YTD income remains distinct from contract annual rent', () => {
  it('actualIncomeYtd is its own figure, never derived from or equal to annualized contract rent', () => {
    const contractAnnual = resolveContractAnnualRent(resolveContractMonthlyRent({ id: 'l1', monthlyRent: 2500 }, 0))
    // Only 2 months of $2,000 actually collected so far — genuinely
    // different from a $30,000 annualized contract rate.
    const actualIncome = resolveActualIncomeYtd(taxSummary({ grossIncome: 4000, transactionCount: 2 }), false)
    expect(contractAnnual.value).toBe(30000)
    expect(actualIncome.value).toBe(4000)
    expect(actualIncome.period).toBe('ytd_actual')
    expect(contractAnnual.period).toBe('annual_contract')
  })

  it('actual income is unavailable when nothing has been logged, even if a contract rent exists', () => {
    const actualIncome = resolveActualIncomeYtd(taxSummary({ grossIncome: 0, transactionCount: 0, hasManualRecord: false }), false)
    expect(actualIncome.status).toBe('unavailable')
    expect(actualIncome.value).toBeNull()
  })

  it('a genuine $0 actual income (e.g. a vacant stretch) is available, not unavailable, once there is other Tax Center data for the property/year', () => {
    const actualIncome = resolveActualIncomeYtd(taxSummary({ grossIncome: 0, transactionCount: 3 }), false)
    expect(actualIncome.status).toBe('available')
    expect(actualIncome.value).toBe(0)
  })

  it('is tagged annual_actual instead of ytd_actual once the tax year is confirmed complete — same figure, relabeled', () => {
    const actualIncome = resolveActualIncomeYtd(taxSummary({ grossIncome: 30000, transactionCount: 24 }), true)
    expect(actualIncome.period).toBe('annual_actual')
    expect(actualIncome.value).toBe(30000)
  })
})

// ---------------------------------------------------------------------------
// 1. YTD NOI uses YTD income and YTD operating expenses from the SAME
// period
// ---------------------------------------------------------------------------

describe('1. YTD NOI uses YTD income and YTD operating expenses from the same period', () => {
  it('noiYtd = actualIncomeYtd - operatingExpensesYtd, both drawn from the same taxYearSummary', () => {
    const income = resolveActualIncomeYtd(taxSummary({ grossIncome: 8000, transactionCount: 6 }), false)
    const expenses = resolveOperatingExpensesYtd(taxSummary({ operatingExpenses: 2500, transactionCount: 6 }), false)
    const noi = resolveNoiYtd(income, expenses)
    expect(noi.value).toBe(5500)
    expect(noi.status).toBe('available')
    expect(noi.period).toBe('ytd_actual')
  })

  it('never uses contract rent as the income side', () => {
    // Contract rent would be $30,000/yr here, but noiYtd must only ever
    // reflect the actual $8,000 tracked so far.
    const income = resolveActualIncomeYtd(taxSummary({ grossIncome: 8000, transactionCount: 6 }), false)
    const expenses = resolveOperatingExpensesYtd(taxSummary({ operatingExpenses: 2500, transactionCount: 6 }), false)
    const noi = resolveNoiYtd(income, expenses)
    expect(noi.value).not.toBe(30000 - 2500)
  })
})

// ---------------------------------------------------------------------------
// 2. Annual contract rent is NOT combined with YTD operating expenses to
// produce annual NOI (the actual Phase B.1 bug)
// ---------------------------------------------------------------------------

describe('2. Annual contract rent is never combined with YTD operating expenses to produce annual NOI', () => {
  it('a mid-year property with a lease and some YTD expenses gets NO annual NOI, even though both inputs "exist"', () => {
    const result = computePropertyPerformance({
      propertyId: 'p1',
      estimatedValue: 400000,
      propertyMonthlyRentFallback: 0,
      propertyMortgageBalanceFallback: 0,
      activeLease: { id: 'l1', monthlyRent: 2500 }, // would annualize to $30,000
      mortgage: null,
      taxYearSummary: taxSummary({ year: '2026', operatingExpenses: 9000, transactionCount: 12 }), // YTD, current year
    }, NOW_MID_2026)

    expect(result.contractAnnualRent.value).toBe(30000) // available on its own
    expect(result.period.isYearComplete).toBe(false)
    // The old (buggy) formula would have been 30000 - 9000 = 21000. It
    // must not appear anywhere.
    expect(result.noiAnnual.status).toBe('unavailable')
    expect(result.noiAnnual.value).toBeNull()
    expect(result.noiAnnual.value).not.toBe(21000)
  })
})

// ---------------------------------------------------------------------------
// 3. Annual NOI is unavailable when no compatible annual basis exists
// ---------------------------------------------------------------------------

describe('3. Annual NOI is unavailable when no compatible annual expense basis exists', () => {
  it('unavailable for the current, still-in-progress tax year, regardless of how much YTD data exists', () => {
    const noiYtd = availableMetric(21000)
    const noiAnnual = resolveNoiAnnual(noiYtd, false)
    expect(noiAnnual.status).toBe('unavailable')
    expect(noiAnnual.value).toBeNull()
  })

  it('unavailable even for a complete prior year if the underlying YTD figures themselves were unavailable/incomplete', () => {
    const noiAnnual = resolveNoiAnnual(unavailableMetric, true)
    expect(noiAnnual.status).toBe('unavailable')
    expect(noiAnnual.value).toBeNull()
  })

  it('is genuinely available for a confirmed, fully-elapsed prior tax year with real income and expense data', () => {
    const noiYtd = availableMetric(21000)
    const noiAnnual = resolveNoiAnnual(noiYtd, true)
    expect(noiAnnual.status).toBe('available')
    expect(noiAnnual.value).toBe(21000)
    expect(noiAnnual.period).toBe('annual_actual')
  })
})

// ---------------------------------------------------------------------------
// 4-5. Cap Rate gating
// ---------------------------------------------------------------------------

describe('4. Cap Rate is unavailable when valid annual NOI is unavailable', () => {
  it('unavailable when noiAnnual is unavailable (the common mid-year case)', () => {
    const capRate = resolveCapRate(unavailableMetric, resolveEstimatedValue(400000))
    expect(capRate.status).toBe('unavailable')
    expect(capRate.value).toBeNull()
  })

  it('unavailable when estimated value is missing, even with a valid annual NOI', () => {
    const capRate = resolveCapRate(availableMetric(24000), resolveEstimatedValue(0))
    expect(capRate.status).toBe('unavailable')
    expect(capRate.value).toBeNull()
  })

  it('never returns a misleading 0% when required data is missing', () => {
    const capRate = resolveCapRate(unavailableMetric, resolveEstimatedValue(0))
    expect(capRate.value).not.toBe(0)
    expect(capRate.value).toBeNull()
  })
})

describe('5. Cap Rate works when a genuinely compatible annual NOI basis is supplied', () => {
  it('NOI / estimated value x 100, using a confirmed annual NOI', () => {
    const noiYtd = availableMetric(24000)
    const noiAnnual = resolveNoiAnnual(noiYtd, true)
    const capRate = resolveCapRate(noiAnnual, resolveEstimatedValue(400000))
    expect(capRate.value).toBeCloseTo(6, 6) // 24000 / 400000 * 100
    expect(capRate.status).toBe('available')
    expect(capRate.period).toBe('annual_actual')
  })
})

// ---------------------------------------------------------------------------
// 6-7. Net Cash Flow gating
// ---------------------------------------------------------------------------

describe('6. Net Cash Flow does not divide YTD NOI by 12', () => {
  it('unavailable when only a YTD (not annual) NOI exists, even with a real mortgage payment on file', () => {
    const noiYtdOnly = availableMetric(9000) // deliberately NOT run through resolveNoiAnnual
    const debtService = resolveMonthlyDebtService({ currentBalance: 280000, monthlyPayment: 1500 })
    // Directly simulate the mistake: pass a YTD-tagged NOI where an
    // annual one is required. resolveNetCashFlow must still refuse it
    // once the annual gate is applied upstream — this test exercises the
    // full computePropertyPerformance path instead, which is where the
    // gate actually lives.
    const result = computePropertyPerformance({
      propertyId: 'p1', estimatedValue: 400000, propertyMonthlyRentFallback: 0, propertyMortgageBalanceFallback: 0,
      activeLease: { id: 'l1', monthlyRent: 2500 },
      mortgage: { currentBalance: 280000, monthlyPayment: 1500 },
      taxYearSummary: taxSummary({ year: '2026', grossIncome: 5000, operatingExpenses: 9000, transactionCount: 6 }),
    }, NOW_MID_2026)
    expect(result.noiYtd.value).toBe(-4000) // a real, available YTD figure
    expect(result.netCashFlowMonthly.status).toBe('unavailable')
    expect(result.netCashFlowMonthly.value).toBeNull()
    void noiYtdOnly
    void debtService
  })
})

describe('7. Net Cash Flow becomes unavailable when a valid annual/compatible NOI basis is absent', () => {
  it('unavailable when noiAnnual is unavailable, even with valid debt service', () => {
    const debtService = resolveMonthlyDebtService({ currentBalance: 280000, monthlyPayment: 1500 })
    const cashFlow = resolveNetCashFlow(unavailableMetric, debtService)
    expect(cashFlow.status).toBe('unavailable')
    expect(cashFlow.value).toBeNull()
  })

  it('unavailable when there is no mortgage record on file at all, even with a valid annual NOI', () => {
    const noiAnnual = resolveNoiAnnual(availableMetric(24000), true)
    const debtService = resolveMonthlyDebtService(null)
    const cashFlow = resolveNetCashFlow(noiAnnual, debtService)
    expect(cashFlow.status).toBe('unavailable')
    expect(cashFlow.value).toBeNull()
  })

  it('unavailable when a mortgage record exists but has no payment amount recorded (incomplete debt service never feeds cash flow)', () => {
    const noiAnnual = resolveNoiAnnual(availableMetric(24000), true)
    const debtService = resolveMonthlyDebtService({ currentBalance: 280000, monthlyPayment: 0 })
    expect(debtService.status).toBe('incomplete')
    const cashFlow = resolveNetCashFlow(noiAnnual, debtService)
    expect(cashFlow.status).toBe('unavailable')
  })

  it('is available and period-consistent when both a confirmed annual NOI and a real monthly payment exist', () => {
    const noiAnnual = resolveNoiAnnual(availableMetric(24000), true)
    const debtService = resolveMonthlyDebtService({ currentBalance: 280000, monthlyPayment: 1500 })
    const cashFlow = resolveNetCashFlow(noiAnnual, debtService)
    expect(cashFlow.status).toBe('available')
    expect(cashFlow.value).toBeCloseTo(24000 / 12 - 1500, 6) // 500
    expect(cashFlow.period).toBe('monthly_derived')
  })
})

// ---------------------------------------------------------------------------
// Expense resolution / double counting (unaffected by the Phase B.1 fix,
// still covered directly)
// ---------------------------------------------------------------------------

describe('Expense resolution does not double-count manual and tracked amounts', () => {
  it('operatingExpensesYtd uses Tax Center\'s already-resolved effective total verbatim', () => {
    const resolved = resolveOperatingExpensesYtd(taxSummary({ operatingExpenses: 5000, transactionCount: 8 }), false)
    expect(resolved.value).toBe(5000)
  })

  it('a $0 total with other data present is flagged incomplete, never silently trusted as a real zero', () => {
    const resolved = resolveOperatingExpensesYtd(taxSummary({ operatingExpenses: 0, transactionCount: 3 }), false)
    expect(resolved.status).toBe('incomplete')
  })

  it('a NOI built on an incomplete (suspicious-zero) expense total is unavailable, not a falsely-inflated number', () => {
    const income = resolveActualIncomeYtd(taxSummary({ grossIncome: 2000, transactionCount: 3 }), false)
    const expenses = resolveOperatingExpensesYtd(taxSummary({ operatingExpenses: 0, transactionCount: 3 }), false)
    const noi = resolveNoiYtd(income, expenses)
    expect(noi.status).toBe('unavailable')
  })
})

// ---------------------------------------------------------------------------
// Equity (unaffected by the Phase B.1 fix — a point-in-time metric, not a
// period-flow one — still covered directly)
// ---------------------------------------------------------------------------

describe('Equity', () => {
  it('works when value + mortgage balance exist', () => {
    const value = resolveEstimatedValue(400000)
    const balance = resolveMortgageBalance({ currentBalance: 280000, monthlyPayment: 1800 }, 0)
    const equity = resolveEquity(value, balance)
    expect(equity.value).toBe(120000)
    expect(equity.status).toBe('available')
    expect(equity.period).toBe('point_in_time')
  })

  it('is unavailable when required inputs are missing', () => {
    const equity = resolveEquity(resolveEstimatedValue(0), resolveMortgageBalance({ currentBalance: 100000, monthlyPayment: 900 }, 0))
    expect(equity.status).toBe('unavailable')
    expect(equity.value).toBeNull()
  })

  it('never treats a missing mortgage record as $0 debt', () => {
    const equity = resolveEquity(resolveEstimatedValue(400000), resolveMortgageBalance(null, 0))
    expect(equity.status).toBe('unavailable')
  })
})

// ---------------------------------------------------------------------------
// 11. Missing values remain null/unavailable rather than zero
// ---------------------------------------------------------------------------

describe('11. Missing values remain null/unavailable rather than zero', () => {
  it('every unavailable metric in an entirely-empty snapshot has value: null, never 0', () => {
    const result = computePropertyPerformance({
      propertyId: 'p1',
      estimatedValue: 0,
      propertyMonthlyRentFallback: 0,
      propertyMortgageBalanceFallback: 0,
      activeLease: null,
      mortgage: null,
      taxYearSummary: taxSummary(),
    })
    for (const [key, metric] of Object.entries(result)) {
      if (key === 'propertyId' || key === 'period') continue
      const m = metric as { status: string; value: number | null }
      expect(m.status).toBe('unavailable')
      expect(m.value, `${key} should be null when unavailable`).toBeNull()
    }
  })

  it('a genuine negative NOI/cash flow is returned as computed, never treated as an error', () => {
    const income = resolveActualIncomeYtd(taxSummary({ grossIncome: 500, transactionCount: 10 }), false)
    const expenses = resolveOperatingExpensesYtd(taxSummary({ operatingExpenses: 9000, transactionCount: 10 }), false)
    const noi = resolveNoiYtd(income, expenses)
    expect(noi.value).toBeLessThan(0)
    expect(noi.status).toBe('available')
  })
})

// ---------------------------------------------------------------------------
// 12. No NaN/Infinity
// ---------------------------------------------------------------------------

describe('12. No NaN/Infinity outputs', () => {
  it('a fully-populated complete-year result is all-finite', () => {
    assertAllFinite(computePropertyPerformance(completeYearInput(), NOW_MID_2026))
  })

  it('a mid-year (incomplete) result is all-finite', () => {
    assertAllFinite(computePropertyPerformance({
      propertyId: 'p1', estimatedValue: 400000, propertyMonthlyRentFallback: 0, propertyMortgageBalanceFallback: 0,
      activeLease: { id: 'l1', monthlyRent: 2500 }, mortgage: { currentBalance: 280000, monthlyPayment: 1800 },
      taxYearSummary: taxSummary({ year: '2026', grossIncome: 5000, operatingExpenses: 2000, transactionCount: 6 }),
    }, NOW_MID_2026))
  })

  it('an entirely-empty result does not throw and is all-finite', () => {
    assertAllFinite(computePropertyPerformance({
      propertyId: 'p1', estimatedValue: 0, propertyMonthlyRentFallback: 0, propertyMortgageBalanceFallback: 0,
      activeLease: null, mortgage: null, taxYearSummary: taxSummary(),
    }))
  })

  it('never divides by a zero estimated value into Infinity', () => {
    const capRate = resolveCapRate(availableMetric(24000), resolveEstimatedValue(0))
    assertAllFinite(capRate)
  })

  it('negative inputs (e.g. a corrupt/negative mortgage payment) never produce non-finite math', () => {
    assertAllFinite(resolveMonthlyDebtService({ currentBalance: 100000, monthlyPayment: -500 }))
  })
})

// ---------------------------------------------------------------------------
// Data-quality/source metadata
// ---------------------------------------------------------------------------

describe('Data-quality/source metadata reflects fallback/manual/stale conditions', () => {
  it('a mortgage-record-sourced balance is flagged estimated + potentiallyStale, with an explanatory note', () => {
    const balance = resolveMortgageBalance({ currentBalance: 200000, monthlyPayment: 1500 }, 0)
    expect(balance.estimated).toBe(true)
    expect(balance.potentiallyStale).toBe(true)
    expect(balance.notes?.length).toBeGreaterThan(0)
  })

  it('estimated value is always flagged estimated (landlord-entered, never independently verified)', () => {
    expect(resolveEstimatedValue(400000).estimated).toBe(true)
  })

  it('noiAnnual explains WHY it is unavailable mid-year, not just that it is', () => {
    const noiAnnual = resolveNoiAnnual(availableMetric(21000), false)
    expect(noiAnnual.notes?.some((n) => /still in progress/i.test(n))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 10. Period metadata is correct
// ---------------------------------------------------------------------------

describe('10. Period metadata is correct', () => {
  it('every metric carries an explicit, semantically-correct period tag', () => {
    const result = computePropertyPerformance(completeYearInput(), NOW_MID_2026)
    expect(result.contractMonthlyRent.period).toBe('monthly_contract')
    expect(result.contractAnnualRent.period).toBe('annual_contract')
    expect(result.actualIncomeYtd.period).toBe('annual_actual') // 2025 is complete as of mid-2026
    expect(result.operatingExpensesYtd.period).toBe('annual_actual')
    expect(result.noiYtd.period).toBe('annual_actual')
    expect(result.noiAnnual.period).toBe('annual_actual')
    expect(result.capRatePercent.period).toBe('annual_actual')
    expect(result.netCashFlowMonthly.period).toBe('monthly_derived')
    expect(result.estimatedValue.period).toBe('point_in_time')
    expect(result.mortgageBalance.period).toBe('point_in_time')
    expect(result.equity.period).toBe('point_in_time')
  })

  it('the SAME figures are tagged ytd_actual, and noiAnnual/capRate/netCashFlow are unavailable, for the current in-progress year', () => {
    const result = computePropertyPerformance({
      propertyId: 'p1', estimatedValue: 400000, propertyMonthlyRentFallback: 0, propertyMortgageBalanceFallback: 0,
      activeLease: { id: 'l1', monthlyRent: 2500 }, mortgage: { currentBalance: 280000, monthlyPayment: 1800 },
      taxYearSummary: taxSummary({ year: '2026', grossIncome: 15000, operatingExpenses: 4000, transactionCount: 6 }),
    }, NOW_MID_2026)
    expect(result.period.isYearComplete).toBe(false)
    expect(result.actualIncomeYtd.period).toBe('ytd_actual')
    expect(result.operatingExpensesYtd.period).toBe('ytd_actual')
    expect(result.noiYtd.period).toBe('ytd_actual')
    expect(result.noiYtd.status).toBe('available') // YTD NOI IS still available mid-year
    expect(result.noiAnnual.status).toBe('unavailable')
    expect(result.capRatePercent.status).toBe('unavailable')
    expect(result.netCashFlowMonthly.status).toBe('unavailable')
  })

  it('period.taxYear/asOf/isYearComplete are all explicit and correct', () => {
    const result = computePropertyPerformance(completeYearInput(), NOW_MID_2026)
    expect(result.period.taxYear).toBe('2025')
    expect(result.period.asOf).toBe('2026-06-15')
    expect(result.period.isYearComplete).toBe(true)
  })

  it('contractAnnualRent is always exactly 12x contractMonthlyRent, never independently derived', () => {
    const monthly = resolveContractMonthlyRent({ id: 'l1', monthlyRent: 1750 }, 0)
    const annual = resolveContractAnnualRent(monthly)
    expect(annual.value).toBe(monthly.value! * 12)
  })
})

// ---------------------------------------------------------------------------
// Integration: full-property scenarios
// ---------------------------------------------------------------------------

describe('computePropertyPerformance — integration', () => {
  it('a brand-new landlord with only an address and an estimated value gets a valid, mostly-unavailable snapshot, never a crash', () => {
    const result = computePropertyPerformance({
      propertyId: 'p1', estimatedValue: 350000, propertyMonthlyRentFallback: 0, propertyMortgageBalanceFallback: 0,
      activeLease: null, mortgage: null, taxYearSummary: taxSummary(),
    })
    expect(result.estimatedValue.status).toBe('available')
    expect(result.contractMonthlyRent.status).toBe('unavailable')
    expect(result.actualIncomeYtd.status).toBe('unavailable')
    expect(result.noiYtd.status).toBe('unavailable')
    expect(result.noiAnnual.status).toBe('unavailable')
    expect(result.capRatePercent.status).toBe('unavailable')
    expect(result.netCashFlowMonthly.status).toBe('unavailable')
    expect(result.equity.status).toBe('unavailable')
  })

  it('a disciplined landlord reviewing a complete prior tax year gets every metric available, all period-consistent', () => {
    const result = computePropertyPerformance(completeYearInput(), NOW_MID_2026)
    expect(result.estimatedValue.value).toBe(400000)
    expect(result.contractAnnualRent.value).toBe(30000)
    expect(result.actualIncomeYtd.value).toBe(30000)
    expect(result.operatingExpensesYtd.value).toBe(9000)
    expect(result.noiYtd.value).toBe(21000)
    expect(result.noiAnnual.value).toBe(21000)
    expect(result.capRatePercent.value).toBeCloseTo(5.25, 6) // 21000/400000*100
    expect(result.equity.value).toBe(120000)
    expect(result.netCashFlowMonthly.status).toBe('available')
  })

  it('is a pure function — calling it twice with the same input and now produces identical output', () => {
    const a = computePropertyPerformance(completeYearInput(), NOW_MID_2026)
    const b = computePropertyPerformance(completeYearInput(), NOW_MID_2026)
    expect(a).toEqual(b)
  })
})
