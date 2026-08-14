import { describe, expect, it } from 'vitest'
import { computeCompDeltas } from './comp-delta'
import type { ComparableSale, PropertyFacts } from './types'

const subjectFacts: PropertyFacts = { beds: 4, baths: 2, squareFeet: 1800, yearBuilt: 2005, lotSizeSqft: 6000, propertyType: 'Single Family' }

function comp(overrides: Partial<ComparableSale> = {}): ComparableSale {
  return {
    address: 'A', distanceMiles: 0.4, salePrice: 500000, saleDate: '2026-01-01', beds: 4, baths: 2, squareFeet: 1800, pricePerSqft: 278,
    propertyType: null, yearBuilt: null, lotSizeSqft: null, matchScore: null, listingStatus: null, daysOnMarket: null, imageUrl: null,
    ...overrides,
  }
}

describe('computeCompDeltas', () => {
  it('returns no chips when subjectFacts is null (RentCast AVM does not return subject facts today) — never fabricated', () => {
    expect(computeCompDeltas(null, 500000, comp())).toEqual([])
  })

  it('+sqft chip when the comp is larger than the subject', () => {
    const deltas = computeCompDeltas(subjectFacts, 500000, comp({ squareFeet: 2020 }))
    expect(deltas).toContainEqual({ key: 'sqft', label: '+220 sqft' })
  })

  it('-sqft chip when the comp is smaller than the subject', () => {
    const deltas = computeCompDeltas(subjectFacts, 500000, comp({ squareFeet: 1600 }))
    expect(deltas).toContainEqual({ key: 'sqft', label: '-200 sqft' })
  })

  it('omits the sqft chip entirely when equal', () => {
    const deltas = computeCompDeltas(subjectFacts, 500000, comp({ squareFeet: 1800 }))
    expect(deltas.find((d) => d.key === 'sqft')).toBeUndefined()
  })

  it('omits the sqft chip when either side is missing', () => {
    const deltas = computeCompDeltas(subjectFacts, 500000, comp({ squareFeet: null }))
    expect(deltas.find((d) => d.key === 'sqft')).toBeUndefined()
  })

  it('-1 bedroom chip (singular) when the comp has one fewer bedroom', () => {
    const deltas = computeCompDeltas(subjectFacts, 500000, comp({ beds: 3 }))
    expect(deltas).toContainEqual({ key: 'beds', label: '-1 bedroom' })
  })

  it('+2 bedrooms chip (plural) when the comp has two more bedrooms', () => {
    const deltas = computeCompDeltas(subjectFacts, 500000, comp({ beds: 6 }))
    expect(deltas).toContainEqual({ key: 'beds', label: '+2 bedrooms' })
  })

  it('"8 years newer" when the comp was built later than the subject', () => {
    const deltas = computeCompDeltas(subjectFacts, 500000, comp({ yearBuilt: 2013 }))
    expect(deltas).toContainEqual({ key: 'year', label: '8 years newer' })
  })

  it('"1 year older" (singular) when the comp is one year older', () => {
    const deltas = computeCompDeltas(subjectFacts, 500000, comp({ yearBuilt: 2004 }))
    expect(deltas).toContainEqual({ key: 'year', label: '1 year older' })
  })

  it('omits the year chip when either side is missing', () => {
    const deltas = computeCompDeltas(subjectFacts, 500000, comp({ yearBuilt: null }))
    expect(deltas.find((d) => d.key === 'year')).toBeUndefined()
  })

  it('"$X/sqft higher" when the comp is priced higher per sqft than the subject\'s estimate', () => {
    // subject: 500000 / 1800 = ~277.78/sqft; comp at 300/sqft -> +22
    const deltas = computeCompDeltas(subjectFacts, 500000, comp({ pricePerSqft: 300 }))
    expect(deltas).toContainEqual({ key: 'pricePerSqft', label: '$22/sqft higher' })
  })

  it('"$X/sqft lower" when the comp is priced lower per sqft than the subject\'s estimate', () => {
    const deltas = computeCompDeltas(subjectFacts, 500000, comp({ pricePerSqft: 250 }))
    expect(deltas).toContainEqual({ key: 'pricePerSqft', label: '$28/sqft lower' })
  })

  it('omits the price/sqft chip when the subject has no estimated value', () => {
    const deltas = computeCompDeltas(subjectFacts, 0, comp({ pricePerSqft: 300 }))
    expect(deltas.find((d) => d.key === 'pricePerSqft')).toBeUndefined()
  })

  it('never includes a distance chip — distance is already a primary card field, not a delta', () => {
    const deltas = computeCompDeltas(subjectFacts, 500000, comp())
    expect(deltas.find((d) => d.key === 'distance')).toBeUndefined()
  })

  it('a fully-matching comp (identical facts, same price/sqft) produces zero chips', () => {
    expect(computeCompDeltas(subjectFacts, 500000, comp({ pricePerSqft: 500000 / 1800 }))).toEqual([])
  })
})
