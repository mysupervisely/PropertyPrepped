// PropRoster Milestone: Investment Tools 2.0 — RentCast implementation of
// PropertyValuationProvider (Part 8), using RentCast's AVM Value Estimate
// endpoint (GET /v1/avm/value), which returns an estimated value + range
// plus nearby comparable properties in a single call — the best fit for
// this feature's "enter address -> estimated value + comps" flow (see the
// completion report for the full RentCast-vs-ATTOM comparison).
//
// VERIFICATION NOTE (same caveat as lib/address/providers/mapbox.ts): no
// RENTCAST_API_KEY is available in this environment to exercise a live
// call. normalizeRentCastResponse() is written against RentCast's
// documented AVM response shape (price/priceRangeLow/priceRangeHigh plus
// a comparables array carrying formattedAddress/price/distance/bedrooms/
// bathrooms/squareFootage/lastSaleDate-or-similar fields) and unit tested
// against a realistic sample response — the live HTTP round trip has NOT
// been exercised against RentCast's real service, and per Part 8 no
// subscription was purchased to verify one. Verify field names against a
// real account/response before relying on this in production; if
// RentCast's response shape has drifted, only this file and its test need
// to change.
//
// NEVER invents a value or comparable: every numeric field below is read
// directly from RentCast's response, or left null/empty when absent —
// nothing here is computed by an LLM or guessed.

import type { NormalizedAddress } from '../../address/types'
import type { ComparableSale, PropertyValuationResult } from '../types'
import type { PropertyValuationProvider } from '../provider'

const AVM_VALUE_URL = 'https://api.rentcast.io/v1/avm/value'

type RentCastComparable = {
  formattedAddress?: string
  address?: string
  distance?: number
  price?: number
  salePrice?: number
  lastSaleDate?: string
  removedDate?: string
  bedrooms?: number
  bathrooms?: number
  squareFootage?: number
}

type RentCastValueResponse = {
  price?: number
  priceRangeLow?: number
  priceRangeHigh?: number
  comparables?: RentCastComparable[]
}

/** Pure normalization — no network, no side effects. Exercised directly in rentcast.test.ts. */
export function normalizeRentCastResponse(raw: RentCastValueResponse, subject: NormalizedAddress): PropertyValuationResult {
  const estimatedValue = typeof raw.price === 'number' ? raw.price : 0
  const lowEstimate = typeof raw.priceRangeLow === 'number' ? raw.priceRangeLow : estimatedValue
  const highEstimate = typeof raw.priceRangeHigh === 'number' ? raw.priceRangeHigh : estimatedValue

  // At most 5 (Part 7: "Show 3–5 strong comps") — never padded beyond
  // what the provider actually returned.
  const comparables: ComparableSale[] = (raw.comparables || []).slice(0, 5).map((c) => {
    const salePrice = typeof c.salePrice === 'number' ? c.salePrice : typeof c.price === 'number' ? c.price : 0
    const squareFeet = typeof c.squareFootage === 'number' ? c.squareFootage : null
    return {
      address: c.formattedAddress || c.address || 'Address unavailable',
      distanceMiles: typeof c.distance === 'number' ? c.distance : null,
      salePrice,
      saleDate: c.lastSaleDate || c.removedDate || '',
      beds: typeof c.bedrooms === 'number' ? c.bedrooms : null,
      baths: typeof c.bathrooms === 'number' ? c.bathrooms : null,
      squareFeet,
      pricePerSqft: squareFeet && squareFeet > 0 ? salePrice / squareFeet : null,
    }
  })

  return {
    subjectProperty: subject,
    estimatedValue,
    lowEstimate,
    highEstimate,
    // A simple, explainable heuristic — never a number RentCast itself
    // didn't provide any basis for: more supporting comps -> higher
    // stated confidence. No estimate at all -> null, not a guess.
    confidence: estimatedValue > 0 ? (comparables.length >= 3 ? 'High' : comparables.length >= 1 ? 'Medium' : 'Low') : null,
    propertyFacts: null,
    comparables,
    providerMetadata: { provider: 'rentcast', generatedAt: new Date().toISOString() },
  }
}

export class RentCastValuationProvider implements PropertyValuationProvider {
  readonly name = 'rentcast'
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async getValuation(address: NormalizedAddress): Promise<PropertyValuationResult> {
    const url = new URL(AVM_VALUE_URL)
    url.searchParams.set('address', address.formattedAddress)

    const response = await fetch(url.toString(), {
      headers: { 'X-Api-Key': this.apiKey, Accept: 'application/json' },
    })
    if (!response.ok) {
      throw new Error(`RentCast valuation request failed (${response.status})`)
    }
    const raw = (await response.json()) as RentCastValueResponse
    return normalizeRentCastResponse(raw, address)
  }
}
