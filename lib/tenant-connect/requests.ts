// PropRoster — Tenant Connect V1 (Milestone 24): Requests + PropWatch
// integration.
//
// Pure functions only — no Supabase/React. Reuses the exact
// DashboardDateItem/NavTarget shapes lib/dashboard/attention.ts already
// defines (same convention lib/rent-ledger/ledger.ts's own PropWatch
// builders already follow — domain-specific builder, shared type
// imported from attention.ts) so a new tenant request folds into the
// SAME Needs Attention list every other signal already renders into,
// never a second notification center (Section 10's explicit rule).

import type { DashboardDateItem, PropertyLabelLookup } from '../dashboard/attention'
import type { TenantRequestStatus } from './types'

export type TenantRequestForAttention = {
  id: string
  property_id: string
  title: string
  status: TenantRequestStatus
  created_at: string
}

/**
 * Only brand-new (status === 'New') requests surface as a PropWatch
 * attention item — Section 10: "A NEW unresolved tenant request may
 * create/surface a PropWatch attention item." An 'In Progress' request
 * is already being handled (no longer needs the same "hey, look at
 * this" nudge); a 'Resolved' one needs none at all. Not date-driven
 * (a request has no due date), so daysUntil is always 0 and urgency is
 * always 'Urgent' — deliberately landing this near the top of Needs
 * Attention alongside genuinely overdue items, never buried under
 * "Upcoming."
 *
 * Navigates to the property's Rent > Tenant tab (Section 10: "Tapping
 * the PropWatch item should take the landlord directly to the relevant
 * property/request") — same convention as every other PropWatch item,
 * which links to a TAB, never a specific record's own modal; the
 * flagged request is then visible in that tab's (typically short)
 * Requests list.
 */
export function buildTenantRequestDateItems(requests: TenantRequestForAttention[], propertyLabelById: PropertyLabelLookup): DashboardDateItem[] {
  return requests
    .filter((r) => r.status === 'New')
    .map((r) => ({
      id: r.id,
      type: 'TenantRequest',
      label: 'New maintenance request',
      description: r.title,
      propertyId: r.property_id,
      propertyLabel: propertyLabelById.get(r.property_id) || '',
      date: r.created_at,
      daysUntil: 0,
      urgency: 'Urgent',
      nav: { tab: 'Rent', rentSubTab: 'Tenant' },
    }))
}
