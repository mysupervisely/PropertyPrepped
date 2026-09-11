import { describe, expect, it } from 'vitest'
import { computePropertyPerformance, resolveMonthlyDebtService, resolveMortgageBalance } from './calculate'
import { normalizeFinancingStatus, type PropertyPerformanceInput } from './types'
import { buildPropertyPerformanceInput, type PropertyRow } from './resolve'

// Property Intelligence V1, Phase C.2 — Part 3: financing_status
// semantics. properties.financing_status ('Active Mortgage' | 'Paid Off'
// | 'No Mortgage' | 'Unknown', supabase/schema.sql's
// properties_financing_status_check) lets the engine treat mortgage
// balance/debt service as a CONFIRMED $0 for a property the landlord has
// explicitly said has no financing — resolving the "no mortgage vs.
// never entered" ambiguity Phase A/Phase C flagged, for the real subset
// of properties where it's actually been set. Every decision here lives
// in the engine (calculate.ts) — these tests never assert anything about
// React.

function taxSummary() {
  return { year: '2026', grossIncome: 0, operatingExpenses: 0, transactionCount: 0, hasManualRecord: false }
}

function baseInput(overrides: Partial<PropertyPerformanceInput> = {}): PropertyPerformanceInput {
  return {
    propertyId: 'p1',
    estimatedValue: 350000,
    propertyMonthlyRentFallback: 0,
    propertyMortgageBalanceFallback: 0,
    activeLease: null,
    mortgage: null,
    financingStatus: 'Unknown',
    taxYearSummary: taxSummary(),
    ...overrides,
  }
}

describe('normalizeFinancingStatus — defensive boundary', () => {
  it('passes through each of the 4 known values unchanged', () => {
    expect(normalizeFinancingStatus('Active Mortgage')).toBe('Active Mortgage')
    expect(normalizeFinancingStatus('Paid Off')).toBe('Paid Off')
    expect(normalizeFinancingStatus('No Mortgage')).toBe('No Mortgage')
    expect(normalizeFinancingStatus('Unknown')).toBe('Unknown')
  })

  it('null, undefined, empty string, and any unexpected value all collapse to Unknown — never silently read as Paid Off/No Mortgage', () => {
    expect(normalizeFinancingStatus(null)).toBe('Unknown')
    expect(normalizeFinancingStatus(undefined)).toBe('Unknown')
    expect(normalizeFinancingStatus('')).toBe('Unknown')
    expect(normalizeFinancingStatus('paid off')).toBe('Unknown') // wrong case is NOT trusted
    expect(normalizeFinancingStatus('something-unexpected')).toBe('Unknown')
  })
})

describe('14. Missing is different from a known zero', () => {
  it('resolveMortgageBalance: no mortgage row + Unknown financing status stays unavailable, never $0', () => {
    const balance = resolveMortgageBalance(null, 0, 'Unknown')
    expect(balance.status).toBe('unavailable')
    expect(balance.value).toBeNull()
  })

  it('resolveMortgageBalance: no mortgage row + Paid Off financing status IS a confirmed $0 — a different status/source, not the same "unavailable"', () => {
    const missing = resolveMortgageBalance(null, 0, 'Unknown')
    const confirmed = resolveMortgageBalance(null, 0, 'Paid Off')
    expect(missing.status).toBe('unavailable')
    expect(confirmed.status).toBe('available')
    expect(confirmed.value).toBe(0)
    expect(confirmed.source).toBe('financing_status_confirmed')
    expect(missing.source).not.toBe('financing_status_confirmed')
  })
})

describe('8-9. Paid Off / No Mortgage produce known $0 mortgage/debt-service semantics', () => {
  it.each(['Paid Off', 'No Mortgage'] as const)('%s: mortgage balance is a confirmed, available $0 with no mortgage row', (status) => {
    const balance = resolveMortgageBalance(null, 0, status)
    expect(balance.status).toBe('available')
    expect(balance.value).toBe(0)
    expect(balance.source).toBe('financing_status_confirmed')
    expect(balance.notes?.some((n) => n.includes(status))).toBe(true)
  })

  it.each(['Paid Off', 'No Mortgage'] as const)('%s: monthly debt service is a confirmed, available $0 with no mortgage row', (status) => {
    const debtService = resolveMonthlyDebtService(null, status)
    expect(debtService.status).toBe('available')
    expect(debtService.value).toBe(0)
    expect(debtService.source).toBe('financing_status_confirmed')
  })

  it.each(['Paid Off', 'No Mortgage'] as const)('%s: takes precedence over a leftover/stale mortgage row that should have been removed', (status) => {
    const balance = resolveMortgageBalance({ currentBalance: 180000, monthlyPayment: 1200 }, 0, status)
    const debtService = resolveMonthlyDebtService({ currentBalance: 180000, monthlyPayment: 1200 }, status)
    expect(balance.value).toBe(0)
    expect(debtService.value).toBe(0)
  })
})

describe('10. Paid Off + valid Estimated Value produces Estimated Equity equal to value — decided by the engine, not React', () => {
  it('equity falls out of the existing resolveEquity() formula automatically once mortgageBalance is a confirmed $0 — no special-cased equity logic added', () => {
    const result = computePropertyPerformance(baseInput({ estimatedValue: 350000, financingStatus: 'Paid Off' }))
    expect(result.mortgageBalance.value).toBe(0)
    expect(result.equity.status).toBe('available')
    expect(result.equity.value).toBe(350000)
  })

  it('the same is true for No Mortgage', () => {
    const result = computePropertyPerformance(baseInput({ estimatedValue: 275000, financingStatus: 'No Mortgage' }))
    expect(result.equity.value).toBe(275000)
  })
})

describe('11. No Mortgage + valid annual NOI produces Net Cash Flow without inventing mortgage payments', () => {
  it('netCashFlowMonthly falls out of the existing resolveNetCashFlow() formula automatically once monthlyDebtService is a confirmed $0 — equals annual NOI / 12 exactly, no invented payment', () => {
    const result = computePropertyPerformance(baseInput({
      financingStatus: 'No Mortgage',
      taxYearSummary: { year: '2025', grossIncome: 30000, operatingExpenses: 6000, transactionCount: 24, hasManualRecord: false },
    }), new Date('2026-06-01T00:00:00Z'))
    expect(result.period.isYearComplete).toBe(true)
    expect(result.noiAnnual.status).toBe('available')
    expect(result.noiAnnual.value).toBe(24000)
    expect(result.monthlyDebtService.value).toBe(0)
    expect(result.netCashFlowMonthly.status).toBe('available')
    expect(result.netCashFlowMonthly.value).toBeCloseTo(24000 / 12, 6) // 2000 — NOI/12 minus zero debt service
  })
})

describe('12. Active Mortgage never assumes zero balance/debt service', () => {
  it('with no mortgage row on file, balance and debt service stay unavailable — never inferred as $0 just because the status says financed', () => {
    const result = computePropertyPerformance(baseInput({ financingStatus: 'Active Mortgage' }))
    expect(result.mortgageBalance.status).toBe('unavailable')
    expect(result.mortgageBalance.value).toBeNull()
    expect(result.monthlyDebtService.status).toBe('unavailable')
    expect(result.equity.status).toBe('unavailable') // depends on a real mortgage balance
  })

  it('with a real mortgage row on file, behaves exactly as before Phase C.2 (unaffected by financingStatus)', () => {
    const result = computePropertyPerformance(baseInput({
      financingStatus: 'Active Mortgage',
      mortgage: { currentBalance: 240000, monthlyPayment: 1600 },
    }))
    expect(result.mortgageBalance.value).toBe(240000)
    expect(result.mortgageBalance.source).toBe('mortgage_record')
    expect(result.monthlyDebtService.value).toBe(1600)
  })
})

describe('13. Unknown financing status never assumes zero', () => {
  it('behaves identically to the pre-Phase-C.2 engine — unavailable with no mortgage row, real values when one exists', () => {
    const noMortgage = computePropertyPerformance(baseInput({ financingStatus: 'Unknown' }))
    expect(noMortgage.mortgageBalance.status).toBe('unavailable')
    expect(noMortgage.monthlyDebtService.status).toBe('unavailable')

    const withMortgage = computePropertyPerformance(baseInput({
      financingStatus: 'Unknown',
      mortgage: { currentBalance: 150000, monthlyPayment: 1100 },
    }))
    expect(withMortgage.mortgageBalance.value).toBe(150000)
  })

  it('a null/missing financing_status normalizes to Unknown and behaves the same way', () => {
    const result = computePropertyPerformance(baseInput({ financingStatus: normalizeFinancingStatus(null) }))
    expect(result.mortgageBalance.status).toBe('unavailable')
  })
})

describe('resolve.ts: financing_status flows from the raw property row into the engine', () => {
  function property(overrides: Partial<PropertyRow> = {}): PropertyRow {
    return {
      id: 'p1', address: '1 Main St', city: 'Columbus', property_type: 'Rental Property',
      estimated_value: 350000, monthly_rent: 0, mortgage_balance: 0,
      ...overrides,
    }
  }

  it('a property row with financing_status "Paid Off" produces a confirmed $0 mortgage balance end to end', () => {
    const input = buildPropertyPerformanceInput({
      property: property({ financing_status: 'Paid Off' }),
      leases: [], currentMortgage: null, yearTransactions: [], yearMaintenanceRecords: [], taxRecord: null,
    })
    expect(input.financingStatus).toBe('Paid Off')
    const result = computePropertyPerformance(input)
    expect(result.mortgageBalance.value).toBe(0)
    expect(result.equity.value).toBe(350000)
  })

  it('a property row with no financing_status at all normalizes to Unknown, not a crash or a false zero', () => {
    const input = buildPropertyPerformanceInput({
      property: property(),
      leases: [], currentMortgage: null, yearTransactions: [], yearMaintenanceRecords: [], taxRecord: null,
    })
    expect(input.financingStatus).toBe('Unknown')
    const result = computePropertyPerformance(input)
    expect(result.mortgageBalance.status).toBe('unavailable')
  })
})
