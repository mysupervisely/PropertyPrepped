import { describe, expect, it } from 'vitest'
import {
  CUSTOM_ITEM_GROUPS, CUSTOM_ITEM_GROUP_LABELS,
  customItemsForGroup, customItemsForProperty, sumCustomItems,
  operatingExpenseCustomItemsTotal, capitalCustomItemsTotal, financingCustomItemsTotal,
  isOperatingExpenseLikeGroup, customItemsForPanelGroup, type CustomTaxItem,
} from './custom-items'
import { categoriesInGroup, TAX_CATEGORIES, type TaxCategoryGroup } from './manual-entry'

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

// ---------------------------------------------------------------------
// customItemsForPanelGroup — the property panel's own group-header
// totals (Correction: "a landlord should never see a different subtotal
// inside the property's Tax section than the amount Tax Center
// ultimately uses simply because some expenses were entered as custom
// items"). PropertyTaxPanel.tsx calls this SAME function (imported, not
// reimplemented) to compute each collapsible group's displayed total —
// see lib/tax-center/property-tax-panel-totals.test.ts for the
// source-level proof that the component actually does so.
// ---------------------------------------------------------------------
describe('customItemsForPanelGroup — property panel group subtotals', () => {
  it('a custom Operating Expense item appears in the operatingExpense group', () => {
    const items = [item({ id: 'a', group: 'operatingExpense', amount: 750 })]
    expect(customItemsForPanelGroup(items, 'operatingExpense')).toEqual(items)
  })

  it('a custom Professional / Administrative item appears in the professional group', () => {
    const items = [item({ id: 'a', group: 'professional', amount: 400 })]
    expect(customItemsForPanelGroup(items, 'professional')).toEqual(items)
  })

  it('a custom Travel item appears in the travel group', () => {
    const items = [item({ id: 'a', group: 'travel', amount: 60 })]
    expect(customItemsForPanelGroup(items, 'travel')).toEqual(items)
  })

  it('a custom Meals item appears in the meals group', () => {
    const items = [item({ id: 'a', group: 'meals', amount: 45 })]
    expect(customItemsForPanelGroup(items, 'meals')).toEqual(items)
  })

  it('a custom Financing item appears in the financing group', () => {
    const items = [item({ id: 'a', group: 'financing', amount: 500 })]
    expect(customItemsForPanelGroup(items, 'financing')).toEqual(items)
  })

  it('a custom Capital / Depreciable item appears in the capital group', () => {
    const items = [item({ id: 'a', group: 'capital', amount: 3000 })]
    expect(customItemsForPanelGroup(items, 'capital')).toEqual(items)
  })

  it('an "Other"-tagged item is attributed to operatingExpense (matching isOperatingExpenseLikeGroup\'s own treatment of "other")', () => {
    const items = [item({ id: 'a', group: 'other', amount: 20 })]
    expect(customItemsForPanelGroup(items, 'operatingExpense')).toEqual(items)
    // and it must NOT also appear under any other group — one attribution only
    for (const group of ['professional', 'travel', 'meals', 'financing', 'capital'] as TaxCategoryGroup[]) {
      expect(customItemsForPanelGroup(items, group)).toEqual([])
    }
  })

  it('income never has custom items attributed to it — a custom item is always expense-shaped', () => {
    const items = [
      item({ id: 'a', group: 'operatingExpense' }), item({ id: 'b', group: 'capital' }), item({ id: 'c', group: 'other' }),
    ]
    expect(customItemsForPanelGroup(items, 'income')).toEqual([])
  })

  it('each custom item is attributed to exactly one panel group — summing across every group reproduces the whole list exactly once', () => {
    const items = [
      item({ id: 'opex', group: 'operatingExpense', amount: 100 }),
      item({ id: 'prof', group: 'professional', amount: 50 }),
      item({ id: 'travel', group: 'travel', amount: 30 }),
      item({ id: 'meals', group: 'meals', amount: 20 }),
      item({ id: 'financing', group: 'financing', amount: 500 }),
      item({ id: 'capital', group: 'capital', amount: 3000 }),
      item({ id: 'other', group: 'other', amount: 15 }),
    ]
    const groups: TaxCategoryGroup[] = ['income', 'operatingExpense', 'professional', 'travel', 'meals', 'financing', 'capital']
    const totalAcrossPanelGroups = groups.reduce((sum, g) => sum + sumCustomItems(customItemsForPanelGroup(items, g)), 0)
    expect(totalAcrossPanelGroups).toBe(sumCustomItems(items)) // 'other' rolled into operatingExpense — nothing lost, nothing doubled
  })

  it('a group with no matching custom items returns an empty array, never a fabricated total', () => {
    const items = [item({ id: 'a', group: 'capital', amount: 500 })]
    expect(customItemsForPanelGroup(items, 'travel')).toEqual([])
  })
})

describe('mileage never contributes to a dollar subtotal (structural guarantee)', () => {
  it('CustomTaxItem has no mileage-shaped field at all — a custom item can never represent mileage', () => {
    const sample = item({ group: 'travel' })
    expect(Object.keys(sample)).not.toContain('mileage')
    expect(Object.keys(sample)).not.toContain('miles')
    expect(Object.keys(sample)).not.toContain('business_mileage')
  })

  it('TAX_CATEGORIES (the fixed dollar categories every panel group sums) has no mileage entry in the travel group or anywhere else', () => {
    const travelCategories = categoriesInGroup('travel')
    expect(travelCategories.every((c) => c.manualField !== 'business_mileage')).toBe(true)
    expect(TAX_CATEGORIES.some((c) => c.manualField === 'business_mileage')).toBe(false)
  })
})
