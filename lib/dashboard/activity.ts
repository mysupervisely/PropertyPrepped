// PropRoster — Milestone 16: Landlord Command Center V1, Recent Activity.
//
// Not an audit-log system — no new table, no event-sourcing. Every
// activity item is derived, read-only, from a record's own created_at
// (every relevant table already has one) at render time. Pure functions
// only; app/page.tsx supplies the already-loaded rows it already fetches
// for the property workspace.

import type { NavTarget } from './attention'

export type ActivityType = 'Document' | 'Maintenance' | 'Financial' | 'Note' | 'Lease' | 'Insurance' | 'Mortgage' | 'Property' | 'PropCrew'

export type ActivityItem = {
  id: string
  type: ActivityType
  description: string
  propertyId: string | null
  timestamp: string
  nav: NavTarget | null
  // Documents + Navigation + Realtor Connect Polish: the safe identifier
  // already available on a Document-type activity item — the document's
  // own property_documents.id, never anything more sensitive (no storage
  // path, no analysis content). Only Document activity items ever set
  // this; every other activity type leaves it null. This is what lets an
  // unassigned document's activity row link straight to /documents
  // instead of staying a dead, unclickable row (Section 5) — the
  // property-workspace `nav` mechanism above has no destination for a
  // document that isn't on a property yet, so this is a second, smaller
  // linkage rather than overloading `nav` with a shape it was never
  // built for.
  documentId: string | null
}

export type PropertyLabelLookup = Map<string, string>

export type DocumentActivityInput = { id: string; property_id: string | null; name: string; created_at: string }
export type MaintenanceActivityInput = { id: string; property_id: string; description: string; created_at: string }
export type FinancialActivityInput = { id: string; property_id: string; category: string; created_at: string }
export type NoteActivityInput = { id: string; property_id: string; created_at: string }
export type LeaseActivityInput = { id: string; property_id: string; created_at: string }
export type InsuranceActivityInput = { id: string; property_id: string; created_at: string }
export type MortgageActivityInput = { id: string; property_id: string; created_at: string }
export type PropertyActivityInput = { id: string; address: string; created_at: string }
export type ContactActivityInput = { id: string; property_id: string; name: string; business_name: string | null; created_at: string }

/**
 * A document with no property yet (a not-fully-assigned Smart
 * Upload/Import item — property_id is nullable) still gets an activity
 * entry, honestly labeled, with no navigable destination rather than a
 * guessed one.
 */
export function documentActivity(rows: DocumentActivityInput[], propertyLabelById: PropertyLabelLookup): ActivityItem[] {
  return rows.map((d) => {
    const label = d.property_id ? propertyLabelById.get(d.property_id) : undefined
    return {
      id: `document-${d.id}`, type: 'Document',
      description: label ? `Document uploaded to ${label}` : 'Document uploaded (not yet assigned to a property)',
      propertyId: d.property_id, timestamp: d.created_at,
      nav: d.property_id ? { tab: 'Documents', docsSubTab: 'Documents' } : null,
      documentId: d.id,
    }
  })
}

export function maintenanceActivity(rows: MaintenanceActivityInput[], propertyLabelById: PropertyLabelLookup): ActivityItem[] {
  return rows.map((m) => ({
    id: `maintenance-${m.id}`, type: 'Maintenance',
    description: `Maintenance item added for ${propertyLabelById.get(m.property_id) || 'a property'}`,
    propertyId: m.property_id, timestamp: m.created_at,
    nav: { tab: 'Property', propSubTab: 'Maintenance' },
    documentId: null,
  }))
}

/** Category only, never the exact amount — a glance-level activity feed doesn't need to expose dollar figures. */
export function financialActivity(rows: FinancialActivityInput[], propertyLabelById: PropertyLabelLookup): ActivityItem[] {
  return rows.map((t) => ({
    id: `financial-${t.id}`, type: 'Financial',
    description: `Financial transaction added to ${propertyLabelById.get(t.property_id) || 'a property'} (${t.category})`,
    propertyId: t.property_id, timestamp: t.created_at,
    nav: { tab: 'Financials' },
    documentId: null,
  }))
}

/** Never echoes the note's own body — that stays private to the Notes panel itself. */
export function noteActivity(rows: NoteActivityInput[], propertyLabelById: PropertyLabelLookup): ActivityItem[] {
  return rows.map((n) => ({
    id: `note-${n.id}`, type: 'Note',
    description: `Note added to ${propertyLabelById.get(n.property_id) || 'a property'}`,
    propertyId: n.property_id, timestamp: n.created_at,
    nav: { tab: 'Overview' },
    documentId: null,
  }))
}

export function leaseActivity(rows: LeaseActivityInput[], propertyLabelById: PropertyLabelLookup): ActivityItem[] {
  return rows.map((l) => ({
    id: `lease-${l.id}`, type: 'Lease',
    description: `Lease added for ${propertyLabelById.get(l.property_id) || 'a property'}`,
    propertyId: l.property_id, timestamp: l.created_at,
    nav: { tab: 'Property', propSubTab: 'Lease' },
    documentId: null,
  }))
}

export function insuranceActivity(rows: InsuranceActivityInput[], propertyLabelById: PropertyLabelLookup): ActivityItem[] {
  return rows.map((i) => ({
    id: `insurance-${i.id}`, type: 'Insurance',
    description: `Insurance policy added to ${propertyLabelById.get(i.property_id) || 'a property'}`,
    propertyId: i.property_id, timestamp: i.created_at,
    nav: { tab: 'Property', propSubTab: 'Insurance' },
    documentId: null,
  }))
}

export function mortgageActivity(rows: MortgageActivityInput[], propertyLabelById: PropertyLabelLookup): ActivityItem[] {
  return rows.map((m) => ({
    id: `mortgage-${m.id}`, type: 'Mortgage',
    description: `Mortgage added for ${propertyLabelById.get(m.property_id) || 'a property'}`,
    propertyId: m.property_id, timestamp: m.created_at,
    nav: { tab: 'Property', propSubTab: 'Mortgage' },
    documentId: null,
  }))
}

export function propertyActivity(rows: PropertyActivityInput[]): ActivityItem[] {
  return rows.map((p) => ({
    id: `property-${p.id}`, type: 'Property',
    description: `Property added: ${p.address}`,
    propertyId: p.id, timestamp: p.created_at,
    nav: { tab: 'Overview' },
    documentId: null,
  }))
}

/** Never includes the contact's private notes/experience note — name and business name only, same restriction Global Search's PropCrew results already follow. property_contacts.property_id is required (not-null), so context is always available. */
export function propCrewActivity(rows: ContactActivityInput[], propertyLabelById: PropertyLabelLookup): ActivityItem[] {
  return rows.map((c) => ({
    id: `propcrew-${c.id}`, type: 'PropCrew',
    description: `${c.business_name || c.name} added to PropCrew (${propertyLabelById.get(c.property_id) || 'a property'})`,
    propertyId: c.property_id, timestamp: c.created_at,
    nav: { tab: 'People', peopleSubTab: 'PropCrew' },
    documentId: null,
  }))
}

/** Newest first. */
export function sortByTimestampDescending<T extends { timestamp: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}
