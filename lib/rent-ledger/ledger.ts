// PropRoster — Milestone 18: Rent Ledger + PropWatch V1, per-lease/
// per-period aggregation and Command Center ("PropWatch") wiring.
//
// Pure functions only. Everything here is built from data app/page.tsx
// already loads (properties, leases, rent_payments) plus the pure
// derivation in ./status.ts — no Supabase calls, no new date-threshold
// logic. PropWatch's rent/vacancy signals are shaped as the SAME
// DashboardDateItem type Milestone 16's Needs Attention/Upcoming
// sections already render, so they fold into the existing Command
// Center lists rather than requiring a second, competing dashboard
// (Section 15's explicit instruction).

import { classifyDate, daysUntil, type Urgency } from '../dashboard/date-classification'
import type { DashboardDateItem, NavTarget, PropertyLabelLookup } from '../dashboard/attention'
import { deriveOccupancy } from '../leases/status'
import { deriveRentObligation, deriveRentStatus, periodStart, type RentPeriod, type RentStatus, type LeaseForRent } from './status'

export type LeaseForLedger = LeaseForRent & { id: string; property_id: string; tenant_name: string }
export type PropertyForLedger = { id: string; property_type: string }
export type PaymentForLedger = { lease_id: string; rent_period: string; amount: number }

export type RentLedgerRow = {
  leaseId: string
  propertyId: string
  propertyLabel: string
  tenantName: string
  dueDate: string | null
  expectedAmount: number
  totalPaid: number
  remaining: number
  status: RentStatus
}

/**
 * One row per lease that has an applicable rent obligation for the
 * given period, restricted to Rental Property properties (an
 * owner-occupied/vacation/commercial/land property never generates a
 * rent obligation, matching the same property_type guard Milestone 17's
 * occupancy badge already uses). Vacant properties simply contribute no
 * row — nothing to record — and the Vacant informational signal is
 * handled separately by buildVacancyItems below.
 */
export function buildRentLedgerRows(
  properties: PropertyForLedger[],
  leases: LeaseForLedger[],
  payments: PaymentForLedger[],
  period: RentPeriod,
  propertyLabelById: PropertyLabelLookup,
  now: Date = new Date()
): RentLedgerRow[] {
  const rentalPropertyIds = new Set(properties.filter((p) => p.property_type === 'Rental Property').map((p) => p.id))
  const pStart = periodStart(period)
  const rows: RentLedgerRow[] = []

  for (const lease of leases) {
    if (!rentalPropertyIds.has(lease.property_id)) continue
    const obligation = deriveRentObligation(lease, period)
    if (!obligation.applicable) continue
    const totalPaid = payments
      .filter((p) => p.lease_id === lease.id && p.rent_period === pStart)
      .reduce((sum, p) => sum + Number(p.amount), 0)
    const status = deriveRentStatus(obligation, totalPaid, now)
    if (!status) continue // unreachable (obligation.applicable is true here), keeps TS satisfied
    rows.push({
      leaseId: lease.id, propertyId: lease.property_id, propertyLabel: propertyLabelById.get(lease.property_id) || '',
      tenantName: lease.tenant_name, dueDate: obligation.dueDate, expectedAmount: obligation.expectedAmount,
      totalPaid, remaining: Math.max(0, obligation.expectedAmount - totalPaid), status,
    })
  }

  return rows.sort((a, b) => (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99') || a.propertyLabel.localeCompare(b.propertyLabel))
}

export type RentLedgerSummary = {
  expected: number
  collected: number
  outstanding: number
  paidCount: number
  needsAttentionCount: number
  totalCount: number
}

/** Portfolio summary tiles for the Rent Ledger page's selected month — Expected / Collected / Outstanding / Paid X leases / Needs Attention X leases. */
export function summarizeRentLedgerRows(rows: RentLedgerRow[]): RentLedgerSummary {
  return {
    expected: rows.reduce((sum, r) => sum + r.expectedAmount, 0),
    collected: rows.reduce((sum, r) => sum + r.totalPaid, 0), // honest total received, never capped — an overpayment stays visible, never silently hidden
    outstanding: rows.reduce((sum, r) => sum + r.remaining, 0),
    paidCount: rows.filter((r) => r.status === 'Paid').length,
    needsAttentionCount: rows.filter((r) => r.status === 'Overdue' || r.status === 'Partial' || r.status === 'Due' || r.status === 'Unknown').length,
    totalCount: rows.length,
  }
}

// -- PropWatch: rent + vacancy signals feeding the existing Command
// Center Needs Attention / Upcoming sections (lib/dashboard/attention.ts
// already supplies Lease/Insurance/Mortgage/Maintenance date items —
// these two functions are the only NEW signal sources Milestone 18
// adds, shaped identically so they merge into the same lists). --------

const RENT_STATUS_URGENCY: Partial<Record<RentStatus, Urgency>> = {
  Overdue: 'Expired',
  Due: 'Urgent',
  Partial: 'Urgent',
}

const RENT_STATUS_LABEL: Partial<Record<RentStatus, string>> = {
  Overdue: 'Rent overdue',
  Due: 'Rent due today',
  Partial: 'Rent partially paid',
}

/**
 * Current-month rent signals, restricted to Overdue / Due / Partial
 * (Paid and Upcoming are not "needs attention" items, and Unknown rent
 * — a data problem, not a rent-collection problem — is surfaced inside
 * the Rent Ledger/property Rent card itself rather than added as
 * portfolio-wide PropWatch noise). Always evaluated for the CURRENT
 * calendar month (the period containing `now`), regardless of which
 * month a landlord happens to be browsing in the Rent Ledger UI.
 */
export function buildRentDateItems(leases: LeaseForLedger[], properties: PropertyForLedger[], payments: PaymentForLedger[], period: RentPeriod, propertyLabelById: PropertyLabelLookup, now: Date = new Date()): DashboardDateItem[] {
  const rows = buildRentLedgerRows(properties, leases, payments, period, propertyLabelById, now)
  const items: DashboardDateItem[] = []
  for (const row of rows) {
    const urgency = RENT_STATUS_URGENCY[row.status]
    if (!urgency || row.dueDate === null) continue
    items.push({
      id: row.leaseId, type: 'Rent', label: RENT_STATUS_LABEL[row.status] || 'Rent',
      description: row.remaining > 0 ? `${row.tenantName} · $${row.remaining.toLocaleString()} outstanding` : row.tenantName,
      propertyId: row.propertyId, propertyLabel: row.propertyLabel, date: row.dueDate,
      daysUntil: (daysUntil(row.dueDate, now) as number) ?? 0, urgency,
      nav: { tab: 'Financials' },
    })
  }
  return items
}

export type VacancyItem = {
  id: string
  propertyId: string
  propertyLabel: string
  nav: NavTarget
}

/** Informational only (Section 19) — never urgency-classified, never treats a non-Rental-Property as vacant. Reuses Milestone 17's deriveOccupancy exactly, never a second vacancy definition. */
export function buildVacancyItems(properties: PropertyForLedger[], leases: LeaseForLedger[], propertyLabelById: PropertyLabelLookup): VacancyItem[] {
  const leasesByProperty = new Map<string, LeaseForLedger[]>()
  for (const lease of leases) {
    const list = leasesByProperty.get(lease.property_id) || []
    list.push(lease)
    leasesByProperty.set(lease.property_id, list)
  }
  return properties
    .filter((p) => p.property_type === 'Rental Property')
    .filter((p) => deriveOccupancy(leasesByProperty.get(p.id) || []) === 'Vacant')
    .map((p) => ({ id: p.id, propertyId: p.id, propertyLabel: propertyLabelById.get(p.id) || '', nav: { tab: 'Property', propSubTab: 'Lease' } as NavTarget }))
}

// -- Property Systems warranty expiration (Section 13's "warranty
// expiration where actually stored") -------------------------------

export type SystemForLedger = { id: string; property_id: string; system_type: string; name: string | null; warranty_expiration: string | null }

/** property_systems.warranty_expiration is the only reliably-stored forward-looking date on a system (install_date/last_service_date are historical, not "due" dates) — classified with the exact same classifyDate() thresholds as every other Command Center date item. */
export function buildSystemWarrantyDateItems(systems: SystemForLedger[], propertyLabelById: PropertyLabelLookup, now: Date = new Date()): DashboardDateItem[] {
  const items: DashboardDateItem[] = []
  for (const system of systems) {
    const urgency = classifyDate(system.warranty_expiration, now)
    if (!urgency || urgency === 'Normal') continue
    items.push({
      id: system.id, type: 'System',
      label: urgency === 'Expired' ? 'Warranty expired' : urgency === 'Urgent' ? 'Warranty expiring soon' : 'Warranty expiring',
      description: system.name || system.system_type, propertyId: system.property_id, propertyLabel: propertyLabelById.get(system.property_id) || '',
      date: system.warranty_expiration as string, daysUntil: daysUntil(system.warranty_expiration, now) as number, urgency,
      nav: { tab: 'Property', propSubTab: 'Systems' },
    })
  }
  return items
}
