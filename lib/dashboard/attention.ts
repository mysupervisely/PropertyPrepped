// PropRoster — Milestone 16: Landlord Command Center V1, Needs Attention /
// Upcoming / Open Maintenance aggregation.
//
// Pure functions only — no Supabase calls, no React. app/page.tsx passes
// already-loaded, RLS-scoped rows (the SAME leases/insurancePolicies/
// mortgages/maintenanceRecords/properties state it already fetches for
// the property workspace) and gets back plain, sorted, deduplicated
// dashboard items to render.

import { classifyDate, daysUntil, type Urgency } from './date-classification'

// Mirrors app/page.tsx's Tab / PropertySubTab / PeopleSubTab /
// DocumentsSubTab literal unions — duplicated here rather than imported,
// since app/page.tsx is a page component, not a shared module. Deep
// links are built as this small, page-agnostic NavTarget instead of a
// URL string: every dashboard item lives on the SAME page as
// openProperty() (app/page.tsx), so the page just calls
// openProperty(item.propertyId, nav.tab, nav.docsSubTab, nav.propSubTab,
// nav.peopleSubTab) directly — reusing the exact Milestone 15 mechanism
// without a URL round-trip that a same-page click doesn't need.
export type NavTab = 'Overview' | 'Financials' | 'Property' | 'People' | 'Documents'
export type NavPropertySubTab = 'Lease' | 'Mortgage' | 'Insurance' | 'Maintenance' | 'Systems'
export type NavPeopleSubTab = 'PropCrew' | 'Landlord'
export type NavDocsSubTab = 'Documents' | 'Photos'

export type NavTarget = {
  tab: NavTab
  docsSubTab?: NavDocsSubTab
  propSubTab?: NavPropertySubTab
  peopleSubTab?: NavPeopleSubTab
}

export type PropertyLabelLookup = Map<string, string>

// -- Lease / Insurance / Mortgage / overdue-Maintenance date items -------

export type DashboardDateItemType = 'Lease' | 'Insurance' | 'Mortgage' | 'Maintenance'
export type AttentionUrgency = 'Expired' | 'Urgent'

export type DashboardDateItem = {
  id: string
  type: DashboardDateItemType
  label: string
  description: string
  propertyId: string
  propertyLabel: string
  date: string
  daysUntil: number
  urgency: Urgency
  nav: NavTarget
}

export type LeaseInput = { id: string; property_id: string; tenant_name: string; end_date: string }
export type InsuranceInput = { id: string; property_id: string; carrier: string; expiration_date: string | null }
export type MortgageInput = { id: string; property_id: string; lender: string; maturity_date: string | null }
export type MaintenanceInput = { id: string; property_id: string; description: string; category: string; vendor: string | null; status: string; service_date: string }

function labelFor(propertyId: string, propertyLabelById: PropertyLabelLookup): string {
  return propertyLabelById.get(propertyId) || ''
}

/** Lease end_date — every lease has one (not-null column), so every lease is eligible for classification. */
export function buildLeaseDateItems(leases: LeaseInput[], propertyLabelById: PropertyLabelLookup, now: Date = new Date()): DashboardDateItem[] {
  const items: DashboardDateItem[] = []
  for (const lease of leases) {
    const urgency = classifyDate(lease.end_date, now)
    if (!urgency || urgency === 'Normal') continue
    items.push({
      id: lease.id, type: 'Lease',
      label: urgency === 'Expired' ? 'Lease expired' : urgency === 'Urgent' ? 'Lease expiring soon' : 'Lease expiring',
      description: lease.tenant_name, propertyId: lease.property_id, propertyLabel: labelFor(lease.property_id, propertyLabelById),
      date: lease.end_date, daysUntil: daysUntil(lease.end_date, now) as number, urgency,
      nav: { tab: 'Property', propSubTab: 'Lease' },
    })
  }
  return items
}

/** insurance_policies.expiration_date is nullable — a policy with no expiration on file is left out entirely, never treated as "already expired." */
export function buildInsuranceDateItems(policies: InsuranceInput[], propertyLabelById: PropertyLabelLookup, now: Date = new Date()): DashboardDateItem[] {
  const items: DashboardDateItem[] = []
  for (const policy of policies) {
    const urgency = classifyDate(policy.expiration_date, now)
    if (!urgency || urgency === 'Normal') continue
    items.push({
      id: policy.id, type: 'Insurance',
      label: urgency === 'Expired' ? 'Insurance expired' : urgency === 'Urgent' ? 'Insurance expiring soon' : 'Insurance expiring',
      description: policy.carrier, propertyId: policy.property_id, propertyLabel: labelFor(policy.property_id, propertyLabelById),
      date: policy.expiration_date as string, daysUntil: daysUntil(policy.expiration_date, now) as number, urgency,
      nav: { tab: 'Property', propSubTab: 'Insurance' },
    })
  }
  return items
}

/** mortgages.maturity_date is nullable and typically decades out — this will rarely surface in practice, but uses the exact same threshold logic as every other date rather than a special case. */
export function buildMortgageDateItems(mortgages: MortgageInput[], propertyLabelById: PropertyLabelLookup, now: Date = new Date()): DashboardDateItem[] {
  const items: DashboardDateItem[] = []
  for (const mortgage of mortgages) {
    const urgency = classifyDate(mortgage.maturity_date, now)
    if (!urgency || urgency === 'Normal') continue
    items.push({
      id: mortgage.id, type: 'Mortgage',
      label: urgency === 'Expired' ? 'Mortgage matured' : urgency === 'Urgent' ? 'Mortgage maturing soon' : 'Mortgage maturing',
      description: mortgage.lender, propertyId: mortgage.property_id, propertyLabel: labelFor(mortgage.property_id, propertyLabelById),
      date: mortgage.maturity_date as string, daysUntil: daysUntil(mortgage.maturity_date, now) as number, urgency,
      nav: { tab: 'Property', propSubTab: 'Mortgage' },
    })
  }
  return items
}

/**
 * Deliberately narrow: only a maintenance record still marked
 * 'Scheduled' whose service_date classifies as Expired/Urgent/Upcoming —
 * that's the one status where service_date reliably means "this is
 * supposed to happen by this date" (an overdue item if the date already
 * passed, an upcoming one otherwise — same "Scheduled maintenance"
 * signal the spec's own Upcoming examples call out). A 'Completed',
 * 'In progress', or 'Needs follow-up' record's service_date means "when
 * this visit happened," not a due date, so it's never run through date
 * classification — surfacing every open item regardless of urgency is
 * the dedicated Open Maintenance section's job (buildOpenMaintenanceItems
 * below), not this one, so nothing here manufactures urgency from a
 * status that carries none.
 */
export function buildMaintenanceDateItems(records: MaintenanceInput[], propertyLabelById: PropertyLabelLookup, now: Date = new Date()): DashboardDateItem[] {
  const items: DashboardDateItem[] = []
  for (const record of records) {
    if (record.status !== 'Scheduled') continue
    const urgency = classifyDate(record.service_date, now)
    if (!urgency || urgency === 'Normal') continue
    items.push({
      id: record.id, type: 'Maintenance',
      label: urgency === 'Expired' ? 'Maintenance overdue' : urgency === 'Urgent' ? 'Maintenance due soon' : 'Maintenance scheduled',
      description: record.description, propertyId: record.property_id, propertyLabel: labelFor(record.property_id, propertyLabelById),
      date: record.service_date, daysUntil: daysUntil(record.service_date, now) as number, urgency,
      nav: { tab: 'Property', propSubTab: 'Maintenance' },
    })
  }
  return items
}

/** Combines every date-driven source and splits into Needs Attention (Expired/Urgent) vs Upcoming (Upcoming) — non-overlapping by construction, since classifyDate() only ever assigns a row to exactly one bucket. */
export function splitAttentionAndUpcoming(items: DashboardDateItem[]): { needsAttention: DashboardDateItem[]; upcoming: DashboardDateItem[] } {
  const needsAttention = items.filter((i) => i.urgency === 'Expired' || i.urgency === 'Urgent')
  const upcoming = items.filter((i) => i.urgency === 'Upcoming')
  return { needsAttention, upcoming }
}

// -- Open Maintenance -----------------------------------------------------

export type OpenMaintenanceItem = {
  id: string
  description: string
  category: string
  vendor: string | null
  propertyId: string
  propertyLabel: string
  date: string
  status: string
  nav: NavTarget
}

/** Every non-Completed maintenance record — the compact "what's still open" list, most recently logged/scheduled first. Not urgency-classified; that's what buildMaintenanceOverdueItems is for. */
export function buildOpenMaintenanceItems(records: MaintenanceInput[], propertyLabelById: PropertyLabelLookup): OpenMaintenanceItem[] {
  return records
    .filter((r) => r.status !== 'Completed')
    .map((r) => ({
      id: r.id, description: r.description, category: r.category, vendor: r.vendor,
      propertyId: r.property_id, propertyLabel: labelFor(r.property_id, propertyLabelById),
      date: r.service_date, status: r.status,
      nav: { tab: 'Property', propSubTab: 'Maintenance' } as NavTarget,
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

// -- Generic sort/limit helpers -------------------------------------------

/** Soonest-first — the order Upcoming (and Needs Attention, where "most urgent first" means the same thing) should render in. */
export function sortByDaysUntilAscending<T extends { daysUntil: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.daysUntil - b.daysUntil)
}

export function limitItems<T>(items: T[], limit: number): T[] {
  return items.slice(0, Math.max(0, limit))
}
