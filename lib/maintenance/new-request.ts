// PropRoster — Tenant Connect + Maintenance Coordination, M3.1: Property
// Maintenance Workflow Unification.
//
// Pure, framework-free logic for the landlord's own "+ New Maintenance
// Request" creation flow — the gap M3.1 closes: the only way to create a
// canonical public.maintenance_requests row from a property's own
// Maintenance hub used to be the legacy Service History form
// (maintenance_records, a genuinely different table/concept). This
// module builds the payload for the SAME canonical maintenance_requests
// table M3's Command Center already reads — no parallel work-order
// model.
//
// public.maintenance_requests.tenant_name is NOT NULL with no default
// (Milestone 6's original schema) — a landlord reporting an issue on a
// vacant property, or simply not on a tenant's behalf, still needs SOME
// value there. NO_TENANT_LABEL is that value: an honest placeholder
// ("Landlord") that identifies WHO reported it, never a fabricated
// tenant name.

export const NO_TENANT_LABEL = 'Landlord'

export type NewMaintenanceRequestDraft = {
  propertyId: string
  title: string
  description: string
  priority: string
  status: string
  /** Whether the landlord has opted to attach current-tenant contact info to this request. */
  onBehalfOfTenant: boolean
  tenantName: string
  tenantEmail: string
}

export function defaultNewMaintenanceRequestDraft(propertyId = ''): NewMaintenanceRequestDraft {
  return { propertyId, title: '', description: '', priority: 'Normal', status: 'Submitted', onBehalfOfTenant: false, tenantName: '', tenantEmail: '' }
}

/** What actually gets inserted into maintenance_requests — source is always 'landlord' here (this flow never creates a tenant-sourced row; that remains exclusively the tenant_requests_create_maintenance_case() trigger's job). */
export type NewMaintenanceRequestPayload = {
  propertyId: string
  title: string
  description: string
  priority: string
  status: string
  tenantName: string
  tenantEmail: string | null
}

/**
 * A request is valid to save once it has a property and a non-empty
 * title — exactly maintenance_requests' own NOT NULL columns that this
 * flow doesn't already default (tenant_name always gets a value via
 * buildNewMaintenanceRequestPayload below, so it's never a gate here).
 */
export function isNewMaintenanceRequestValid(draft: NewMaintenanceRequestDraft): boolean {
  return Boolean(draft.propertyId && draft.title.trim())
}

/**
 * Never invents a fake tenant: tenant fields are only ever included when
 * the landlord explicitly opted in (onBehalfOfTenant) AND actually typed
 * a name. Otherwise tenant_name falls back to NO_TENANT_LABEL — required
 * by the NOT NULL column, but never presented as a real person.
 */
export function buildNewMaintenanceRequestPayload(draft: NewMaintenanceRequestDraft): NewMaintenanceRequestPayload {
  const tenantName = draft.onBehalfOfTenant ? draft.tenantName.trim() : ''
  const tenantEmail = draft.onBehalfOfTenant ? draft.tenantEmail.trim() : ''
  return {
    propertyId: draft.propertyId,
    title: draft.title.trim(),
    description: draft.description.trim(),
    priority: draft.priority,
    status: draft.status,
    tenantName: tenantName || NO_TENANT_LABEL,
    tenantEmail: tenantEmail || null,
  }
}
