// PropRoster — Google Street View Static API implementation of
// PropertyImageProvider. This is the ONLY file in the codebase that talks
// to Google's Street View endpoints, and the ONLY place
// GOOGLE_STREET_VIEW_API_KEY is ever read — mirroring the same
// one-file-owns-the-provider-secret pattern already used for
// lib/valuation/providers/rentcast.ts (RENTCAST_API_KEY) and
// lib/address/providers/mapbox.ts (MAPBOX_ACCESS_TOKEN).
//
// CRITICAL (security): the API key is used ONLY to build outbound
// server-side fetch() calls to Google below. It is never included in any
// value this module returns (PropertyImageAvailability/PropertyImageBytes
// carry no URL at all, let alone one with a key in it), never logged (the
// error logging below logs Google's status string only, never the
// request URL), and this file is never imported from a 'use client'
// component — the only caller is app/api/property-image/route.ts
// (server-only, Next.js route handler).
//
// Two Google endpoints, used in sequence:
//  1. Street View Static API — Metadata:
//     GET https://maps.googleapis.com/maps/api/streetview/metadata
//     Documented statuses: OK, ZERO_RESULTS, NOT_FOUND, OVER_QUERY_LIMIT,
//     REQUEST_DENIED, INVALID_REQUEST, UNKNOWN_ERROR. Metadata requests
//     are used SPECIFICALLY to avoid ever requesting (and being billed
//     for) a Static Image when no panorama exists — see Part 3 of the
//     Street View task spec.
//  2. Street View Static API — Image:
//     GET https://maps.googleapis.com/maps/api/streetview
//     Only ever called with `pano=<panoId>` from step 1 (never a second,
//     independent location lookup) — see fetchImageBytes()'s doc comment
//     for why.
//
// VERIFICATION NOTE (same caveat as every other provider in this
// codebase): no GOOGLE_STREET_VIEW_API_KEY is available in this
// environment to exercise a live call. Written against Google's
// documented request/response shape and unit tested with a mocked
// fetch() against realistic sample responses (street-view.test.ts) — the
// live HTTP round trip has not been exercised. Verify against a real key
// before depending on this in production.

import type { PropertyImageAvailability, PropertyImageBytes, PropertyImageLocation, PropertyImageProvider } from '../types'

const METADATA_URL = 'https://maps.googleapis.com/maps/api/streetview/metadata'
const IMAGE_URL = 'https://maps.googleapis.com/maps/api/streetview'

// Sized for the existing comp-card photo area (a fixed-height, fluid-width
// box — see .compPhotoArea in globals.css); object-fit:cover crops this
// to fit any card width, so an exact aspect-ratio match isn't required.
// 640 is the Static API's free-tier maximum in either dimension.
const IMAGE_SIZE = '640x400'
// A moderate field of view — wide enough to show the property and a bit
// of context without the fisheye distortion of a very wide FOV, and
// without the "zoomed in" look of a narrow one (Part 4: "reasonable
// field of view... do not over-zoom").
const FIELD_OF_VIEW = 80

const TIMEOUT_MS = 5000

type StreetViewMetadataResponse = { status?: string; pano_id?: string }

function withTimeout(signalSource?: AbortSignal): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  if (signalSource) signalSource.addEventListener('abort', () => controller.abort())
  return { signal: controller.signal, cancel: () => clearTimeout(timer) }
}

/** `location=lat,lng` when both coordinates are available (more precise panorama matching per Part 11), else the formatted address string. */
function locationParam(location: PropertyImageLocation): string {
  if (location.latitude !== null && location.longitude !== null) {
    return `${location.latitude},${location.longitude}`
  }
  return location.formattedAddress
}

export class StreetViewImageProvider implements PropertyImageProvider {
  readonly name = 'google-street-view'
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async checkAvailability(location: PropertyImageLocation): Promise<PropertyImageAvailability> {
    if (!location.formattedAddress && location.latitude === null) {
      return { available: false, reason: 'no_imagery' }
    }
    const url = new URL(METADATA_URL)
    url.searchParams.set('location', locationParam(location))
    url.searchParams.set('key', this.apiKey)

    const { signal, cancel } = withTimeout()
    try {
      const response = await fetch(url.toString(), { signal })
      cancel()
      if (!response.ok) {
        console.error('street view metadata request failed', response.status)
        return { available: false, reason: 'provider_error' }
      }
      const body = (await response.json().catch(() => ({}))) as StreetViewMetadataResponse
      if (body.status === 'ZERO_RESULTS' || body.status === 'NOT_FOUND') {
        return { available: false, reason: 'no_imagery' }
      }
      if (body.status !== 'OK' || !body.pano_id) {
        console.error('street view metadata returned non-OK status', body.status)
        return { available: false, reason: 'provider_error' }
      }
      return { available: true, panoId: body.pano_id }
    } catch (err) {
      cancel()
      console.error('street view metadata request errored', err instanceof Error ? err.message : err)
      return { available: false, reason: 'provider_error' }
    }
  }

  /**
   * Always call with the panoId from a just-completed (or cached)
   * checkAvailability() when one is known — using `pano=` guarantees this
   * fetches the EXACT panorama that was confirmed to exist, rather than
   * re-resolving the location a second time (which could, in principle,
   * resolve to a different nearby panorama than the one checked).
   */
  async fetchImageBytes(location: PropertyImageLocation, panoId: string | null): Promise<PropertyImageBytes> {
    const url = new URL(IMAGE_URL)
    if (panoId) {
      url.searchParams.set('pano', panoId)
    } else {
      url.searchParams.set('location', locationParam(location))
    }
    url.searchParams.set('size', IMAGE_SIZE)
    url.searchParams.set('fov', String(FIELD_OF_VIEW))
    url.searchParams.set('key', this.apiKey)
    // heading intentionally omitted — Google auto-calculates a heading
    // that faces the given location/pano when none is supplied, which is
    // exactly the "aim at the property" behavior Part 4 wants, without
    // this app guessing at a heading value itself.

    const { signal, cancel } = withTimeout()
    try {
      const response = await fetch(url.toString(), { signal })
      cancel()
      if (!response.ok) {
        console.error('street view image request failed', response.status)
        return { ok: false, reason: 'provider_error' }
      }
      const contentType = response.headers.get('content-type') || 'image/jpeg'
      const bytes = new Uint8Array(await response.arrayBuffer())
      return { ok: true, contentType, bytes, attributionText: 'Street View imagery © Google' }
    } catch (err) {
      cancel()
      console.error('street view image request errored', err instanceof Error ? err.message : err)
      return { ok: false, reason: 'provider_error' }
    }
  }
}
