// PropRoster — PropCrew, Part 11: "Would you use them again?" — private
// operational memory, never a review/rating/feedback (see the UI copy
// requirements below, which every consumer of these labels must use
// verbatim). Pure constants/helpers, no Supabase/React.

export type ReusePreference = 'YES' | 'POSSIBLY' | 'NO'

export const REUSE_PREFERENCE_OPTIONS: ReusePreference[] = ['YES', 'POSSIBLY', 'NO']

export const REUSE_PREFERENCE_LABELS: Record<ReusePreference, string> = {
  YES: 'Yes',
  POSSIBLY: 'Possibly',
  NO: 'No',
}

// Required UI copy (Part 11, verbatim) — surfaced next to the reuse
// preference and the private note field everywhere they appear, so this
// is never mistaken for a public review/rating.
export const PROPCREW_PRIVATE_NOTE_LABEL = 'Private note for your records'
export const PROPCREW_PRIVACY_DISCLOSURE = 'Private — never shared with the provider.'

/** CSS-friendly tone key for styling a reuse-preference pill — never used as display copy itself. */
export function reusePreferenceTone(value: ReusePreference | null): 'good' | 'moderate' | 'weak' | 'unknown' {
  if (value === 'YES') return 'good'
  if (value === 'POSSIBLY') return 'moderate'
  if (value === 'NO') return 'weak'
  return 'unknown'
}
