import { describe, expect, it } from 'vitest'
import { findExactContactMatch, normalizeEmailForMatch, normalizePhoneForMatch } from './dedupe'

describe('normalizePhoneForMatch', () => {
  it('strips formatting so different-looking representations of the same number normalize identically', () => {
    expect(normalizePhoneForMatch('(555) 123-4567')).toBe('5551234567')
    expect(normalizePhoneForMatch('555-123-4567')).toBe('5551234567')
    expect(normalizePhoneForMatch('555.123.4567')).toBe('5551234567')
  })

  it('drops a leading US country-code "1" on an 11-digit number', () => {
    expect(normalizePhoneForMatch('+1 555 123 4567')).toBe('5551234567')
    expect(normalizePhoneForMatch('1-555-123-4567')).toBe('5551234567')
  })

  it('leaves a 10-digit number as-is (no country code to drop)', () => {
    expect(normalizePhoneForMatch('5551234567')).toBe('5551234567')
  })

  it('does not touch a genuinely different number\'s digits', () => {
    expect(normalizePhoneForMatch('555-987-6543')).not.toBe(normalizePhoneForMatch('555-123-4567'))
  })
})

describe('normalizeEmailForMatch', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmailForMatch('  Mike@ABCAir.com  ')).toBe('mike@abcair.com')
  })
})

type Contact = { id: string; phone: string | null; email: string | null }

const existing: Contact[] = [
  { id: 'c1', phone: '(555) 123-4567', email: 'mike@abcair.com' },
  { id: 'c2', phone: null, email: 'jamie@lee.com' },
  { id: 'c3', phone: '555-000-1111', email: null },
]

describe('findExactContactMatch — deterministic only, never fuzzy', () => {
  it('matches on an exact normalized phone, even with different formatting', () => {
    expect(findExactContactMatch(existing, '555.123.4567', '')?.id).toBe('c1')
    expect(findExactContactMatch(existing, '+1 (555) 123-4567', '')?.id).toBe('c1')
  })

  it('matches on an exact, case-insensitive email', () => {
    expect(findExactContactMatch(existing, '', 'MIKE@ABCAIR.COM')?.id).toBe('c1')
  })

  it('matches on phone OR email — either one alone is enough', () => {
    expect(findExactContactMatch(existing, '555-000-1111', 'nobody@nowhere.com')?.id).toBe('c3')
    expect(findExactContactMatch(existing, '999-999-9999', 'jamie@lee.com')?.id).toBe('c2')
  })

  it('returns null when neither the draft phone nor email is provided — never matches purely on name/role/business (no fuzzy identity matching)', () => {
    expect(findExactContactMatch(existing, '', '')).toBeNull()
  })

  it('returns null when the draft phone/email genuinely matches nothing on file', () => {
    expect(findExactContactMatch(existing, '555-222-3333', 'nobody@nowhere.com')).toBeNull()
  })

  it('a near-miss (one digit different, or a similar-looking name) never matches — this is exact-normalized comparison only, not fuzzy', () => {
    expect(findExactContactMatch(existing, '555-123-4568', '')).toBeNull()
    expect(findExactContactMatch(existing, '', 'mike@abcair.co')).toBeNull()
  })

  it('excludeId lets an in-place edit skip matching the row being edited against itself', () => {
    expect(findExactContactMatch(existing, '555-123-4567', '', 'c1')).toBeNull()
    // A different existing row with the same phone is still found even when excluding another id.
    const withDuplicatePhone: Contact[] = [...existing, { id: 'c4', phone: '555-123-4567', email: null }]
    expect(findExactContactMatch(withDuplicatePhone, '555-123-4567', '', 'c1')?.id).toBe('c4')
  })

  it('returns the first match in list order when more than one existing contact could match', () => {
    const dup: Contact[] = [{ id: 'first', phone: '555-123-4567', email: null }, { id: 'second', phone: '555-123-4567', email: null }]
    expect(findExactContactMatch(dup, '555-123-4567', '')?.id).toBe('first')
  })
})
