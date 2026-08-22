import { describe, expect, it } from 'vitest'
import {
  CUSTOM_ITEM_GROUPS, CUSTOM_ITEM_GROUP_LABELS,
  customItemsForGroup, customItemsForProperty, sumCustomItems,
  operatingExpenseCustomItemsTotal, capitalCustomItemsTotal, financingCustomItemsTotal,
  isOperatingExpenseLikeGroup, type CustomTaxItem,
} from './custom-items'

function item(overrides: Partial<CustomTaxItem> = {}): CustomTaxItem {
  return {
    id: 'item-1', propertyId: 'p1', taxYear: 2026, description: 'Custom item',
    amount: 100, group: 'operatingExpense', notes: null, documentId: null,
    ...overrides,
  }
}

describe('CUSTOM_ITEM_GROUPS / CUSTOM_ITEM_GROUP_LABELS', () => {
  it('lists exactly the 7 groups the spec allows for a custom item — never "income"', () => {
    expect(CUSTOM_ITEM_GROUPS.sort()).toEqual(['operatingExpense', 'professional', 'travel', 'meals', 'financing', 'capital', 'other'].sort())
    expect(CUSTOM_ITEM_GROUPS).not.toContain('income')
  })

  it('every group has a human-readable label', () => {
    for (const group of CUSTOM_ITEM_GROUPS) {
      expect(typeof CUSTOM_ITEM_GROUP_LABELS[group]).toBe('string')
      expect(CUSTOM_ITEM_GROUP_LABELS[group].length).toBeGreaterThan(0)
    }
  })
})

describe('customItemsForProperty', () => {
  it('filters to one property AND one tax year', () => {
    const items = [
      item({ id: 'a', propertyId: 'p1', taxYear: 2026 }),
      item({ id: 'b', propertyId: 'p1', taxYear: 2025 }),
      item({ id: 'c', propertyId: 'p2', taxYear: 2026 }),
    ]
    expect(customItemsForProperty(items, 'p1', 2026).map((i) => i.id)).toEqual(['a'])
  })

  it('accepts the tax year as a string or a number identically', () => {
    const items = [item({ id: 'a', propertyId: 'p1', taxYear: 2026 })]
    expect(customItemsForProperty(items, 'p1', '2026').map((i) => i.id)).toEqual(['a'])
    expect(customItemsForProperty(items, 'p1', 2026).map((i) => i.id)).toEqual(['a'])
  })
})

describe('customItemsForGroup / sumCustomItems', () => {
  it('filters by group and sums only that group\'s amounts', () => {
    const items = [
      item({ id: 'a', group: 'capital', amount: 1000 }),
      item({ id: 'b', group: 'operatingExpense', amount: 200 }),
      item({ id: 'c', group: 'capital', amount: 500 }),
    ]
    expect(sumCustomItems(customItemsForGroup(items, 'capital'))).toBe(1500)
    expect(sumCustomItems(customItemsForGroup(items, 'operatingExpense'))).toBe(200)
  })

  it('sums to 0 for an empty list — never fabricates a total', () => {
    expect(sumCustomItems([])).toBe(0)
  })
})

describe('isOperatingExpenseLikeGroup', () => {
  it('operatingExpense / professional / travel / meals / other all count as operating-expense-like', () => {
    for (const group of ['operatingExpense', 'professional', 'travel', 'meals', 'other'] as const) {
      expect(isOperatingExpenseLikeGroup(group)).toBe(true)
    }
  })

  it('financing and capital are excluded — never operating-expense-like', () => {
    expect(isOperatingExpenseLikeGroup('financing')).toBe(false)
    expect(isOperatingExpenseLikeGroup('capital')).toBe(false)
  })
})

describe('operatingExpenseCustomItemsTotal / capitalCustomItemsTotal / financingCustomItemsTotal — mutually exclusive buckets', () => {
  const items = [
    item({ id: 'opex', group: 'operatingExpense', amount: 100 }),
    item({ id: 'prof', group: 'professional', amount: 50 }),
    item({ id: 'travel', group: 'travel', amount: 30 }),
    item({ id: 'meals', group: 'meals', amount: 20 }),
    item({ id: 'other', group: 'other', amount: 10 }),
    item({ id: 'financing', group: 'financing', amount: 500 }),
    item({ id: 'capital', group: 'capital', amount: 3000 }),
  ]

  it('operatingExpenseCustomItemsTotal sums exactly the 5 operating-expense-like groups', () => {
    expect(operatingExpenseCustomItemsTotal(items)).toBe(100 + 50 + 30 + 20 + 10)
  })

  it('capitalCustomItemsTotal sums only the capital group', () => {
    expect(capitalCustomItemsTotal(items)).toBe(3000)
  })

  it('financingCustomItemsTotal sums only the financing group', () => {
    expect(financingCustomItemsTotal(items)).toBe(500)
  })

  it('the three totals never overlap — every item is counted in exactly one of them', () => {
    const totalAcrossBuckets = operatingExpenseCustomItemsTotal(items) + capitalCustomItemsTotal(items) + financingCustomItemsTotal(items)
    expect(totalAcrossBuckets).toBe(sumCustomItems(items)) // no item counted twice, none dropped
  })
})
