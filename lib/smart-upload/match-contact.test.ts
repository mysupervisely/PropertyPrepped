import { describe, expect, it } from 'vitest'
import { findMatchingContact } from './match-contact'
import type { SmartUploadContact } from './types'

const contacts: SmartUploadContact[] = [
  { id: 'c1', name: 'Jamie Rivera', business_name: 'ABC Air Conditioning' },
  { id: 'c2', name: 'Sam Lee', business_name: null },
]

describe('findMatchingContact — PROPCREW', () => {
  it('existing provider match: matches by business_name', () => {
    expect(findMatchingContact('ABC Air Conditioning', contacts)?.id).toBe('c1')
  })

  it('existing provider match: matches by name, case-insensitively', () => {
    expect(findMatchingContact('sam lee', contacts)?.id).toBe('c2')
  })

  it('no match: a vendor not in PropCrew returns null (caller must offer Add/Skip, never auto-create)', () => {
    expect(findMatchingContact('XYZ Plumbing', contacts)).toBeNull()
  })

  it('no match: empty/missing vendor text', () => {
    expect(findMatchingContact('', contacts)).toBeNull()
    expect(findMatchingContact(null, contacts)).toBeNull()
    expect(findMatchingContact(undefined, contacts)).toBeNull()
  })

  it('no match: empty contacts list never throws', () => {
    expect(findMatchingContact('ABC Air Conditioning', [])).toBeNull()
  })
})
