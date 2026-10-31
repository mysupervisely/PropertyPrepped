import { it, expect } from 'vitest'
import { aggregateRentCollection, rentCollectionPercent } from './rent-collection'
it('uses actual recorded payments and caps overpayment without rounding unpaid rent to 100%', () => {
  expect(rentCollectionPercent({ expectedAmount: 2500, totalPaid: 0 })).toBe(0)
  expect(rentCollectionPercent({ expectedAmount: 2500, totalPaid: 1250 })).toBe(50)
  expect(rentCollectionPercent({ expectedAmount: 2500, totalPaid: 2499.99 })).toBe(99)
  expect(rentCollectionPercent({ expectedAmount: 2500, totalPaid: 2600 })).toBe(100)
})
it('does not turn missing, invalid or zero obligations into a performance score', () => {
  expect(rentCollectionPercent()).toBeNull()
  for (const value of [0, -1, NaN, Infinity]) expect(rentCollectionPercent({ expectedAmount: value, totalPaid: 0 })).toBeNull()
  expect(rentCollectionPercent({ expectedAmount: 2500, totalPaid: -1 })).toBeNull()
})
it('aggregates every applicable lease for a property without mixing properties', () => {
  const totals = aggregateRentCollection([{ propertyId: 'a', expectedAmount: 1000, totalPaid: 1000 }, { propertyId: 'a', expectedAmount: 1000, totalPaid: 0 }, { propertyId: 'b', expectedAmount: 3000, totalPaid: 3000 }])
  expect(rentCollectionPercent(totals.get('a'))).toBe(50)
  expect(rentCollectionPercent(totals.get('b'))).toBe(100)
  expect(totals.has('vacant')).toBe(false)
})
