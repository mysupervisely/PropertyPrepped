// PropRoster — property image provider abstraction. Nothing outside this
// module (the /api/property-image route, the comp-card UI) knows this app
// currently uses Google Street View — every caller talks to
// PropertyImageProvider, mirroring the exact same pattern already used
// for lib/valuation/provider.ts, lib/address/provider.ts, and
// lib/document-intelligence/provider.ts in this codebase.
//
// Extensibility note (Part 2 — "future provider order may eventually
// become MLS/IDX → Street View → PropRoster placeholder"): that chain is
// NOT built here. Building it would mean a small wrapper provider that
// tries an MLS/IDX PropertyImageProvider first and falls through to this
// one on a miss — the interface in types.ts is already shaped to support
// that without any changes, but no MLS/IDX work is started in this pass.

import type { PropertyImageProvider } from './types'
import { StreetViewImageProvider } from './providers/street-view'

/** True only when the required environment variable is present. */
export function isPropertyImageConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.GOOGLE_STREET_VIEW_API_KEY)
}

/**
 * Returns a configured PropertyImageProvider, or null if none is
 * configured — never throws. Every caller must treat null exactly like
 * "no imagery available" (Part 8: a missing/invalid key must never break
 * Property Value & Comps, only fall back to the placeholder).
 */
export function getPropertyImageProvider(): PropertyImageProvider | null {
  if (!isPropertyImageConfigured()) return null
  return new StreetViewImageProvider(process.env.GOOGLE_STREET_VIEW_API_KEY!)
}
