import { describe, expect, it } from 'vitest'
import { checkRateLimit, extractClientIp, isHoneypotTripped, type RateLimitState } from './rate-limit'

describe('checkRateLimit', () => {
  it('allows requests under the limit', () => {
    const state: RateLimitState = new Map()
    const config = { maxRequests: 3, windowMs: 60_000 }
    expect(checkRateLimit(state, 'ip1', 1000, config)).toBe(true)
    expect(checkRateLimit(state, 'ip1', 2000, config)).toBe(true)
    expect(checkRateLimit(state, 'ip1', 3000, config)).toBe(true)
  })

  it('blocks the request once the limit is reached within the window', () => {
    const state: RateLimitState = new Map()
    const config = { maxRequests: 2, windowMs: 60_000 }
    expect(checkRateLimit(state, 'ip1', 1000, config)).toBe(true)
    expect(checkRateLimit(state, 'ip1', 2000, config)).toBe(true)
    expect(checkRateLimit(state, 'ip1', 3000, config)).toBe(false)
  })

  it('allows again once the window has fully slid past the earlier requests', () => {
    const state: RateLimitState = new Map()
    const config = { maxRequests: 2, windowMs: 60_000 }
    expect(checkRateLimit(state, 'ip1', 1000, config)).toBe(true)
    expect(checkRateLimit(state, 'ip1', 2000, config)).toBe(true)
    expect(checkRateLimit(state, 'ip1', 3000, config)).toBe(false)
    // 61s later, both earlier timestamps have aged out of the window.
    expect(checkRateLimit(state, 'ip1', 62_000, config)).toBe(true)
  })

  it('tracks distinct keys independently — one caller being limited never affects another', () => {
    const state: RateLimitState = new Map()
    const config = { maxRequests: 1, windowMs: 60_000 }
    expect(checkRateLimit(state, 'ip1', 1000, config)).toBe(true)
    expect(checkRateLimit(state, 'ip1', 1001, config)).toBe(false)
    expect(checkRateLimit(state, 'ip2', 1001, config)).toBe(true)
  })

  it('defaults to REALTOR_LEAD_RATE_LIMIT when no config is passed', () => {
    const state: RateLimitState = new Map()
    for (let i = 0; i < 5; i++) expect(checkRateLimit(state, 'ip1', 1000 + i)).toBe(true)
    expect(checkRateLimit(state, 'ip1', 1006)).toBe(false)
  })
})

describe('extractClientIp', () => {
  it('prefers x-forwarded-for, using only the first (client) hop', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.5, 70.41.3.18, 150.172.238.178' })
    expect(extractClientIp(headers)).toBe('203.0.113.5')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const headers = new Headers({ 'x-real-ip': '203.0.113.9' })
    expect(extractClientIp(headers)).toBe('203.0.113.9')
  })

  it('never throws and returns "unknown" when neither header is present', () => {
    const headers = new Headers()
    expect(extractClientIp(headers)).toBe('unknown')
  })
})

describe('isHoneypotTripped', () => {
  it('is false for empty/whitespace/absent values — the real, expected case', () => {
    expect(isHoneypotTripped('')).toBe(false)
    expect(isHoneypotTripped('   ')).toBe(false)
    expect(isHoneypotTripped(undefined)).toBe(false)
    expect(isHoneypotTripped(null)).toBe(false)
  })

  it('is true whenever the honeypot field has any real content', () => {
    expect(isHoneypotTripped('http://spam.example')).toBe(true)
  })
})
