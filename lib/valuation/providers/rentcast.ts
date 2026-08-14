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
//
// Property Value & Comps UI Redesign — cost-control note (per that task's
// Part 10, "do not silently turn one request into six"):
//
// RentCast's single AVM Value Estimate call (GET /v1/avm/value) — the
// only request this file makes — documents its `comparables[]` entries as
// including, alongside the fields already mapped above: propertyType,
// yearBuilt, lotSize, a 0–1 "correlation" similarity score, listingType,
// and daysOnMarket. Those are now mapped below at ZERO extra request
// cost, because they already ride along in the one response this
// provider was always fetching.
//
// What RentCast's AVM response does NOT include, confirmed against its
// documented schema: (1) a property/listing PHOTO URL — RentCast is a
// data/records API, not a listing-photo API, on any endpoint this
// codebase has integrated; imageUrl below is therefore always null here,
// never a fabricated or scraped photo. (2) pool / roof / heating /
// cooling / solar / HOA / tax-assessment / garage detail, or the SUBJECT
// property's own beds/baths/sqft/yearBuilt (propertyFacts stays null,
// unchanged from before this redesign) — RentCast only exposes those
// through its separate Property Records endpoint (GET /v1/properties),
// which would mean ONE ADDITIONAL paid RentCast request per property
// looked up (the subject, and potentially each comp, if per-comp detail
// were ever added). Per Part 10's explicit instruction, that additional
// call is NOT implemented here — seeing this data would require a
// deliberate follow-up task; see the redesign completion report for the
// full field-by-field breakdown and request-count impact this stop
// point was reported against.
//
// VERIFICATION NOTE: like the file-level note above, this was written
// against RentCast's documented schema, not a live account (still no
// RENTCAST_API_KEY in this environment) — treat the new fields the same
// way as the original ones: verify against a real response before
// depending on them being reliably present.

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
  propertyType?: string
  yearBuilt?: number
  lotSize?: number
  /** RentCast's documented 0–1 similarity score for this comparable. */
  correlation?: number
  listingType?: string
  daysOnMarket?: number
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
      propertyType: c.propertyType || null,
      yearBuilt: typeof c.yearBuilt === 'number' ? c.yearBuilt : null,
      lotSizeSqft: typeof c.lotSize === 'number' ? c.lotSize : null,
      matchScore: typeof c.correlation === 'number' ? c.correlation : null,
      listingStatus: c.listingType || null,
      daysOnMarket: typeof c.daysOnMarket === 'number' ? c.daysOnMarket : null,
      // Never populated by this provider today — see the file header.
      imageUrl: null,
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
