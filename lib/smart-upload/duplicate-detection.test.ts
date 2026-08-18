import { describe, expect, it } from 'vitest'
import { detectDuplicate, findFileDuplicate, findReceiptDuplicate } from './duplicate-detection'

describe('findFileDuplicate', () => {
  const existing = [
    { id: 'd1', name: 'invoice.pdf', size_bytes: 12345 },
    { id: 'd2', name: 'receipt.jpg', size_bytes: 98765 },
  ]

  it('matches on identical name and size', () => {
    expect(findFileDuplicate({ name: 'invoice.pdf', size: 12345 }, existing)?.id).toBe('d1')
  })

  it('does not match when only the name matches', () => {
    expect(findFileDuplicate({ name: 'invoice.pdf', size: 999 }, existing)).toBeNull()
  })

  it('does not match when only the size matches', () => {
    expect(findFileDuplicate({ name: 'other.pdf', size: 12345 }, existing)).toBeNull()
  })

  it('returns null for an empty candidate', () => {
    expect(findFileDuplicate({ name: '', size: 0 }, existing)).toBeNull()
  })

  it('returns null against an empty existing list', () => {
    expect(findFileDuplicate({ name: 'invoice.pdf', size: 12345 }, [])).toBeNull()
  })
})

describe('findReceiptDuplicate', () => {
  const existing = [
    { id: 't1', vendor: 'The Home Depot', transaction_date: '2026-03-01', amount: 184.72 },
  ]

  it('matches on vendor (case/whitespace-insensitive) + date + amount', () => {
    expect(findReceiptDuplicate({ vendor: '  the home depot  ', date: '2026-03-01', amount: 184.72 }, existing)?.id).toBe('t1')
  })

  it('matches within a cent of rounding', () => {
    expect(findReceiptDuplicate({ vendor: 'The Home Depot', date: '2026-03-01', amount: 184.7199 }, existing)?.id).toBe('t1')
  })

  it('does not match a different date', () => {
    expect(findReceiptDuplicate({ vendor: 'The Home Depot', date: '2026-03-02', amount: 184.72 }, existing)).toBeNull()
  })

  it('does not match a different amount', () => {
    expect(findReceiptDuplicate({ vendor: 'The Home Depot', date: '2026-03-01', amount: 184.73 }, existing)).toBeNull()
  })

  it('does not match a different vendor', () => {
    expect(findReceiptDuplicate({ vendor: 'Lowes', date: '2026-03-01', amount: 184.72 }, existing)).toBeNull()
  })

  it('never matches when any field is missing — no false positive from partial data', () => {
    expect(findReceiptDuplicate({ vendor: null, date: '2026-03-01', amount: 184.72 }, existing)).toBeNull()
    expect(findReceiptDuplicate({ vendor: 'The Home Depot', date: null, amount: 184.72 }, existing)).toBeNull()
    expect(findReceiptDuplicate({ vendor: 'The Home Depot', date: '2026-03-01', amount: null }, existing)).toBeNull()
  })
})

describe('detectDuplicate', () => {
  const existingDocs = [{ id: 'd1', name: 'invoice.pdf', size_bytes: 12345 }]
  const existingTx = [{ id: 't1', vendor: 'The Home Depot', transaction_date: '2026-03-01', amount: 184.72 }]

  it('prefers the file-signature match when both signals fire', () => {
    const result = detectDuplicate(
      { name: 'invoice.pdf', size: 12345 },
      { vendor: 'The Home Depot', date: '2026-03-01', amount: 184.72 },
      existingDocs, existingTx,
    )
    expect(result?.existingId).toBe('d1')
  })

  it('falls back to the receipt signature when the file signature does not match', () => {
    const result = detectDuplicate(
      { name: 'different-file.pdf', size: 999 },
      { vendor: 'The Home Depot', date: '2026-03-01', amount: 184.72 },
      existingDocs, existingTx,
    )
    expect(result?.existingId).toBe('t1')
  })

  it('returns null when neither signal fires', () => {
    const result = detectDuplicate(
      { name: 'different-file.pdf', size: 999 },
      { vendor: 'Someone Else', date: '2026-01-01', amount: 1 },
      existingDocs, existingTx,
    )
    expect(result).toBeNull()
  })
})
