import { describe, expect, it } from 'vitest'
import { sortComparables } from './sort-comparables'
import type { ComparableSale } from './types'

function comp(overrides: Partial<ComparableSale> = {}): ComparableSale {
  return {
    address: 'A', distanceMiles: null, salePrice: 0, saleDate: '', beds: null, baths: null, squareFeet: null, pricePerSqft: null,
    propertyType: null, yearBuilt: null, lotSizeSqft: null, matchScore: null, listingStatus: null, daysOnMarket: null, imageUrl: null,
    ...overrides,
  }
}

describe('sortComparables', () => {
  it('never mutates the input array', () => {
    const input = [comp({ address: 'B', distanceMiles: 2 }), comp({ address: 'A', distanceMiles: 1 })]
    const original = [...input]
    sortComparables(input, 'distance')
    expect(input).toEqual(original)
  })

  it('distance: ascending, closest first', () => {
    const input = [comp({ address: 'Far', distanceMiles: 2.1 }), comp({ address: 'Near', distanceMiles: 0.3 })]
    expect(sortComparables(input, 'distance').map((c) => c.address)).toEqual(['Near', 'Far'])
  })

  it('price: ascending, cheapest first', () => {
    const input = [comp({ address: 'High', salePrice: 600000 }), comp({ address: 'Low', salePrice: 400000 })]
    expect(sortComparables(input, 'price').map((c) => c.address)).toEqual(['Low', 'High'])
  })

  it('date: descending, most recent first', () => {
    const input = [comp({ address: 'Old', saleDate: '2025-01-01' }), comp({ address: 'New', saleDate: '2026-06-01' })]
    expect(sortComparables(input, 'date').map((c) => c.address)).toEqual(['New', 'Old'])
  })

  it('pricePerSqft: ascending, lowest first', () => {
    const input = [comp({ address: 'High', pricePerSqft: 300 }), comp({ address: 'Low', pricePerSqft: 200 })]
    expect(sortComparables(input, 'pricePerSqft').map((c) => c.address)).toEqual(['Low', 'High'])
  })

  it('match: descending, best match first', () => {
    const input = [comp({ address: 'Weak', matchScore: 0.6 }), comp({ address: 'Strong', matchScore: 0.95 })]
    expect(sortComparables(input, 'match').map((c) => c.address)).toEqual(['Strong', 'Weak'])
  })

  it('a comparable missing the sorted-on value always sorts last, regardless of direction', () => {
    const distanceInput = [comp({ address: 'Unknown', distanceMiles: null }), comp({ address: 'Known', distanceMiles: 1 })]
    expect(sortComparables(distanceInput, 'distance').map((c) => c.address)).toEqual(['Known', 'Unknown'])

    const matchInput = [comp({ address: 'Unknown', matchScore: null }), comp({ address: 'Known', matchScore: 0.8 })]
    expect(sortComparables(matchInput, 'match').map((c) => c.address)).toEqual(['Known', 'Unknown'])
  })

  it('all comparables missing the sorted-on value: stable, no crash', () => {
    const input = [comp({ address: 'A' }), comp({ address: 'B' })]
    expect(sortComparables(input, 'price').map((c) => c.address)).toEqual(['A', 'B'])
  })
})
