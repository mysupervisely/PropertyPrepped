// PropRoster — Landlord Digest V1: assembling ONE owner's attention
// items for the weekly email.
//
// Pure functions only — no Supabase, no network. This module
// deliberately does NOT reimplement any status/urgency/date logic: it
// calls the exact same canonical builders app/page.tsx's own Dashboard
// "Needs Your Attention" already uses (lib/dashboard/attention.ts,
// lib/rent-ledger/ledger.ts, lib/tenant-connect/requests.ts), in the
// same order, gated by the same canUsePropWatch entitlement check. The
// Dashboard and the digest can never disagree about what needs
// attention, because they are the same computation over the same
// inputs — see each import below for exactly which Dashboard builder
// it reuses.

import {
  buildLeaseDateItems, buildInsuranceDateItems, buildMortgageDateItems, buildMaintenanceDateItems,
  splitAttentionAndUpcoming, sortByDaysUntilAscending, limitItems,
  type DashboardDateItem, type DashboardDateItemType, type PropertyLabelLookup, type NavTarget,
  type LeaseInput, type InsuranceInput, type MortgageInput, type MaintenanceInput,
} from '../dashboard/attention'
import { buildRentDateItems, buildSystemWarrantyDateItems, type LeaseForLedger, type PropertyForLedger, type PaymentForLedger, type SystemForLedger } from '../rent-ledger/ledger'
import { buildTenantRequestDateItems, type TenantRequestForAttention } from '../tenant-connect/requests'
import { periodFromDate } from '../rent-ledger/status'

// Same cap Dashboard's own "Needs Your Attention" list uses
// (app/page.tsx's NEEDS_ATTENTION_LIMIT) — a digest email is even more
// of a "the most important few things" surface than the dashboard
// itself, so it never grows unbounded for a large portfolio.
export const DIGEST_ITEM_LIMIT = 10

export type OwnerDigestSourceData = {
  properties: PropertyForLedger[]
  leases: LeaseForLedger[]
  insurancePolicies: InsuranceInput[]
  mortgages: MortgageInput[]
  maintenanceRecords: MaintenanceInput[]
  rentPayments: PaymentForLedger[]
  propertySystems: SystemForLedger[]
  tenantRequests: TenantRequestForAttention[]
  propertyLabelById: PropertyLabelLookup
  /** Only the one capability this digest's content depends on — the exact same gate app/page.tsx's Dashboard checks before including PropWatch's rent-status/warranty signals. Vacancy/open-maintenance-list signals are intentionally out of scope for V1 (see this file's own header/the milestone report — a deliberate scope decision, not an oversight). */
  canUsePropWatch: boolean
}

/**
 * Every current Needs-Attention item (Expired or Urgent — never
 * "Upcoming," which is a distinct, lower-urgency Dashboard section this
 * V1 digest doesn't surface) for one owner, soonest/most-urgent first,
 * capped at DIGEST_ITEM_LIMIT. Byte-for-byte the same composition
 * app/page.tsx's Dashboard builds (leases/insurance/mortgage/
 * maintenance always included; rent status + system warranty gated on
 * canUsePropWatch, matching Launch Pricing's own "PropWatch's enhanced
 * signals are the gated part, not the base Lease/Insurance/Mortgage/
 * Maintenance ones" rule) — see this file's header comment.
 */
export function buildOwnerAttentionItems(data: OwnerDigestSourceData, now: Date = new Date()): DashboardDateItem[] {
  const currentPeriod = periodFromDate(now)
  const dateItems: DashboardDateItem[] = [
    ...buildLeaseDateItems(data.leases as LeaseInput[], data.propertyLabelById, now),
    ...buildInsuranceDateItems(data.insurancePolicies, data.propertyLabelById, now),
    ...buildMortgageDateItems(data.mortgages, data.propertyLabelById, now),
    ...buildMaintenanceDateItems(data.maintenanceRecords, data.propertyLabelById, now),
    ...(data.canUsePropWatch ? buildRentDateItems(data.leases, data.properties, data.rentPayments, currentPeriod, data.propertyLabelById, now) : []),
    ...(data.canUsePropWatch ? buildSystemWarrantyDateItems(data.propertySystems, data.propertyLabelById, now) : []),
    ...buildTenantRequestDateItems(data.tenantRequests, data.propertyLabelById),
  ]
  const { needsAttention } = splitAttentionAndUpcoming(dateItems)
  return limitItems(sortByDaysUntilAscending(needsAttention), DIGEST_ITEM_LIMIT)
}

// -- Grouping for digest presentation (not a Dashboard concept — the
// Dashboard renders one flat "most urgent first" list; a weekly email
// benefits from the same items grouped into a few short, scannable
// sections instead). Every group is still built from the exact same
// items buildOwnerAttentionItems returned — this only reorganizes
// presentation, never recomputes urgency or status. --------------------

export type DigestGroupName = 'Rent' | 'Leases' | 'Maintenance' | 'Property'

const GROUP_BY_TYPE: Record<DashboardDateItemType, DigestGroupName> = {
  Rent: 'Rent',
  Lease: 'Leases',
  Maintenance: 'Maintenance',
  TenantRequest: 'Maintenance',
  Insurance: 'Property',
  Mortgage: 'Property',
  System: 'Property',
}

// Same order the conceptual mock in the milestone brief uses (Rent,
// then Leases, then Maintenance, then Property/Insurance/Warranty) —
// items within a group stay in the urgency order buildOwnerAttentionItems
// already sorted them into.
const GROUP_ORDER: DigestGroupName[] = ['Rent', 'Leases', 'Maintenance', 'Property']

export type DigestGroup = { name: DigestGroupName; items: DashboardDateItem[] }

/** Groups an already-built, already-sorted item list into the digest's four display sections, omitting any group with nothing in it — never an empty "Property" heading with no rows under it. */
export function groupDigestItems(items: DashboardDateItem[]): DigestGroup[] {
  const byGroup = new Map<DigestGroupName, DashboardDateItem[]>()
  for (const item of items) {
    const group = GROUP_BY_TYPE[item.type]
    const list = byGroup.get(group) || []
    list.push(item)
    byGroup.set(group, list)
  }
  return GROUP_ORDER
    .map((name) => ({ name, items: byGroup.get(name) || [] }))
    .filter((group) => group.items.length > 0)
}

// -- Deep links -------------------------------------------------------
//
// Reuses the app's EXISTING deep-link mechanism verbatim — app/page.tsx's
// own ?openProperty=/?openTab=/?openDocsSubTab=/?openPropSubTab=/
// ?openRentSubTab= query params (Milestone 15, Global Search's own
// link format; lib/tenant-connect/notify.ts's landlordRequestLink()
// already builds one example of this exact shape). No new routing is
// introduced — an item whose `nav` this app/page.tsx effect already
// understands just becomes a URL instead of a same-page function call.

/** The exact URL app/page.tsx's own ?openProperty= deep-link effect already knows how to open — same NavTarget shape every DashboardDateItem already carries. */
export function digestItemLink(origin: string, propertyId: string, nav: NavTarget): string {
  const params = new URLSearchParams({ openProperty: propertyId, openTab: nav.tab })
  if (nav.docsSubTab) params.set('openDocsSubTab', nav.docsSubTab)
  if (nav.propSubTab) params.set('openPropSubTab', nav.propSubTab)
  if (nav.rentSubTab) params.set('openRentSubTab', nav.rentSubTab)
  return `${origin.replace(/\/$/, '')}/?${params.toString()}`
}

/** The digest's single primary CTA — the app's homepage/dashboard, same origin convention as every other PropRoster email link (lib/tenant-connect/notify.ts). */
export function digestDashboardLink(origin: string): string {
  return `${origin.replace(/\/$/, '')}/`
}
