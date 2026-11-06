import { describe, it, expect } from 'vitest'
import { parseTaxAmount } from './amount-input'

describe('tax amounts retain normal money entry', () => {
  it('accepts whole amounts, decimals, grouping and pasted dollar amounts', () => {
    for (const [raw, expected] of [['1250',1250],['1250.',1250],['1250.50',1250.5],['1,250.50',1250.5],['$ 1,250.50',1250.5],['.50',0.5],['0',0]] as const) expect(parseTaxAmount(raw)).toBe(expected)
  })
  it('distinguishes a blank override from an explicit zero', () => {
    expect(parseTaxAmount('')).toBeNull()
    expect(parseTaxAmount(' ')).toBeNull()
    expect(parseTaxAmount('0.00')).toBe(0)
  })
  it('keeps incomplete or invalid values invalid without silently turning them into another amount', () => {
    for (const raw of ['.', '12,50', '1.2.3', '-30', 'abc', 'Infinity']) expect(parseTaxAmount(raw)).toBeNaN()
  })
})
