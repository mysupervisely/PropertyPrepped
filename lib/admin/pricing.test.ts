import { describe, expect, it } from 'vitest'
import { ANTHROPIC_MODEL_PRICING_USD_PER_MILLION_TOKENS, estimateCostUsd } from './pricing'
import { DEFAULT_MODEL, VERIFIED_MODELS } from '../document-intelligence/model-config'

describe('estimateCostUsd', () => {
  it('prices a known model correctly (1M input, 1M output tokens = input+output rate)', () => {
    const cost = estimateCostUsd('claude-sonnet-5', 1_000_000, 1_000_000)
    expect(cost).toBe(3.0 + 15.0)
  })

  it('scales linearly with token count', () => {
    const cost = estimateCostUsd('claude-sonnet-5', 500_000, 0)
    expect(cost).toBeCloseTo(1.5, 6)
  })

  it('returns 0 for zero tokens on a known model (not null)', () => {
    expect(estimateCostUsd('claude-sonnet-5', 0, 0)).toBe(0)
  })

  it('returns null — never a guessed number — for an unrecognized model', () => {
    expect(estimateCostUsd('claude-made-up-model', 1000, 1000)).toBeNull()
  })

  it('every model this app can actually call (DEFAULT_MODEL + VERIFIED_MODELS) has a pricing entry', () => {
    const models = new Set([DEFAULT_MODEL, ...VERIFIED_MODELS])
    for (const model of models) {
      expect(ANTHROPIC_MODEL_PRICING_USD_PER_MILLION_TOKENS[model], `missing pricing entry for ${model}`).toBeDefined()
    }
  })
})
