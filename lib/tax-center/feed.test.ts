import { describe, expect, it } from 'vitest'
import {
  resolveTransactionSource, buildTaxCenterFeed, computeTaxCenterYearSummary, filterTaxCenterFeed, groupFeedByMonth,
  type TaxCenterFeedTransactionInput, type TaxCenterFeedItem,
} from './feed'

function tx(overrides: Partial<TaxCenterFeedTransactionInput>): TaxCenterFeedTransactionInput {
  return {
    id: 't1', property_id: 'p1', transaction_date: '2026-09-12', transaction_type: 'Expense',
    category: 'Repairs', amount: 184.27, document_id: null, vendor: null, description: '',
    ...overrides,
  }
}

describe('resolveTransactionSource', () => {
  it('is "manual" when no rent_payments or maintenance_records row links to it', () => {
    expect(resolveTransactionSource('t1', [], [])).toBe('manual')
    expect(resolveTransactionSource('t1', [{ financial_transaction_id: 'other' }], [{ financial_transaction_id: null }])).toBe('manual')
  })

  it('is "rent-ledger" when a rent_payments row links to it', () => {
    expect(resolveTransactionSource('t1', [{ financial_transaction_id: 't1' }], [])).toBe('rent-ledger')
  })

  it('is "maintenance" when a maintenance_records row links to it', () => {
    expect(resolveTransactionSource('t1', [], [{ financial_transaction_id: 't1' }])).toBe('maintenance')
  })

  it('prefers rent-ledger if (implausibly) both links existed, rather than picking arbitrarily', () => {
    expect(resolveTransactionSource('t1', [{ financial_transaction_id: 't1' }], [{ financial_transaction_id: 't1' }])).toBe('rent-ledger')
  })
})

describe('buildTaxCenterFeed', () => {
  const propertyLabelById = new Map([['p1', '5558 Pats Point'], ['p2', '148 Maple Street']])

  it('falls back to the category when description is blank — a feed row is never left with nothing to show', () => {
    const feed = buildTaxCenterFeed([tx({ description: '', category: 'Repairs & Maintenance' })], propertyLabelById, [], [])
    expect(feed[0].description).toBe('Repairs & Maintenance')
  })

  it('uses the real description when one exists, never overridden by category', () => {
    const feed = buildTaxCenterFeed([tx({ description: 'Home Depot', category: 'Repairs' })], propertyLabelById, [], [])
    expect(feed[0].description).toBe('Home Depot')
  })

  it('resolves the property label from the lookup map, "Unknown property" if the id is missing from it', () => {
    const feed = buildTaxCenterFeed([tx({ property_id: 'p1' }), tx({ id: 't2', property_id: 'p9' })], propertyLabelById, [], [])
    expect(feed[0].propertyLabel).toBe('5558 Pats Point')
    expect(feed[1].propertyLabel).toBe('Unknown property')
  })

  it('hasReceipt is true only when document_id is set', () => {
    const feed = buildTaxCenterFeed([tx({ document_id: 'doc-1' }), tx({ id: 't2', document_id: null })], propertyLabelById, [], [])
    expect(feed.find((f) => f.id === 't1')!.hasReceipt).toBe(true)
    expect(feed.find((f) => f.id === 't2')!.hasReceipt).toBe(false)
  })

  it('carries the correct source label per item, in the same batch (three same-shape transactions, three different sources)', () => {
    const items = [
      tx({ id: 'rent-tx', category: 'Rent', transaction_type: 'Income' }),
      tx({ id: 'maint-tx', category: 'Maintenance' }),
      tx({ id: 'manual-tx', category: 'Repairs' }),
    ]
    const feed = buildTaxCenterFeed(items, propertyLabelById, [{ financial_transaction_id: 'rent-tx' }], [{ financial_transaction_id: 'maint-tx' }])
    expect(feed.find((f) => f.id === 'rent-tx')!.source).toBe('rent-ledger')
    expect(feed.find((f) => f.id === 'maint-tx')!.source).toBe('maintenance')
    expect(feed.find((f) => f.id === 'manual-tx')!.source).toBe('manual')
  })

  it('sorts newest first', () => {
    const feed = buildTaxCenterFeed(
      [tx({ id: 'old', transaction_date: '2026-01-05' }), tx({ id: 'new', transaction_date: '2026-09-12' }), tx({ id: 'mid', transaction_date: '2026-05-01' })],
      propertyLabelById, [], [],
    )
    expect(feed.map((f) => f.id)).toEqual(['new', 'mid', 'old'])
  })
})

describe('computeTaxCenterYearSummary', () => {
  function feedItem(overrides: Partial<TaxCenterFeedItem>): TaxCenterFeedItem {
    return {
      id: 'i1', description: 'x', amount: 100, type: 'Expense', propertyId: 'p1', propertyLabel: 'X',
      date: '2026-01-01', category: 'Repairs', vendor: null, source: 'manual', hasReceipt: false,
      ...overrides,
    }
  }

  it('sums income and expenses separately, net = income - expenses', () => {
    const summary = computeTaxCenterYearSummary([
      feedItem({ type: 'Income', amount: 2450 }),
      feedItem({ type: 'Expense', amount: 184.27 }),
      feedItem({ type: 'Expense', amount: 65.73 }),
    ])
    expect(summary.income).toBe(2450)
    expect(summary.expenses).toBeCloseTo(250)
    expect(summary.net).toBeCloseTo(2200)
  })

  it('receiptCount counts only items with hasReceipt true, across both income and expense', () => {
    const summary = computeTaxCenterYearSummary([
      feedItem({ type: 'Income', hasReceipt: true }),
      feedItem({ type: 'Expense', hasReceipt: true }),
      feedItem({ type: 'Expense', hasReceipt: false }),
    ])
    expect(summary.receiptCount).toBe(2)
  })

  it('an empty feed produces all zeros, never NaN/undefined', () => {
    const summary = computeTaxCenterYearSummary([])
    expect(summary).toEqual({ income: 0, expenses: 0, net: 0, receiptCount: 0 })
  })
})

describe('filterTaxCenterFeed', () => {
  const items: TaxCenterFeedItem[] = [
    { id: '1', description: 'Rent', amount: 2450, type: 'Income', propertyId: 'p1', propertyLabel: 'A', date: '2026-09-01', category: 'Rent', vendor: null, source: 'rent-ledger', hasReceipt: false },
    { id: '2', description: 'Home Depot', amount: 184.27, type: 'Expense', propertyId: 'p1', propertyLabel: 'A', date: '2026-09-12', category: 'Repairs', vendor: 'Home Depot', source: 'manual', hasReceipt: true },
    { id: '3', description: 'HVAC service', amount: 320, type: 'Expense', propertyId: 'p2', propertyLabel: 'B', date: '2026-09-09', category: 'Maintenance', vendor: null, source: 'maintenance', hasReceipt: false },
  ]

  it('an empty filters object returns the feed unchanged', () => {
    expect(filterTaxCenterFeed(items, {})).toEqual(items)
  })

  it('filters by property', () => {
    expect(filterTaxCenterFeed(items, { propertyId: 'p1' }).map((i) => i.id)).toEqual(['1', '2'])
  })

  it('filters by type', () => {
    expect(filterTaxCenterFeed(items, { type: 'Expense' }).map((i) => i.id)).toEqual(['2', '3'])
  })

  it('filters by category', () => {
    expect(filterTaxCenterFeed(items, { category: 'Repairs' }).map((i) => i.id)).toEqual(['2'])
  })

  it('filters by receipt status: attached', () => {
    expect(filterTaxCenterFeed(items, { receiptStatus: 'attached' }).map((i) => i.id)).toEqual(['2'])
  })

  it('filters by receipt status: missing', () => {
    expect(filterTaxCenterFeed(items, { receiptStatus: 'missing' }).map((i) => i.id)).toEqual(['1', '3'])
  })

  it('combines filters (AND, not OR)', () => {
    expect(filterTaxCenterFeed(items, { propertyId: 'p1', type: 'Expense' }).map((i) => i.id)).toEqual(['2'])
  })
})

describe('groupFeedByMonth', () => {
  function feedItem(overrides: Partial<TaxCenterFeedItem>): TaxCenterFeedItem {
    return {
      id: 'i1', description: 'x', amount: 100, type: 'Expense', propertyId: 'p1', propertyLabel: 'X',
      date: '2026-01-01', category: 'Repairs', vendor: null, source: 'manual', hasReceipt: false,
      ...overrides,
    }
  }

  it('an empty feed produces no groups', () => {
    expect(groupFeedByMonth([])).toEqual([])
  })

  it('a single month produces a single group with a readable label', () => {
    const groups = groupFeedByMonth([feedItem({ id: '1', date: '2026-09-12' }), feedItem({ id: '2', date: '2026-09-01' })])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ key: '2026-09', label: 'September 2026' })
    expect(groups[0].items.map((i) => i.id)).toEqual(['1', '2'])
  })

  it('groups newest month first, matching an already newest-first input feed — never re-sorts within or across groups', () => {
    const groups = groupFeedByMonth([
      feedItem({ id: 'sep-new', date: '2026-09-12' }),
      feedItem({ id: 'sep-old', date: '2026-09-01' }),
      feedItem({ id: 'aug', date: '2026-08-20' }),
      feedItem({ id: 'jan', date: '2026-01-05' }),
    ])
    expect(groups.map((g) => g.label)).toEqual(['September 2026', 'August 2026', 'January 2026'])
    expect(groups[0].items.map((i) => i.id)).toEqual(['sep-new', 'sep-old'])
    expect(groups[1].items.map((i) => i.id)).toEqual(['aug'])
    expect(groups[2].items.map((i) => i.id)).toEqual(['jan'])
  })

  it('respects whatever order the input feed is already in — grouping never introduces its own sort', () => {
    // Deliberately NOT newest-first input — proves grouping is a pure
    // bucket-by-month, not a second ordering decision.
    const groups = groupFeedByMonth([
      feedItem({ id: 'jan', date: '2026-01-05' }),
      feedItem({ id: 'sep', date: '2026-09-12' }),
    ])
    expect(groups.map((g) => g.key)).toEqual(['2026-01', '2026-09'])
  })
})
