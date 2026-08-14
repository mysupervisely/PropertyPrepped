import { describe, expect, it } from 'vitest'
import { normalizeMapboxFeature } from './mapbox'

describe('normalizeMapboxFeature — Mapbox Search Box raw response -> NormalizedAddress', () => {
  it('extracts a fully-populated feature into every NormalizedAddress field', () => {
    const feature = {
      id: 'dXJuOm1ieHBsYzpBQUFB',
      properties: {
        mapbox_id: 'dXJuOm1ieHBsYzpBQUFB',
        name: '17 Amazon Ave',
        place_formatted: 'Miami, FL 33101',
        full_address: '17 Amazon Ave, Miami, FL 33101, United States',
        address_line1: '17 Amazon Ave',
        context: {
          address: { name: '17 Amazon Ave' },
          street: { name: 'Amazon Ave' },
          place: { name: 'Miami' },
          region: { name: 'Florida', region_code: 'FL' },
          postcode: { name: '33101' },
          country: { name: 'United States', country_code: 'us' },
        },
      },
      geometry: { coordinates: [-80.19, 25.774] as [number, number] },
    }

    const result = normalizeMapboxFeature(feature)
    expect(result).toEqual({
      formattedAddress: '17 Amazon Ave, Miami, FL 33101, United States',
      addressLine1: '17 Amazon Ave',
      addressLine2: null,
      city: 'Miami',
      state: 'FL',
      postalCode: '33101',
      country: 'us',
      latitude: 25.774,
      longitude: -80.19,
      providerId: 'dXJuOm1ieHBsYzpBQUFB',
    })
  })

  it('falls back to place_formatted/name when full_address is absent', () => {
    const feature = { properties: { name: '17 Amazon Ave', place_formatted: 'Miami, FL' } }
    const result = normalizeMapboxFeature(feature)
    expect(result.formattedAddress).toBe('Miami, FL')
  })

  it('builds addressLine1 from context.address + context.street when address_line1 is absent', () => {
    const feature = { properties: { context: { address: { name: '17' }, street: { name: 'Amazon Ave' } } } }
    const result = normalizeMapboxFeature(feature)
    expect(result.addressLine1).toBe('17 Amazon Ave')
  })

  it('never fabricates city/state/postal/country/lat/lng when the source data is missing — all stay null', () => {
    const result = normalizeMapboxFeature({ properties: { name: 'Somewhere' } })
    expect(result.city).toBeNull()
    expect(result.state).toBeNull()
    expect(result.postalCode).toBeNull()
    expect(result.country).toBeNull()
    expect(result.latitude).toBeNull()
    expect(result.longitude).toBeNull()
    expect(result.addressLine1).toBeNull()
  })

  it('formattedAddress is always a string, never undefined, even for a completely empty feature', () => {
    const result = normalizeMapboxFeature({})
    expect(result.formattedAddress).toBe('')
    expect(typeof result.formattedAddress).toBe('string')
  })

  it('prefers region_code ("FL") over the full region name for `state`', () => {
    const result = normalizeMapboxFeature({ properties: { context: { region: { name: 'Florida', region_code: 'FL' } } } })
    expect(result.state).toBe('FL')
  })

  it('falls back to the full region name when region_code is absent', () => {
    const result = normalizeMapboxFeature({ properties: { context: { region: { name: 'Florida' } } } })
    expect(result.state).toBe('Florida')
  })

  it('uses feature.id as providerId when properties.mapbox_id is absent', () => {
    const result = normalizeMapboxFeature({ id: 'fallback-id', properties: {} })
    expect(result.providerId).toBe('fallback-id')
  })
})
