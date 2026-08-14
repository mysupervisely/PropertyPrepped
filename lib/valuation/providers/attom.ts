// PropRoster Milestone: Investment Tools 2.0 — ATTOM implementation of
// PropertyValuationProvider (Part 8), included specifically to prove
// PropertyValuationProvider is not tightly coupled to RentCast (Part 3/8
// both require this) — it is NOT the recommended default provider (see
// the completion report's RentCast-vs-ATTOM comparison for why).
//
// VERIFICATION NOTE: ATTOM's AVM data is split across separate endpoints
// (an AVM detail/snapshot endpoint for the estimate, and a distinct sales-
// comparables endpoint keyed by lat/long + radius for comps) rather than
// RentCast's single combined call, and this codebase has never
// authenticated against ATTOM's API. This adapter is deliberately a
// minimal, documented skeleton — normalizeAttomAvmResponse() is unit
// tested against a realistic sample of ATTOM's documented AVM detail
// shape (property[0].avm.amount.{value,high,low}), but comparable-sales
// retrieval is intentionally NOT implemented here (it would need a second
// authenticated endpoint this codebase has never called) and always
// returns an empty comparables array rather than guessing at a shape. Per
// Part 8, no ATTOM subscription was purchased to verify any of this
// live — treat this file as a starting point for a future pass, not a
// production-ready adapter.

import type { NormalizedAddress } from '../../address/types'
import type { PropertyValuationResult } from '../types'
import type { PropertyValuationProvider } from '../provider'

const AVM_DETAIL_URL = 'https://api.gateway.attomdata.com/propertyapi/v1.0.0/avm/detail'

type AttomAvmResponse = {
  property?: {
    avm?: {
      amount?: { value?: number; high?: number; low?: number }
    }
  }[]
}

/** Pure normalization — no network, no side effects. Exercised directly in attom.test.ts. */
export function normalizeAttomAvmResponse(raw: AttomAvmResponse, subject: NormalizedAddress): PropertyValuationResult {
  const avm = raw.property?.[0]?.avm?.amount
  const estimatedValue = typeof avm?.value === 'number' ? avm.value : 0
  const lowEstimate = typeof avm?.low === 'number' ? avm.low : estimatedValue
  const highEstimate = typeof avm?.high === 'number' ? avm.high : estimatedValue

  return {
    subjectProperty: subject,
    estimatedValue,
    lowEstimate,
    highEstimate,
    // No comparables retrieved (see file header) -> no basis to state a
    // confidence level either; null, not a guess.
    confidence: null,
    propertyFacts: null,
    // Deliberately empty, not fabricated — comparable-sales retrieval is
    // not implemented for ATTOM in this pass (see file header).
    comparables: [],
    providerMetadata: { provider: 'attom', generatedAt: new Date().toISOString() },
  }
}

export class AttomValuationProvider implements PropertyValuationProvider {
  readonly name = 'attom'
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async getValuation(address: NormalizedAddress): Promise<PropertyValuationResult> {
    const url = new URL(AVM_DETAIL_URL)
    url.searchParams.set('address1', address.addressLine1 || address.formattedAddress)
    if (address.city && address.state) url.searchParams.set('address2', `${address.city}, ${address.state}`)

    const response = await fetch(url.toString(), {
      headers: { apikey: this.apiKey, Accept: 'application/json' },
    })
    if (!response.ok) {
      throw new Error(`ATTOM valuation request failed (${response.status})`)
    }
    const raw = (await response.json()) as AttomAvmResponse
    return normalizeAttomAvmResponse(raw, address)
  }
}
