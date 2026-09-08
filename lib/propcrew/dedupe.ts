// PropRoster — PropCrew Mobile Contact Import V1: smallest-safe
// duplicate-avoidance.
//
// Deliberately NOT fuzzy/AI matching — per this milestone's own
// explicit instruction ("Do NOT perform fuzzy AI identity matching").
// Two deterministic, normalized checks only: an exact phone match
// (after stripping formatting and a US country-code prefix) or an
// exact, case-insensitive email match. A match only ever OFFERS the
// landlord the existing contact — it never merges or overwrites
// anything automatically; the caller (components/PropCrewPanel.tsx)
// still requires an explicit "Use existing contact" tap.

/** Digits only, and a leading US country-code '1' on an 11-digit number dropped, so "(555) 123-4567", "555-123-4567", and "+1 555 123 4567" all normalize identically. Never assumes a country for anything other than a bare leading '1' — no broader international normalization is attempted (out of scope: this only needs to catch the common "same number, different formatting" case, not a general phone-number library). */
export function normalizePhoneForMatch(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits
}

export function normalizeEmailForMatch(email: string): string {
  return email.trim().toLowerCase()
}

export type MatchableContact = { phone: string | null; email: string | null }

/**
 * Returns the first existing contact whose normalized phone OR email
 * exactly equals the given draft phone/email — or null when neither
 * the draft nor any contact has enough to compare (a blank phone and
 * blank email never "match" every contact that also lacks one).
 * `excludeId` lets an edit-in-place caller exclude the row being
 * edited from matching itself (unused by the "new contact" call site,
 * which never sets it — there is nothing to exclude when nothing exists
 * yet).
 */
export function findExactContactMatch<T extends MatchableContact & { id: string }>(
  contacts: T[],
  phone: string,
  email: string,
  excludeId?: string | null,
): T | null {
  const normalizedPhone = phone.trim() ? normalizePhoneForMatch(phone) : ''
  const normalizedEmail = email.trim() ? normalizeEmailForMatch(email) : ''
  if (!normalizedPhone && !normalizedEmail) return null

  for (const contact of contacts) {
    if (excludeId && contact.id === excludeId) continue
    if (normalizedPhone && contact.phone && normalizePhoneForMatch(contact.phone) === normalizedPhone) return contact
    if (normalizedEmail && contact.email && normalizeEmailForMatch(contact.email) === normalizedEmail) return contact
  }
  return null
}
