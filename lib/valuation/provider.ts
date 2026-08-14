// PropRoster Milestone: Investment Tools 2.0 — property valuation provider
// abstraction (Part 8). Nothing outside this module (the /api/valuation
// route, the Property Value & Comps page) knows which real-estate-data
// provider is configured — every caller talks to
// PropertyValuationProvider, mirroring the exact same "one interface,
// swappable adapter" pattern already used for
// lib/document-intelligence/provider.ts (AI provider) and
// lib/address/provider.ts (address search provider) in this codebase.
//
// CRITICAL (Part 8): this is the ONLY path Property Value & Comps uses to
// obtain a value estimate or comparable sales. Nothing in lib/valuation/
// imports the Anthropic SDK or calls an LLM — property values and comps
// come from a real data provider or not at all.

import type { NormalizedAddress } from '../address/types'
import type { PropertyValuationResult } from './types'
import { RentCastValuationProvider } from './providers/rentcast'
import { AttomValuationProvider } from './providers/attom'

export interface PropertyValuationProvider {
  readonly name: string
  getValuation(address: NormalizedAddress): Promise<PropertyValuationResult>
}

/**
 * True only when a real valuation-data provider is configured. Part 8: "If
 * no provider is configured: Show 'Property valuation data is not
 * configured yet.'" — every caller must check this (or handle a null
 * getPropertyValuationProvider()) before attempting a lookup.
 */
export function isValuationProviderConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.RENTCAST_API_KEY || env.ATTOM_API_KEY)
}

/**
 * Returns a configured PropertyValuationProvider, or null if none is
 * configured — never throws, and NEVER fabricates a fallback provider.
 * RentCast is preferred when both are configured (see the completion
 * report for the RentCast-vs-ATTOM comparison this preference is based
 * on); ATTOM is included to prove the abstraction is not tightly coupled
 * to one vendor (Part 3/8), not because it's the recommended default.
 */
export function getPropertyValuationProvider(): PropertyValuationProvider | null {
  if (process.env.RENTCAST_API_KEY) return new RentCastValuationProvider(process.env.RENTCAST_API_KEY)
  if (process.env.ATTOM_API_KEY) return new AttomValuationProvider(process.env.ATTOM_API_KEY)
  return null
}
