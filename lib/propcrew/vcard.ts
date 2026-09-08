// PropRoster — PropCrew Mobile Contact Import V1.
//
// iPhone/iOS Safari fallback. The audit for this milestone confirmed
// (see lib/propcrew/contact-picker.ts's own header, and the QA history
// it documents) that the W3C Contact Picker API is Chromium-Android
// only — no iOS browser has ever implemented it, installed-as-PWA
// included, because every iOS browser (Safari, Chrome for iOS, Firefox
// for iOS, etc.) runs on WebKit and the API simply isn't in WebKit.
// There is no undocumented workaround for that; this file is the
// investigated, safe alternative instead: a user-selected vCard
// (.vcf) file.
//
// The real-world flow this supports: in iOS Contacts, a landlord taps
// a contact -> Share Contact -> Save to Files (or AirDrop/Mail to
// themselves) -> in PropRoster, taps "Import a contact card" -> the
// OS's own file picker (Files / iCloud Drive / Recents) -> the one
// file they just saved. Two explicit user actions, both entirely
// under the user's control, neither one a broad address-book grant —
// PropRoster only ever sees the bytes of the one file the user picked,
// parsed entirely client-side, never uploaded anywhere.
//
// Deliberately pure/framework-free — no DOM, no network, fully
// unit-testable. The one browser API call (reading the File the user
// picked) stays in components/PropCrewPanel.tsx; this module only ever
// receives already-read text.
//
// Minimal, dependency-free RFC 6350 (vCard 4.0; vCard 2.1/3.0 in
// practice use the same TEL/EMAIL/ORG/FN/N line shapes) parser —
// exactly the four fields PropCrew ever prefills (name, phone, email,
// organization), nothing else read or kept.

import { dedupeTrimmed, type PropCrewImportCandidate } from './contact-picker'

/** One parsed vCard's raw fields, before conversion to a PropCrew import candidate. */
export type ParsedVCard = {
  name: string
  phones: string[]
  emails: string[]
  /** null when the card has no ORG line at all — never guessed from name/email. */
  organization: string | null
}

// vCard line folding (RFC 6350 §3.2): a line that starts with a space
// or tab is a continuation of the previous physical line, not a new
// property. Must be undone before any line is parsed, or a folded long
// name/note can silently truncate a real value or get mis-parsed as a
// bogus property.
function unfoldLines(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rawLines = normalized.split('\n')
  const lines: string[] = []
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length) {
      lines[lines.length - 1] += line.slice(1)
    } else {
      lines.push(line)
    }
  }
  return lines
}

/**
 * Splits a file's raw text into the text of each BEGIN:VCARD…END:VCARD
 * block it contains. A file with zero blocks (not a vCard at all — the
 * "malformed file" case) returns []; a file with more than one (e.g. an
 * accidental "export all contacts") returns all of them, but
 * parseVCardFile() below deliberately REFUSES to prefill from a
 * multi-card file rather than silently using just the first — the
 * whole point of this feature is one explicitly chosen contact, not an
 * accidental partial address-book import.
 */
export function splitVCards(text: string): string[] {
  const lines = unfoldLines(text)
  const cards: string[] = []
  let current: string[] | null = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^BEGIN:VCARD$/i.test(trimmed)) { current = []; continue }
    if (/^END:VCARD$/i.test(trimmed)) { if (current) cards.push(current.join('\n')); current = null; continue }
    if (current) current.push(line)
  }
  return cards
}

function unescapeValue(value: string): string {
  return value.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim()
}

function parseLine(line: string): { name: string; value: string } | null {
  const colonIdx = line.indexOf(':')
  if (colonIdx === -1) return null
  const head = line.slice(0, colonIdx)
  const value = line.slice(colonIdx + 1)
  const name = head.split(';')[0].trim().toUpperCase()
  if (!name) return null
  return { name, value }
}

/** Parses the body of ONE already-split BEGIN:VCARD…END:VCARD block. */
export function parseVCardBlock(block: string): ParsedVCard {
  let fn = ''
  let nParts: string[] = []
  const phones: string[] = []
  const emails: string[] = []
  let organization: string | null = null

  for (const raw of block.split('\n')) {
    const parsed = parseLine(raw)
    if (!parsed) continue
    const value = unescapeValue(parsed.value)
    if (!value) continue
    switch (parsed.name) {
      case 'FN':
        if (!fn) fn = value
        break
      case 'N':
        if (!nParts.length) nParts = value.split(';').map((s) => s.trim())
        break
      case 'TEL':
        phones.push(value)
        break
      case 'EMAIL':
        emails.push(value)
        break
      case 'ORG':
        // ORG can be "Company;Department;…" — only the organization
        // name itself is a reliable, prefill-worthy value; department/
        // unit segments are dropped rather than concatenated into a
        // business name nobody typed.
        if (organization === null) {
          const company = value.split(';')[0].trim()
          if (company) organization = company
        }
        break
      default:
        break
    }
  }

  let name = fn
  if (!name && nParts.length) {
    // N is "Family;Given;Middle;Prefix;Suffix" — "Given Family" reads
    // naturally as a display name; FN (when present, which is required
    // by spec but not every real-world export includes it correctly)
    // is always preferred over reconstructing one from N.
    const [family, given] = nParts
    name = [given, family].filter(Boolean).join(' ').trim()
  }

  return { name, phones: dedupeTrimmed(phones), emails: dedupeTrimmed(emails), organization }
}

export type VCardImportResult =
  | { ok: true; candidate: PropCrewImportCandidate }
  // no_card: the file has no BEGIN:VCARD/END:VCARD block at all (not a
  // vCard, or corrupted). multiple_cards: more than one contact in the
  // file — refused rather than silently using the first (see
  // splitVCards' own comment). empty_card: a single, well-formed card
  // with no name, phone, or email at all — nothing usable to prefill.
  | { ok: false; reason: 'no_card' | 'multiple_cards' | 'empty_card' }

/**
 * The one entry point components/PropCrewPanel.tsx calls after reading
 * a user-selected file's text. Pure — never touches the DOM/network,
 * never partially prefills from a multi-contact file.
 */
export function parseVCardFile(text: string): VCardImportResult {
  const blocks = splitVCards(text)
  if (blocks.length === 0) return { ok: false, reason: 'no_card' }
  if (blocks.length > 1) return { ok: false, reason: 'multiple_cards' }

  const parsed = parseVCardBlock(blocks[0])
  if (!parsed.name && !parsed.phones.length && !parsed.emails.length) return { ok: false, reason: 'empty_card' }

  const candidate: PropCrewImportCandidate = {
    name: parsed.name,
    phones: parsed.phones,
    emails: parsed.emails,
    ...(parsed.organization ? { businessName: parsed.organization } : {}),
  }
  return { ok: true, candidate }
}
