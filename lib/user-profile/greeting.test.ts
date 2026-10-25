import { describe, expect, it } from 'vitest'
import { greetingTimeOfDay, resolveGreetingName, resolveInitials } from './greeting'
import type { UserProfile } from './types'

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u1', first_name: null, last_name: null, display_name: null, phone: null, timezone: null, photo_path: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('resolveGreetingName — display name -> first name -> email prefix -> "there"', () => {
  it('prefers display_name over everything else, including a set first_name', () => {
    expect(resolveGreetingName(profile({ display_name: 'Jam', first_name: 'Jamie' }), 'jamie.rivera@example.com')).toBe('Jam')
  })

  it('falls back to first_name when display_name is not set', () => {
    expect(resolveGreetingName(profile({ first_name: 'Jamie' }), 'jamie.rivera@example.com')).toBe('Jamie')
  })

  it('falls back to a capitalized email prefix when no profile name is set', () => {
    expect(resolveGreetingName(profile(), 'jamie.rivera@example.com')).toBe('Jamie')
  })

  it('falls back to "there" when there is no profile and no email', () => {
    expect(resolveGreetingName(null, null)).toBe('there')
  })

  it('falls back to "there" when profile exists but every field including email is blank', () => {
    expect(resolveGreetingName(profile(), '')).toBe('there')
  })

  it('never uses email as the greeting when a real name exists (Part 1 requirement)', () => {
    const result = resolveGreetingName(profile({ display_name: 'Jam' }), 'someone-else@example.com')
    expect(result).not.toContain('@')
    expect(result).toBe('Jam')
  })

  it('treats a whitespace-only display_name/first_name as not set', () => {
    expect(resolveGreetingName(profile({ display_name: '   ' }), 'jamie@example.com')).toBe('Jamie')
    expect(resolveGreetingName(profile({ display_name: '  ', first_name: '  ' }), 'jamie@example.com')).toBe('Jamie')
  })

  it('handles an email with dots/underscores/hyphens in the local part', () => {
    expect(resolveGreetingName(null, 'j.smith@example.com')).toBe('J')
    expect(resolveGreetingName(null, '_jam_@example.com')).toBe('Jam')
  })
})

describe('resolveInitials — first+last initial -> display_name words -> first_name words -> email prefix -> "?"', () => {
  it('prefers first+last name initials over display_name', () => {
    expect(resolveInitials(profile({ first_name: 'Jamie', last_name: 'Rivera', display_name: 'Jam' }), 'jamie.rivera@example.com')).toBe('JR')
  })

  it('falls back to display_name words when last_name is not set', () => {
    expect(resolveInitials(profile({ display_name: 'Jamie Rivera' }), 'jamie.rivera@example.com')).toBe('JR')
  })

  it('takes the first two letters of a single-word display_name', () => {
    expect(resolveInitials(profile({ display_name: 'Jam' }), 'jamie@example.com')).toBe('JA')
  })

  it('falls back to first_name alone when no last_name or display_name is set', () => {
    expect(resolveInitials(profile({ first_name: 'Jamie' }), 'jamie@example.com')).toBe('JA')
  })

  it('falls back to the first two letters of the email prefix when no profile name is set', () => {
    expect(resolveInitials(profile(), 'jamie.rivera@example.com')).toBe('JA')
  })

  it('falls back to "?" when there is no profile and no email', () => {
    expect(resolveInitials(null, null)).toBe('?')
  })

  it('treats a whitespace-only name field as not set', () => {
    expect(resolveInitials(profile({ first_name: '  ', last_name: '  ' }), 'jamie@example.com')).toBe('JA')
  })

  it('always uppercases, regardless of input case', () => {
    expect(resolveInitials(profile({ first_name: 'jamie', last_name: 'rivera' }), 'jamie@example.com')).toBe('JR')
  })
})

describe('greetingTimeOfDay', () => {
  it('morning before noon', () => {
    expect(greetingTimeOfDay(0)).toBe('morning')
    expect(greetingTimeOfDay(11)).toBe('morning')
  })
  it('afternoon from noon to before 6pm', () => {
    expect(greetingTimeOfDay(12)).toBe('afternoon')
    expect(greetingTimeOfDay(17)).toBe('afternoon')
  })
  it('evening from 6pm on', () => {
    expect(greetingTimeOfDay(18)).toBe('evening')
    expect(greetingTimeOfDay(23)).toBe('evening')
  })
})
