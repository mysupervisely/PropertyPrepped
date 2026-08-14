// PropRoster Milestone 11: Property Watch — Insurance renewal monitoring
// (Section 5). Reuses the existing `insurance_policies` table, which
// already keeps every policy row ever added for a property (nothing is
// overwritten when a new policy year is entered) — that history is exactly
// what lets this generator "deterministically compare premiums" between
// the current and previous policy without any new schema.

import { computeUrgency } from '../urgency'
import { formatDateDisplay, subtractDays } from '../date-utils'
import { EVENT_KEYS } from '../identity'
import type { PropertyWatchDraft } from '../types'
import type { PropertyLike } from './lease'

export type InsurancePolicyLike = {
  id: string
  property_id: string
  owner_id: string
  carrier: string
  annual_premium: number
  expiration_date: string | null
  created_at: string
}

export type PremiumChange = {
  previousAmount: number
  currentAmount: number
  increaseAmount: number
  increasePercent: number
}

const WARNING_WINDOW_DAYS = 90

/**
 * `policiesForProperty` should be every insurance_policies row for one
 * property (any order) — this sorts by created_at itself so callers don't
 * have to. The most recently added row is treated as "current"; the one
 * before it (if any) as "previous", for the premium comparison. Returns
 * null when there's no policy on file, or the current policy has no
 * expiration date, or the expiration is more than 90 days away.
 */
export function deriveInsuranceWatchDraft(
  policiesForProperty: InsurancePolicyLike[],
  property: PropertyLike,
  now: Date = new Date()
): PropertyWatchDraft | null {
  if (!policiesForProperty.length) return null
  const sorted = [...policiesForProperty].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const current = sorted[0]
  const previous = sorted[1] ?? null

  if (!current.expiration_date) return null
  const urgency = computeUrgency(current.expiration_date, now)
  if (!urgency.withinWarningWindow) return null

  // Never compare when there's nothing real to compare against — no
  // fabricated "previous premium" (Section 5: only compare when both
  // previous and current policy data are actually available).
  const premiumChange: PremiumChange | null =
    previous && previous.annual_premium > 0
      ? (() => {
          const increaseAmount = current.annual_premium - previous.annual_premium
          return {
            previousAmount: previous.annual_premium,
            currentAmount: current.annual_premium,
            increaseAmount,
            increasePercent: (increaseAmount / previous.annual_premium) * 100,
          }
        })()
      : null

  const renewalText = urgency.isPastDue
    ? `renewal was due ${formatDateDisplay(current.expiration_date)}`
    : `renews in ${urgency.daysRemaining} day${urgency.daysRemaining === 1 ? '' : 's'} (${formatDateDisplay(current.expiration_date)})`
  const premiumText = premiumChange && premiumChange.increaseAmount > 0
    ? ` Premium increased from $${Math.round(premiumChange.previousAmount).toLocaleString()} to $${Math.round(premiumChange.currentAmount).toLocaleString()} (+${premiumChange.increasePercent.toFixed(1)}%).`
    : ''

  return {
    owner_id: current.owner_id,
    property_id: current.property_id,
    source_type: 'insurance_policy',
    source_id: current.id,
    event_key: EVENT_KEYS.insuranceRenewal,
    category: 'Insurance',
    title: 'Insurance Renewal',
    description: `${property.address} — ${current.carrier} policy ${renewalText}.${premiumText}`,
    event_date: current.expiration_date,
    warning_date: subtractDays(current.expiration_date, WARNING_WINDOW_DAYS),
    priority: urgency.priority,
    status: urgency.status,
    action_type: 'Review Policy',
    metadata: {
      carrier: current.carrier,
      daysRemaining: urgency.daysRemaining,
      isPastDue: urgency.isPastDue,
      premiumChange,
    },
  }
}
