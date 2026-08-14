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

  // Property Value & Comps UI Redesign — additional fields the provider
  // already returns in the SAME single valuation request (no extra
  // RentCast calls added to populate any of these; see rentcast.ts's
  // header comment and the redesign completion report's cost-control
  // section for exactly which fields were and were not available without
  // a second, per-comp request).
  propertyType: string | null
  yearBuilt: number | null
  lotSizeSqft: number | null
  /** RentCast's 0–1 "correlation" similarity score for this comp, when supplied. Null (not 0) when the provider gives no basis to judge similarity — never guessed. See match-quality.ts for the deterministic label thresholds built on this. */
  matchScore: number | null
  /** e.g. RentCast's "listingType" (Standard, New Construction, ...) — provider-reported, never inferred. */
  listingStatus: string | null
  daysOnMarket: number | null
  /**
   * A real photo URL for this comparable property. RentCast's AVM/comps
   * response does not include one today (see rentcast.ts) — this is
   * always null in production right now, and the UI renders a PropRoster
   * placeholder whenever it is. The field exists so a future provider (or
   * a future RentCast endpoint) can populate a real photo without any
   * component change — see components/PropertyPhoto.tsx.
   */
  imageUrl: string | null
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
