// PropRoster — Property Value & Comps UI Redesign, Part 7 ("Subject vs.
// Comp information"). Small, deterministic comparison chips like
// "+220 sqft" / "-1 bedroom" / "8 years newer" / "$15/sqft higher" —
// computed here from real provider numbers only. No LLM, no estimation:
// every chip is a straight subtraction between two provider-reported
// numbers, and a chip is simply omitted whenever either side of the
// comparison is missing (never guessed, never shown as "N/A").
//
// Distance ("0.4 mi away") is intentionally NOT produced here — it's
// already a primary, always-shown field on every comp card (Part 3), so
// repeating it as a delta chip here would just be clutter (Part 7: "Do
// not make the cards overly complicated").

import type { ComparableSale, PropertyFacts } from './types'

export type CompDelta = { key: string; label: string }

function pluralize(n: number, singular: string, plural: string): string {
  return Math.abs(n) === 1 ? singular : plural
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

/**
 * Computes the small subject-vs-comp indicators for one comparable.
 * `subjectFacts`/`subjectEstimatedValue` may be null/0 (RentCast's AVM
 * response does not currently return subject property facts — see
 * rentcast.ts) — in that case every chip that needs them is simply
 * omitted, never fabricated.
 */
export function computeCompDeltas(subjectFacts: PropertyFacts | null, subjectEstimatedValue: number, comp: ComparableSale): CompDelta[] {
  const deltas: CompDelta[] = []

  if (subjectFacts?.squareFeet != null && comp.squareFeet != null) {
    const diff = comp.squareFeet - subjectFacts.squareFeet
    if (diff !== 0) deltas.push({ key: 'sqft', label: `${signed(diff)} sqft` })
  }

  if (subjectFacts?.beds != null && comp.beds != null) {
    const diff = comp.beds - subjectFacts.beds
    if (diff !== 0) deltas.push({ key: 'beds', label: `${signed(diff)} ${pluralize(diff, 'bedroom', 'bedrooms')}` })
  }

  if (subjectFacts?.yearBuilt != null && comp.yearBuilt != null) {
    const diff = comp.yearBuilt - subjectFacts.yearBuilt
    if (diff > 0) deltas.push({ key: 'year', label: `${diff} ${pluralize(diff, 'year', 'years')} newer` })
    else if (diff < 0) deltas.push({ key: 'year', label: `${Math.abs(diff)} ${pluralize(diff, 'year', 'years')} older` })
  }

  if (subjectFacts?.squareFeet && subjectEstimatedValue > 0 && comp.pricePerSqft != null) {
    const subjectPricePerSqft = subjectEstimatedValue / subjectFacts.squareFeet
    const diff = Math.round(comp.pricePerSqft - subjectPricePerSqft)
    if (diff > 0) deltas.push({ key: 'pricePerSqft', label: `$${diff}/sqft higher` })
    else if (diff < 0) deltas.push({ key: 'pricePerSqft', label: `$${Math.abs(diff)}/sqft lower` })
  }

  return deltas
}
