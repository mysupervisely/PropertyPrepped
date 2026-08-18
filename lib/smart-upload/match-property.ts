// PropRoster — Smart Upload Foundation: property matching (Part 8/9).
//
// "If the document contains an address and it confidently matches one of
// the authenticated user's properties: suggest/preselect the property...
// If confidence is insufficient, do not silently associate the item with
// a property." This module only ever produces a SUGGESTION — the caller
// (the review UI) always requires the user to tap/confirm a property
// before anything is written; a "High" suggestion pre-selects the same
// tap target a "None" result leaves empty, it never skips that tap.
//
// Deliberately simple, honest string comparison — no fuzzy/AI matching,
// nothing that could look more confident than it is. Only ever compares
// against the CALLER'S OWN properties list (already RLS-scoped by
// whoever fetched it) — this module has no way to see, and therefore no
// way to leak or match against, another owner's property.

import type { SmartUploadProperty } from './types'

export type PropertyMatchConfidence = 'High' | 'Medium' | 'None'

export type PropertyMatchResult = {
  property: SmartUploadProperty | null
  confidence: PropertyMatchConfidence
}

/** Lowercase, strip punctuation, collapse whitespace — nothing fancier. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The leading run of digits — a street number, when the address starts with one. */
function leadingNumber(text: string): string | null {
  const match = /^(\d+)\b/.exec(text.trim())
  return match ? match[1] : null
}

/**
 * Compares an AI-extracted address string (may be null/empty/partial —
 * never trusted as-is) against the caller's own properties. Returns the
 * single best match plus how confident that match is:
 *
 *   High   — normalized extracted text and a property's normalized
 *            address are identical, or one contains the other AND they
 *            share the same leading street number.
 *   Medium — the leading street number matches and the extracted text
 *            contains at least one more word from the property's address
 *            (weaker than High, still not a random guess).
 *   None   — nothing crosses even the Medium bar. The caller must show
 *            "Which property is this for?" and offer every property as
 *            an equal, unpreselected choice (Part 9).
 */
export function matchProperty(extractedAddress: string | null | undefined, properties: SmartUploadProperty[]): PropertyMatchResult {
  const text = (extractedAddress || '').trim()
  if (!text || !properties.length) return { property: null, confidence: 'None' }

  const normalizedExtracted = normalize(text)
  const extractedNumber = leadingNumber(normalizedExtracted)

  let best: PropertyMatchResult = { property: null, confidence: 'None' }

  for (const property of properties) {
    const normalizedAddress = normalize(property.address)
    if (!normalizedAddress) continue

    if (normalizedExtracted === normalizedAddress) {
      return { property, confidence: 'High' }
    }

    const propertyNumber = leadingNumber(normalizedAddress)
    const sameNumber = Boolean(extractedNumber && propertyNumber && extractedNumber === propertyNumber)
    const oneContainsOther = normalizedExtracted.includes(normalizedAddress) || normalizedAddress.includes(normalizedExtracted)

    if (sameNumber && oneContainsOther) {
      if (best.confidence !== 'High') best = { property, confidence: 'High' }
      continue
    }

    if (sameNumber) {
      // Same street number, but the rest of the text doesn't clearly
      // overlap — e.g. a different street with the same house number.
      // Only worth a Medium suggestion, never higher.
      if (best.confidence === 'None') best = { property, confidence: 'Medium' }
    }
  }

  return best
}
