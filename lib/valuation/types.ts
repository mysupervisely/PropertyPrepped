// PropRoster Milestone: Investment Tools 2.0 — Property Value & Comps data
// shapes (Part 8). Every numeric/property fact here is expected to
// originate from a real property-data provider (RentCast, ATTOM, etc.) —
// nothing in this module or anywhere it's consumed may be filled in by
// Claude/Anthropic or any other LLM (Part 8/9's CRITICAL requirement).

import type { NormalizedAddress } from '../address/types'

export type ComparableSale = {
  address: string
  /** Distance from the subject property, in miles. Null when the provider doesn't report it. */
  distanceMiles: number | null
  salePrice: number
  /** ISO date string (e.g. "2026-06-15"), or '' if the provider doesn't report a sale date. */
  saleDate: string
  beds: number | null
  baths: number | null
  squareFeet: number | null
  /** salePrice / squareFeet, computed here — null when squareFeet is unusable, never divided by zero. */
  pricePerSqft: number | null
}

export type PropertyFacts = {
  beds: number | null
  baths: number | null
  squareFeet: number | null
  yearBuilt: number | null
  lotSizeSqft: number | null
  propertyType: string | null
}

export type ValuationConfidence = 'High' | 'Medium' | 'Low'

export type PropertyValuationResult = {
  subjectProperty: NormalizedAddress
  estimatedValue: number
  lowEstimate: number
  highEstimate: number
  /** Null when the provider gives no basis to judge confidence — never guessed. */
  confidence: ValuationConfidence | null
  propertyFacts: PropertyFacts | null
  /** 0–5 comparable sales, per Part 7 ("Show 3–5 strong comps where provider data supports it") — never padded with invented comps to hit a target count. */
  comparables: ComparableSale[]
  providerMetadata: { provider: string; generatedAt: string }
}
