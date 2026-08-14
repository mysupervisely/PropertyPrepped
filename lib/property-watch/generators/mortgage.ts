// PropRoster Milestone 11: Property Watch — Mortgage date monitoring
// (Section 7). Reuses the existing `mortgages` table. Only `maturity_date`
// exists in that schema today, so that's the only date this generator can
// honestly watch in this milestone — there are no ARM-adjustment/reset,
// balloon, or escrow-change columns to read (Section 7 also allows those
// "when data exists"; here, it doesn't yet). A document-derived ARM/balloon
// date can still reach Property Watch today via a manual reminder or a
// future document-intelligence field addition — seeing generators/manual.ts
// and generators/document-intelligence.ts.
//
// This deliberately never recommends refinancing (Section 7) — the only
// fact this generator states is "your loan matures on this date."

import { computeUrgency } from '../urgency'
import { formatDateDisplay, subtractDays } from '../date-utils'
import { EVENT_KEYS } from '../identity'
import type { PropertyWatchDraft } from '../types'
import type { PropertyLike } from './lease'

export type MortgageLike = {
  id: string
  property_id: string
  owner_id: string
  lender: string
  maturity_date: string | null
}

const WARNING_WINDOW_DAYS = 90

export function deriveMortgageWatchDraft(mortgage: MortgageLike, property: PropertyLike, now: Date = new Date()): PropertyWatchDraft | null {
  if (!mortgage.maturity_date) return null
  const urgency = computeUrgency(mortgage.maturity_date, now)
  if (!urgency.withinWarningWindow) return null

  return {
    owner_id: mortgage.owner_id,
    property_id: mortgage.property_id,
    source_type: 'mortgage',
    source_id: mortgage.id,
    event_key: EVENT_KEYS.mortgageMaturity,
    category: 'Mortgage',
    title: 'Mortgage Maturity',
    description: `${property.address} — mortgage with ${mortgage.lender} matures ${formatDateDisplay(mortgage.maturity_date)}.`,
    event_date: mortgage.maturity_date,
    warning_date: subtractDays(mortgage.maturity_date, WARNING_WINDOW_DAYS),
    priority: urgency.priority,
    status: urgency.status,
    action_type: 'Review',
    metadata: { lender: mortgage.lender, daysRemaining: urgency.daysRemaining, isPastDue: urgency.isPastDue },
  }
}
