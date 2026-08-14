// PropRoster Milestone 11: Property Watch — pure reconciliation.
//
// Turns "here is the current full set of drafts a refresh just computed"
// plus "here is what's already persisted" into exactly two lists: rows to
// insert, and rows to update. Never deletes — a source that stops
// producing a draft (e.g. a lease got deleted) leaves its last-known
// Watch item in place rather than silently vanishing; a human can Dismiss
// it. This function never touches Supabase — engine.ts is the only thing
// that calls it with real data and writes the result.
//
// The one subtle rule (Section 2's "update where appropriate rather than
// creating endless duplicates", applied to user-resolved items): if an
// existing item is already Completed or Dismissed AND the source's
// event_date hasn't actually changed, leave it alone completely — a
// refresh must never resurrect something the owner already resolved just
// because time passed. But if the event_date DID change (the classic case:
// a lease got renewed to a new end date), the old resolution no longer
// describes the current fact, so the row is updated in place — same
// identity, refreshed content, status recomputed from scratch. That one
// update is simultaneously "the lease's new expiration is now tracked" and
// "the obsolete reminder about the old date is gone" (Section 3's test),
// because there was only ever one row for this identity to begin with.

import type { PropertyWatchDraft, WatchPriority, WatchSourceType, WatchStatus } from './types'

/** The subset of a persisted row reconcile actually needs to make its decision. */
export type PersistedWatchRow = {
  id: string
  source_type: WatchSourceType
  source_id: string | null
  event_key: string
  event_date: string | null
  status: WatchStatus
  priority: WatchPriority
}

export type WatchUpdate = { id: string; patch: PropertyWatchDraft }

export type ReconcileResult = {
  toInsert: PropertyWatchDraft[]
  toUpdate: WatchUpdate[]
}

function identityKey(row: { source_type: string; source_id: string | null; event_key: string }): string {
  return `${row.source_type}::${row.source_id ?? ''}::${row.event_key}`
}

const TERMINAL_STATUSES: WatchStatus[] = ['Completed', 'Dismissed']

export function reconcileWatchItems(existing: PersistedWatchRow[], drafts: PropertyWatchDraft[]): ReconcileResult {
  // Manual items (source_id null) never dedupe against anything — every
  // manual add is a deliberate new row (identity.ts, point 4). Only
  // source-backed drafts get looked up.
  const existingByKey = new Map(
    existing.filter((row) => row.source_id !== null).map((row) => [identityKey(row), row] as const)
  )

  const toInsert: PropertyWatchDraft[] = []
  const toUpdate: WatchUpdate[] = []

  for (const draft of drafts) {
    if (draft.source_id === null) {
      toInsert.push(draft)
      continue
    }
    const match = existingByKey.get(identityKey(draft))
    if (!match) {
      toInsert.push(draft)
      continue
    }
    const isTerminal = TERMINAL_STATUSES.includes(match.status)
    const dateChanged = match.event_date !== draft.event_date
    if (isTerminal && !dateChanged) continue // owner already resolved this; nothing changed — leave it alone
    toUpdate.push({ id: match.id, patch: draft })
  }

  return { toInsert, toUpdate }
}
