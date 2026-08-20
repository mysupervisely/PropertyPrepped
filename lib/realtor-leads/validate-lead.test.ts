import { describe, expect, it } from 'vitest'
import { validateLeadInput } from './validate-lead'

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Jamie Rivera',
    email: 'jamie@example.com',
    phone: '',
    preferredContactMethod: 'Email',
    message: '',
    propertyAddress: '123 Main St, Tampa, FL 33602',
    consent: true,
    ...overrides,
  }
}

describe('validateLeadInput — required fields', () => {
  it('accepts a valid payload with email only', () => {
    const result = validateLeadInput(basePayload())
    expect(result.valid).toBe(true)
  })

  it('accepts a valid payload with phone only', () => {
    const result = validateLeadInput(basePayload({ email: '', phone: '555-123-4567' }))
    expect(result.valid).toBe(true)
  })

  it('rejects a missing/blank name', () => {
    expect(validateLeadInput(basePayload({ name: '' }))).toEqual({ valid: false, error: 'Please enter your name.' })
    expect(validateLeadInput(basePayload({ name: '   ' }))).toEqual({ valid: false, error: 'Please enter your name.' })
  })

  it('requires consent to be explicitly true — missing, false, or truthy-but-not-boolean-true all fail', () => {
    expect(validateLeadInput(basePayload({ consent: false })).valid).toBe(false)
    expect(validateLeadInput(basePayload({ consent: undefined })).valid).toBe(false)
    expect(validateLeadInput(basePayload({ consent: 'true' })).valid).toBe(false)
  })

  it('requires at least one of email or phone', () => {
    const result = validateLeadInput(basePayload({ email: '', phone: '' }))
    expect(result).toEqual({ valid: false, error: 'Please provide an email or phone number.' })
  })

  it('rejects an implausible email format', () => {
    const result = validateLeadInput(basePayload({ email: 'not-an-email' }))
    expect(result.valid).toBe(false)
  })

  it('rejects an implausible phone format', () => {
    const result = validateLeadInput(basePayload({ email: '', phone: 'call me maybe' }))
    expect(result.valid).toBe(false)
  })

  it('requires a recognized preferred contact method', () => {
    expect(validateLeadInput(basePayload({ preferredContactMethod: 'Carrier Pigeon' })).valid).toBe(false)
    expect(validateLeadInput(basePayload({ preferredContactMethod: undefined })).valid).toBe(false)
  })
})

describe('validateLeadInput — optional fields', () => {
  it('message and propertyAddress are optional — a valid submission without them still passes', () => {
    const result = validateLeadInput(basePayload({ message: '', propertyAddress: '' }))
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.message).toBeNull()
      expect(result.data.propertyAddress).toBeNull()
    }
  })

  it('trims whitespace and caps length rather than rejecting an overlong message', () => {
    const long = 'a'.repeat(5000)
    const result = validateLeadInput(basePayload({ message: long }))
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.data.message?.length).toBeLessThanOrEqual(2000)
  })
})

describe('validateLeadInput — malformed payloads never throw', () => {
  it('handles null/undefined/non-object payloads', () => {
    expect(validateLeadInput(null).valid).toBe(false)
    expect(validateLeadInput(undefined).valid).toBe(false)
    expect(validateLeadInput('a string').valid).toBe(false)
    expect(validateLeadInput(42).valid).toBe(false)
  })
})
