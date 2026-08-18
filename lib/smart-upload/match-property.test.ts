import { describe, expect, it } from 'vitest'
import { matchProperty } from './match-property'
import type { SmartUploadProperty } from './types'

const properties: SmartUploadProperty[] = [
  { id: 'p1', address: '12109 Rustic River Way', city: 'Example City, FL 12345' },
  { id: 'p2', address: '48 Ocean Avenue', city: 'Example City, FL 12345' },
]

describe('matchProperty — PROPERTY ASSIGNMENT', () => {
  it('confident match: exact normalized address match returns High confidence', () => {
    const result = matchProperty('12109 Rustic River Way', properties)
    expect(result.confidence).toBe('High')
    expect(result.property?.id).toBe('p1')
  })

  it('confident match: same street number plus overlapping text (extra unit/suite) still returns High', () => {
    const result = matchProperty('12109 Rustic River Way, Unit B', properties)
    expect(result.confidence).toBe('High')
    expect(result.property?.id).toBe('p1')
  })

  it('no match: no address in the extracted text', () => {
    const result = matchProperty(null, properties)
    expect(result.confidence).toBe('None')
    expect(result.property).toBeNull()
  })

  it('no match: empty string', () => {
    const result = matchProperty('   ', properties)
    expect(result.confidence).toBe('None')
    expect(result.property).toBeNull()
  })

  it('no match: an address that resembles none of the caller\'s properties', () => {
    const result = matchProperty('900 Completely Different Blvd', properties)
    expect(result.confidence).toBe('None')
    expect(result.property).toBeNull()
  })

  it('no match: an empty properties list never throws, just returns None', () => {
    const result = matchProperty('12109 Rustic River Way', [])
    expect(result.confidence).toBe('None')
    expect(result.property).toBeNull()
  })

  it('never returns a property that is not in the supplied list (cross-owner rejection at the data layer, not this function) — the caller only ever passes its own RLS-scoped properties', () => {
    const result = matchProperty('12109 Rustic River Way', [])
    expect(result.property).toBeNull()
  })

  it('same leading street number but otherwise different street text yields only Medium confidence, never High', () => {
    const result = matchProperty('48 Someplace Else Road', properties)
    expect(result.confidence).toBe('Medium')
    expect(result.property?.id).toBe('p2')
  })

  it('is case- and punctuation-insensitive', () => {
    const result = matchProperty('12109 RUSTIC RIVER WAY.', properties)
    expect(result.confidence).toBe('High')
  })
})
