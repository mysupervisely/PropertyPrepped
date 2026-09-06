'use client'

// PropRoster Milestone 28 — M3: Landlord Maintenance Command Center V1.
//
// Turns the canonical public.maintenance_requests case list (both
// tenant- and landlord-originated) into an operational workspace: a
// four-tile status summary, a card list, and a detail view with the
// V1 landlord actions (status change, priority, PropCrew assignment).
// This REPLACES the old flat "Maintenance requests" list that used to
// sit inside the Rent tab (app/page.tsx) — same table, same rows, no
// new query — with a polished, mobile-first presentation and the
// safety/attachment/intake context Guided Intake (M2) already captures
// but nothing landlord-facing displayed until now.
//
// Data ownership: `requests`/`tenantRequests`/`contacts` are passed in
// already loaded and already filtered to this property (loadPortfolio()
// in app/page.tsx already fetches all three) — this component adds
// exactly one further query of its own, on demand, when a case is
// opened: the linked maintenance_intake_sessions row and its
// conversation's attachments, mirroring the same lazy-load-on-open
// pattern TenantRequestsPanel already uses for its own thread/
// attachments.
//
// STATUS SYNC (M1.1's open question, closed here): changing a case's
// status also updates the linked tenant_requests row (see
// lib/maintenance/status.ts's own header for the full architecture
// note) — maintenance_requests remains the one canonical case; this
// only ever writes the mirror, never reads FROM it to decide anything.
//
// AUDIT LOG: only tenant-originated cases can ever produce a
// maintenance_audit_log row in this pass — that table's own FK targets
// tenant_requests, not maintenance_requests, and it has no INSERT
// policy for `authenticated` at all (only a SECURITY DEFINER trigger on
// tenant_requests writes to it). The status-sync write above already
// fires that trigger for tenant-originated cases for free; PropCrew
// assignment and any landlord-only-case status change are NOT audited
// in V1 — there is no schema-supported path for either without a new
// migration, which this milestone deliberately does not add.
//
// PropCrew assignment writes ONLY maintenance_requests.assigned_contact_id
// (already RLS-verified to belong to the same owner — see
// supabase/schema.sql's maintenance_requests_update_own policy). No
// provider outreach, no notification to the contact, no scheduling —
// exactly the "internal organization only" boundary Section 8 of the
// M3 brief requires.

import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { notifyTenantConnect } from '../../lib/tenant-connect/notify-client'
import type { TenantRequest } from '../../lib/tenant-connect/types'
import { maintenanceCategoryLabel } from '../../lib/maintenance/categories'
import {
  MAINTENANCE_REQUEST_STATUSES,
  presentMaintenanceStatus,
  summarizeMaintenanceCaseCounts,
  syncedTenantRequestStatus,
  REOPENED_STATUS,
  type MaintenanceRequestStatus,
} from '../../lib/maintenance/status'

export type CommandCenterCase = {
  id: string
  property_id: string
  owner_id: string
  tenant_name: string
  tenant_email: string | null
  title: string
  description: string
  priority: string
  status: string
  created_at: string
  assigned_contact_id: string | null
  source: 'tenant' | 'landlord'
}

type ContactOption = { id: string; name: string; business_name: string | null; role: string }

type IntakeOutcome = 'resolved_in_intake' | 'escalated_to_dispatch' | 'escalated_urgent' | 'abandoned'

const OUTCOME_COPY: Record<IntakeOutcome, { heading: string; tone: 'good' | 'warn' | 'bad' }> = {
  resolved_in_intake: { heading: "The tenant's issue may have been resolved during guided intake.", tone: 'good' },
  escalated_to_dispatch: { heading: 'Guided intake recommended professional diagnosis.', tone: 'warn' },
  escalated_urgent: { heading: 'Guided intake showed the tenant urgent safety guidance for this report.', tone: 'bad' },
  abandoned: { heading: 'The tenant did not finish the guided intake for this report.', tone: 'warn' },
}

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent']

export function MaintenanceCommandCenter({
  supabase, propertyId, ownerId, requests, tenantRequests, contacts, onRefresh, onLogRequest,
}: {
  supabase: SupabaseClient
  propertyId: string
  ownerId: string
  requests: CommandCenterCase[]
  tenantRequests: TenantRequest[]
  contacts: ContactOption[]
  onRefresh: () => void
  onLogRequest: () => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [outcomeById, setOutcomeById] = useState<Map<string, IntakeOutcome | null>>(new Map())
  const [attachmentsById, setAttachmentsById] = useState<Map<string, string[]>>(new Map())
  const [detailLoading, setDetailLoading] = useState(false)

  // Newest first — matches every other list in this app.
  const sorted = [...requests].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const counts = summarizeMaintenanceCaseCounts(sorted.map((r) => ({ status: r.status as MaintenanceRequestStatus, source: r.source })))
  const tenantRequestByCaseId = new Map(tenantRequests.filter((r) => r.maintenance_request_id).map((r) => [r.maintenance_request_id as string, r]))

  const open = sorted.find((r) => r.id === openId) || null
  const openTenantRequest = open ? tenantRequestByCaseId.get(open.id) || null : null

  async function openCase(item: CommandCenterCase) {
    setOpenId(item.id)
    setError('')
    const linked = tenantRequestByCaseId.get(item.id)
    if (!linked) return
    setDetailLoading(true)
    const { data: sessionRows } = await supabase
      .from('maintenance_intake_sessions')
      .select('outcome')
      .eq('request_id', linked.id)
      .order('created_at', { ascending: false })
      .limit(1)
    const outcome = ((sessionRows as { outcome: IntakeOutcome | null }[] | null) || [])[0]?.outcome ?? null
    setOutcomeById((prev) => new Map(prev).set(item.id, outcome))

    const { data: messageRows } = await supabase.from('property_messages').select('id').eq('conversation_id', linked.conversation_id)
    const messageIds = ((messageRows as { id: string }[] | null) || []).map((m) => m.id)
    if (messageIds.length) {
      const { data: attachmentRows } = await supabase.from('property_message_attachments').select('storage_path').in('message_id', messageIds)
      const urls: string[] = []
      for (const row of (attachmentRows as { storage_path: string }[] | null) || []) {
        const { data: signed } = await supabase.storage.from('tenant-connect-attachments').createSignedUrl(row.storage_path, 3600)
        if (signed?.signedUrl) urls.push(signed.signedUrl)
      }
      setAttachmentsById((prev) => new Map(prev).set(item.id, urls))
    } else {
      setAttachmentsById((prev) => new Map(prev).set(item.id, []))
    }
    setDetailLoading(false)
  }

  function closeCase() {
    setOpenId(null)
  }

  /**
   * The one place every status change goes through — Mark In Progress,
   * Mark Completed, and Reopen are all thin callers of this. Writes the
   * canonical case first; only on success does it sync the linked
   * tenant_requests row (M1.1 fix) and fire the same landlord_update
   * notification TenantRequestsPanel's own status change already sends,
   * so a tenant sees the same "your landlord updated this" email either
   * way, regardless of which UI the landlord used.
   */
  async function changeStatus(item: CommandCenterCase, status: MaintenanceRequestStatus) {
    setBusy(true)
    setError('')
    const { error: caseErr } = await supabase.from('maintenance_requests').update({ status }).eq('id', item.id)
    if (caseErr) {
      setBusy(false)
      setError(caseErr.message)
      return
    }
    const linked = tenantRequestByCaseId.get(item.id)
    if (linked) {
      const { error: syncErr } = await supabase.from('tenant_requests').update({ status: syncedTenantRequestStatus(status) }).eq('id', linked.id)
      if (syncErr) console.error('maintenance command center: tenant_requests status sync failed (case status still updated)', syncErr)
      else void notifyTenantConnect(supabase, 'landlord_update', { requestId: linked.id })
    }
    setBusy(false)
    onRefresh()
  }

  async function changePriority(item: CommandCenterCase, priority: string) {
    setBusy(true)
    setError('')
    const { error: err } = await supabase.from('maintenance_requests').update({ priority }).eq('id', item.id)
    setBusy(false)
    if (err) { setError(err.message); return }
    onRefresh()
  }

  async function assignContact(item: CommandCenterCase, contactId: string) {
    setBusy(true)
    setError('')
    const { error: err } = await supabase.from('maintenance_requests').update({ assigned_contact_id: contactId || null }).eq('id', item.id)
    setBusy(false)
    if (err) { setError(err.message); return }
    onRefresh()
  }

  return (
    <div className="maintenanceCommandCenter">
      <div className="sectionHead workspaceHeading">
        <div><p className="eyebrow">MAINTENANCE</p><h2>Maintenance Command Center</h2><p>Every maintenance case for this property — tenant-submitted and landlord-logged — in one place.</p></div>
        <button className="primary" onClick={onLogRequest}>+ Log request</button>
      </div>

      {error && <div className="statusMessage errorMessage">{error}<button onClick={() => setError('')}>×</button></div>}

      <div className="financialStats landlordStats commandCenterStats">
        <div className="financialStat"><span>Needs Review</span><strong>{counts['Needs Review']}</strong></div>
        <div className="financialStat"><span>Open</span><strong>{counts.Open}</strong></div>
        <div className="financialStat"><span>In Progress</span><strong>{counts['In Progress']}</strong></div>
        <div className="financialStat"><span>Completed</span><strong>{counts.Completed}</strong></div>
      </div>

      {sorted.length ? (
        <div className="maintenanceList commandCenterList">
          {sorted.map((item) => {
            const presented = presentMaintenanceStatus(item.status as MaintenanceRequestStatus, item.source)
            const linked = tenantRequestByCaseId.get(item.id)
            const contact = contacts.find((c) => c.id === item.assigned_contact_id)
            return (
              <button key={item.id} className="maintenanceRow requestRow tenantRequestRow commandCenterCard" onClick={() => void openCase(item)}>
                <div className="maintenanceDate"><strong>{new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong><span>{new Date(item.created_at).getFullYear()}</span></div>
                <div className="maintenanceBody">
                  <div className="maintenanceTitle">
                    <div>
                      <span className={`statusPill ${presented.bucket === 'Needs Review' ? 'pillWarn' : presented.bucket === 'Completed' ? 'pillGood' : ''}`}>{presented.label}</span>
                      <span className={`statusPill priority${item.priority}`}>{item.priority}</span>
                      {item.source === 'tenant' && <span className="statusPill tenantSourceBadge">Tenant</span>}
                      <h3>{item.title}</h3>
                      <p>{item.source === 'tenant' && linked ? `${maintenanceCategoryLabel(linked.category)} · ` : ''}{item.tenant_name}{contact ? ` · Assigned: ${contact.business_name || contact.name}` : ''}</p>
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="emptyState"><strong>No maintenance cases yet</strong><span>Tenant-submitted reports will appear here automatically. Log one yourself with the button above.</span></div>
      )}

      {open && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && closeCase()}>
          <div className="modal maintenanceCaseModal">
            <div className="modalTop">
              <div><p className="eyebrow">{open.source === 'tenant' && openTenantRequest ? maintenanceCategoryLabel(openTenantRequest.category).toUpperCase() : 'MAINTENANCE'}</p><h2>{open.title}</h2></div>
              <button className="iconButton" onClick={closeCase}>×</button>
            </div>

            <div className="maintenanceCaseSection">
              <p className="eyebrow">Status</p>
              <span className={`statusPill ${presentMaintenanceStatus(open.status as MaintenanceRequestStatus, open.source).bucket === 'Completed' ? 'pillGood' : ''}`}>{presentMaintenanceStatus(open.status as MaintenanceRequestStatus, open.source).label}</span>
            </div>

            <div className="maintenanceCaseSection">
              <p className="eyebrow">Reported by</p>
              <p>{open.tenant_name}{open.tenant_email ? ` · ${open.tenant_email}` : ''}</p>
              <p className="muted">{new Date(open.created_at).toLocaleString()}</p>
            </div>

            {open.description && (
              <div className="maintenanceCaseSection">
                <p className="eyebrow">{open.source === 'tenant' ? 'Tenant report' : 'Description'}</p>
                <p className="requestDescription maintenanceCaseDescription">{open.description}</p>
              </div>
            )}

            {open.source === 'tenant' && detailLoading && <p className="muted">Loading intake details…</p>}

            {open.source === 'tenant' && !detailLoading && outcomeById.get(open.id) && (
              <div className="maintenanceCaseSection">
                <p className="eyebrow">Safety</p>
                <p className={`maintenanceSafetyNote maintenanceSafetyNote${OUTCOME_COPY[outcomeById.get(open.id) as IntakeOutcome].tone}`}>
                  {OUTCOME_COPY[outcomeById.get(open.id) as IntakeOutcome].heading}
                </p>
              </div>
            )}

            {open.source === 'tenant' && !detailLoading && (attachmentsById.get(open.id) || []).length > 0 && (
              <div className="maintenanceCaseSection">
                <p className="eyebrow">Attachments</p>
                <div className="tenantConnectBubbleAttachments maintenanceCaseAttachments">
                  {(attachmentsById.get(open.id) || []).map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="Tenant-submitted photo" /></a>
                  ))}
                </div>
              </div>
            )}

            <div className="maintenanceCaseSection">
              <p className="eyebrow">Priority</p>
              <select aria-label="Priority" value={open.priority} disabled={busy} onChange={(e) => void changePriority(open, e.target.value)}>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>

            <div className="maintenanceCaseSection">
              <p className="eyebrow">Assign from PropCrew</p>
              <select aria-label="Assigned PropCrew contact" value={open.assigned_contact_id || ''} disabled={busy} onChange={(e) => void assignContact(open, e.target.value)}>
                <option value="">Unassigned</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.business_name || c.name}{c.role ? ` — ${c.role}` : ''}</option>)}
              </select>
              <p className="muted">Internal organization only — nothing is sent to this contact.</p>
            </div>

            <div className="maintenanceCaseSection">
              <p className="eyebrow">Next action</p>
              <div className="maintenanceActions maintenanceCaseActions">
                {open.status !== 'In Progress' && open.status !== 'Completed' && <button className="secondary" disabled={busy} onClick={() => void changeStatus(open, 'In Progress')}>Mark In Progress</button>}
                {open.status !== 'Completed' && <button className="primary" disabled={busy} onClick={() => void changeStatus(open, 'Completed')}>Mark Completed</button>}
                {open.status === 'Completed' && <button className="secondary" disabled={busy} onClick={() => void changeStatus(open, REOPENED_STATUS)}>Reopen</button>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
