import { describe, expect, it } from 'vitest'
import { parseVCardBlock, parseVCardFile, splitVCards } from './vcard'

const CRLF = '\r\n'

function card(lines: string[]): string {
  return ['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD'].join(CRLF)
}

describe('splitVCards', () => {
  it('finds exactly one card in a well-formed single-contact export', () => {
    expect(splitVCards(card(['FN:Mike Rivera']))).toHaveLength(1)
  })

  it('finds zero cards in a file with no BEGIN:VCARD/END:VCARD at all — the "malformed file" case', () => {
    expect(splitVCards('this is not a vcard, just some text')).toEqual([])
  })

  it('finds every card in a multi-contact export (parseVCardFile is what refuses these, not this function)', () => {
    const text = card(['FN:Mike Rivera']) + CRLF + card(['FN:Jamie Lee'])
    expect(splitVCards(text)).toHaveLength(2)
  })

  it('is case-insensitive on BEGIN/END and tolerates trailing whitespace on those lines', () => {
    const text = 'begin:vcard  \nFN:Mike\nend:vcard'
    expect(splitVCards(text)).toHaveLength(1)
  })
})

describe('parseVCardBlock — the four PropCrew fields only (name, phone, email, organization)', () => {
  it('parses FN, a single TEL, a single EMAIL, and ORG', () => {
    const [block] = splitVCards(card(['FN:Mike Rivera', 'TEL:555-123-4567', 'EMAIL:mike@abcair.com', 'ORG:ABC Air Conditioning']))
    const parsed = parseVCardBlock(block)
    expect(parsed).toEqual({ name: 'Mike Rivera', phones: ['555-123-4567'], emails: ['mike@abcair.com'], organization: 'ABC Air Conditioning' })
  })

  it('falls back to N (Family;Given) as "Given Family" when FN is missing', () => {
    const [block] = splitVCards(card(['N:Rivera;Mike;;;']))
    expect(parseVCardBlock(block).name).toBe('Mike Rivera')
  })

  it('prefers FN over N when both are present', () => {
    const [block] = splitVCards(card(['N:Rivera;Mike;;;', 'FN:Mike R.']))
    expect(parseVCardBlock(block).name).toBe('Mike R.')
  })

  it('organization is null (never an empty string, never invented) when there is no ORG line at all', () => {
    const [block] = splitVCards(card(['FN:Mike Rivera', 'TEL:555-123-4567']))
    expect(parseVCardBlock(block).organization).toBeNull()
  })

  it('only the first ORG segment (the company name) is kept — a department/unit segment is dropped, never concatenated into a business name nobody typed', () => {
    const [block] = splitVCards(card(['FN:Mike Rivera', 'ORG:ABC Air Conditioning;Service Department']))
    expect(parseVCardBlock(block).organization).toBe('ABC Air Conditioning')
  })

  it('collects every distinct TEL and EMAIL line, never guessing a single one — same "never silently choose" rule as the Contact Picker path', () => {
    const [block] = splitVCards(card(['FN:Mike Rivera', 'TEL;TYPE=CELL:555-123-4567', 'TEL;TYPE=WORK:555-987-6543', 'EMAIL:mike@abcair.com', 'EMAIL:mike@personal.com']))
    const parsed = parseVCardBlock(block)
    expect(parsed.phones).toEqual(['555-123-4567', '555-987-6543'])
    expect(parsed.emails).toEqual(['mike@abcair.com', 'mike@personal.com'])
  })

  it('de-duplicates an identical TEL/EMAIL listed twice under different TYPE parameters', () => {
    const [block] = splitVCards(card(['FN:Mike Rivera', 'TEL;TYPE=CELL:555-123-4567', 'TEL;TYPE=VOICE:555-123-4567']))
    expect(parseVCardBlock(block).phones).toEqual(['555-123-4567'])
  })

  it('a card with only a name and no phone/email is still a valid, safe parse — empty arrays, never a crash', () => {
    const [block] = splitVCards(card(['FN:Jamie Lee']))
    expect(parseVCardBlock(block)).toEqual({ name: 'Jamie Lee', phones: [], emails: [], organization: null })
  })

  it('unescapes RFC 6350 value escaping (\\,) in a plain (non-structured) value like FN', () => {
    const [block] = splitVCards(card(['FN:Rivera\\, Mike']))
    expect(parseVCardBlock(block).name).toBe('Rivera, Mike')
  })

  it('unfolds a long, line-folded FN value (RFC 6350 continuation lines) back into one value', () => {
    // Per RFC 6350 §3.2, folding inserts CRLF + exactly one WSP marker
    // character; unfolding strips exactly that CRLF + one WSP. The
    // ORIGINAL separating space between "Conditioning" and "and" is a
    // second character, preserved here as the continuation line's
    // second leading space — so after stripping only the fold marker,
    // that original space survives and the value rejoins correctly.
    const folded = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Mike Rivera of ABC Air Conditioning', '  and Heating Services', 'END:VCARD'].join(CRLF)
    const [block] = splitVCards(folded)
    expect(parseVCardBlock(block).name).toBe('Mike Rivera of ABC Air Conditioning and Heating Services')
  })

  it('ignores property lines this app never uses (ADR, NOTE, PHOTO, etc.) without erroring', () => {
    const [block] = splitVCards(card(['FN:Mike Rivera', 'ADR:;;123 Main St;Springfield;IL;62704;USA', 'NOTE:Great guy', 'TEL:555-123-4567']))
    const parsed = parseVCardBlock(block)
    expect(parsed.name).toBe('Mike Rivera')
    expect(parsed.phones).toEqual(['555-123-4567'])
  })
})

describe('parseVCardFile — the one entry point components/PropCrewPanel.tsx calls', () => {
  it('a valid single-contact vCard converts directly to a PropCrewImportCandidate', () => {
    const result = parseVCardFile(card(['FN:Mike Rivera', 'TEL:555-123-4567', 'EMAIL:mike@abcair.com', 'ORG:ABC Air Conditioning']))
    expect(result).toEqual({ ok: true, candidate: { name: 'Mike Rivera', phones: ['555-123-4567'], emails: ['mike@abcair.com'], businessName: 'ABC Air Conditioning' } })
  })

  it('never includes a businessName key at all when the card has no ORG — never a null/empty placeholder standing in for "no company"', () => {
    const result = parseVCardFile(card(['FN:Mike Rivera', 'TEL:555-123-4567']))
    expect(result).toEqual({ ok: true, candidate: { name: 'Mike Rivera', phones: ['555-123-4567'], emails: [] } })
    if (result.ok) expect('businessName' in result.candidate).toBe(false)
  })

  it('a missing-fields card (name only) is still a valid import — the review form is where the landlord fills in the rest', () => {
    const result = parseVCardFile(card(['FN:Jamie Lee']))
    expect(result).toEqual({ ok: true, candidate: { name: 'Jamie Lee', phones: [], emails: [] } })
  })

  it('multiple phone numbers and emails both come through as full arrays, for the same "which one?" UI step the Contact Picker path uses', () => {
    const result = parseVCardFile(card(['FN:Mike Rivera', 'TEL:555-123-4567', 'TEL:555-987-6543', 'EMAIL:mike@abcair.com', 'EMAIL:mike@personal.com']))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.candidate.phones).toEqual(['555-123-4567', '555-987-6543'])
      expect(result.candidate.emails).toEqual(['mike@abcair.com', 'mike@personal.com'])
    }
  })

  it('a malformed file (no BEGIN:VCARD at all) is refused with reason "no_card", never a crash', () => {
    expect(parseVCardFile('Name: Mike\nPhone: 555-1234')).toEqual({ ok: false, reason: 'no_card' })
  })

  it('an empty string is refused with reason "no_card"', () => {
    expect(parseVCardFile('')).toEqual({ ok: false, reason: 'no_card' })
  })

  it('a file with more than one contact is refused with reason "multiple_cards" — NEVER silently imports just the first (this is the exact anti-bulk-address-book-import guard)', () => {
    const text = card(['FN:Mike Rivera', 'TEL:555-123-4567']) + CRLF + card(['FN:Jamie Lee', 'TEL:555-999-0000'])
    expect(parseVCardFile(text)).toEqual({ ok: false, reason: 'multiple_cards' })
  })

  it('a single, well-formed card with no name, phone, or email at all is refused with reason "empty_card" — nothing usable to prefill', () => {
    const text = card(['VERSION:3.0'])
    expect(parseVCardFile(text)).toEqual({ ok: false, reason: 'empty_card' })
  })

  it('works with LF-only line endings too, not just CRLF', () => {
    const text = 'BEGIN:VCARD\nFN:Mike Rivera\nTEL:555-123-4567\nEND:VCARD'
    const result = parseVCardFile(text)
    expect(result).toEqual({ ok: true, candidate: { name: 'Mike Rivera', phones: ['555-123-4567'], emails: [] } })
  })
})
