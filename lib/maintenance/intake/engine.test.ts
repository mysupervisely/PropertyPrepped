import { describe, expect, it } from 'vitest'
import { getNextStepId, isUrgent, answeredStepsInOrder, buildSummary } from './engine'
import { URGENT_STEP_ID, type IntakeTree } from './types'

// A small synthetic tree, isolated from the real category definitions,
// so these tests exercise the ENGINE's logic specifically (branching,
// urgent routing, summary rendering) without depending on any real
// tree's exact question wording.
const testTree: IntakeTree = {
  categoryId: 'other',
  version: 'test-v1',
  entryStepId: 'a',
  titleStepId: 'a',
  steps: {
    a: {
      id: 'a',
      question: {
        key: 'a', prompt: 'Step A', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'safe', label: 'Safe answer' }, { value: 'danger', label: 'Danger answer', urgentReason: 'fire_smoke' }],
        summaryLabel: 'A',
      },
      next: (ans) => (ans.a === 'safe' ? 'b' : 'never-reached'),
    },
    b: {
      id: 'b',
      question: { key: 'b', prompt: 'Step B', safetyClass: 'safe_observation', type: 'text', summaryLabel: 'B', unitSuffix: '°F' },
      next: () => 'c',
    },
    c: {
      id: 'c',
      question: { key: 'c', prompt: 'Step C (not in summary)', safetyClass: 'safe_observation', type: 'photo', optional: true },
      next: () => null,
    },
  },
}

describe('getNextStepId', () => {
  it('follows a step\'s own next() for a non-urgent answer', () => {
    expect(getNextStepId(testTree, 'a', { a: 'safe' })).toBe('b')
  })

  it('routes to URGENT_STEP_ID when the chosen option is urgent-flagged, regardless of the step\'s own next()', () => {
    expect(getNextStepId(testTree, 'a', { a: 'danger' })).toBe(URGENT_STEP_ID)
  })

  it('returns null for an unknown step id', () => {
    expect(getNextStepId(testTree, 'nonexistent', {})).toBeNull()
  })
})

describe('isUrgent', () => {
  it('is true only when the current step\'s answer is urgent-flagged', () => {
    expect(isUrgent(testTree, 'a', { a: 'safe' })).toBe(false)
    expect(isUrgent(testTree, 'a', { a: 'danger' })).toBe(true)
  })
})

describe('answeredStepsInOrder', () => {
  it('walks answered steps in the order they were actually asked, stopping at the first unanswered step', () => {
    const steps = answeredStepsInOrder(testTree, { a: 'safe', b: '70' })
    expect(steps.map((s) => s.step.id)).toEqual(['a', 'b'])
  })

  it('stops immediately if the entry step is unanswered', () => {
    expect(answeredStepsInOrder(testTree, {})).toEqual([])
  })

  it('stops at an urgent answer rather than walking past it', () => {
    const steps = answeredStepsInOrder(testTree, { a: 'danger' })
    expect(steps.map((s) => s.step.id)).toEqual(['a'])
  })

  it('never infinite-loops even against a pathological tree that points back at itself', () => {
    const loopTree: IntakeTree = {
      categoryId: 'other', version: 'loop-v1', entryStepId: 'x', titleStepId: 'x',
      steps: { x: { id: 'x', question: { key: 'x', prompt: 'X', safetyClass: 'safe_observation', type: 'select', options: [{ value: 'v', label: 'V' }] }, next: () => 'x' } },
    }
    const steps = answeredStepsInOrder(loopTree, { x: 'v' })
    expect(steps.length).toBe(1)
  })
})

describe('buildSummary', () => {
  it('renders every summaryLabel-carrying answered step, in order, using option labels not raw values', () => {
    const { title, description } = buildSummary(testTree, { a: 'safe', b: '72', c: 'ignored-no-summary-label' }, 'Test title')
    expect(title).toBe('Test title')
    expect(description).toContain('TEST TITLE')
    expect(description).toContain('Tenant observations:')
    expect(description).toContain('A: Safe answer')
    expect(description).toContain('B: 72°F')
    expect(description).not.toContain('C:')
  })

  it('excludes any step without a summaryLabel (e.g. photo steps) from the text body', () => {
    const { description } = buildSummary(testTree, { a: 'safe', b: '72', c: 'x' }, 'T')
    expect(description).not.toMatch(/Step C/)
  })
})
