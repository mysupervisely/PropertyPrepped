// PropRoster — Milestone 15: Global Search V1, result shaping.
//
// Pure mapping/filtering only — no Supabase calls here (those stay in
// app/search/page.tsx, same split every other lib/ module in this
// codebase already uses). Each function takes rows the page already
// fetched (already narrowed server-side via lib/search/query.ts's
// buildOrFilter + a LIMIT), re-checks the precise multi-word match, and
// maps to the one shared SearchResult shape the page renders.
//
// Deep links reuse app/page.tsx's EXISTING ?openProperty=<id> mechanism
// (extended with ?openTab / ?openDocsSubTab / ?openPropSubTab /
// ?openPeopleSubTab — see app/page.tsx's openProperty()/its resolving
// effect) — not a second navigation architecture.

import { matchesAllWords } from './query'

export type PropertyRef = { id: string; address: string; city: string }

export type SearchResultType = 'Property' | 'Document' | 'PropCrew' | 'System' | 'Maintenance' | 'Financial' | 'Note' | 'Lease' | 'Mortgage' | 'Insurance'

export type SearchResult = {
  id: string
  type: SearchResultType
  title: string
  subtitle: string
  detail: string
  href: string
}

function propertyHref(propertyId: string, opts?: { tab?: string; docsSubTab?: string; propSubTab?: string; peopleSubTab?: string }): string {
  const params = new URLSearchParams({ openProperty: propertyId })
  if (opts?.tab) params.set('openTab', opts.tab)
  if (opts?.docsSubTab) params.set('openDocsSubTab', opts.docsSubTab)
  if (opts?.propSubTab) params.set('openPropSubTab', opts.propSubTab)
  if (opts?.peopleSubTab) params.set('openPeopleSubTab', opts.peopleSubTab)
  return `/?${params.toString()}`
}

// -- Properties ---------------------------------------------------------

export type PropertyRow = { id: string; address: string; city: string; property_type: string }
export const PROPERTY_SEARCH_COLUMNS = ['address', 'city', 'property_type']

export function searchProperties(rows: PropertyRow[], words: string[]): SearchResult[] {
  return rows
    .filter((p) => matchesAllWords(words, [p.address, p.city, p.property_type]))
    .map((p) => ({ id: p.id, type: 'Property', title: p.address, subtitle: p.city, detail: p.property_type, href: propertyHref(p.id) }))
}

// -- Documents ------------------------------------------------------------
// A document with property_id null is a not-yet-assigned Smart Upload/
// Import item — labeled "Unassigned" and routed to /smart-import (the
// closest correct place to finish assigning it), never a property page
// that doesn't apply to it yet.

export type DocumentRow = { id: string; property_id: string | null; name: string; category: string; document_type: string | null }
export const DOCUMENT_SEARCH_COLUMNS = ['name', 'category', 'document_type']

export function searchDocuments(rows: DocumentRow[], words: string[], propertyById: Map<string, PropertyRef>): SearchResult[] {
  return rows
    .filter((d) => matchesAllWords(words, [d.name, d.category, d.document_type]))
    .map((d) => {
      const property = d.property_id ? propertyById.get(d.property_id) : null
      return {
        id: d.id, type: 'Document', title: d.name,
        subtitle: property ? property.address : 'Unassigned',
        detail: [d.category, d.document_type].filter(Boolean).join(' · '),
        href: d.property_id ? propertyHref(d.property_id, { tab: 'Documents', docsSubTab: 'Documents' }) : '/smart-import',
      }
    })
}

// -- PropCrew ---------------------------------------------------------------
// Deliberately never includes notes/experience_note in the searched
// columns or the preview — private per-provider notes stay private.
// Exact-contact deep linking isn't supported yet (PropCrewPanel has no
// "open this one contact" URL); results route to /propcrew, the closest
// correct section — see the completion report.

export type ContactRow = { id: string; name: string; business_name: string | null; role: string; phone: string | null; email: string | null }
export const CONTACT_SEARCH_COLUMNS = ['name', 'business_name', 'role', 'phone', 'email']

export function searchContacts(rows: ContactRow[], words: string[], propertyCountByContact: Map<string, number>): SearchResult[] {
  return rows
    .filter((c) => matchesAllWords(words, [c.name, c.business_name, c.role, c.phone, c.email]))
    .map((c) => {
      const count = propertyCountByContact.get(c.id) || 1
      return {
        id: c.id, type: 'PropCrew', title: c.business_name || c.name,
        subtitle: c.business_name ? c.name : c.role,
        detail: `${c.role} · ${count} propert${count === 1 ? 'y' : 'ies'}`,
        href: '/propcrew',
      }
    })
}

// -- Property systems -------------------------------------------------------

export type SystemRow = { id: string; property_id: string; system_type: string; name: string | null; manufacturer: string | null; model: string | null; serial_number: string | null }
export const SYSTEM_SEARCH_COLUMNS = ['system_type', 'name', 'manufacturer', 'model', 'serial_number']

export function searchSystems(rows: SystemRow[], words: string[], propertyById: Map<string, PropertyRef>): SearchResult[] {
  return rows
    .filter((s) => matchesAllWords(words, [s.system_type, s.name, s.manufacturer, s.model, s.serial_number]))
    .map((s) => {
      const property = propertyById.get(s.property_id)
      return {
        id: s.id, type: 'System', title: s.name || s.system_type,
        subtitle: property?.address || '',
        detail: [s.manufacturer, s.model].filter(Boolean).join(' ') || s.system_type,
        href: propertyHref(s.property_id, { tab: 'Property', propSubTab: 'Systems' }),
      }
    })
}

// -- Maintenance --------------------------------------------------------

export type MaintenanceRow = { id: string; property_id: string; description: string; category: string; vendor: string | null }
export const MAINTENANCE_SEARCH_COLUMNS = ['description', 'category', 'vendor']

export function searchMaintenance(rows: MaintenanceRow[], words: string[], propertyById: Map<string, PropertyRef>): SearchResult[] {
  return rows
    .filter((m) => matchesAllWords(words, [m.description, m.category, m.vendor]))
    .map((m) => {
      const property = propertyById.get(m.property_id)
      return {
        id: m.id, type: 'Maintenance', title: m.description,
        subtitle: property?.address || '', detail: [m.category, m.vendor].filter(Boolean).join(' · '),
        href: propertyHref(m.property_id, { tab: 'Property', propSubTab: 'Maintenance' }),
      }
    })
}

// -- Financial transactions ----------------------------------------------

export type TransactionRow = { id: string; property_id: string; description: string; category: string; vendor: string | null }
export const FINANCIAL_SEARCH_COLUMNS = ['description', 'category', 'vendor']

export function searchFinancials(rows: TransactionRow[], words: string[], propertyById: Map<string, PropertyRef>): SearchResult[] {
  return rows
    .filter((t) => matchesAllWords(words, [t.description, t.category, t.vendor]))
    .map((t) => {
      const property = propertyById.get(t.property_id)
      return {
        id: t.id, type: 'Financial', title: t.description,
        subtitle: property?.address || '', detail: [t.category, t.vendor].filter(Boolean).join(' · '),
        href: propertyHref(t.property_id, { tab: 'Financials' }),
      }
    })
}

// -- Notes ----------------------------------------------------------------

export type NoteRow = { id: string; property_id: string; body: string }
export const NOTE_SEARCH_COLUMNS = ['body']
const NOTE_PREVIEW_LENGTH = 70

export function searchNotes(rows: NoteRow[], words: string[], propertyById: Map<string, PropertyRef>): SearchResult[] {
  return rows
    .filter((n) => matchesAllWords(words, [n.body]))
    .map((n) => {
      const property = propertyById.get(n.property_id)
      return {
        id: n.id, type: 'Note', title: n.body.length > NOTE_PREVIEW_LENGTH ? `${n.body.slice(0, NOTE_PREVIEW_LENGTH)}…` : n.body,
        subtitle: property?.address || '', detail: 'Note',
        href: propertyHref(n.property_id, { tab: 'Overview' }),
      }
    })
}

// -- Lease / Mortgage / Insurance (grouped in the UI, kept as three small
// functions here since each table's fields are genuinely different) -----

// Milestone 17: tenant_phone joins tenant_name/tenant_email as a
// searchable, safe lease-identifying field. Never searches notes (a
// private, freeform field) or any other sensitive data.
export type LeaseRow = { id: string; property_id: string; tenant_name: string; tenant_email: string | null; tenant_phone?: string | null }
export const LEASE_SEARCH_COLUMNS = ['tenant_name', 'tenant_email', 'tenant_phone']

export function searchLeases(rows: LeaseRow[], words: string[], propertyById: Map<string, PropertyRef>): SearchResult[] {
  return rows
    .filter((l) => matchesAllWords(words, [l.tenant_name, l.tenant_email, l.tenant_phone]))
    .map((l) => {
      const property = propertyById.get(l.property_id)
      return { id: l.id, type: 'Lease', title: l.tenant_name, subtitle: property?.address || '', detail: 'Lease', href: propertyHref(l.property_id, { tab: 'Property', propSubTab: 'Lease' }) }
    })
}

export type MortgageRow = { id: string; property_id: string; lender: string; loan_number: string | null }
export const MORTGAGE_SEARCH_COLUMNS = ['lender', 'loan_number']

export function searchMortgages(rows: MortgageRow[], words: string[], propertyById: Map<string, PropertyRef>): SearchResult[] {
  return rows
    .filter((m) => matchesAllWords(words, [m.lender, m.loan_number]))
    .map((m) => {
      const property = propertyById.get(m.property_id)
      return { id: m.id, type: 'Mortgage', title: m.lender, subtitle: property?.address || '', detail: 'Mortgage', href: propertyHref(m.property_id, { tab: 'Property', propSubTab: 'Mortgage' }) }
    })
}

export type InsuranceRow = { id: string; property_id: string; carrier: string; policy_number: string | null }
export const INSURANCE_SEARCH_COLUMNS = ['carrier', 'policy_number']

export function searchInsurance(rows: InsuranceRow[], words: string[], propertyById: Map<string, PropertyRef>): SearchResult[] {
  return rows
    .filter((i) => matchesAllWords(words, [i.carrier, i.policy_number]))
    .map((i) => {
      const property = propertyById.get(i.property_id)
      return { id: i.id, type: 'Insurance', title: i.carrier, subtitle: property?.address || '', detail: 'Insurance', href: propertyHref(i.property_id, { tab: 'Property', propSubTab: 'Insurance' }) }
    })
}
