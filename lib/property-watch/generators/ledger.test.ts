import { describe, expect, it } from 'vitest'
import { deriveHoaWatchDraft, deriveTaxWatchDraft, type LedgerTransactionLike } from './ledger'
import type { PropertyLike } from './lease'

const property: PropertyLike = { id: 'prop-1', owner_id: 'owner-1', address: '45 Oak Ave' }

function tx(overrides: Partial<LedgerTransactionLike>): LedgerTransactionLike {
  return { property_id: 'prop-1', transaction_date: '2026-01-15', transaction_type: 'Expense', category: 'Taxes', amount: 1000, ...overrides }
}

describe('deriveTaxWatchDraft', () => {
  it('detects a year-over-year increase', () => {
    const transactions = [
      tx({ transaction_date: '2025-11-01', amount: 6850 }),
      tx({ transaction_date: '2026-11-01', amount: 7920 }),
    ]
    const draft = deriveTaxWatchDraft(transactions, property)!
    expect(draft.category).toBe('Property Tax')
    expect(draft.status).toBe('Needs Attention')
    const meta = draft.metadata as { previousAmount: number; currentAmount: number; increasePercent: number }
    expect(meta.previousAmount).toBe(6850)
    expect(meta.currentAmount).toBe(7920)
    expect(meta.increasePercent).toBeCloseTo(15.6, 1)
    expect(draft.description).toContain('6,850')
    expect(draft.description).toContain('7,920')
  })

  it('uses careful, non-accusatory language, never "your assessment is wrong"', () => {
    const transactions = [tx({ transaction_date: '2025-01-01', amount: 1000 }), tx({ transaction_date: '2026-01-01', amount: 1500 })]
    const draft = deriveTaxWatchDraft(transactions, property)!
    expect(draft.description.toLowerCase()).not.toContain('wrong')
    expect(draft.description).toContain('may be worth reviewing')
  })

  it('sums multiple transactions within the same year before comparing', () => {
    const transactions = [
      tx({ transaction_date: '2025-06-01', amount: 3000 }),
      tx({ transaction_date: '2025-12-01', amount: 3000 }),
      tx({ transaction_date: '2026-06-01', amount: 3500 }),
      tx({ transaction_date: '2026-12-01', amount: 3500 }),
    ]
    const draft = deriveTaxWatchDraft(transactions, property)!
    const meta = draft.metadata as { previousAmount: number; currentAmount: number }
    expect(meta.previousAmount).toBe(6000)
    expect(meta.currentAmount).toBe(7000)
  })

  it('produces nothing when only one year of data exists', () => {
    expect(deriveTaxWatchDraft([tx({ transaction_date: '2026-01-01', amount: 1000 })], property)).toBeNull()
  })

  it('produces nothing when the amount did not increase', () => {
    const transactions = [tx({ transaction_date: '2025-01-01', amount: 1000 }), tx({ transaction_date: '2026-01-01', amount: 1000 })]
    expect(deriveTaxWatchDraft(transactions, property)).toBeNull()
  })

  it('ignores transactions for a different property', () => {
    const transactions = [
      tx({ transaction_date: '2025-01-01', amount: 1000, property_id: 'other-prop' }),
      tx({ transaction_date: '2026-01-01', amount: 5000, property_id: 'other-prop' }),
    ]
    expect(deriveTaxWatchDraft(transactions, property)).toBeNull()
  })

  it('ignores Income transactions in the Taxes category', () => {
    const transactions = [
      tx({ transaction_date: '2025-01-01', amount: 1000, transaction_type: 'Expense' }),
      tx({ transaction_date: '2026-01-01', amount: 1000, transaction_type: 'Expense' }),
      tx({ transaction_date: '2026-06-01', amount: 5000, transaction_type: 'Income' }),
    ]
    expect(deriveTaxWatchDraft(transactions, property)).toBeNull()
  })
})

describe('deriveHoaWatchDraft', () => {
  it('detects HOA dues increasing year over year', () => {
    const transactions = [
      tx({ category: 'HOA', transaction_date: '2025-01-01', amount: 3900 }), // $325/mo
      tx({ category: 'HOA', transaction_date: '2026-01-01', amount: 4740 }), // $395/mo
    ]
    const draft = deriveHoaWatchDraft(transactions, property)!
    expect(draft.category).toBe('HOA')
    expect(draft.title).toBe('HOA Dues Increase')
    const meta = draft.metadata as { increaseAmount: number }
    expect(meta.increaseAmount).toBe(840)
  })

  it('produces nothing when dues did not increase', () => {
    const transactions = [tx({ category: 'HOA', transaction_date: '2025-01-01', amount: 3900 }), tx({ category: 'HOA', transaction_date: '2026-01-01', amount: 3900 })]
    expect(deriveHoaWatchDraft(transactions, property)).toBeNull()
  })
})
