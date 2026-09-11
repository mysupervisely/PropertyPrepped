import { describe, expect, it } from 'vitest'
import { buildPropertyPerformanceInput, type LeaseRow, type PropertyRow } from './resolve'
import { computePropertyPerformance } from './calculate'
import { emptyManualFields, emptyMileageFields } from '../tax-center/manual-entry'
import type { TransactionInput } from '../tax-center/types'

function property(overrides: Partial<PropertyRow> = {}): PropertyRow {
  return {
    id: 'prop-1',
    address: '123 Main St',
    city: 'Columbus',
    property_type: 'Rental Property',
    estimated_value: 400000,
    monthly_rent: 1800,
    mortgage_balance: 250000,
    ...overrides,
  }
}

function lease(overrides: Partial<LeaseRow> = {}): LeaseRow {
  return {
    id: 'lease-1',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    monthly_rent: 2200,
    ...overrides,
  }
}

function tx(overrides: Partial<TransactionInput> = {}): TransactionInput {
  return {
    id: 'tx-1',
    property_id: 'prop-1',
    transaction_date: '2026-02-01',
    transaction_type: 'Income',
    category: 'Rent',
    amount: 2200,
    document_id: null,
    ...overrides,
  }
}

describe('buildPropertyPerformanceInput — source resolution', () => {
  it('reuses selectCurrentLease to pick the active lease, not just the first row', () => {
    const now = new Date('2026-06-01T12:00:00Z')
    const expired = lease({ id: 'lease-old', start_date: '2024-01-01', end_date: '2024-12-31', monthly_rent: 1500 })
    const active = lease({ id: 'lease-current', start_date: '2026-01-01', end_date: '2026-12-31', monthly_rent: 2200 })
    const input = buildPropertyPerformanceInput({
      property: property(),
      leases: [expired, active],
      currentMortgage: null,
      yearTransactions: [],
      yearMaintenanceRecords: [],
      taxRecord: null,
      now,
    })
    expect(input.activeLease).toEqual({ id: 'lease-current', monthlyRent: 2200 })
  })

  it('falls back to the property row\'s monthly_rent when no lease is active', () => {
    const input = buildPropertyPerformanceInput({
      property: property({ monthly_rent: 1900 }),
      leases: [],
      currentMortgage: null,
      yearTransactions: [],
      yearMaintenanceRecords: [],
      taxRecord: null,
    })
    expect(input.activeLease).toBeNull()
    expect(input.propertyMonthlyRentFallback).toBe(1900)
  })

  it('passes through the caller-selected current mortgage row unchanged (does not re-sort or pick among multiple itself)', () => {
    const input = buildPropertyPerformanceInput({
      property: property(),
      leases: [],
      currentMortgage: { current_balance: 275000, monthly_payment: 1950 },
      yearTransactions: [],
      yearMaintenanceRecords: [],
      taxRecord: null,
    })
    expect(input.mortgage).toEqual({ currentBalance: 275000, monthlyPayment: 1950 })
  })

  it('leaves mortgage null when no current mortgage is passed — never invents a $0 mortgage', () => {
    const input = buildPropertyPerformanceInput({
      property: property(),
      leases: [],
      currentMortgage: null,
      yearTransactions: [],
      yearMaintenanceRecords: [],
      taxRecord: null,
    })
    expect(input.mortgage).toBeNull()
  })

  it('defaults the tax year to now\'s calendar year, and can be overridden explicitly', () => {
    const now = new Date('2026-03-01T00:00:00Z')
    const defaulted = buildPropertyPerformanceInput({
      property: property(), leases: [], currentMortgage: null,
      yearTransactions: [], yearMaintenanceRecords: [], taxRecord: null, now,
    })
    expect(defaulted.taxYearSummary.year).toBe('2026')

    const overridden = buildPropertyPerformanceInput({
      property: property(), leases: [], currentMortgage: null,
      yearTransactions: [], yearMaintenanceRecords: [], taxRecord: null, now, year: '2025',
    })
    expect(overridden.taxYearSummary.year).toBe('2025')
  })

  it('builds taxYearSummary from computePropertyTaxSummary\'s real resolved totals — reuses Tax Center\'s manual-replaces-tracked rule rather than re-summing', () => {
    const transactions = [
      tx({ id: 't1', transaction_type: 'Income', category: 'Rent', amount: 2200 }),
      tx({ id: 't2', transaction_type: 'Expense', category: 'Repairs', amount: 400 }),
    ]
    // A manual Tax Center entry of $900 for Repairs REPLACES the $400
    // tracked from the ledger — the resolved total must be $900, not
    // $1,300 (Phase A Section 5's double-counting audit).
    const taxRecord = { ...emptyManualFields(), ...emptyMileageFields(), notes: null, document_id: null, repairs: 900 }
    const input = buildPropertyPerformanceInput({
      property: property(), leases: [], currentMortgage: null,
      yearTransactions: transactions, yearMaintenanceRecords: [], taxRecord,
    })
    expect(input.taxYearSummary.operatingExpenses).toBe(900)
    expect(input.taxYearSummary.grossIncome).toBe(2200)
    expect(input.taxYearSummary.transactionCount).toBe(2)
    expect(input.taxYearSummary.hasManualRecord).toBe(true)
  })

  it('only counts this property\'s transactions even when a mixed-property list is passed (computePropertyTaxSummary\'s own property_id filter)', () => {
    const transactions = [
      tx({ id: 't1', property_id: 'prop-1', category: 'Rent', amount: 2200 }),
      tx({ id: 't2', property_id: 'prop-OTHER', category: 'Rent', amount: 9999 }),
    ]
    const input = buildPropertyPerformanceInput({
      property: property({ id: 'prop-1' }), leases: [], currentMortgage: null,
      yearTransactions: transactions, yearMaintenanceRecords: [], taxRecord: null,
    })
    expect(input.taxYearSummary.grossIncome).toBe(2200)
    expect(input.taxYearSummary.transactionCount).toBe(1)
  })
})

describe('buildPropertyPerformanceInput + computePropertyPerformance — end to end', () => {
  it('a fully-populated property resolves from raw rows to a trustworthy, all-available snapshot with no crash', () => {
    const now = new Date('2026-06-15T00:00:00Z')
    const input = buildPropertyPerformanceInput({
      property: property({ estimated_value: 400000 }),
      leases: [lease({ monthly_rent: 2200 })],
      currentMortgage: { current_balance: 250000, monthly_payment: 1800 },
      yearTransactions: [
        tx({ id: 't1', transaction_type: 'Income', category: 'Rent', amount: 2200, transaction_date: '2026-01-01' }),
        tx({ id: 't2', transaction_type: 'Income', category: 'Rent', amount: 2200, transaction_date: '2026-02-01' }),
        tx({ id: 't3', transaction_type: 'Expense', category: 'Repairs', amount: 350, transaction_date: '2026-02-10' }),
      ],
      yearMaintenanceRecords: [],
      taxRecord: null,
      now,
    })
    const result = computePropertyPerformance(input, now)

    expect(result.estimatedValue.value).toBe(400000)
    expect(result.contractMonthlyRent.value).toBe(2200)
    expect(result.actualIncomeYtd.value).toBe(4400)
    expect(result.operatingExpensesYtd.value).toBe(350)
    expect(result.mortgageBalance.value).toBe(250000)
    expect(result.monthlyDebtService.value).toBe(1800)
    expect(result.equity.value).toBe(150000)
    expect(result.noiAnnual.status).toBe('available')
    expect(result.capRatePercent.status).toBe('available')
    expect(result.netCashFlowMonthly.status).toBe('available')
  })

  it('a brand-new property (nothing but an address and a value) resolves without throwing, mostly unavailable', () => {
    const input = buildPropertyPerformanceInput({
      property: property({ estimated_value: 300000, monthly_rent: 0, mortgage_balance: 0 }),
      leases: [],
      currentMortgage: null,
      yearTransactions: [],
      yearMaintenanceRecords: [],
      taxRecord: null,
    })
    const result = computePropertyPerformance(input)
    expect(result.estimatedValue.status).toBe('available')
    expect(result.contractMonthlyRent.status).toBe('unavailable')
    expect(result.mortgageBalance.status).toBe('unavailable')
    expect(result.equity.status).toBe('unavailable')
  })
})
