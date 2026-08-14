// PropRoster — Property Value & Comps UI Redesign, Part 9 ("Sort comps").
// Pure, client-side re-sort of the comparables PropRoster already has in
// memory — no backend call, no re-fetch, per Part 9's explicit
// requirement. A comparable missing the sorted-on field always sorts to
// the end, regardless of direction, rather than being placed arbitrarily.

import type { ComparableSale } from './types'

export type ComparableSortKey = 'distance' | 'price' | 'date' | 'pricePerSqft' | 'match'

export const COMPARABLE_SORT_OPTIONS: { key: ComparableSortKey; label: string }[] = [
  { key: 'distance', label: 'Distance' },
  { key: 'price', label: 'Sale Price' },
  { key: 'date', label: 'Sale Date' },
  { key: 'pricePerSqft', label: 'Price / Sq Ft' },
  { key: 'match', label: 'Match Quality' },
]

function numericValue(comp: ComparableSale, key: ComparableSortKey): number | null {
  switch (key) {
    case 'distance': return comp.distanceMiles
    case 'price': return comp.salePrice
    case 'date': return comp.saleDate ? new Date(comp.saleDate).getTime() : null
    case 'pricePerSqft': return comp.pricePerSqft
    case 'match': return comp.matchScore
  }
}

// Closest/cheapest/oldest-listed-first metrics sort ascending by default;
// "Sale Date" (newest first) and "Match Quality" (best match first) are
// more useful sorted descending — matches how each metric is normally
// read at a glance.
const DESCENDING: ReadonlySet<ComparableSortKey> = new Set(['date', 'match'])

/** Never mutates the input array — returns a new sorted copy. */
export function sortComparables(comparables: ComparableSale[], sortBy: ComparableSortKey): ComparableSale[] {
  const direction = DESCENDING.has(sortBy) ? -1 : 1
  return [...comparables].sort((a, b) => {
    const av = numericValue(a, sortBy)
    const bv = numericValue(b, sortBy)
    if (av === null && bv === null) return 0
    if (av === null) return 1 // missing values always sort last
    if (bv === null) return -1
    return (av - bv) * direction
  })
}
