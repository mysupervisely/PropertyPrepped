// PropRoster Milestone 11: Property Watch — Maintenance recurrence signals
// (Section 11). Reuses the existing `maintenance_records` table. The rule
// is exactly the one the milestone specifies and nothing more: the same
// category has 3+ recorded events within the trailing 12 months. No AI
// diagnosis, no "replacement is necessary" language — just the count, and
// a pointer to go look at the history.

import { EVENT_KEYS } from '../identity'
import type { PropertyWatchDraft } from '../types'
import type { PropertyLike } from './lease'

export type MaintenanceRecordLike = {
  id: string
  property_id: string
  service_date: string
  category: string
}

const RECURRENCE_THRESHOLD = 3
const TRAILING_DAYS = 365

export function deriveMaintenanceRecurrenceDrafts(
  records: MaintenanceRecordLike[],
  property: PropertyLike,
  now: Date = new Date()
): PropertyWatchDraft[] {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - TRAILING_DAYS)
  const cutoffIso = cutoff.toISOString().slice(0, 10)

  const byCategory = new Map<string, MaintenanceRecordLike[]>()
  for (const record of records) {
    if (record.property_id !== property.id) continue
    if (record.service_date < cutoffIso) continue
    const list = byCategory.get(record.category) ?? []
    list.push(record)
    byCategory.set(record.category, list)
  }

  const drafts: PropertyWatchDraft[] = []
  for (const [category, list] of byCategory) {
    if (list.length < RECURRENCE_THRESHOLD) continue
    const mostRecent = list.reduce((a, b) => (a.service_date > b.service_date ? a : b))
    drafts.push({
      owner_id: property.owner_id,
      property_id: property.id,
      source_type: 'maintenance_record',
      // No single maintenance_records row represents "the pattern" — the
      // property is the stable identity (identity.ts, point 5).
      source_id: property.id,
      event_key: EVENT_KEYS.maintenanceRecurrence(category),
      category: 'Maintenance',
      title: 'Recurring Maintenance',
      description: `${category} has had ${list.length} recorded service events in the past 12 months.`,
      event_date: mostRecent.service_date,
      warning_date: null,
      priority: 'Normal',
      status: 'Needs Attention',
      action_type: 'Review Maintenance History',
      metadata: { category, eventCount: list.length, trailingDays: TRAILING_DAYS },
    })
  }
  return drafts
}
