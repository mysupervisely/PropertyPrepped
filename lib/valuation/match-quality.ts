// PropRoster — Property Value & Comps UI Redesign, Part 8 ("Match
// Quality"). Turns a comparable's provider-supplied similarity score into
// a human label using fixed, documented thresholds — never an invented or
// provider-guessed score. This module is pure and requires no LLM.
//
// CRITICAL: the score itself must always come from the provider (RentCast
// AVM comparables' documented `correlation` field, mapped to
// ComparableSale.matchScore in providers/rentcast.ts). If a comparable has
// no score, matchQualityLabel() must be called with null and returns null
// — never a fabricated "Moderate Comp" label for a comp we simply don't
// have data on.

/** Deterministic thresholds against RentCast's documented 0–1 "correlation" similarity score. Chosen so most real comps (which tend to cluster high, since RentCast already filters to strong matches before returning them) land in "Good"/"Strong", while still leaving room for weaker matches to read as "Moderate" rather than being labeled the same as a near-perfect match. */
export const MATCH_QUALITY_THRESHOLDS = {
  strong: 0.9,
  good: 0.75,
  moderate: 0.5,
} as const

export type MatchQualityLabel = 'Strong Comp' | 'Good Comp' | 'Moderate Comp'

/** Null in, null out — a missing score is never turned into a label. */
export function matchQualityLabel(score: number | null): MatchQualityLabel | null {
  if (score === null || !Number.isFinite(score)) return null
  if (score >= MATCH_QUALITY_THRESHOLDS.strong) return 'Strong Comp'
  if (score >= MATCH_QUALITY_THRESHOLDS.good) return 'Good Comp'
  if (score >= MATCH_QUALITY_THRESHOLDS.moderate) return 'Moderate Comp'
  return null
}

/** "92% match" formatting — null in, null out. */
export function formatMatchPercent(score: number | null): string | null {
  if (score === null || !Number.isFinite(score)) return null
  return `${Math.round(score * 100)}% match`
}
