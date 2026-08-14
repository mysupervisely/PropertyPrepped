import { afterEach, describe, expect, it } from 'vitest'
import { getPropertyValuationProvider, isValuationProviderConfigured } from './provider'

const ORIGINAL_RENTCAST = process.env.RENTCAST_API_KEY
const ORIGINAL_ATTOM = process.env.ATTOM_API_KEY

afterEach(() => {
  if (ORIGINAL_RENTCAST === undefined) delete process.env.RENTCAST_API_KEY
  else process.env.RENTCAST_API_KEY = ORIGINAL_RENTCAST
  if (ORIGINAL_ATTOM === undefined) delete process.env.ATTOM_API_KEY
  else process.env.ATTOM_API_KEY = ORIGINAL_ATTOM
})

describe('isValuationProviderConfigured', () => {
  it('is false when neither RENTCAST_API_KEY nor ATTOM_API_KEY is set', () => {
    expect(isValuationProviderConfigured({})).toBe(false)
  })
  it('is true when RENTCAST_API_KEY is set', () => {
    expect(isValuationProviderConfigured({ RENTCAST_API_KEY: 'key' })).toBe(true)
  })
  it('is true when only ATTOM_API_KEY is set', () => {
    expect(isValuationProviderConfigured({ ATTOM_API_KEY: 'key' })).toBe(true)
  })
})

describe('getPropertyValuationProvider — unavailable state (Part 8: never fake production valuations)', () => {
  it('returns null (never throws, never a stub with fake data) when no provider is configured', () => {
    delete process.env.RENTCAST_API_KEY
    delete process.env.ATTOM_API_KEY
    expect(getPropertyValuationProvider()).toBeNull()
  })

  it('prefers RentCast when both are configured', () => {
    process.env.RENTCAST_API_KEY = 'rc-key'
    process.env.ATTOM_API_KEY = 'attom-key'
    expect(getPropertyValuationProvider()!.name).toBe('rentcast')
  })

  it('falls back to ATTOM when only ATTOM_API_KEY is set — the abstraction is not tightly coupled to RentCast (Part 3/8)', () => {
    delete process.env.RENTCAST_API_KEY
    process.env.ATTOM_API_KEY = 'attom-key'
    expect(getPropertyValuationProvider()!.name).toBe('attom')
  })
})
