import { describe, expect, it } from 'vitest'
import { normalizeRentCastResponse } from './rentcast'
import { manualAddress } from '../../address/types'

const subject = manualAddress('123 Main St, Miami, FL 33101')

describe('normalizeRentCastResponse — RentCast raw AVM response -> PropertyValuationResult', () => {
  it('maps price/priceRangeLow/priceRangeHigh straight through', () => {
    const result = normalizeRentCastResponse({ price: 485000, priceRangeLow: 465000, priceRangeHigh: 505000 }, subject)
    expect(result.estimatedValue).toBe(485000)
    expect(result.lowEstimate).toBe(465000)
    expect(result.highEstimate).toBe(505000)
    expect(result.subjectProperty).toBe(subject)
  })

  it('normalizes comparables with computed price/sqft, capped at 5', () => {
    const raw = {
      price: 480000,
      comparables: Array.from({ length: 8 }, (_, i) => ({
        formattedAddress: `${100 + i} Main St, Miami, FL 33101`,
        salePrice: 470000 + i * 1000,
        distance: 0.2 + i * 0.1,
        lastSaleDate: '2026-06-15',
        bedrooms: 3,
        bathrooms: 2,
        squareFootage: 1850,
      })),
    }
    const result = normalizeRentCastResponse(raw, subject)
    expect(result.comparables).toHaveLength(5)
    expect(result.comparables[0]).toEqual({
      address: '100 Main St, Miami, FL 33101',
      distanceMiles: 0.2,
      salePrice: 470000,
      saleDate: '2026-06-15',
      beds: 3,
      baths: 2,
      squareFeet: 1850,
      pricePerSqft: 470000 / 1850,
    })
  })

  it('never divides by zero for pricePerSqft when squareFootage is missing', () => {
    const result = normalizeRentCastResponse({ price: 480000, comparables: [{ formattedAddress: '1 A St', salePrice: 400000 }] }, subject)
    expect(result.comparables[0].pricePerSqft).toBeNull()
    expect(result.comparables[0].squareFeet).toBeNull()
  })

  it('returns an empty comparables array (never fabricated comps) when the provider gives none', () => {
    const result = normalizeRentCastResponse({ price: 480000 }, subject)
    expect(result.comparables).toEqual([])
  })

  it('estimatedValue defaults to 0 (never fabricated) when price is absent, and confidence is null', () => {
    const result = normalizeRentCastResponse({}, subject)
    expect(result.estimatedValue).toBe(0)
    expect(result.confidence).toBeNull()
  })

  it('confidence scales with comparable count: High (>=3), Medium (1-2), Low (0) when a value exists', () => {
    expect(normalizeRentCastResponse({ price: 1, comparables: [{}, {}, {}] }, subject).confidence).toBe('High')
    expect(normalizeRentCastResponse({ price: 1, comparables: [{}] }, subject).confidence).toBe('Medium')
    expect(normalizeRentCastResponse({ price: 1, comparables: [] }, subject).confidence).toBe('Low')
  })

  it('stamps providerMetadata.provider as "rentcast" and a real generatedAt timestamp', () => {
    const result = normalizeRentCastResponse({ price: 1 }, subject)
    expect(result.providerMetadata.provider).toBe('rentcast')
    expect(() => new Date(result.providerMetadata.generatedAt).toISOString()).not.toThrow()
  })
})
