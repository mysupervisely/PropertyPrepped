import { describe, expect, it } from 'vitest'
import { computePropertyReadiness, countUnassignedTaxDocuments } from './readiness'
import type { MaintenanceRecordInput, TransactionInput } from './types'

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
    expect(result.items[0]).toMatch(/no income or expense records/i)
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
