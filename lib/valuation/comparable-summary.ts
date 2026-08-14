// PropRoster Milestone: Investment Tools 2.0 — Property Value & Comps
// "Comparable Summary" (Part 9). A short, plain-language recap built
// PURELY from the numbers already in a PropertyValuationResult — string
// formatting, not analysis. No AI, no invented facts; if this needs to
// become an LLM-written explanation later (Part 9: "AI may eventually
// explain data"), that would summarize this same real data, never
// generate new sale prices/dates/characteristics/estimates of its own.

import type { PropertyValuationResult } from './types'

/** Returns null when there are no comparables to summarize — never a fabricated sentence about data that doesn't exist. */
export function buildComparableSummary(result: PropertyValuationResult): string | null {
  const comps = result.comparables
  if (!comps.length) return null

  const parts = [`Based on ${comps.length} comparable sale${comps.length === 1 ? '' : 's'}`]

  const distances = comps.map((c) => c.distanceMiles).filter((d): d is number => typeof d === 'number')
  if (distances.length) {
    const maxDistance = Math.max(...distances)
    parts.push(`within ${maxDistance.toFixed(1)} mi`)
  }

  const dates = comps.map((c) => c.saleDate).filter(Boolean).sort()
  if (dates.length) {
    const earliest = formatShortDate(dates[0])
    const latest = formatShortDate(dates[dates.length - 1])
    parts.push(earliest === latest ? `sold ${earliest}` : `sold between ${earliest} and ${latest}`)
  }

  return `${parts.join(' ')}.`
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}
