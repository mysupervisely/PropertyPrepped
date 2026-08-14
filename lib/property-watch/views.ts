// PropRoster Milestone 11: Property Watch — view selection (Sections 14 &
// 16). Pure functions over an already-loaded list of persisted items; no
// Supabase here, so both the homepage widget and the property-page tab can
// share (and test) exactly the same rules.

import { sortWatchItems } from './urgency'
import type { WatchPriority, WatchStatus } from './types'

type ViewItem = { status: WatchStatus; priority: WatchPriority; event_date: string | null }

const HOMEPAGE_LIMIT = 6

/**
 * Section 14: "Only show Needs Your Attention when there are relevant
 * items." The homepage widget is deliberately scoped to status === 'Needs
 * Attention' only — that IS the "relevant right now" bucket (Upcoming
 * items, including a not-yet-confirmed low-confidence document extraction,
 * stay on the property page's Upcoming column instead of ever reaching the
 * compact homepage section). Capped to keep it "visually compact" per the
 * spec — a portfolio with many properties could otherwise produce a long
 * list.
 */
export function selectHomepageAttentionItems<T extends ViewItem>(items: T[], limit: number = HOMEPAGE_LIMIT): T[] {
  const relevant = items.filter((item) => item.status === 'Needs Attention')
  return sortWatchItems(relevant).slice(0, limit)
}

export type PropertyWatchColumns<T> = {
  needsAttention: T[]
  upcoming: T[]
  completed: T[]
}

/** Section 16: the property page's three columns. */
export function groupWatchItemsForPropertyPage<T extends ViewItem>(items: T[]): PropertyWatchColumns<T> {
  const needsAttention = sortWatchItems(items.filter((item) => item.status === 'Needs Attention'))
  const upcoming = sortWatchItems(items.filter((item) => item.status === 'Upcoming'))
  const completed = items.filter((item) => item.status === 'Completed' || item.status === 'Dismissed')
  return { needsAttention, upcoming, completed }
}
