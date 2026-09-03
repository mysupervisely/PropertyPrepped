import { describe, expect, it } from 'vitest'
import { URGENT_GUIDANCE } from './urgent'
import { URGENT_REASONS } from './types'

// M2.1 review pass (Part 2) — the same forbidden-action phrase list
// definitions.test.ts already scans the intake trees for, applied here
// to the urgent guidance copy itself. Deliberately phrase-based, not
// noun-based (see definitions.test.ts's own comment on why).
const FORBIDDEN_PHRASES = [
  'open the panel', 'open the electrical panel', 'remove the panel', 'remove the cover',
  'test the voltage', 'test voltage', 'touch the capacitor', 'handle the refrigerant',
  'reach into the disposal', 'reach inside the disposal', 'climb a ladder', 'climb on the roof',
  'go on the roof', 'access the roof', 'disassemble the', 'take apart the',
  'open the breaker', 'flip the breaker', 'turn off the breaker', 'shut off the gas',
  'relight the pilot', 'light the pilot', 'shut off the water', 'shut off the main',
  'use the shutoff', 'turn the valve', 'pump out',
]

// Words this copy should never need at all — even mentioning the
// equipment (to warn about it) can read as an invitation to interact
// with it, which is exactly what this copy exists to prevent.
const FORBIDDEN_WORDS = ['panel', 'pump', 'shutoff', 'shut-off', 'breaker', 'voltage', 'capacitor']

function fullText(): string {
  return Object.values(URGENT_GUIDANCE).flatMap((g) => [g.heading, ...g.body]).join(' \n ').toLowerCase()
}

describe('URGENT_GUIDANCE — safety copy review (Part 2)', () => {
  it('has an entry for every UrgentReason', () => {
    for (const reason of URGENT_REASONS) {
      expect(URGENT_GUIDANCE[reason]).toBeDefined()
      expect(URGENT_GUIDANCE[reason].body.length).toBeGreaterThan(0)
    }
  })

  it('contains no forbidden unsafe-action phrases', () => {
    const text = fullText()
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(text, `found forbidden phrase "${phrase}"`).not.toContain(phrase)
    }
  })

  it('never names equipment (panel/pump/shutoff/breaker/voltage/capacitor) at all, even as a warning', () => {
    const text = fullText()
    for (const word of FORBIDDEN_WORDS) {
      expect(text, `found forbidden word "${word}"`).not.toContain(word)
    }
  })

  it('never claims PropRoster is an emergency service or responds to emergencies', () => {
    const text = fullText()
    expect(text).not.toMatch(/propRoster (is|will|can) (an? )?emergency/i)
    expect(text).not.toMatch(/we (will|are) (respond|dispatch|send)/i)
  })

  it('911 is named only in genuinely life-safety entries, not as generic boilerplate', () => {
    expect(URGENT_GUIDANCE.fire_smoke.body.join(' ')).toMatch(/911/)
    expect(URGENT_GUIDANCE.gas_smell.body.join(' ')).toMatch(/911/)
    expect(URGENT_GUIDANCE.electrical_hazard.body.join(' ')).toMatch(/911/)
  })

  it('every entry still lets the tenant know they can submit the report', () => {
    for (const reason of URGENT_REASONS) {
      expect(URGENT_GUIDANCE[reason].body.join(' ').toLowerCase()).toMatch(/submit this report/)
    }
  })

  it('makes no absolute medical/legal/professional-safety guarantee ("guarantee", "ensure", "will be safe")', () => {
    const text = fullText()
    expect(text).not.toMatch(/guarantee|ensures? your safety|will be safe|certified safe/)
  })
})
