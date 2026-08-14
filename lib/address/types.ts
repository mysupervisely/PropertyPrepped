// PropRoster Milestone: Investment Tools 2.0 — universal address entry.
//
// One normalized address shape used everywhere PropRoster asks for a
// property address (Add Property, Edit Property, Rental Property Analyzer,
// Home Purchase Calculator, Property Value & Comps). A single shape here is
// what lets AddressAutocomplete (components/AddressAutocomplete.tsx) and
// every consumer stay provider-agnostic — nothing outside lib/address/
// knows whether Mapbox, another provider, or no provider at all produced
// a given address.

/**
 * A single normalized, resolved address. Every field except
 * `formattedAddress` may be unknown for a given source (e.g. a
 * manually-typed address with no provider match at all) — always treat the
 * optional-shaped fields as possibly `null`, never assume a provider filled
 * them in.
 */
export type NormalizedAddress = {
  /** The full human-readable address, always present — this is what's shown/stored when nothing more structured is available. */
  formattedAddress: string
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  /** Opaque id from whichever AddressSearchProvider resolved this address (e.g. a Mapbox feature id) — null for a manually-typed address with no provider match. */
  providerId: string | null
}

/** One row in an autocomplete suggestion list — deliberately minimal; the full NormalizedAddress is only fetched on selection via resolve(). */
export type AddressSuggestion = {
  id: string
  /** Single-line label to show in the dropdown, e.g. "17 Amazon Ave, Miami, FL 33101". */
  label: string
}

/** Builds a plain manually-typed NormalizedAddress with no provider involvement — used whenever autocomplete is unavailable or the user just typed free text. Never a guess at city/state/postal — those stay null rather than parsed out of free text. */
export function manualAddress(text: string): NormalizedAddress {
  return {
    formattedAddress: text,
    addressLine1: text || null,
    addressLine2: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    latitude: null,
    longitude: null,
    providerId: null,
  }
}
