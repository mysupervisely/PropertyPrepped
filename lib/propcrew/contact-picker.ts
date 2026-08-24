// PropRoster — PropCrew Contact Import.
//
// The W3C Contact Picker API (navigator.contacts.select()) is supported
// today only by Chromium-based browsers on Android — no browser on iOS
// (every iOS browser, including Chrome for iOS, runs on WebKit, which has
// never implemented this API) and no desktop browser implements it
// either. This matches — and does not attempt to work around — the prior
// QA audit already documented in components/PropCrewPanel.tsx: there is
// no reliable, secure way to do single-contact selection from the mobile
// web on iOS today. Real feature detection (isContactPickerSupported)
// means the "Add from Contacts" option only ever appears where it will
// actually work; everywhere else (iOS Safari included) the existing
// manual-entry workflow is the only path, exactly as before this
// milestone.
//
// Deliberately pure/framework-free — no network, no DOM writes, fully
// unit-testable without a browser. The one real API call
// (navigator.contacts.select(...)) stays in components/PropCrewPanel.tsx,
// which calls into normalizeContactPickerResult() below to turn its raw
// result into safe candidate values.

/** The shape navigator.contacts.select() resolves to per contact — each requested property is always an array (a contact can have zero, one, or many of each), never a single value. */
export type ContactPickerResult = {
  name?: string[]
  tel?: string[]
  email?: string[]
}

/**
 * True only when the browser exposes the real Contact Picker API — the
 * exact two-part check the spec/MDN recommend (navigator.contacts AND
 * window.ContactsManager), not a guess based on user agent sniffing or a
 * single property's presence. Takes navigator/window as parameters
 * (rather than reading the globals directly) so this stays testable
 * without a DOM.
 */
export function isContactPickerSupported(nav: unknown, win: unknown): boolean {
  if (!nav || typeof nav !== 'object') return false
  if (!win || typeof win !== 'object') return false
  const contacts = (nav as { contacts?: { select?: unknown } }).contacts
  const hasSelect = Boolean(contacts && typeof contacts.select === 'function')
  const hasManager = 'ContactsManager' in win
  return hasSelect && hasManager
}

/** The normalized, de-duplicated candidate values from one picked contact — never a single guessed phone/email when the contact has more than one. */
export type PropCrewImportCandidate = {
  name: string
  phones: string[]
  emails: string[]
}

function dedupeTrimmed(values: string[] | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values || []) {
    const v = raw.trim()
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

/**
 * Pure normalization of one raw Contact Picker result. Never picks a
 * single phone/email on the caller's behalf when more than one exists —
 * that choice belongs to the UI (a radio-style picker when
 * phones.length > 1 or emails.length > 1), never silently guessed here.
 */
export function normalizeContactPickerResult(result: ContactPickerResult): PropCrewImportCandidate {
  const names = (result.name || []).map((n) => n.trim()).filter(Boolean)
  return {
    name: names[0] || '',
    phones: dedupeTrimmed(result.tel),
    emails: dedupeTrimmed(result.email),
  }
}
