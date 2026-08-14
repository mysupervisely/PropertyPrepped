import { describe, expect, it } from 'vitest'
import { buildComparableSummary } from './comparable-summary'
import { manualAddress } from '../address/types'
import type { ComparableSale, PropertyValuationResult } from './types'

function baseResult(overrides: Partial<PropertyValuationResult> = {}): PropertyValuationResult {
  return {
    subjectProperty: manualAddress('123 Main St'),
    estimatedValue: 485000,
    lowEstimate: 465000,
    highEstimate: 505000,
    confidence: 'High',
    propertyFacts: null,
    comparables: [],
    providerMetadata: { provider: 'rentcast', generatedAt: new Date().toISOString() },
    ...overrides,
  }
}

/** A comparable with every Redesign-added field defaulted to null/unavailable — same convention as normalize-analysis.test.ts's baseRaw(), so each test only spells out the fields it actually cares about. */
function comp(overrides: Partial<ComparableSale> = {}): ComparableSale {
  return {
    address: 'A', distanceMiles: null, salePrice: 0, saleDate: '', beds: null, baths: null, squareFeet: null, pricePerSqft: null,
    propertyType: null, yearBuilt: null, lotSizeSqft: null, matchScore: null, listingStatus: null, daysOnMarket: null, imageUrl: null,
    ...overrides,
  }
}

describe('buildComparableSummary', () => {
  it('returns null when there are no comparables — never a fabricated summary', () => {
    expect(buildComparableSummary(baseResult())).toBeNull()
  })

  it('summarizes count, max distance, and sale date range from real comparable data', () => {
    const result = baseResult({
      comparables: [
        comp({ address: 'A', distanceMiles: 0.3, salePrice: 480000, saleDate: '2026-06-15', beds: 3, baths: 2, squareFeet: 1850 }),
        comp({ address: 'B', distanceMiles: 0.7, salePrice: 460000, saleDate: '2026-04-02', beds: 3, baths: 2, squareFeet: 1700 }),
      ],
    })
    const summary = buildComparableSummary(result)
    expect(summary).toContain('2 comparable sales')
    expect(summary).toContain('0.7 mi')
    expect(summary).toContain('Apr 2026')
    expect(summary).toContain('Jun 2026')
  })

  it('uses singular "sale" for exactly one comparable', () => {
    const result = baseResult({ comparables: [comp({ address: 'A', salePrice: 480000 })] })
    expect(buildComparableSummary(result)).toBe('Based on 1 comparable sale.')
  })

  it('omits the distance clause when no comparable reports a distance', () => {
    const result = baseResult({ comparables: [comp({ address: 'A', salePrice: 480000, saleDate: '2026-05-01' })] })
    expect(buildComparableSummary(result)).not.toContain('mi')
  })

  it('omits the date clause when no comparable reports a sale date', () => {
    const result = baseResult({ comparables: [comp({ address: 'A', distanceMiles: 0.2, salePrice: 480000 })] })
    expect(buildComparableSummary(result)).not.toContain('sold')
  })

  it('uses "sold <date>" (not a range) when every comparable shares the same sale date', () => {
    const result = baseResult({
      comparables: [
        comp({ address: 'A', distanceMiles: 0.2, salePrice: 480000, saleDate: '2026-06-15' }),
        comp({ address: 'B', distanceMiles: 0.4, salePrice: 470000, saleDate: '2026-06-15' }),
      ],
    })
    const summary = buildComparableSummary(result)
    expect(summary).toContain('sold Jun 2026.')
    expect(summary).not.toContain('between')
  })
})
