// PropRoster — Property Profile 2.0, Section 9: Property Timeline
// derivation. Pure function, no Supabase/React — see types.ts for the
// full "fully derived, not event-backed" architecture rationale.
//
// Honest omissions (never fabricated to fill a gap in the example event
// list from the task spec): "lease renewed" and "rent change" are NOT
// derived — the leases table has no renewal history or prior-rent value,
// only the current row's dates/rent, so there is no real data to derive
// those events from. "Property tax record" and "PropWatch completion"
// are also not derived — there is no per-year tax history table and
// PropWatch does not exist yet in this codebase. Every one of these is a
// documented future source, not a silently-missing feature.

import type { TimelineEvent, TimelineEventType } from './types'

type PropertyLike = { id: string; address: string; purchase_date: string | null }
type LeaseLike = { id: string; tenant_name: string; start_date: string; end_date: string }
type MortgageLike = { id: string; lender: string; created_at: string; original_balance: number }
type InsuranceLike = { id: string; carrier: string; effective_date: string | null; expiration_date: string | null }
type MaintenanceLike = { id: string; service_date: string; description: string; vendor: string | null; cost: number; financial_transaction_id: string | null }
type FinancialTransactionLike = { id: string; transaction_date: string; transaction_type: 'Income' | 'Expense'; description: string; vendor: string | null; amount: number }
type SystemLike = { id: string; system_type: string; name: string | null; install_date: string | null; last_service_date: string | null; propcrew_contact_id: string | null }
type ContactLike = { id: string; name: string; business_name: string | null }

export type TimelineSourceData = {
  property: PropertyLike
  leases: LeaseLike[]
  mortgages: MortgageLike[]
  insurancePolicies: InsuranceLike[]
  maintenanceRecords: MaintenanceLike[]
  financialTransactions: FinancialTransactionLike[]
  systems: SystemLike[]
  contacts: ContactLike[]
}

/** A financial transaction at/above this amount is surfaced as its own "major expense" timeline event when it isn't already represented by a maintenance record (see the de-duplication note below). Documented, deterministic, adjustable — never an AI/heuristic judgment call. */
export const MAJOR_EXPENSE_THRESHOLD = 1000

function contactLabel(contactId: string | null, contacts: ContactLike[]): string | null {
  if (!contactId) return null
  const contact = contacts.find((c) => c.id === contactId)
  if (!contact) return null
  return contact.business_name || contact.name
}

function isPastOrToday(dateStr: string): boolean {
  return new Date(`${dateStr}T12:00:00`).getTime() <= Date.now()
}

function event(type: TimelineEventType, sourceTable: string, sourceId: string, date: string, title: string, detail: string | null, amount: number | null): TimelineEvent {
  return { id: `${sourceTable}:${sourceId}:${type}`, date, type, title, detail, amount, sourceTable, sourceId }
}

/** Sorted newest-first. Never mutates its input arrays. */
export function deriveTimeline(data: TimelineSourceData): TimelineEvent[] {
  const events: TimelineEvent[] = []

  if (data.property.purchase_date) {
    events.push(event('property-acquired', 'properties', data.property.id, data.property.purchase_date, 'Property acquired', data.property.address, null))
  }

  for (const m of data.mortgages) {
    // created_at (when the record was added), not a fabricated origination
    // date — mortgages has no separate "origination date" column.
    events.push(event('mortgage-originated', 'mortgages', m.id, m.created_at.slice(0, 10), 'Mortgage recorded', m.lender, m.original_balance || null))
  }

  for (const l of data.leases) {
    if (l.start_date) events.push(event('lease-started', 'leases', l.id, l.start_date, 'Lease started', l.tenant_name, null))
    if (l.end_date && isPastOrToday(l.end_date)) events.push(event('lease-ended', 'leases', l.id, l.end_date, 'Lease ended', l.tenant_name, null))
  }

  for (const p of data.insurancePolicies) {
    if (p.effective_date) events.push(event('insurance-effective', 'insurance_policies', p.id, p.effective_date, 'Insurance coverage effective', p.carrier, null))
    if (p.expiration_date && isPastOrToday(p.expiration_date)) events.push(event('insurance-expired', 'insurance_policies', p.id, p.expiration_date, 'Insurance coverage expired', p.carrier, null))
  }

  // Every maintenance record that already links to a financial_transaction
  // (the "add to financials" option when logging maintenance) is counted
  // ONCE here, never a second time in the major-expense pass below.
  const maintenanceLinkedTransactionIds = new Set(data.maintenanceRecords.map((m) => m.financial_transaction_id).filter((id): id is string => Boolean(id)))
  for (const m of data.maintenanceRecords) {
    events.push(event('maintenance', 'maintenance_records', m.id, m.service_date, m.description, m.vendor, m.cost || null))
  }

  for (const s of data.systems) {
    const providerLabel = contactLabel(s.propcrew_contact_id, data.contacts)
    if (s.install_date) events.push(event('system-installed', 'property_systems', s.id, s.install_date, `${s.system_type} installed`, [s.name, providerLabel].filter(Boolean).join(' · ') || null, null))
    if (s.last_service_date) events.push(event('system-serviced', 'property_systems', s.id, s.last_service_date, `${s.system_type} serviced`, providerLabel, null))
  }

  for (const tx of data.financialTransactions) {
    if (tx.transaction_type !== 'Expense') continue
    if (tx.amount < MAJOR_EXPENSE_THRESHOLD) continue
    if (maintenanceLinkedTransactionIds.has(tx.id)) continue
    events.push(event('major-expense', 'financial_transactions', tx.id, tx.transaction_date, tx.description, tx.vendor, tx.amount))
  }

  return events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}
