import { describe, expect, it } from 'vitest'
import { computePropertyReadiness, countUnassignedTaxDocuments } from './readiness'
import { emptyManualFields } from './manual-entry'
import type { MaintenanceRecordInput, TaxRecordInput, TransactionInput } from './types'

function taxRecord(overrides: Partial<TaxRecordInput> = {}): TaxRecordInput {
  return { ...emptyManualFields(), notes: null, document_id: null, ...overrides }
}

function tx(overrides: Partial<TransactionInput> = {}): TransactionInput {
  return {
    id: 'tx1', property_id: 'p1', transaction_date: '2026-03-01', transaction_type: 'Expense',
    category: 'Repairs', amount: 100, document_id: 'doc1',
    ...overrides,
  }
}

describe('computePropertyReadiness', () => {
  it('is "Missing Information" when there are no records at all for the year', () => {
    const result = computePropertyReadiness([], [])
    expect(result.status).toBe('Missing Information')
    expect(result.items[0]).toMatch(/no income, expense, or manual tax records/i)
  })

  it('is "Ready" when every expense is categorized and documented', () => {
    const result = computePropertyReadiness([tx(), tx({ id: 'tx2', category: 'Insurance' })], [])
    expect(result).toEqual({ status: 'Ready', items: [] })
  })

  it('flags expenses categorized as "Other" without being scary about it', () => {
    const result = computePropertyReadiness([tx({ category: 'Other' })], [])
    expect(result.status).toBe('Needs Review')
    expect(result.items[0]).toContain('1 expense')
    expect(result.items[0].toLowerCase()).not.toMatch(/warning|error|fail/)
  })

  it('flags expenses with no attached document/receipt', () => {
    const result = computePropertyReadiness([tx({ document_id: null })], [])
    expect(result.status).toBe('Needs Review')
    expect(result.items[0]).toContain('receipt')
  })

  it('never flags income transactions for missing receipts', () => {
    const result = computePropertyReadiness([tx({ transaction_type: 'Income', category: 'Rent', document_id: null })], [])
    expect(result.status).toBe('Ready')
  })

  it('flags a renovation logged under an ordinary expense category instead of CapEx', () => {
    const renovationTx = tx({ id: 'tx-renovation', category: 'Maintenance' })
    const maintenance: MaintenanceRecordInput[] = [{ id: 'm1', property_id: 'p1', service_date: '2026-03-01', category: 'Renovation', financial_transaction_id: 'tx-renovation' }]
    const result = computePropertyReadiness([renovationTx], maintenance)
    expect(result.status).toBe('Needs Review')
    expect(result.items.some((i) => i.includes('capital improvement'))).toBe(true)
  })

  it('does NOT flag a renovation that was correctly logged as CapEx', () => {
    const renovationTx = tx({ id: 'tx-renovation', category: 'CapEx' })
    const maintenance: MaintenanceRecordInput[] = [{ id: 'm1', property_id: 'p1', service_date: '2026-03-01', category: 'Renovation', financial_transaction_id: 'tx-renovation' }]
    const result = computePropertyReadiness([renovationTx], maintenance)
    expect(result.status).toBe('Ready')
  })

  it('does not flag a non-renovation maintenance record at all', () => {
    const repairTx = tx({ id: 'tx-repair', category: 'Repairs' })
    const maintenance: MaintenanceRecordInput[] = [{ id: 'm1', property_id: 'p1', service_date: '2026-03-01', category: 'Repair', financial_transaction_id: 'tx-repair' }]
    const result = computePropertyReadiness([repairTx], maintenance)
    expect(result.status).toBe('Ready')
  })

  it('can report multiple distinct gaps at once', () => {
    const result = computePropertyReadiness([tx({ category: 'Other', document_id: null })], [])
    expect(result.items.length).toBe(2)
  })
})

describe('countUnassignedTaxDocuments', () => {
  it('counts only Tax-category documents with no property assigned', () => {
    const docs = [
      { id: 'd1', property_id: null, category: 'Tax' },
      { id: 'd2', property_id: 'p1', category: 'Tax' },
      { id: 'd3', property_id: null, category: 'Receipts' },
    ]
    expect(countUnassignedTaxDocuments(docs)).toBe(1)
  })

  it('is 0 when there are none', () => {
    expect(countUnassignedTaxDocuments([])).toBe(0)
  })
})

describe('computePropertyReadiness — Tax Center V2 manual records', () => {
  it('a property with no ledger transactions but a manual tax record is NOT "Missing Information"', () => {
    const result = computePropertyReadiness([], [], taxRecord({ rental_income: 24000 }))
    expect(result.status).not.toBe('Missing Information')
  })

  it('flags mortgage interest as worth entering only when mortgage payments were actually logged this year', () => {
    const mortgageTx: TransactionInput = { id: 'tx1', property_id: 'p1', transaction_date: '2026-01-01', transaction_type: 'Expense', category: 'Mortgage', amount: 1800, document_id: null }
    const result = computePropertyReadiness([mortgageTx], [], null)
    expect(result.status).toBe('Needs Review')
    expect(result.items.some((i) => i.toLowerCase().includes('mortgage interest'))).toBe(true)
  })

  it('does NOT flag missing mortgage interest when there is no mortgage activity at all', () => {
    const rentTx: TransactionInput = { id: 'tx1', property_id: 'p1', transaction_date: '2026-01-01', transaction_type: 'Income', category: 'Rent', amount: 2000, document_id: null }
    const result = computePropertyReadiness([rentTx], [], null)
    expect(result.items.some((i) => i.toLowerCase().includes('mortgage interest'))).toBe(false)
  })

  it('does NOT flag mortgage interest once it has been manually entered', () => {
    const mortgageTx: TransactionInput = { id: 'tx1', property_id: 'p1', transaction_date: '2026-01-01', transaction_type: 'Expense', category: 'Mortgage', amount: 1800, document_id: null }
    const result = computePropertyReadiness([mortgageTx], [], taxRecord({ mortgage_interest: 4800 }))
    expect(result.items.some((i) => i.toLowerCase().includes('mortgage interest'))).toBe(false)
  })

  it('a mortgage interest of exactly 0 counts as "entered" — never re-flagged', () => {
    const mortgageTx: TransactionInput = { id: 'tx1', property_id: 'p1', transaction_date: '2026-01-01', transaction_type: 'Expense', category: 'Mortgage', amount: 1800, document_id: null }
    const result = computePropertyReadiness([mortgageTx], [], taxRecord({ mortgage_interest: 0 }))
    expect(result.items.some((i) => i.toLowerCase().includes('mortgage interest'))).toBe(false)
  })

  it('flags a manual override entered with no supporting note or document', () => {
    const result = computePropertyReadiness([], [], taxRecord({ property_taxes: 6400 }))
    expect(result.status).toBe('Needs Review')
    expect(result.items.some((i) => i.toLowerCase().includes('note or attached document'))).toBe(true)
  })

  it('does NOT flag a manual override that has a note', () => {
    const result = computePropertyReadiness([], [], taxRecord({ property_taxes: 6400, notes: 'From county tax bill' }))
    expect(result.items.some((i) => i.toLowerCase().includes('note or attached document'))).toBe(false)
  })

  it('does NOT flag a manual override that has an attached document', () => {
    const result = computePropertyReadiness([], [], taxRecord({ property_taxes: 6400, document_id: 'doc-1' }))
    expect(result.items.some((i) => i.toLowerCase().includes('note or attached document'))).toBe(false)
  })

  it('a manual record with every field blank is never flagged for missing support (nothing to support)', () => {
    const result = computePropertyReadiness([], [], taxRecord())
    expect(result.items.some((i) => i.toLowerCase().includes('note or attached document'))).toBe(false)
  })

  it('never marks every blank manual field as an error — an otherwise-clean year with one manual entry and a note is Ready', () => {
    const rentTx: TransactionInput = { id: 'tx1', property_id: 'p1', transaction_date: '2026-01-01', transaction_type: 'Income', category: 'Rent', amount: 2000, document_id: 'doc-1' }
    const result = computePropertyReadiness([rentTx], [], taxRecord({ property_taxes: 6400, notes: 'County bill' }))
    expect(result.status).toBe('Ready')
  })
})
