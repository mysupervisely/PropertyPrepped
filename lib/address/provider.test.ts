import { afterEach, describe, expect, it } from 'vitest'
import { getAddressSearchProvider, isAddressSearchConfigured } from './provider'

const ORIGINAL_TOKEN = process.env.MAPBOX_ACCESS_TOKEN

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.MAPBOX_ACCESS_TOKEN
  else process.env.MAPBOX_ACCESS_TOKEN = ORIGINAL_TOKEN
})

describe('isAddressSearchConfigured', () => {
  it('is false when MAPBOX_ACCESS_TOKEN is unset', () => {
    expect(isAddressSearchConfigured({})).toBe(false)
  })

  it('is true when MAPBOX_ACCESS_TOKEN is set', () => {
    expect(isAddressSearchConfigured({ MAPBOX_ACCESS_TOKEN: 'pk.test' })).toBe(true)
  })
})

describe('getAddressSearchProvider — provider unavailable / manual fallback', () => {
  it('returns null (never throws) when MAPBOX_ACCESS_TOKEN is unset — this is the exact signal every caller uses to fall back to manual address entry', () => {
    delete process.env.MAPBOX_ACCESS_TOKEN
    expect(getAddressSearchProvider()).toBeNull()
  })

  it('returns a configured provider once MAPBOX_ACCESS_TOKEN is set', () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.test-token'
    const provider = getAddressSearchProvider()
    expect(provider).not.toBeNull()
    expect(provider!.name).toBe('mapbox')
  })
})
