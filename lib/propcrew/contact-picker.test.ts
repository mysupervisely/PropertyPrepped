import { describe, expect, it } from 'vitest'
import { isContactPickerSupported, normalizeContactPickerResult } from './contact-picker'

describe('isContactPickerSupported', () => {
  it('is true only when both navigator.contacts.select AND window.ContactsManager are present (the real spec/MDN-recommended check)', () => {
    const nav = { contacts: { select: () => Promise.resolve([]) } }
    const win = { ContactsManager: function () {} }
    expect(isContactPickerSupported(nav, win)).toBe(true)
  })

  it('is false when navigator.contacts is missing (e.g. iOS Safari, every desktop browser)', () => {
    expect(isContactPickerSupported({}, { ContactsManager: function () {} })).toBe(false)
  })

  it('is false when navigator.contacts exists but select is not a function', () => {
    expect(isContactPickerSupported({ contacts: {} }, { ContactsManager: function () {} })).toBe(false)
  })

  it('is false when window.ContactsManager is missing, even if navigator.contacts.select exists', () => {
    expect(isContactPickerSupported({ contacts: { select: () => {} } }, {})).toBe(false)
  })

  it('never throws on undefined/null navigator or window (SSR-safe)', () => {
    expect(isContactPickerSupported(undefined, undefined)).toBe(false)
    expect(isContactPickerSupported(null, null)).toBe(false)
  })
})

describe('normalizeContactPickerResult', () => {
  it('takes the first non-empty name, trimmed', () => {
    const candidate = normalizeContactPickerResult({ name: ['  Mike Rivera  '] })
    expect(candidate.name).toBe('Mike Rivera')
  })

  it('falls back to an empty name when none is present', () => {
    expect(normalizeContactPickerResult({}).name).toBe('')
  })

  it('returns every distinct phone number, trimmed, never guessing a single one', () => {
    const candidate = normalizeContactPickerResult({ tel: [' (555) 123-4567 ', '555-987-6543'] })
    expect(candidate.phones).toEqual(['(555) 123-4567', '555-987-6543'])
  })

  it('returns every distinct email address, trimmed, never guessing a single one', () => {
    const candidate = normalizeContactPickerResult({ email: [' mike@abcair.com ', 'mike@personal.com'] })
    expect(candidate.emails).toEqual(['mike@abcair.com', 'mike@personal.com'])
  })

  it('de-duplicates identical values (some contacts list the same number twice under different labels)', () => {
    const candidate = normalizeContactPickerResult({ tel: ['555-123-4567', '555-123-4567'], email: ['mike@abcair.com', 'mike@abcair.com'] })
    expect(candidate.phones).toEqual(['555-123-4567'])
    expect(candidate.emails).toEqual(['mike@abcair.com'])
  })

  it('drops blank/whitespace-only entries', () => {
    const candidate = normalizeContactPickerResult({ tel: ['', '   ', '555-123-4567'], email: [''] })
    expect(candidate.phones).toEqual(['555-123-4567'])
    expect(candidate.emails).toEqual([])
  })

  it('handles a contact with no phone or email at all — a valid, empty-but-safe result, never a crash', () => {
    const candidate = normalizeContactPickerResult({ name: ['Jamie'] })
    expect(candidate).toEqual({ name: 'Jamie', phones: [], emails: [] })
  })

  it('a single phone/email is still returned as a one-item array — the caller decides when a picker UI is or isn\'t needed based on length', () => {
    const candidate = normalizeContactPickerResult({ tel: ['555-123-4567'], email: ['mike@abcair.com'] })
    expect(candidate.phones).toHaveLength(1)
    expect(candidate.emails).toHaveLength(1)
  })
})
