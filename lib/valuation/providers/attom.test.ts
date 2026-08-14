import { describe, expect, it } from 'vitest'
import { normalizeAttomAvmResponse } from './attom'
import { manualAddress } from '../../address/types'

const subject = manualAddress('123 Main St, Miami, FL 33101')

describe('normalizeAttomAvmResponse — ATTOM raw AVM response -> PropertyValuationResult', () => {
  it('maps property[0].avm.amount.{value,high,low} to estimatedValue/lowEstimate/highEstimate', () => {
    const result = normalizeAttomAvmResponse({ property: [{ avm: { amount: { value: 500000, low: 470000, high: 530000 } } }] }, subject)
    expect(result.estimatedValue).toBe(500000)
    expect(result.lowEstimate).toBe(470000)
    expect(result.highEstimate).toBe(530000)
  })

  it('always returns an empty comparables array — ATTOM comparable-sales retrieval is not implemented, and this never fabricates comps to fill the gap', () => {
    const result = normalizeAttomAvmResponse({ property: [{ avm: { amount: { value: 500000 } } }] }, subject)
    expect(result.comparables).toEqual([])
    expect(result.confidence).toBeNull()
  })

  it('defaults estimatedValue to 0 (never fabricated) when the response has no usable avm data', () => {
    const result = normalizeAttomAvmResponse({}, subject)
    expect(result.estimatedValue).toBe(0)
    expect(result.lowEstimate).toBe(0)
    expect(result.highEstimate).toBe(0)
  })

  it('stamps providerMetadata.provider as "attom"', () => {
    const result = normalizeAttomAvmResponse({}, subject)
    expect(result.providerMetadata.provider).toBe('attom')
  })
})
