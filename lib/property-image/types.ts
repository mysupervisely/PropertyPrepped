// PropRoster — Property Value & Comps: Street View imagery addition.
//
// A location to look up imagery for — a comparable (or, in principle,
// the subject property) reduced to exactly what a PropertyImageProvider
// needs. Nothing here is Google-specific; a future MLS/IDX provider would
// consume the same shape.

export type PropertyImageLocation = {
  formattedAddress: string
  latitude: number | null
  longitude: number | null
}

/**
 * Result of checking whether imagery EXISTS for a location — deliberately
 * never carries image bytes, so this can be cached cheaply and safely
 * (see availability-cache.ts) without ever storing Content itself.
 */
export type PropertyImageAvailability =
  | { available: true; panoId: string }
  | { available: false; reason: 'no_imagery' | 'provider_error' }

/**
 * Result of actually fetching image bytes for a previously-confirmed
 * panorama. NEVER cached/persisted by this app (see availability-cache.ts
 * for exactly what is and isn't cached, and why).
 */
export type PropertyImageBytes =
  | { ok: true; contentType: string; bytes: Uint8Array; attributionText: string }
  | { ok: false; reason: 'provider_error' }

/**
 * One real-imagery source. Street View is the only implementation today;
 * the interface is intentionally provider-agnostic so a future step (NOT
 * built in this pass — see provider.ts) could try an MLS/IDX photo
 * provider first and fall through to Street View, with the PropRoster
 * placeholder always the final fallback regardless of how many real
 * providers exist.
 */
export interface PropertyImageProvider {
  readonly name: string
  /** Cheap existence check. Must never return image bytes. */
  checkAvailability(location: PropertyImageLocation): Promise<PropertyImageAvailability>
  /**
   * Fetches actual image bytes. `panoId` should be passed whenever known
   * (fresh from checkAvailability(), or from the availability cache) so
   * the image returned is guaranteed to be the exact panorama that was
   * confirmed to exist — never a second, possibly-different lookup by
   * address/coordinates.
   */
  fetchImageBytes(location: PropertyImageLocation, panoId: string | null): Promise<PropertyImageBytes>
}
