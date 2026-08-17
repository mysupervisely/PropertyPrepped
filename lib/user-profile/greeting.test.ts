import { describe, expect, it } from 'vitest'
import { greetingTimeOfDay, resolveGreetingName } from './greeting'
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
