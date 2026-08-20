// PropRoster Milestone 21: Realtor Connect V1 — conservative geography
// classification.
//
// Section 7: "PropRoster owner will manually decide whether to handle or
// refer leads... Do not create automatic routing... Use conservative
// geography logic... Do not use a paid geocoding service... Do not guess
// based on state alone."
//
// PropRoster's calculators only ever collect a single free-text address
// string (see AddressAutocomplete / lib/address/types.ts's
// formattedAddress) — there is no structured city/state/ZIP field to read
// on the client side of either calculator. This module parses that one
// string with plain regexes (no network call, no paid service) and
// classifies it using two independent, conservative signals:
//
//   1. A curated, non-exhaustive allowlist of Tampa Bay MSA city names
//      (Hillsborough/Pinellas/Pasco/Hernando counties) — a match here is
//      the ONLY way a lead is marked "Tampa Bay Area".
//   2. A confidently-parsed state — if it's clearly present and NOT
//      Florida, or it IS Florida but no Tampa Bay city matched, that's a
//      real (not guessed) signal the property is outside the Tampa Bay
//      area. Florida is a large state; being in FL does not by itself
//      imply Tampa Bay, so this path never returns "Tampa Bay Area" on
//      its own — only the explicit city match (or the ZIP-prefix check
//      below) can.
//   3. A ZIP-code prefix check as a second, independent path to "Tampa
//      Bay Area" when the city name wasn't recognized but a Tampa-Bay-
//      area ZIP code was present (e.g. an address typed without a city).
//
// Anything that doesn't confidently match one of these — no parseable
// state, no recognized city, no recognized ZIP prefix — is "Unknown".
// This is deliberately a coarse, product-level signal for a human
// (the PropRoster owner) to review, never an automatic routing decision.

import type { GeographyBucket } from './types'

// Curated, not exhaustive — core Tampa Bay MSA (Hillsborough, Pinellas,
// Pasco, Hernando). Deliberately excludes Sarasota/Manatee/Polk, which
// some broader "Tampa Bay region" definitions include but which are
// commonly treated as their own separate market — a product/business call
// the PropRoster owner can expand later (see completion report).
export const TAMPA_BAY_CITIES: readonly string[] = [
  'tampa', 'st. petersburg', 'st petersburg', 'saint petersburg', 'clearwater',
  'largo', 'pinellas park', 'dunedin', 'palm harbor', 'safety harbor',
  'oldsmar', 'tarpon springs', 'seminole', 'gulfport', 'indian rocks beach',
  'madeira beach', 'treasure island', 'st. pete beach', 'st pete beach',
  'brandon', 'riverview', 'valrico', 'lithia', 'plant city', 'temple terrace',
  'lutz', 'wesley chapel', 'land o lakes', "land o' lakes", 'new port richey',
  'port richey', 'hudson', 'zephyrhills', 'dade city', 'trinity', 'odessa',
  'apollo beach', 'ruskin', 'sun city center', 'spring hill', 'brooksville',
]

// Tampa Bay MSA ZIP prefixes (first 3 digits): 335 (Tampa/St Pete/
// Clearwater core), 336 (Tampa/Brandon/Plant City), 337 (Hillsborough/
// Pinellas/New Port Richey), 346 (Hernando/west Pasco).
const TAMPA_BAY_ZIP_PREFIXES: readonly string[] = ['335', '336', '337', '346']

const US_STATE_ABBREVIATIONS = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA',
  'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK',
  'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
])

export type ParsedAddressParts = { city: string | null; state: string | null; zip: string | null }

/**
 * Best-effort, regex-only parse of a free-text "street, City, ST 12345"
 * style address into its trailing city/state/ZIP — never throws, never
 * fabricates a value it can't find. Pure and network-free by design (no
 * geocoding service).
 */
export function parseAddressParts(addressText: string): ParsedAddressParts {
  const text = (addressText || '').trim()
  if (!text) return { city: null, state: null, zip: null }

  // "...City, ST 12345" or "...City, ST 12345-6789" or "...City, ST"
  const match = /,\s*([A-Za-z][A-Za-z .'-]*?)\s*,?\s*([A-Za-z]{2})\b\s*(\d{5})?(?:-\d{4})?\s*$/.exec(text)
  if (match) {
    const [, cityRaw, stateRaw, zipRaw] = match
    const state = stateRaw.toUpperCase()
    return {
      city: cityRaw.trim() || null,
      state: US_STATE_ABBREVIATIONS.has(state) ? state : null,
      zip: zipRaw || null,
    }
  }

  // Fall back to a bare trailing ZIP with no confidently-parsed city/state.
  const zipOnly = /\b(\d{5})(?:-\d{4})?\s*$/.exec(text)
  return { city: null, state: null, zip: zipOnly ? zipOnly[1] : null }
}

function cityMatchesTampaBay(city: string | null): boolean {
  if (!city) return false
  const normalized = city.trim().toLowerCase()
  return TAMPA_BAY_CITIES.includes(normalized)
}

function zipMatchesTampaBay(zip: string | null): boolean {
  if (!zip || zip.length < 3) return false
  return TAMPA_BAY_ZIP_PREFIXES.includes(zip.slice(0, 3))
}

/**
 * Classifies a free-text property address into a coarse geography
 * bucket. Conservative by design: only an explicit Tampa Bay city or ZIP
 * match ever returns "Tampa Bay Area"; a confidently-parsed non-match
 * (any other state, or Florida with no recognized city/ZIP) returns
 * "Outside Tampa Bay Area"; anything unparseable returns "Unknown".
 */
export function classifyGeography(addressText: string): GeographyBucket {
  const parts = parseAddressParts(addressText)

  if (cityMatchesTampaBay(parts.city) || zipMatchesTampaBay(parts.zip)) return 'Tampa Bay Area'

  if (parts.state) return 'Outside Tampa Bay Area'

  // No recognized city/ZIP AND no confidently-parsed state at all — no
  // real signal either way.
  return 'Unknown'
}
