import { describe, expect, it } from 'vitest'
import { normalizeRentEstimate } from './rent-estimate'

describe('normalizeRentEstimate', () => {
  it('uses only provider numbers and counts actual comparables', () => {
    const result = normalizeRentEstimate({ rent: 2600, rentRangeLow: 2400, rentRangeHigh: 2800, comparables: [{}, {}] })
    expect(result).toMatchObject({ rent: 2600, low: 2400, high: 2800, comparables: 2, source: 'rentcast' })
  })
  it('does not invent an estimate when missing', () => {
    expect(normalizeRentEstimate({})).toBeNull()
    expect(normalizeRentEstimate({ rent: -5 })).toBeNull()
    expect(normalizeRentEstimate({ rent: '2600' })).toBeNull()
  })
  it('does not show contradictory or missing ranges', () => {
    expect(normalizeRentEstimate({ rent: 2500, rentRangeLow: 2700, rentRangeHigh: 2200 })).toMatchObject({ low: null, high: null })
  })
})
