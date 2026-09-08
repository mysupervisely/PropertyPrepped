'use client'

// PropRoster — Tenant Connect + Maintenance Coordination, M3: Landlord
// Maintenance Command Center V1.
//
// A portfolio-wide, landlord-accessible place to answer: what needs my
// attention, which property, what did the tenant report, is anything
// urgent, has PropCrew been assigned, what's next. Reads/writes the
// SAME public.maintenance_requests table every property workspace
// already uses (Rent > Tenant tab, app/page.tsx) — this page does not
// introduce a second maintenance data model, just a portfolio-level
// view onto the one that already exists, per this milestone's own
// architecture instruction.
//
// Auth/page-shell pattern mirrors app/rent-ledger/page.tsx exactly
// (useAuthUser + AuthHeader + the same authShell/authCard sign-in
// gate, its own independent Supabase fetch rather than reusing
// app/page.tsx's in-memory state — same reason Rent Ledger and Tax
// Center are separate pages, not new tabs bolted onto the single-page
// property workspace).
//
// SECURITY: every query below relies entirely on RLS
// (maintenance_requests_select_own, tenant_requests_select,
// maintenance_intake_sessions_select, property_contacts_select_own,
// property_contact_links_select_own, properties_select_own — all
// pre-existing, all owner-scoped) — no explicit owner_id filter is
// added client-side because none is needed; RLS is the actual
// boundary, matching every other portfolio page in this app. No
// service-role key, no elevated client, ever.
//
// M3 scope only — no provider outreach, no scheduling, no quotes, no
// SMS, no payments. See docs/tenant-connect-m3-landlord-command-
// center.md for the full milestone writeup and the two identified,
// NOT-applied schema gaps (a "Needs More Information" status value and
// a landlord-only internal note).

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'
import { AuthHeader } from '../../components/AuthHeader'
import { MaintenanceCaseDetail } from '../../components/maintenance/MaintenanceCaseDetail'
import { NewMaintenanceRequestModal } from '../../components/maintenance/NewMaintenanceRequestModal'
import type { NewMaintenanceRequestPayload } from '../../lib/maintenance/new-request'
import {
  enrichMaintenanceCases, sortCasesForCommandCenter, summarizeCommandCenter, relevantContactsForProperty,
  NEXT_ACTION_LABEL,
  type MaintenanceCaseRow, type TenantRequestLink, type IntakeSessionOutcome,
  type PropCrewContactRef, type PropCrewLinkRef, type EnrichedMaintenanceCase, type MaintenanceCaseStatus,
} from '../../lib/maintenance/command-center'
import { maintenanceCategoryLabel } from '../../lib/maintenance/categories'

type PropertyRef = { id: string; address: string; city: string }
// Tenant Connect M3.1 — same shape lib/leases/status.ts's
// selectCurrentLease()/normalizeTenants() already expect (LeaseWithId &
// TenantLeaseFields), fetched here for the SAME tenant-prefill purpose
// app/page.tsx's property-level "+ New Maintenance Request" uses —
// portfolio-wide since this page has no single selected property.
type LeaseRef = { id: string; property_id: string; tenant_name: string; tenant_email: string | null; tenant_phone: string | null; start_date: string | null; end_date: string | null }

export default function MaintenancePage() {
  const { user, ready } = useAuthUser()

  if (!ready) return <main className="authShell"><div className="loadingState">Loading Maintenance Command Center…</div></main>

  if (!user) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Sign in required</h1>
          <p className="authIntro">Sign in to view your Maintenance Command Center.</p>
          <Link className="primary authSubmit" href="/">Go to sign in</Link>
        </section>
      </main>
    )
  }

  return <MaintenanceCommandCenter user={user} />
}

function MaintenanceCommandCenter({ user }: { user: User }) {
  const [properties, setProperties] = useState<PropertyRef[]>([])
  const [cases, setCases] = useState<MaintenanceCaseRow[]>([])
  const [tenantRequests, setTenantRequests] = useState<TenantRequestLink[]>([])
  const [intakeSessions, setIntakeSessions] = useState<IntakeSessionOutcome[]>([])
  const [contacts, setContacts] = useState<PropCrewContactRef[]>([])
  const [contactLinks, setContactLinks] = useState<PropCrewLinkRef[]>([])
  const [leases, setLeases] = useState<LeaseRef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [openCaseId, setOpenCaseId] = useState<string | null>(null)
  const [showNewRequest, setShowNewRequest] = useState(false)
  const [newRequestError, setNewRequestError] = useState('')

  async function load() {
    if (!supabase) return
    setLoading(true)
    setError('')
    const [
      { data: propertyRows, error: propError },
      { data: caseRows, error: caseError },
      { data: contactRows, error: contactError },
      { data: linkRows },
      { data: tenantRequestRows },
      { data: sessionRows },
      { data: leaseRows },
    ] = await Promise.all([
      supabase.from('properties').select('id,address,city').order('created_at', { ascending: true }),
      supabase.from('maintenance_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('property_contacts').select('id,property_id,owner_id,name,business_name,role').order('created_at', { ascending: false }),
      supabase.from('property_contact_links').select('contact_id,property_id'),
      // Tenant Connect tables: same defensive pattern app/page.tsx's own
      // loadPortfolio() already established — these may legitimately not
      // exist yet on an account whose Tenant Connect migrations haven't
      // been applied; a failure here must never block the base
      // (landlord-logged) maintenance case list from loading.
      supabase.from('tenant_requests').select('id,maintenance_request_id,category'),
      supabase.from('maintenance_intake_sessions').select('request_id,outcome'),
      // Tenant Connect M3.1 — for the "+ New Maintenance Request" tenant-prefill only.
      supabase.from('leases').select('id,property_id,tenant_name,tenant_email,tenant_phone,start_date,end_date'),
    ])
    const firstError = propError || caseError || contactError
    if (firstError) { setError(firstError.message); setLoading(false); return }
    setProperties((propertyRows || []) as PropertyRef[])
    setCases((caseRows || []) as MaintenanceCaseRow[])
    setContacts((contactRows || []) as PropCrewContactRef[])
    setContactLinks((linkRows || []) as PropCrewLinkRef[])
    setTenantRequests((tenantRequestRows || []) as TenantRequestLink[])
    setIntakeSessions((sessionRows || []) as IntakeSessionOutcome[])
    setLeases((leaseRows || []) as LeaseRef[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const propertyById = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties])
  const propertyLabel = (propertyId: string) => {
    const p = propertyById.get(propertyId)
    return p ? `${p.address}${p.city ? `, ${p.city}` : ''}` : 'Property'
  }

  const enriched = useMemo(() => enrichMaintenanceCases(cases, tenantRequests, intakeSessions), [cases, tenantRequests, intakeSessions])
  const sorted = useMemo(() => sortCasesForCommandCenter(enriched), [enriched])
  const summary = useMemo(() => summarizeCommandCenter(enriched), [enriched])
  const active = sorted.filter((c) => c.active)
  const history = sorted.filter((c) => !c.active)

  const openCase = sorted.find((c) => c.id === openCaseId) || null
  const contactsForOpenCase = openCase ? relevantContactsForProperty(contacts, contactLinks, openCase.property_id) : []

  async function assignContact(caseId: string, contactId: string | null) {
    if (!supabase) return
    setBusy(true)
    const { error: e } = await supabase.from('maintenance_requests').update({ assigned_contact_id: contactId }).eq('id', caseId)
    if (e) setError(e.message)
    setBusy(false)
    await load()
  }

  async function changeStatus(caseId: string, status: MaintenanceCaseStatus) {
    if (!supabase) return
    setBusy(true)
    const { error: e } = await supabase.from('maintenance_requests').update({ status }).eq('id', caseId)
    if (e) setError(e.message)
    setBusy(false)
    await load()
  }

  // Tenant Connect M3.1 — portfolio-level "+ New Maintenance Request"
  // entry point (Section 2's "also provide a portfolio-level entry that
  // first asks/selects the property"). Same canonical maintenance_requests
  // insert app/page.tsx's property-level save does; the created row
  // appears here automatically on the next load() (this page IS the
  // Command Center), never a separate copy.
  async function saveNewRequest(payload: NewMaintenanceRequestPayload) {
    if (!supabase || !user || !payload.propertyId || !payload.title) return
    setBusy(true); setNewRequestError('')
    const { error: e } = await supabase.from('maintenance_requests').insert({
      owner_id: user.id, property_id: payload.propertyId,
      tenant_name: payload.tenantName, tenant_email: payload.tenantEmail,
      title: payload.title, description: payload.description, priority: payload.priority, status: payload.status,
    })
    if (e) setNewRequestError(e.message)
    else { setShowNewRequest(false); await load() }
    setBusy(false)
  }

  return (
    <main className="shell">
      <AuthHeader />

      <section className="intro">
        <p className="eyebrow">MAINTENANCE</p>
        <h1>Maintenance Command Center</h1>
        <p>Every active maintenance case across your portfolio, tenant- and landlord-reported alike, in one place.</p>
      </section>

      <div className="sectionHead workspaceHeading"><div /><button className="primary" onClick={() => setShowNewRequest(true)}>+ New Maintenance Request</button></div>

      {error && <div className="globalError">{error}<button onClick={() => setError('')}>×</button></div>}

      <div className="financialStats maintenanceSummaryStats">
        <div className="financialStat"><span>Needs attention</span><strong>{summary.activeCount}</strong></div>
        <div className="financialStat"><span>Urgent</span><strong>{summary.urgentCount}</strong></div>
        <div className="financialStat"><span>Completed</span><strong>{summary.completedCount}</strong></div>
      </div>

      {loading ? (
        <div className="emptyState"><strong>Loading…</strong></div>
      ) : active.length === 0 && history.length === 0 ? (
        <div className="emptyState"><strong>No maintenance requests yet.</strong><span>Requests your tenants submit through Tenant Connect, and any you log yourself, will show up here.</span></div>
      ) : (
        <>
          <div className="sectionHead workspaceHeading"><div><h2>Needs attention</h2><p>{active.length} active case{active.length === 1 ? '' : 's'}.</p></div></div>
          {active.length === 0 ? (
            <div className="emptyState"><strong>Nothing needs attention right now.</strong></div>
          ) : (
            <div className="maintenanceCommandCenterList">
              {active.map((c) => (
                <MaintenanceCaseCard key={c.id} caseRow={c} propertyLabel={propertyLabel(c.property_id)} onOpen={() => setOpenCaseId(c.id)} />
              ))}
            </div>
          )}

          {history.length > 0 && (
            <>
              <button className="secondary maintenanceHistoryToggle" onClick={() => setShowHistory((s) => !s)}>
                {showHistory ? 'Hide' : 'Show'} completed ({history.length})
              </button>
              {showHistory && (
                <div className="maintenanceCommandCenterList maintenanceCommandCenterHistory">
                  {history.map((c) => (
                    <MaintenanceCaseCard key={c.id} caseRow={c} propertyLabel={propertyLabel(c.property_id)} onOpen={() => setOpenCaseId(c.id)} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {openCase && (
        <MaintenanceCaseDetail
          caseRow={openCase}
          propertyLabel={propertyLabel(openCase.property_id)}
          contacts={contactsForOpenCase}
          busy={busy}
          onAssign={(contactId) => void assignContact(openCase.id, contactId)}
          onStatusChange={(status) => void changeStatus(openCase.id, status)}
          onClose={() => setOpenCaseId(null)}
        />
      )}

      {showNewRequest && (
        <NewMaintenanceRequestModal
          properties={properties}
          leases={leases}
          busy={busy}
          error={newRequestError}
          onCancel={() => { setShowNewRequest(false); setNewRequestError('') }}
          onSave={(payload) => void saveNewRequest(payload)}
        />
      )}
    </main>
  )
}

// Mobile-first card: readable, obvious urgency, obvious property
// identity, large tap target (the whole card is the button), minimal
// horizontal scroll (no wide table anywhere in this file).
function MaintenanceCaseCard({ caseRow, propertyLabel, onOpen }: { caseRow: EnrichedMaintenanceCase; propertyLabel: string; onOpen: () => void }) {
  return (
    <button className={`maintenanceCommandCenterCard${caseRow.urgent ? ' maintenanceCommandCenterCardUrgent' : ''}`} onClick={onOpen}>
      <div className="maintenanceCommandCenterCardTop">
        {caseRow.urgent && <span className="statusPill pillBad maintenanceUrgentBadge">Urgent</span>}
        <span className={`statusPill priority${caseRow.priority}`}>{caseRow.priority}</span>
        <span className={`statusPill ${caseRow.source === 'tenant' ? 'tenantSourceBadge' : 'landlordSourceBadge'}`}>{caseRow.source === 'tenant' ? 'Tenant' : 'Landlord'}</span>
      </div>
      <strong className="maintenanceCommandCenterCardProperty">{propertyLabel}</strong>
      <span className="maintenanceCommandCenterCardTitle">{caseRow.title}</span>
      <span className="muted maintenanceCommandCenterCardMeta">
        {caseRow.category ? `${maintenanceCategoryLabel(caseRow.category)} · ` : ''}{new Date(caseRow.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
      </span>
      <span className="muted maintenanceCommandCenterCardNext">{NEXT_ACTION_LABEL[caseRow.nextAction]}</span>
    </button>
  )
}
