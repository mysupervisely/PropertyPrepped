'use client'

// PropRoster — Tenant Connect + Maintenance Coordination, M3.1: Property
// Maintenance Workflow Unification.
//
// The landlord's own "+ New Maintenance Request" form — creates a
// canonical public.maintenance_requests row (source='landlord'), the
// SAME table/architecture the tenant-originated flow already writes to
// via tenant_requests_create_maintenance_case() (M1.1). No parallel
// work-order model. Mounted from BOTH the property-level Maintenance hub
// (app/page.tsx, property pre-selected and hidden) and the portfolio
// Command Center (app/maintenance/page.tsx, property chosen first) —
// one implementation, matching MaintenanceCaseDetail's own established
// "shared, dumb component" pattern in this app: every write goes through
// the caller-supplied onSave callback, this file never touches Supabase.
//
// Tenant prefill (M3.1 Section 3): when the selected property has a
// CURRENT lease (lib/leases/status.ts's selectCurrentLease — the exact
// same derivation the rest of this app already uses for occupancy/
// "Current Lease," never a second one), the landlord can opt in
// ("This is on behalf of the current tenant") to prefill name/email
// from that lease — reviewable/editable, never silently submitted
// without the landlord seeing it first. Phone (leases.tenant_phone) is
// shown as read-only context — maintenance_requests has no column to
// persist it, so it is deliberately NOT part of the saved payload
// (see lib/maintenance/new-request.ts's own header for why).
//
// Reporting on behalf of NO tenant (vacant property, or the landlord
// simply not opting in) is always valid — see
// lib/maintenance/new-request.ts's isNewMaintenanceRequestValid()/
// buildNewMaintenanceRequestPayload(): tenant fields are never required,
// and no fake tenant is ever invented.

import { useEffect, useState } from 'react'
import { selectCurrentLease, normalizeTenants, type TenantLeaseFields, type LeaseWithId } from '../../lib/leases/status'
import {
  defaultNewMaintenanceRequestDraft, isNewMaintenanceRequestValid, buildNewMaintenanceRequestPayload,
  type NewMaintenanceRequestDraft, type NewMaintenanceRequestPayload,
} from '../../lib/maintenance/new-request'

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent']
const STATUSES = ['Submitted', 'Scheduled', 'In Progress', 'Completed']

type LeaseForPrefill = LeaseWithId & TenantLeaseFields & { property_id: string }

export function NewMaintenanceRequestModal({
  properties, fixedPropertyId, fixedPropertyLabel, leases, busy, error, onCancel, onSave,
}: {
  properties: { id: string; address: string; city: string }[]
  fixedPropertyId?: string
  fixedPropertyLabel?: string
  leases: LeaseForPrefill[]
  busy: boolean
  error?: string
  onCancel: () => void
  onSave: (payload: NewMaintenanceRequestPayload) => void
}) {
  const [draft, setDraft] = useState<NewMaintenanceRequestDraft>(defaultNewMaintenanceRequestDraft(fixedPropertyId || ''))

  const currentLease = draft.propertyId ? selectCurrentLease(leases.filter((l) => l.property_id === draft.propertyId)) : null
  const currentTenant = currentLease ? normalizeTenants(currentLease)[0] : null

  // Prefill only fires when the checkbox is switched ON (or the property
  // changes while it's already on) — never overwrites text the landlord
  // is actively editing, and never fires at all when there's no current
  // tenant to prefill from.
  useEffect(() => {
    if (draft.onBehalfOfTenant && currentTenant) {
      setDraft((d) => ({ ...d, tenantName: d.tenantName || currentTenant.name, tenantEmail: d.tenantEmail || currentTenant.email || '' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.onBehalfOfTenant, draft.propertyId])

  function toggleOnBehalfOfTenant(checked: boolean) {
    setDraft((d) => ({
      ...d, onBehalfOfTenant: checked,
      tenantName: checked ? d.tenantName : '', tenantEmail: checked ? d.tenantEmail : '',
    }))
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal moduleModal">
        <div className="modalTop">
          <div><p className="eyebrow">MAINTENANCE</p><h2>New maintenance request</h2></div>
          <button className="iconButton" onClick={onCancel} aria-label="Close">×</button>
        </div>
        <div className="formGrid">
          {!fixedPropertyId ? (
            <label className="fullField">Property
              <select value={draft.propertyId} onChange={(e) => setDraft((d) => ({ ...d, propertyId: e.target.value, onBehalfOfTenant: false, tenantName: '', tenantEmail: '' }))}>
                <option value="">Choose a property</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.address}{p.city ? `, ${p.city}` : ''}</option>)}
              </select>
            </label>
          ) : (
            <label className="fullField">Property<strong style={{ display: 'block', padding: '10px 0' }}>{fixedPropertyLabel}</strong></label>
          )}
          <label className="fullField">Issue / title<input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="AC not cooling" /></label>
          <label className="fullField">Description<input value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Details you already know…" /></label>
          <label>Priority<select value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label>Status<select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>

          {draft.propertyId && currentTenant ? (
            <>
              <label className="recurringCheck fullField">
                <input type="checkbox" checked={draft.onBehalfOfTenant} onChange={(e) => toggleOnBehalfOfTenant(e.target.checked)} />
                <span>This is on behalf of the current tenant ({currentTenant.name})</span>
                <small>Prefills from the current lease. Review and edit before saving.</small>
              </label>
              {draft.onBehalfOfTenant && (
                <>
                  <label>Tenant name<input value={draft.tenantName} onChange={(e) => setDraft((d) => ({ ...d, tenantName: e.target.value }))} /></label>
                  <label>Tenant email<input type="email" value={draft.tenantEmail} onChange={(e) => setDraft((d) => ({ ...d, tenantEmail: e.target.value }))} /></label>
                  {currentTenant.phone && <p className="muted fullField">Phone on file: {currentTenant.phone}</p>}
                </>
              )}
            </>
          ) : draft.propertyId ? (
            <p className="muted fullField">No current tenant on file for this property — this request will be recorded as landlord-reported.</p>
          ) : null}

          {error && <p className="errorMessage">{error}</p>}
        </div>
        <div className="modalActions">
          <button className="secondary" onClick={onCancel}>Cancel</button>
          <button className="primary" disabled={busy || !isNewMaintenanceRequestValid(draft)} onClick={() => onSave(buildNewMaintenanceRequestPayload(draft))}>{busy ? 'Saving…' : 'Save request'}</button>
        </div>
      </div>
    </div>
  )
}
