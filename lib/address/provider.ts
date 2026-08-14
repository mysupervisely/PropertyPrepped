// PropRoster Milestone: Investment Tools 2.0 — address provider abstraction.
//
// Nothing outside this module (the API routes, AddressAutocomplete) knows
// this app currently uses Mapbox — every caller talks to
// AddressSearchProvider. Swapping or adding a provider later means writing
// a new class that satisfies this interface and changing the single line
// in getAddressSearchProvider() below, mirroring the exact pattern already
// used for lib/document-intelligence/provider.ts (AI provider) and
// lib/valuation/provider.ts (property valuation provider) in this same
// codebase.

import type { AddressSuggestion, NormalizedAddress } from './types'
import { MapboxAddressSearchProvider } from './providers/mapbox'

export interface AddressSearchProvider {
  readonly name: string
  /** Returns candidate suggestions for a partial address string. Empty array (not an error) when nothing matches. */
  search(query: string): Promise<AddressSuggestion[]>
  /** Resolves a suggestion's opaque id into a full NormalizedAddress. Null if the id is no longer resolvable. */
  resolve(providerId: string): Promise<NormalizedAddress | null>
}

/**
 * True only when the required environment variable is present. Every
 * caller must check this (or handle a null getAddressSearchProvider())
 * before attempting a search — the rest of the app keeps working with
 * manual address entry when this is false (Part 3: "gracefully fall back
 * to manual address entry").
 */
export function isAddressSearchConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.MAPBOX_ACCESS_TOKEN)
}

/** Returns a configured AddressSearchProvider, or null if none is configured. Never throws — callers treat null exactly like "no results available." */
export function getAddressSearchProvider(): AddressSearchProvider | null {
  if (!isAddressSearchConfigured()) return null
  return new MapboxAddressSearchProvider(process.env.MAPBOX_ACCESS_TOKEN!)
}
