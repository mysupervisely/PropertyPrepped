import { describe, expect, it } from 'vitest'
import { MAINTENANCE_CATEGORY_IDS } from '../../categories'
import { INTAKE_DEFINITIONS, intakeTreeFor } from './index'
import { getNextStepId, buildSummary, deriveTitle } from '../engine'
import { URGENT_STEP_ID, type IntakeTree } from '../types'

// Phrases that would instruct a tenant to do anything Section 4 of the
// M2 brief explicitly forbids. Deliberately matches ACTION phrases, not
// bare nouns — "garbage disposal" is a legitimate appliance-type label,
// but "reach into the disposal" would not be.
const FORBIDDEN_PHRASES = [
  'open the panel', 'open the electrical panel', 'remove the panel', 'remove the cover',
  'test the voltage', 'test voltage', 'touch the capacitor', 'handle the refrigerant',
  'reach into the disposal', 'reach inside the disposal', 'climb a ladder', 'climb on the roof',
  'go on the roof', 'access the roof', 'go onto the roof', 'disassemble the', 'take apart the',
  'open the breaker', 'flip the breaker', 'turn off the breaker', 'shut off the gas',
  'relight the pilot', 'light the pilot', 'test the outlet with',
]

function allText(tree: IntakeTree): string {
  const parts: string[] = []
  for (const step of Object.values(tree.steps)) {
    parts.push(step.question.prompt)
    if (step.question.helpText) parts.push(step.question.helpText)
    for (const opt of step.question.options ?? []) parts.push(opt.label)
  }
  return parts.join(' \n ').toLowerCase()
}

describe('Every canonical category has a real, versioned intake tree', () => {
  it('INTAKE_DEFINITIONS has exactly the 8 canonical category ids as keys', () => {
    expect(Object.keys(INTAKE_DEFINITIONS).sort()).toEqual([...MAINTENANCE_CATEGORY_IDS].sort())
  })

  for (const categoryId of MAINTENANCE_CATEGORY_IDS) {
    describe(`${categoryId}`, () => {
      const tree = intakeTreeFor(categoryId)

      it('categoryId matches the registry key', () => {
        expect(tree.categoryId).toBe(categoryId)
      })

      it('has a version string of the form "<category>-v<N>"', () => {
        expect(tree.version).toMatch(new RegExp(`^${categoryId}-v\\d+$`))
      })

      it('entryStepId points at a real step', () => {
        expect(tree.steps[tree.entryStepId]).toBeDefined()
      })

      it('titleStepId points at a real, select- or text-type step (never a bare yes/no safety gate)', () => {
        const titleStep = tree.steps[tree.titleStepId]
        expect(titleStep).toBeDefined()
        expect(titleStep.question.summaryLabel !== undefined || titleStep.question.type === 'text').toBe(true)
      })

      it('deriveTitle produces a real, non-empty title once titleStepId is answered', () => {
        const titleStep = tree.steps[tree.titleStepId]
        const sampleValue = titleStep.question.options?.[0]?.value ?? 'Sample answer'
        const title = deriveTitle(tree, { [titleStep.question.key]: sampleValue }, 'FALLBACK')
        expect(title).not.toBe('FALLBACK')
        expect(title.length).toBeGreaterThan(0)
      })

      it('every next() target is either a real step id, null, or the urgent sentinel', () => {
        for (const step of Object.values(tree.steps)) {
          // Probe next() with every option value (and a blank answer for
          // text/photo types) to exercise every branch deterministically.
          const probes: Record<string, string>[] = step.question.options?.length
            ? step.question.options.map((o) => ({ [step.question.key]: o.value }))
            : [{ [step.question.key]: 'probe' }]
          for (const answers of probes) {
            const targetId = getNextStepId(tree, step.id, answers)
            if (targetId !== null && targetId !== URGENT_STEP_ID) {
              expect(tree.steps[targetId], `step "${step.id}" answer ${JSON.stringify(answers)} points at missing step "${targetId}"`).toBeDefined()
            }
          }
        }
      })

      it('every select-type question has at least 2 options', () => {
        for (const step of Object.values(tree.steps)) {
          if (step.question.type === 'select') expect(step.question.options?.length ?? 0).toBeGreaterThanOrEqual(2)
        }
      })

      it('every question key is unique within the tree', () => {
        const keys = Object.values(tree.steps).map((s) => s.question.key)
        expect(new Set(keys).size).toBe(keys.length)
      })

      it('contains no forbidden unsafe-action phrases anywhere in its prompts/help text/option labels', () => {
        const text = allText(tree)
        for (const phrase of FORBIDDEN_PHRASES) {
          expect(text, `found forbidden phrase "${phrase}" in ${categoryId}`).not.toContain(phrase)
        }
      })

      it('is reachable end-to-end from entryStepId without ever hitting a missing step (deterministic walk with a fixed "first option" strategy)', () => {
        let currentId: string | null = tree.entryStepId
        const answers: Record<string, string> = {}
        const seen = new Set<string>()
        let steps = 0
        while (currentId && currentId !== URGENT_STEP_ID) {
          expect(seen.has(currentId), `cycle detected at step "${currentId}"`).toBe(false)
          seen.add(currentId)
          const step = tree.steps[currentId]
          expect(step, `walk hit missing step "${currentId}"`).toBeDefined()
          const firstSafeOption = step.question.options?.find((o) => !o.urgentReason) ?? step.question.options?.[0]
          answers[step.question.key] = firstSafeOption?.value ?? 'sample text'
          currentId = getNextStepId(tree, currentId, answers)
          steps += 1
          expect(steps, 'walk exceeded 50 steps — likely a cycle').toBeLessThan(50)
        }
      })
    })
  }
})

describe('Heating/AC — the flagship "AC not cooling" branch matches the M2 brief\'s own example', () => {
  const tree = intakeTreeFor('heating_ac')

  it('walks exactly the brief\'s example answers and produces the brief\'s own example summary', () => {
    const answers: Record<string, string> = {}
    let currentId: string | null = tree.entryStepId
    const script: Record<string, string> = {
      hvac_symptom: 'ac_not_cooling',
      thermostat_mode: 'cool',
      set_temperature: '72',
      current_temperature: '79',
      airflow: 'normal',
      air_feel: 'warm',
      filter_condition: 'clean',
      outdoor_unit_running: 'no',
      water_or_ice_visible: 'no',
      unusual_sound_ac: 'none',
      unusual_smell_ac: 'none',
    }
    let guard = 0
    while (currentId && currentId !== URGENT_STEP_ID) {
      guard += 1
      expect(guard).toBeLessThan(30)
      const step = tree.steps[currentId]
      expect(step).toBeDefined()
      const value = script[step.question.key]
      expect(value, `no scripted answer for question "${step.question.key}"`).toBeDefined()
      answers[step.question.key] = value
      currentId = getNextStepId(tree, currentId, answers)
    }
    expect(currentId).toBeNull() // completed without escalating urgent

    const derivedTitle = deriveTitle(tree, answers, 'FALLBACK')
    expect(derivedTitle).toBe('AC is running but not cooling')
    const { title, description } = buildSummary(tree, answers, derivedTitle)
    expect(description).toContain('AC IS RUNNING BUT NOT COOLING')
    expect(description).toContain('Thermostat: COOL')
    expect(description).toContain('Set temperature: 72°F')
    expect(description).toContain('Current temperature: 79°F')
    expect(description).toContain('Airflow: Normal')
    expect(description).toContain('Supply air: Warm')
    expect(description).toContain('Filter: Clean')
    expect(description).toContain('Outdoor unit: No, not running')
    expect(description).toContain('Visible water/ice: No')
    expect(description).toContain('Unusual smell: No unusual smell')
    expect(title).toBe('AC is running but not cooling')
  })

  it('never asks whether the compressor is running/spinning, and explicitly instructs the tenant NOT to touch/approach the outdoor unit', () => {
    const text = allText(tree)
    expect(text).not.toContain('compressor')
    const outdoorStep = tree.steps.outdoor_unit_running
    expect(outdoorStep.question.prompt.toLowerCase()).not.toMatch(/^(please )?touch|open/)
    expect(outdoorStep.question.helpText?.toLowerCase()).toMatch(/never approach or touch|without touching/)
  })
})

describe('Urgent safety triggers route to the urgent path deterministically', () => {
  const cases: { category: 'heating_ac' | 'electrical' | 'leak_water' | 'plumbing' | 'toilet' | 'appliance' | 'other'; stepId: string; answerKey: string; answerValue: string }[] = [
    { category: 'heating_ac', stepId: 'unusual_smell_ac', answerKey: 'unusual_smell_ac', answerValue: 'gas' },
    { category: 'heating_ac', stepId: 'unusual_smell_ac', answerKey: 'unusual_smell_ac', answerValue: 'burning' },
    { category: 'heating_ac', stepId: 'water_ice_active', answerKey: 'water_ice_active', answerValue: 'yes_large' },
    { category: 'electrical', stepId: 'symptom', answerKey: 'symptom', answerValue: 'sparking' },
    { category: 'electrical', stepId: 'symptom', answerKey: 'symptom', answerValue: 'burning_smell' },
    { category: 'leak_water', stepId: 'amount', answerKey: 'amount', answerValue: 'heavy' },
    { category: 'plumbing', stepId: 'leak_active', answerKey: 'leak_active', answerValue: 'yes_heavy' },
    { category: 'toilet', stepId: 'overflow_active', answerKey: 'overflow_active', answerValue: 'yes' },
    { category: 'appliance', stepId: 'leak', answerKey: 'leak', answerValue: 'yes_major' },
    { category: 'appliance', stepId: 'unusual_smell_sound', answerKey: 'unusual_smell_sound', answerValue: 'gas' },
    { category: 'other', stepId: 'safety_gate', answerKey: 'safety_gate', answerValue: 'yes' },
  ]

  for (const c of cases) {
    it(`${c.category}/${c.stepId} answer "${c.answerValue}" escalates to the urgent path`, () => {
      const tree = intakeTreeFor(c.category)
      expect(getNextStepId(tree, c.stepId, { [c.answerKey]: c.answerValue })).toBe(URGENT_STEP_ID)
    })
  }

  it('a non-urgent answer on the same questions does NOT escalate', () => {
    const tree = intakeTreeFor('electrical')
    expect(getNextStepId(tree, 'symptom', { symptom: 'no_power' })).not.toBe(URGENT_STEP_ID)
  })
})
