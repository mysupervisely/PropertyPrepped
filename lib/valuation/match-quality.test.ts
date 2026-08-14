import { describe, expect, it } from 'vitest'
import { formatMatchPercent, matchQualityLabel } from './match-quality'

describe('matchQualityLabel — deterministic thresholds, never a guess', () => {
  it('returns null for a missing score — never fabricates a label', () => {
    expect(matchQualityLabel(null)).toBeNull()
  })

  it('returns null for a non-finite score', () => {
    expect(matchQualityLabel(NaN)).toBeNull()
  })

  it('"Strong Comp" at and above 0.90', () => {
    expect(matchQualityLabel(0.9)).toBe('Strong Comp')
    expect(matchQualityLabel(0.99)).toBe('Strong Comp')
    expect(matchQualityLabel(1)).toBe('Strong Comp')
  })

  it('"Good Comp" from 0.75 up to (not including) 0.90', () => {
    expect(matchQualityLabel(0.75)).toBe('Good Comp')
    expect(matchQualityLabel(0.89)).toBe('Good Comp')
  })

  it('"Moderate Comp" from 0.50 up to (not including) 0.75', () => {
    expect(matchQualityLabel(0.5)).toBe('Moderate Comp')
    expect(matchQualityLabel(0.74)).toBe('Moderate Comp')
  })

  it('below 0.50 gets no label — never stretched down to "Moderate"', () => {
    expect(matchQualityLabel(0.49)).toBeNull()
    expect(matchQualityLabel(0)).toBeNull()
  })
})

describe('formatMatchPercent', () => {
  it('formats as a rounded whole-number percent + " match"', () => {
    expect(formatMatchPercent(0.923)).toBe('92% match')
    expect(formatMatchPercent(0.925)).toBe('93% match') // Math.round rounds .5 up
    expect(formatMatchPercent(1)).toBe('100% match')
  })

  it('returns null for a missing score', () => {
    expect(formatMatchPercent(null)).toBeNull()
  })
})
