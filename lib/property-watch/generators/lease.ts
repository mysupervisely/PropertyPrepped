// PropRoster Milestone 11: Property Watch — Lease expiration monitoring
// (Section 3). Reuses the existing `leases` table only — no schema change,
// no invented tenant data. Default warning milestones (90/60/30/7 days)
// come entirely from urgency.ts's shared banding, not a separate schedule
// here — see that file for why each threshold is independently testable.

import { computeUrgency } from '../urgency'
import { formatDateDisplay, subtractDays } from '../date-utils'
import { EVENT_KEYS } from '../identity'
import type { PropertyWatchDraft } from '../types'

export type LeaseLike = {
  id: string
  property_id: string
  owner_id: string
  tenant_name: string
  end_date: string | null
  renewal_status: string
}

export type PropertyLike = {
  id: string
  owner_id: string
  address: string
}

const WARNING_WINDOW_DAYS = 90

/**
 * Returns null when there's nothing to watch: no end date on file, or the
 * lease is already marked 'Ended' (Section 3 — don't keep nagging about a
 * lease the owner already closed out), or the expiration is still more
 * than 90 days away (nothing to surface yet).
 */
export function deriveLeaseWatchDraft(lease: LeaseLike, property: PropertyLike, now: Date = new Date()): PropertyWatchDraft | null {
  if (!lease.end_date) return null
  if (lease.renewal_status === 'Ended') return null

  const urgency = computeUrgency(lease.end_date, now)
  if (!urgency.withinWarningWindow) return null

  const daysText = urgency.isPastDue
    ? `Lease expired ${Math.abs(urgency.daysRemaining)} day${Math.abs(urgency.daysRemaining) === 1 ? '' : 's'} ago.`
    : `${urgency.daysRemaining} day${urgency.daysRemaining === 1 ? '' : 's'} remaining.`

  return {
    owner_id: lease.owner_id,
    property_id: lease.property_id,
    source_type: 'lease',
    source_id: lease.id,
    event_key: EVENT_KEYS.leaseExpiration,
    category: 'Lease',
    title: 'Lease Expiring',
    description: `${property.address} — lease expires ${formatDateDisplay(lease.end_date)}. ${daysText}`,
    event_date: lease.end_date,
    warning_date: subtractDays(lease.end_date, WARNING_WINDOW_DAYS),
    priority: urgency.priority,
    status: urgency.status,
    // Section 4: the decision itself (renew vs. turn over) is never made
    // here — action_type stays the generic 'Review'. The UI's Lease item
    // renders the full Review / Prepare Renewal / Prepare for Marketing /
    // Dismiss action row described in Section 3/4 for every category
    // 'Lease' item regardless of this field; see components/PropertyWatch*.
    action_type: 'Review',
    metadata: {
      tenantName: lease.tenant_name,
      daysRemaining: urgency.daysRemaining,
      isPastDue: urgency.isPastDue,
    },
  }
}
