import { describe, expect, it } from 'vitest'
import {
  computePropertyPerformance,
  resolveActualIncomeYtd,
  resolveCapRate,
  resolveContractAnnualRent,
  resolveContractMonthlyRent,
  resolveEquity,
  resolveEstimatedValue,
  resolveMonthlyDebtService,
  resolveMortgageBalance,
  resolveNetCashFlow,
  resolveNOI,
  resolveOperatingExpensesYtd,
} from './calculate'
import type { PropertyPerformanceInput, TaxYearSummaryInput } from './types'

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
    otherIncome: 0,
    transactionCount: 0,
    hasManualRecord: false,
    ...overrides,
  }
}

function fullInput(overrides: Partial<PropertyPerformanceInput> = {}): PropertyPerformanceInput {
  return {
    propertyId: 'prop-1',
    estimatedValue: 400000,
    propertyMonthlyRentFallback: 0,
    propertyMortgageBalanceFallback: 0,
    activeLease: { id: 'lease-1', monthlyRent: 2500 },
    mortgage: { currentBalance: 280000, monthlyPayment: 1800 },
    taxYearSummary: taxSummary({ grossIncome: 30000, operatingExpenses: 9000, transactionCount: 12, hasManualRecord: false }),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 1-2: Contract rent source priority
// ---------------------------------------------------------------------------

describe('resolveContractMonthlyRent — source priority', () => {
  it('1. active lease rent takes priority over property fallback rent', () => {
    const metric = resolveContractMonthlyRent({ id: 'lease-1', monthlyRent: 2200 }, 1800)
    expect(metric.value).toBe(2200)
    expect(metric.status).toBe('available')
    expect(metric.source).toBe('active_lease')
    expect(metric.estimated).toBeUndefined()
  })

  it('2. property fallback rent is used when no active lease exists', () => {
    const metric = resolveContractMonthlyRent(null, 1800)
    expect(metric.value).toBe(1800)
    expect(metric.status).toBe('available')
    expect(metric.source).toBe('property_fallback')
    expect(metric.estimated).toBe(true)
    expect(metric.notes?.join(' ')).toMatch(/no active lease/i)
  })

  it('is unavailable when neither an active lease nor a fallback rent exists', () => {
    const metric = resolveContractMonthlyRent(null, 0)
    expect(metric.value).toBeNull()
    expect(metric.status).toBe('unavailable')
  })

  it('never silently promotes the fallback to the same confidence as an active lease (source always distinguishes them)', () => {
    const withLease = resolveContractMonthlyRent({ id: 'l1', monthlyRent: 2000 }, 2000)
    const withFallback = resolveContractMonthlyRent(null, 2000)
    expect(withLease.source).not.toBe(withFallback.source)
    expect(withLease.estimated).toBeUndefined()
    expect(withFallback.estimated).toBe(true)
  })
})

describe('resolveContractAnnualRent', () => {
  it('annualizes the monthly figure and mirrors its source/status', () => {
    const monthly = resolveContractMonthlyRent({ id: 'l1', monthlyRent: 2500 }, 0)
    const annual = resolveContractAnnualRent(monthly)
    expect(annual.value).toBe(30000)
    expect(annual.source).toBe(monthly.source)
    expect(annual.status).toBe('available')
  })

  it('stays unavailable when the monthly figure is unavailable', () => {
    const monthly = resolveContractMonthlyRent(null, 0)
    const annual = resolveContractAnnualRent(monthly)
    expect(annual.value).toBeNull()
    expect(annual.status).toBe('unavailable')
  })
})

// ---------------------------------------------------------------------------
// 3: Contract rent vs. actual income are distinct concepts
// ---------------------------------------------------------------------------

describe('3. Contract rent stays distinct from actual rent received', () => {
  it('actualIncomeYtd is its own figure, not derived from or equal to contract rent', () => {
    const contractRent = resolveContractMonthlyRent({ id: 'l1', monthlyRent: 2500 }, 0)
    // Only 2 months of $2,000 actually collected (a rent concession, or
    // simply not fully caught up) — genuinely different from the $2,500
    // contract rate.
    const actualIncome = resolveActualIncomeYtd(taxSummary({ grossIncome: 4000, transactionCount: 2 }))
    expect(contractRent.value).toBe(2500)
    expect(actualIncome.value).toBe(4000)
    expect(actualIncome.value).not.toBe(contractRent.value! * 2)
  })

  it('actual income is unavailable when nothing has been logged, even if a contract rent exists', () => {
    const actualIncome = resolveActualIncomeYtd(taxSummary({ grossIncome: 0, transactionCount: 0, hasManualRecord: false }))
    expect(actualIncome.status).toBe('unavailable')
    expect(actualIncome.value).toBeNull()
  })

  it('a genuine $0 actual income (e.g. a vacant stretch) is available, not unavailable, once there is other Tax Center data for the property/year', () => {
    const actualIncome = resolveActualIncomeYtd(taxSummary({ grossIncome: 0, transactionCount: 3 }))
    expect(actualIncome.status).toBe('available')
    expect(actualIncome.value).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 4-6: NOI and Cap Rate
// ---------------------------------------------------------------------------

describe('4. NOI excludes financing', () => {
  it('is unaffected by mortgage/debt-service figures — only income and operating expenses feed it', () => {
    const rent = resolveContractAnnualRent(resolveContractMonthlyRent({ id: 'l1', monthlyRent: 2500 }, 0))
    const expenses = resolveOperatingExpensesYtd(taxSummary({ operatingExpenses: 9000, transactionCount: 12 }))
    const noi = resolveNOI(rent, 0, expenses)
    // 2500 * 12 - 9000 = 21000, regardless of any mortgage payment.
    expect(noi.value).toBe(21000)
    expect(noi.status).toBe('available')
  })

  it('includes Tax Center "other rental-related income" as an additive term, per Phase A\'s formula', () => {
    const rent = resolveContractAnnualRent(resolveContractMonthlyRent({ id: 'l1', monthlyRent: 2000 }, 0))
    const expenses = resolveOperatingExpensesYtd(taxSummary({ operatingExpenses: 5000, transactionCount: 4 }))
    const noi = resolveNOI(rent, 1200, expenses)
    // 2000*12 + 1200 - 5000 = 20200
    expect(noi.value).toBe(20200)
  })
})

describe('5. Cap Rate formula is correct', () => {
  it('NOI / estimated value x 100', () => {
    const noi = { value: 24000, status: 'available' as const, source: 'derived' as const }
    const value = resolveEstimatedValue(400000)
    const capRate = resolveCapRate(noi, value)
    expect(capRate.value).toBeCloseTo(6, 6) // 24000 / 400000 * 100
    expect(capRate.status).toBe('available')
  })
})

describe('6. Cap Rate is unavailable when value is missing or invalid', () => {
  it('unavailable when estimated value is not entered (0)', () => {
    const noi = { value: 24000, status: 'available' as const, source: 'derived' as const }
    const capRate = resolveCapRate(noi, resolveEstimatedValue(0))
    expect(capRate.status).toBe('unavailable')
    expect(capRate.value).toBeNull()
  })

  it('unavailable when NOI itself is unavailable', () => {
    const capRate = resolveCapRate({ value: null, status: 'unavailable', source: 'derived' }, resolveEstimatedValue(400000))
    expect(capRate.status).toBe('unavailable')
    expect(capRate.value).toBeNull()
  })

  it('never returns a misleading 0% when required data is missing', () => {
    const capRate = resolveCapRate({ value: null, status: 'unavailable', source: 'derived' }, resolveEstimatedValue(0))
    expect(capRate.value).not.toBe(0)
    expect(capRate.value).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 7: Expense resolution never double-counts
// ---------------------------------------------------------------------------

describe('7. Expense resolution does not double-count manual and tracked amounts', () => {
  it('operatingExpensesYtd uses Tax Center\'s already-resolved effective total verbatim — never adds a second figure on top', () => {
    // Tax Center's own computePropertyTaxSummary already applied the
    // manual-replaces-tracked rule before this number ever reaches
    // Property Intelligence (lib/tax-center/manual-entry.ts's
    // computeCategoryValue) — e.g. tracked ledger total was $4,000, a
    // manual Tax Center entry of $5,000 REPLACED it, so the resolved
    // total this module receives is $5,000, not $9,000.
    const resolved = resolveOperatingExpensesYtd(taxSummary({ operatingExpenses: 5000, transactionCount: 8 }))
    expect(resolved.value).toBe(5000)
  })

  it('a $0 total with other data present is flagged incomplete, never silently trusted as a real zero', () => {
    const resolved = resolveOperatingExpensesYtd(taxSummary({ operatingExpenses: 0, transactionCount: 3 }))
    expect(resolved.status).toBe('incomplete')
    expect(resolved.value).toBe(0)
  })

  it('a NOI built on an incomplete (suspicious-zero) expense total is unavailable, not a falsely-inflated number', () => {
    const rent = resolveContractAnnualRent(resolveContractMonthlyRent({ id: 'l1', monthlyRent: 2000 }, 0))
    const expenses = resolveOperatingExpensesYtd(taxSummary({ operatingExpenses: 0, transactionCount: 3 }))
    const noi = resolveNOI(rent, 0, expenses)
    expect(noi.status).toBe('unavailable')
    expect(noi.value).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 8-9: Net Cash Flow
// ---------------------------------------------------------------------------

describe('8. Net Cash Flow subtracts debt service from NOI', () => {
  it('NOI/12 - monthly debt service', () => {
    const noi = { value: 24000, status: 'available' as const, source: 'derived' as const }
    const debtService = resolveMonthlyDebtService({ currentBalance: 280000, monthlyPayment: 1500 })
    const cashFlow = resolveNetCashFlow(noi, debtService)
    expect(cashFlow.value).toBeCloseTo(24000 / 12 - 1500, 6) // 500
    expect(cashFlow.status).toBe('available')
  })
})

describe('9. Net Cash Flow is unavailable/incomplete when required financing data is missing', () => {
  it('unavailable when there is no mortgage record on file at all', () => {
    const noi = { value: 24000, status: 'available' as const, source: 'derived' as const }
    const debtService = resolveMonthlyDebtService(null)
    const cashFlow = resolveNetCashFlow(noi, debtService)
    expect(cashFlow.status).toBe('unavailable')
    expect(cashFlow.value).toBeNull()
  })

  it('unavailable when a mortgage record exists but has no payment amount recorded (incomplete debt service never feeds cash flow)', () => {
    const noi = { value: 24000, status: 'available' as const, source: 'derived' as const }
    const debtService = resolveMonthlyDebtService({ currentBalance: 280000, monthlyPayment: 0 })
    expect(debtService.status).toBe('incomplete')
    const cashFlow = resolveNetCashFlow(noi, debtService)
    expect(cashFlow.status).toBe('unavailable')
  })

  it('never treats a missing mortgage record as proof of $0 debt service', () => {
    const debtService = resolveMonthlyDebtService(null)
    expect(debtService.value).not.toBe(0)
    expect(debtService.value).toBeNull()
    expect(debtService.notes?.join(' ')).toMatch(/does not necessarily mean/i)
  })
})

// ---------------------------------------------------------------------------
// 10-11: Equity
// ---------------------------------------------------------------------------

describe('10. Equity calculation works when value + mortgage balance exist', () => {
  it('estimated value - mortgage balance', () => {
    const value = resolveEstimatedValue(400000)
    const balance = resolveMortgageBalance({ currentBalance: 280000, monthlyPayment: 1800 }, 0)
    const equity = resolveEquity(value, balance)
    expect(equity.value).toBe(120000)
    expect(equity.status).toBe('available')
    expect(equity.estimated).toBe(true) // never described as lender-verified
  })

  it('works using the property-level fallback balance when no mortgage record exists', () => {
    const value = resolveEstimatedValue(400000)
    const balance = resolveMortgageBalance(null, 250000)
    const equity = resolveEquity(value, balance)
    expect(equity.value).toBe(150000)
    expect(equity.status).toBe('available')
    expect(equity.potentiallyStale).toBe(true)
  })
})

describe('11. Equity is unavailable when required inputs are missing', () => {
  it('unavailable when estimated value is missing', () => {
    const equity = resolveEquity(resolveEstimatedValue(0), resolveMortgageBalance({ currentBalance: 100000, monthlyPayment: 900 }, 0))
    expect(equity.status).toBe('unavailable')
    expect(equity.value).toBeNull()
  })

  it('unavailable (never treated as zero debt) when no mortgage balance can be determined at all', () => {
    const equity = resolveEquity(resolveEstimatedValue(400000), resolveMortgageBalance(null, 0))
    expect(equity.status).toBe('unavailable')
    expect(equity.value).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 12-13: Zero vs. unknown
// ---------------------------------------------------------------------------

describe('12. Missing values never silently become zero', () => {
  it('every unavailable metric in a full snapshot has value: null, never 0', () => {
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
})

describe('13. Zero values remain valid when they genuinely mean zero', () => {
  it('a real $0 active-lease rent is available, not unavailable', () => {
    const rent = resolveContractMonthlyRent({ id: 'l1', monthlyRent: 0 }, 0)
    expect(rent.status).toBe('available')
    expect(rent.value).toBe(0)
  })

  it('a real $0 actual income (vacant stretch, other data present) is available, not unavailable', () => {
    const income = resolveActualIncomeYtd(taxSummary({ grossIncome: 0, transactionCount: 5 }))
    expect(income.status).toBe('available')
    expect(income.value).toBe(0)
  })

  it('a genuine negative NOI/cash flow is returned as computed, never treated as an error', () => {
    const rent = resolveContractAnnualRent(resolveContractMonthlyRent({ id: 'l1', monthlyRent: 500 }, 0))
    const expenses = resolveOperatingExpensesYtd(taxSummary({ operatingExpenses: 9000, transactionCount: 10 }))
    const noi = resolveNOI(rent, 0, expenses)
    expect(noi.value).toBeLessThan(0)
    expect(noi.status).toBe('available')
  })
})

// ---------------------------------------------------------------------------
// 14: No NaN/Infinity, ever
// ---------------------------------------------------------------------------

describe('14. No NaN/Infinity outputs', () => {
  it('a fully-populated result is all-finite', () => {
    assertAllFinite(computePropertyPerformance(fullInput()))
  })

  it('an entirely-empty result (brand-new property, nothing else entered) is all-finite and does not throw', () => {
    const result = computePropertyPerformance({
      propertyId: 'p1',
      estimatedValue: 0,
      propertyMonthlyRentFallback: 0,
      propertyMortgageBalanceFallback: 0,
      activeLease: null,
      mortgage: null,
      taxYearSummary: taxSummary(),
    })
    assertAllFinite(result)
  })

  it('never divides by a zero estimated value into Infinity', () => {
    const noi = { value: 24000, status: 'available' as const, source: 'derived' as const }
    const capRate = resolveCapRate(noi, resolveEstimatedValue(0))
    assertAllFinite(capRate)
  })

  it('negative inputs (e.g. a corrupt/negative mortgage payment) never produce non-finite math', () => {
    const debtService = resolveMonthlyDebtService({ currentBalance: 100000, monthlyPayment: -500 })
    assertAllFinite(debtService)
  })
})

// ---------------------------------------------------------------------------
// 15: Data-quality/source metadata
// ---------------------------------------------------------------------------

describe('15. Data-quality/source metadata reflects fallback/manual/stale conditions', () => {
  it('a mortgage-record-sourced balance is flagged estimated + potentiallyStale, with an explanatory note', () => {
    const balance = resolveMortgageBalance({ currentBalance: 200000, monthlyPayment: 1500 }, 0)
    expect(balance.estimated).toBe(true)
    expect(balance.potentiallyStale).toBe(true)
    expect(balance.notes?.length).toBeGreaterThan(0)
  })

  it('estimated value is always flagged estimated (landlord-entered, never independently verified)', () => {
    const value = resolveEstimatedValue(400000)
    expect(value.estimated).toBe(true)
  })

  it('a fallback-rent-driven NOI carries the fallback\'s caveat forward into its own notes', () => {
    const rent = resolveContractAnnualRent(resolveContractMonthlyRent(null, 1800))
    const expenses = resolveOperatingExpensesYtd(taxSummary({ operatingExpenses: 6000, transactionCount: 10 }))
    const noi = resolveNOI(rent, 0, expenses)
    expect(noi.status).toBe('incomplete')
    expect(noi.notes?.some((n) => /no active lease/i.test(n))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 16: Periods stay explicit and separate
// ---------------------------------------------------------------------------

describe('16. YTD/annual/monthly periods remain clearly separated', () => {
  it('contractAnnualRent is always exactly 12x contractMonthlyRent, never independently derived', () => {
    const monthly = resolveContractMonthlyRent({ id: 'l1', monthlyRent: 1750 }, 0)
    const annual = resolveContractAnnualRent(monthly)
    expect(annual.value).toBe(monthly.value! * 12)
  })

  it('operatingExpensesYtd is never silently annualized — it is exactly Tax Center\'s year-to-date figure', () => {
    const expenses = resolveOperatingExpensesYtd(taxSummary({ operatingExpenses: 2500, transactionCount: 3 }))
    // Not multiplied up to a full-year run rate — this is the real,
    // partial-year total, on purpose (Phase A: never silently annualize
    // partial-year transactional data).
    expect(expenses.value).toBe(2500)
  })

  it('a full snapshot carries explicit period metadata (taxYear + asOf) the caller can label with', () => {
    const now = new Date('2026-03-15T12:00:00Z')
    const result = computePropertyPerformance(fullInput({ taxYearSummary: taxSummary({ year: '2026', grossIncome: 30000, operatingExpenses: 9000, transactionCount: 12 }) }), now)
    expect(result.period.taxYear).toBe('2026')
    expect(result.period.asOf).toBe('2026-03-15')
  })

  it('NOI\'s own notes are explicit that expenses are year-to-date, not a trailing-twelve-month figure', () => {
    const rent = resolveContractAnnualRent(resolveContractMonthlyRent({ id: 'l1', monthlyRent: 2000 }, 0))
    const expenses = resolveOperatingExpensesYtd(taxSummary({ operatingExpenses: 4000, transactionCount: 5 }))
    const noi = resolveNOI(rent, 0, expenses)
    expect(noi.notes?.some((n) => /tax year to date/i.test(n))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Integration: full-property scenarios
// ---------------------------------------------------------------------------

describe('computePropertyPerformance — integration', () => {
  it('a brand-new landlord with only an address and an estimated value gets a valid, mostly-unavailable snapshot, never a crash', () => {
    const result = computePropertyPerformance({
      propertyId: 'p1',
      estimatedValue: 350000,
      propertyMonthlyRentFallback: 0,
      propertyMortgageBalanceFallback: 0,
      activeLease: null,
      mortgage: null,
      taxYearSummary: taxSummary(),
    })
    expect(result.estimatedValue.status).toBe('available')
    expect(result.estimatedValue.value).toBe(350000)
    expect(result.contractMonthlyRent.status).toBe('unavailable')
    expect(result.actualIncomeYtd.status).toBe('unavailable')
    expect(result.operatingExpensesYtd.status).toBe('unavailable')
    expect(result.noiAnnual.status).toBe('unavailable')
    expect(result.capRatePercent.status).toBe('unavailable')
    expect(result.mortgageBalance.status).toBe('unavailable')
    expect(result.monthlyDebtService.status).toBe('unavailable')
    expect(result.netCashFlowMonthly.status).toBe('unavailable')
    expect(result.equity.status).toBe('unavailable')
  })

  it('a disciplined landlord (active lease, logged expenses, a mortgage on file) gets every metric available', () => {
    const result = computePropertyPerformance(fullInput())
    expect(result.estimatedValue.status).toBe('available')
    expect(result.contractMonthlyRent.status).toBe('available')
    expect(result.contractAnnualRent.value).toBe(30000)
    expect(result.actualIncomeYtd.status).toBe('available')
    expect(result.operatingExpensesYtd.status).toBe('available')
    expect(result.noiAnnual.status).toBe('available')
    expect(result.noiAnnual.value).toBe(21000) // 2500*12 - 9000
    expect(result.capRatePercent.status).toBe('available')
    expect(result.mortgageBalance.status).toBe('available')
    expect(result.monthlyDebtService.status).toBe('available')
    expect(result.netCashFlowMonthly.status).toBe('available')
    expect(result.equity.status).toBe('available')
    expect(result.equity.value).toBe(400000 - 280000)
  })

  it('is a pure function — calling it twice with the same input and now produces identical output', () => {
    const now = new Date('2026-06-01T00:00:00Z')
    const a = computePropertyPerformance(fullInput(), now)
    const b = computePropertyPerformance(fullInput(), now)
    expect(a).toEqual(b)
  })
})
