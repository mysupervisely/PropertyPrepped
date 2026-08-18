import { describe, expect, it } from 'vitest'
import { extractReceiptFields, looksLikeServiceInvoice, missingReceiptFields } from './receipt-fields'

describe('extractReceiptFields — RECEIPTS vendor/date/amount extraction mapping', () => {
  it('maps vendor/date/amount/description/category from applyFields', () => {
    const fields = extractReceiptFields({ vendor: 'The Home Depot', date: '2026-08-12', amount: '184.72', cost: null, description: 'HVAC air filter', category: 'Repairs & Maintenance' })
    expect(fields).toEqual({ vendor: 'The Home Depot', date: '2026-08-12', amount: '184.72', description: 'HVAC air filter', suggestedCategory: 'Repairs & Maintenance' })
  })

  it('normalizes a "$" and "," formatted amount to a plain digit string', () => {
    const fields = extractReceiptFields({ vendor: 'Vendor', date: null, amount: '$1,250.00', cost: null, description: null, category: null })
    expect(fields.amount).toBe('1250.00')
  })

  it('falls back to cost when amount is not set (maintenance-style invoices use cost)', () => {
    const fields = extractReceiptFields({ vendor: 'Vendor', date: null, amount: null, cost: '450', description: null, category: null })
    expect(fields.amount).toBe('450')
  })

  it('every field is null when nothing was identified', () => {
    const fields = extractReceiptFields({ vendor: null, date: null, amount: null, cost: null, description: null, category: null })
    expect(fields).toEqual({ vendor: null, date: null, amount: null, description: null, suggestedCategory: null })
  })
})

describe('missingReceiptFields — RECEIPTS missing vendor/date/amount', () => {
  it('reports nothing missing when all three are present', () => {
    expect(missingReceiptFields({ vendor: 'V', date: '2026-01-01', amount: '10', description: null, suggestedCategory: null })).toEqual([])
  })
  it('reports missing vendor', () => {
    expect(missingReceiptFields({ vendor: null, date: '2026-01-01', amount: '10', description: null, suggestedCategory: null })).toEqual(['vendor'])
  })
  it('reports missing date', () => {
    expect(missingReceiptFields({ vendor: 'V', date: null, amount: '10', description: null, suggestedCategory: null })).toEqual(['date'])
  })
  it('reports missing amount when absent or zero/negative', () => {
    expect(missingReceiptFields({ vendor: 'V', date: '2026-01-01', amount: null, description: null, suggestedCategory: null })).toEqual(['amount'])
    expect(missingReceiptFields({ vendor: 'V', date: '2026-01-01', amount: '0', description: null, suggestedCategory: null })).toEqual(['amount'])
  })
  it('reports all three missing at once', () => {
    expect(missingReceiptFields({ vendor: null, date: null, amount: null, description: null, suggestedCategory: null })).toEqual(['vendor', 'date', 'amount'])
  })
})

describe('looksLikeServiceInvoice — MAINTENANCE / PropCrew association suggestion', () => {
  it('a clear HVAC service category is treated as a service invoice', () => {
    expect(looksLikeServiceInvoice({ suggestedCategory: 'HVAC', description: null })).toBe(true)
  })
  it('a plumbing repair description is treated as a service invoice even with no category', () => {
    expect(looksLikeServiceInvoice({ suggestedCategory: null, description: 'Plumbing repair under kitchen sink' })).toBe(true)
  })
  it('a plain retail purchase is NOT treated as a service invoice', () => {
    expect(looksLikeServiceInvoice({ suggestedCategory: 'Supplies', description: 'Air filter, light bulbs' })).toBe(false)
  })
  it('nothing identified is not treated as a service invoice (never force the maintenance path on missing data)', () => {
    expect(looksLikeServiceInvoice({ suggestedCategory: null, description: null })).toBe(false)
  })
})
