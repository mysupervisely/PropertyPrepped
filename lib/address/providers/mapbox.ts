// PropRoster Milestone: Investment Tools 2.0 — Mapbox implementation of
// AddressSearchProvider, using the Mapbox Search Box API (suggest +
// retrieve), which is Mapbox's current recommended API for exactly this
// "type-ahead partial address -> resolve a full structured address" flow
// (the same shape Address Autofill uses).
//
// This is the ONLY file in the codebase that talks to Mapbox's HTTP API —
// every other module goes through the AddressSearchProvider interface
// (lib/address/provider.ts).
//
// VERIFICATION NOTE: written against Mapbox's documented Search Box API
// request/response shape (suggest: GET .../search/searchbox/v1/suggest;
// retrieve: GET .../search/searchbox/v1/retrieve/{id}), with the
// normalization below reading from the documented `properties.context`
// sub-object structure (address/street/place/region/postcode/country).
// No MAPBOX_ACCESS_TOKEN is available in this environment to exercise a
// live call — normalizeMapboxFeature() is unit tested against a
// realistic sample response (mapbox.test.ts), but the live HTTP round
// trip has NOT been exercised against Mapbox's real service. Verify with
// a real token before relying on this in production; if Mapbox's response
// shape has drifted, only this file and its test need to change — nothing
// else in the app depends on Mapbox's wire format.

import type { NormalizedAddress, AddressSuggestion } from '../types'
import type { AddressSearchProvider } from '../provider'

const SUGGEST_URL = 'https://api.mapbox.com/search/searchbox/v1/suggest'
const RETRIEVE_URL = 'https://api.mapbox.com/search/searchbox/v1/retrieve'

// A Search Box "session" groups a suggest→retrieve pair for Mapbox's
// session-based billing. One token per provider-instance lifetime (a
// server-side request in this app's case) is a reasonable, documented
// approximation — see Mapbox's session pricing docs before high-volume use.
function newSessionToken(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

type MapboxContextEntry = { name?: string; region_code?: string; country_code?: string }
type MapboxSuggestFeature = { mapbox_id: string; name?: string; place_formatted?: string; full_address?: string }
type MapboxSuggestResponse = { suggestions?: MapboxSuggestFeature[] }
type MapboxRetrieveFeature = {
  id?: string
  properties?: {
    mapbox_id?: string
    name?: string
    place_formatted?: string
    full_address?: string
    address_line1?: string
    address_line2?: string
    context?: {
      address?: MapboxContextEntry
      street?: MapboxContextEntry
      place?: MapboxContextEntry
      region?: MapboxContextEntry
      postcode?: MapboxContextEntry
      country?: MapboxContextEntry
    }
    coordinates?: { longitude?: number; latitude?: number }
  }
  geometry?: { coordinates?: [number, number] }
}
type MapboxRetrieveResponse = { features?: MapboxRetrieveFeature[] }

/**
 * Pure normalization: Mapbox's raw retrieve-feature shape -> this app's
 * NormalizedAddress. No network, no side effects — exercised directly in
 * mapbox.test.ts against a realistic sample response, independent of
 * whether a live Mapbox call can be made in this environment.
 */
export function normalizeMapboxFeature(feature: MapboxRetrieveFeature): NormalizedAddress {
  const props = feature.properties || {}
  const ctx = props.context || {}
  const [lon, lat] = feature.geometry?.coordinates || []

  return {
    formattedAddress: props.full_address || props.place_formatted || props.name || '',
    addressLine1: props.address_line1 || [ctx.address?.name, ctx.street?.name].filter(Boolean).join(' ') || null,
    addressLine2: props.address_line2 || null,
    city: ctx.place?.name || null,
    state: ctx.region?.region_code || ctx.region?.name || null,
    postalCode: ctx.postcode?.name || null,
    country: ctx.country?.country_code || ctx.country?.name || null,
    latitude: typeof lat === 'number' ? lat : (props.coordinates?.latitude ?? null),
    longitude: typeof lon === 'number' ? lon : (props.coordinates?.longitude ?? null),
    providerId: props.mapbox_id || feature.id || null,
  }
}

export class MapboxAddressSearchProvider implements AddressSearchProvider {
  readonly name = 'mapbox'
  private accessToken: string
  private sessionToken: string

  constructor(accessToken: string) {
    this.accessToken = accessToken
    this.sessionToken = newSessionToken()
  }

  async search(query: string): Promise<AddressSuggestion[]> {
    const trimmed = query.trim()
    if (!trimmed) return []

    const url = new URL(SUGGEST_URL)
    url.searchParams.set('q', trimmed)
    url.searchParams.set('access_token', this.accessToken)
    url.searchParams.set('session_token', this.sessionToken)
    url.searchParams.set('types', 'address')
    url.searchParams.set('limit', '5')
    // Final Launch Fixes: PropRoster V1 is U.S.-only, but nothing was
    // restricting Search Box results to it — a production test returned
    // an Australian suggestion. Mapbox's suggest endpoint has a real
    // server-side `country` filter (ISO 3166-1 alpha-2, comma-separated)
    // built for exactly this; using it means non-U.S. results are never
    // returned in the first place, rather than trusting a client-side
    // filter to remember to drop them after the fact.
    url.searchParams.set('country', 'us')

    const response = await fetch(url.toString())
    if (!response.ok) {
      throw new Error(`Mapbox suggest request failed (${response.status})`)
    }
    const body = (await response.json()) as MapboxSuggestResponse
    return (body.suggestions || [])
      .filter((s) => s.mapbox_id)
      .map((s) => ({
        id: s.mapbox_id,
        label: s.full_address || s.place_formatted || s.name || s.mapbox_id,
      }))
  }

  async resolve(providerId: string): Promise<NormalizedAddress | null> {
    const url = new URL(`${RETRIEVE_URL}/${encodeURIComponent(providerId)}`)
    url.searchParams.set('access_token', this.accessToken)
    url.searchParams.set('session_token', this.sessionToken)

    const response = await fetch(url.toString())
    if (!response.ok) {
      if (response.status === 404) return null
      throw new Error(`Mapbox retrieve request failed (${response.status})`)
    }
    const body = (await response.json()) as MapboxRetrieveResponse
    const feature = body.features?.[0]
    if (!feature) return null
    return normalizeMapboxFeature(feature)
  }
}
