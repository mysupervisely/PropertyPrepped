// PropRoster — Smart Upload Foundation: PropCrew provider matching
// (Part 13/14). Same idea as components/DocumentIntelligencePanel.tsx's
// existing `vendorAlreadyContact` check — extracted here so Smart Upload
// can reuse the identical, already-shipped logic instead of a second
// implementation. Simple exact-name comparison, same as before: no fuzzy
// matching, nothing that could suggest a match more confidently than the
// data supports. A near-miss (typo, "LLC" suffix, etc.) intentionally
// falls through to "not found" — Part 14 explicitly wants the honest
// "Add to PropCrew" path in that case, never a wrong auto-link.

import type { SmartUploadContact } from './types'

/** Normalized exact match against name OR business_name — same rule PropCrewPanel/DocumentIntelligencePanel already use. */
export function findMatchingContact(vendorOrBusinessName: string | null | undefined, contacts: SmartUploadContact[]): SmartUploadContact | null {
  const needle = (vendorOrBusinessName || '').trim().toLowerCase()
  if (!needle) return null
  return contacts.find((c) => c.name.toLowerCase() === needle || (c.business_name || '').toLowerCase() === needle) || null
}
