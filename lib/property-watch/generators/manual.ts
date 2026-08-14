// PropRoster Milestone 11: Property Watch — manual reminders (Section 13).
// Same architecture as every other category — a manual reminder is just a
// PropertyWatchDraft with source_type 'manual' and source_id null (never a
// second reminder table; see identity.ts point 4 for why null is safe
// here).
//
// Unlike the automatic generators, a manual reminder is NOT gated behind
// the shared 90-day warning window — the owner explicitly asked for it, so
// it exists (as 'Upcoming') from the moment it's created, however far out
// the date is. Its own "remind me N days before" value drives when its
// STATUS flips to 'Needs Attention'; its PRIORITY still comes from the
// same shared urgency.ts bands as everything else, so it sorts correctly
// alongside automatic items (Section 15: one deterministic priority scale).

import { computeUrgency } from '../urgency'
import { subtractDays } from '../date-utils'
import { EVENT_KEYS } from '../identity'
import type { PropertyWatchDraft, WatchActionType, WatchCategory, WatchPriority } from '../types'

export type ManualWatchInput = {
  ownerId: string
  propertyId: string
  category: WatchCategory
  title: string
  description?: string
  /** YYYY-MM-DD, or null/omitted for a reminder with no specific date. */
  eventDate?: string | null
  /** "Remind me N days before" — defaults to 30. Ignored when eventDate is null. */
  warningDays?: number
  actionType?: WatchActionType
}

const DEFAULT_WARNING_DAYS = 30

export function buildManualWatchDraft(input: ManualWatchInput, now: Date = new Date()): PropertyWatchDraft {
  const warningDays = input.warningDays ?? DEFAULT_WARNING_DAYS
  const urgency = input.eventDate ? computeUrgency(input.eventDate, now) : null

  let priority: WatchPriority = 'Normal'
  let status: 'Upcoming' | 'Needs Attention' = 'Upcoming'
  if (urgency) {
    priority = urgency.priority
    status = urgency.isPastDue || urgency.daysRemaining <= warningDays ? 'Needs Attention' : 'Upcoming'
  }

  return {
    owner_id: input.ownerId,
    property_id: input.propertyId,
    source_type: 'manual',
    source_id: null,
    event_key: EVENT_KEYS.manual,
    category: input.category,
    title: input.title.trim(),
    description: (input.description ?? '').trim(),
    event_date: input.eventDate ?? null,
    warning_date: input.eventDate ? subtractDays(input.eventDate, warningDays) : null,
    priority,
    status,
    action_type: input.actionType ?? 'Review',
    metadata: { manuallyCreated: true, warningDays },
  }
}
