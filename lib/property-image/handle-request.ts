// PropRoster — the testable core of GET /api/property-image, expressed as
// a plain async function with injected dependencies (provider + cache
// read/write) rather than reading process.env or the module-level cache
// directly — the same "ports and adapters" seam already used for
// lib/document-intelligence/analyze-request.ts, so this can be unit
// tested (including cache hits/misses and every failure mode) without a
// real Google account or a running Next.js server.

import type { PropertyImageAvailability, PropertyImageLocation, PropertyImageProvider } from './types'
import { cacheKeyForLocation } from './availability-cache'

export type PropertyImageRequestDeps = {
  getProvider: () => PropertyImageProvider | null
  getCached: (key: string) => PropertyImageAvailability | undefined
  setCached: (key: string, value: PropertyImageAvailability) => void
}

export type PropertyImageRequestResult =
  | { status: 200; contentType: string; bytes: Uint8Array; cacheControl: string }
  | { status: 400 | 404 | 502 }

const IMAGE_CACHE_CONTROL = 'public, max-age=3600' // see route.ts / the completion report for why 1 hour, and why this is the ONLY caching of bytes anywhere (browser/CDN HTTP cache, never server-side storage).

/**
 * Resolves one property-image request end to end: validates input, uses
 * the cache to skip a redundant Google metadata call when possible, and
 * only ever fetches image bytes for a panorama already confirmed to
 * exist. Never throws — every failure path (missing config, no imagery,
 * upstream error) resolves to a plain 4xx/5xx result the route can return
 * as-is, so a Street View problem can never surface as an unhandled
 * exception on this route, let alone anywhere near /api/valuation.
 */
export async function handlePropertyImageRequest(location: PropertyImageLocation, deps: PropertyImageRequestDeps): Promise<PropertyImageRequestResult> {
  if (!location.formattedAddress.trim() && location.latitude === null) {
    return { status: 400 }
  }

  const provider = deps.getProvider()
  if (!provider) {
    return { status: 404 }
  }

  const key = cacheKeyForLocation(location)
  let availability = deps.getCached(key)
  if (!availability) {
    availability = await provider.checkAvailability(location)
    deps.setCached(key, availability)
  }

  if (!availability.available) {
    return { status: 404 }
  }

  const image = await provider.fetchImageBytes(location, availability.panoId)
  if (!image.ok) {
    return { status: 502 }
  }

  return { status: 200, contentType: image.contentType, bytes: image.bytes, cacheControl: IMAGE_CACHE_CONTROL }
}
