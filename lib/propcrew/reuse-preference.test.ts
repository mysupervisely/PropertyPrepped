import { describe, expect, it } from 'vitest'
import { PROPCREW_PRIVACY_DISCLOSURE, PROPCREW_PRIVATE_NOTE_LABEL, REUSE_PREFERENCE_LABELS, REUSE_PREFERENCE_OPTIONS, reusePreferenceTone } from './reuse-preference'

describe('PropCrew reuse preference', () => {
  it('exposes exactly the three required options, in order', () => {
    expect(REUSE_PREFERENCE_OPTIONS).toEqual(['YES', 'POSSIBLY', 'NO'])
  })

  it('never labels this as a review/rating/feedback (Part 11 requirement)', () => {
    const allText = [PROPCREW_PRIVATE_NOTE_LABEL, PROPCREW_PRIVACY_DISCLOSURE, ...Object.values(REUSE_PREFERENCE_LABELS)].join(' ').toLowerCase()
    expect(allText).not.toMatch(/review|rating|feedback/)
  })

  it('the private-note label and privacy disclosure match Part 11 exactly', () => {
    expect(PROPCREW_PRIVATE_NOTE_LABEL).toBe('Private note for your records')
    expect(PROPCREW_PRIVACY_DISCLOSURE).toBe('Private — never shared with the provider.')
  })

  it('maps each preference to a distinct styling tone', () => {
    expect(reusePreferenceTone('YES')).toBe('good')
    expect(reusePreferenceTone('POSSIBLY')).toBe('moderate')
    expect(reusePreferenceTone('NO')).toBe('weak')
  })

  it('maps a missing preference to "unknown", never a fabricated default', () => {
    expect(reusePreferenceTone(null)).toBe('unknown')
  })
})
