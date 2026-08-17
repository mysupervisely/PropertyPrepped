// PropRoster — Street View availability cache.
//
// WHAT is cached: only the RESULT of a metadata check — either
// { available: true, panoId } or { available: false, reason }. Never
// image bytes, never anything Google would consider "Content" beyond a
// panorama id. This matches Google Maps Platform's terms, which
// generally prohibit pre-fetching/caching/storing Content but explicitly
// permit caching Place IDs and Street View panorama ids (pano_id) —
// see the completion report for the exact citation. Image bytes
// themselves are NEVER written here or anywhere else server-side; see
// app/api/property-image/route.ts for the (browser-only, short-lived)
// HTTP caching applied to the actual image response.
//
// WHERE: an in-memory Map in this module, private to the server process.
// On Netlify's serverless runtime this is best-effort — it only helps
// while a function instance stays warm between requests, not a
// guaranteed cross-request/global cache — but it costs nothing extra to
// have, and meaningfully cuts duplicate Google metadata calls during a
// burst of nearby lookups (e.g. re-running the same valuation, or two
// users independently valuing nearby properties whose comps overlap)
// within one warm instance's lifetime.
//
// FOR HOW LONG: 24 hours per entry (a panorama's existence essentially
// never changes minute-to-minute, so a bounded but not tiny TTL is safe),
// and the Map is capped at MAX_ENTRIES with oldest-first eviction so an
// unusually long-lived warm instance can't grow this unbounded.

import type { PropertyImageAvailability } from './types'

const TTL_MS = 24 * 60 * 60 * 1000
const MAX_ENTRIES = 500

type CacheEntry = { value: PropertyImageAvailability; expiresAt: number }

const cache = new Map<string, CacheEntry>()

/** Rounded to ~11m precision (5 decimal places) — enough to distinguish real addresses while treating trivial float noise in the same coordinate as one cache entry. */
export function cacheKeyForLocation(location: { formattedAddress: string; latitude: number | null; longitude: number | null }): string {
  if (location.latitude !== null && location.longitude !== null) {
    return `geo:${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`
  }
  return `addr:${location.formattedAddress.trim().toLowerCase()}`
}

export function getCachedAvailability(key: string): PropertyImageAvailability | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return undefined
  }
  return entry.value
}

export function setCachedAvailability(key: string, value: PropertyImageAvailability): void {
  if (cache.size >= MAX_ENTRIES && !cache.has(key)) {
    const oldestKey = cache.keys().next().value
    if (oldestKey !== undefined) cache.delete(oldestKey)
  }
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS })
}

/** Test-only: clears all cached entries so tests don't leak state into each other. */
export function clearAvailabilityCacheForTests(): void {
  cache.clear()
}
