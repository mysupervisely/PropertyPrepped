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

import { useEffect, useMemo, useRef, useState } from 'react'
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
  showsDedicatedUrgentBadge,
  type MaintenanceCaseRow, type TenantRequestLink, type IntakeSessionOutcome,
  type PropCrewContactRef, type PropCrewLinkRef, type EnrichedMaintenanceCase, type MaintenanceCaseStatus,
} from '../../lib/maintenance/command-center'
import { MaintenanceCategoryIcon } from '../../components/icons/MaintenanceCategoryIcon'
import { latestOutreachForContact, type ProviderOutreachRow } from '../../lib/maintenance/provider-outreach'
import { sendProviderOutreach as postProviderOutreach, providerOutreachErrorMessage } from '../../lib/maintenance/provider-outreach-client'
import { windowsForMaintenanceRequest, entryPreferenceForMaintenanceRequest, type AvailabilityWindow } from '../../lib/maintenance/availability'
import { latestAppointmentForOutreach, type AppointmentRow } from '../../lib/maintenance/appointments'
import { confirmAppointment as postConfirmAppointment, appointmentErrorMessage } from '../../lib/maintenance/appointments-client'

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
  // Tenant Connect: Provider Outreach V1 — same defensive
  // "legitimately empty until migrated" pattern as tenantRequests/
  // intakeSessions above; outreachBusy/outreachError are local to the
  // currently-open case's Send Request action only.
  const [providerOutreach, setProviderOutreach] = useState<ProviderOutreachRow[]>([])
  const [outreachBusy, setOutreachBusy] = useState(false)
  const [outreachError, setOutreachError] = useState('')
  // Scheduling Coordination V1 — same defensive pattern; appointmentBusy/
  // appointmentError are local to the currently-open case's action only.
  const [availabilityWindows, setAvailabilityWindows] = useState<AvailabilityWindow[]>([])
  const [appointments, setAppointments] = useState<AppointmentRow[]>([])
  const [appointmentBusy, setAppointmentBusy] = useState(false)
  const [appointmentError, setAppointmentError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Simplification + Maintenance Workspace V2, Phase D.1: replaces the
  // old separate "Needs attention" heading + "Show completed (N)"
  // toggle with a compact filter row over the exact same already-
  // computed active/sorted arrays below — no new query, no new
  // derivation. 'My properties' (from the visual concept this phase is
  // adapting) is meaningless here: RLS already scopes every case to
  // the caller's own portfolio, so there is no OTHER set of properties
  // to filter against — 'Urgent' is the genuinely useful third filter
  // instead ("make it easy to see the maintenance cases the landlord
  // needs to act on").
  const [filter, setFilter] = useState<'attention' | 'all' | 'urgent'>('attention')
  const [openCaseId, setOpenCaseId] = useState<string | null>(null)
  const [showNewRequest, setShowNewRequest] = useState(false)
  const [newRequestError, setNewRequestError] = useState('')
  // Bug fix (real-device iPhone testing, M3.1 follow-up) — see
  // changeStatus() below for the root-cause writeup; matches the
  // identical fix in app/page.tsx's updateRequestStatus().
  const [statusUpdateMessage, setStatusUpdateMessage] = useState('')
  const statusUpdateMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      { data: providerOutreachRows },
      { data: availabilityWindowRows },
      { data: appointmentRows },
    ] = await Promise.all([
      supabase.from('properties').select('id,address,city').order('created_at', { ascending: true }),
      supabase.from('maintenance_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('property_contacts').select('id,property_id,owner_id,name,business_name,role,email').order('created_at', { ascending: false }),
      supabase.from('property_contact_links').select('contact_id,property_id'),
      // Tenant Connect tables: same defensive pattern app/page.tsx's own
      // loadPortfolio() already established — these may legitimately not
      // exist yet on an account whose Tenant Connect migrations haven't
      // been applied; a failure here must never block the base
      // (landlord-logged) maintenance case list from loading.
      supabase.from('tenant_requests').select('id,maintenance_request_id,category,entry_preference'),
      supabase.from('maintenance_intake_sessions').select('request_id,outcome'),
      // Tenant Connect M3.1 — for the "+ New Maintenance Request" tenant-prefill only.
      supabase.from('leases').select('id,property_id,tenant_name,tenant_email,tenant_phone,start_date,end_date'),
      // Tenant Connect: Provider Outreach V1 — same defensive pattern as
      // tenant_requests/maintenance_intake_sessions above.
      supabase.from('maintenance_provider_outreach').select('id, maintenance_request_id, contact_id, status, provider_message, sent_at, responded_at').order('sent_at', { ascending: false }),
      // Scheduling Coordination V1 — same defensive pattern.
      supabase.from('maintenance_availability_windows').select('id, request_id, window_date, window_label'),
      supabase.from('maintenance_appointments').select('id, maintenance_request_id, outreach_id, proposed_local_start_at, proposed_by, matched_availability, status, confirmed_at, created_at').order('created_at', { ascending: false }),
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
    setProviderOutreach((providerOutreachRows || []) as ProviderOutreachRow[])
    setAvailabilityWindows((availabilityWindowRows || []) as AvailabilityWindow[])
    setAppointments((appointmentRows || []) as AppointmentRow[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const propertyById = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties])
  const propertyLabel = (propertyId: string) => {
    const p = propertyById.get(propertyId)
    return p ? `${p.address}${p.city ? `, ${p.city}` : ''}` : 'Property'
  }

  // Simplification + Maintenance Workspace V2, Phase C: same reasoning
  // as app/page.tsx's identical call — providerOutreach/appointments are
  // already fetched portfolio-wide for this page's own display needs.
  const enriched = useMemo(
    () => enrichMaintenanceCases(cases, tenantRequests, intakeSessions, providerOutreach, appointments),
    [cases, tenantRequests, intakeSessions, providerOutreach, appointments],
  )
  const sorted = useMemo(() => sortCasesForCommandCenter(enriched), [enriched])
  const summary = useMemo(() => summarizeCommandCenter(enriched), [enriched])
  const active = sorted.filter((c) => c.active)
  const history = sorted.filter((c) => !c.active)

  const openCase = sorted.find((c) => c.id === openCaseId) || null
  const contactsForOpenCase = openCase ? relevantContactsForProperty(contacts, contactLinks, openCase.property_id) : []
  // Tenant Connect: Provider Outreach V1 (Section 6/8) — see
  // app/page.tsx's identical derivation for the request-scoping and
  // reassignment-is-a-separate-event rationale.
  const outreachForOpenCase = openCase?.assigned_contact_id
    ? latestOutreachForContact(providerOutreach.filter((o) => o.maintenance_request_id === openCase.id), openCase.assigned_contact_id)
    : null
  // Scheduling Coordination V1 (Section 4/6) — see app/page.tsx's
  // identical derivation for the join/scoping rationale.
  const availabilityForOpenCase = openCase ? windowsForMaintenanceRequest(availabilityWindows, tenantRequests, openCase.id) : []
  const entryPreferenceForOpenCase = openCase ? entryPreferenceForMaintenanceRequest(tenantRequests, openCase.id) : null
  const appointmentForOpenCase = outreachForOpenCase ? latestAppointmentForOutreach(appointments, outreachForOpenCase.id) : null

  async function assignContact(caseId: string, contactId: string | null) {
    if (!supabase) return
    setBusy(true)
    const { error: e } = await supabase.from('maintenance_requests').update({ assigned_contact_id: contactId }).eq('id', caseId)
    if (e) setError(e.message)
    setBusy(false)
    await load()
  }

  // Bug fix (real-device iPhone testing, M3.1 follow-up): identical root
  // cause and fix as app/page.tsx's updateRequestStatus() — the write
  // persisted immediately, but this handler blocked on a full portfolio
  // reload() before the case card/detail modal showed anything new,
  // with no interim feedback, which read as "did nothing" on a real
  // device. Fix: patch the one canonical `cases` array immediately
  // (active/history split, the Command Center summary counts, and the
  // open case's own detail view all derive from this same array), show
  // a brief confirmation, and reload() in the background afterward
  // instead of gating the UI on it.
  function flashStatusUpdateMessage(text: string) {
    setStatusUpdateMessage(text)
    if (statusUpdateMessageTimer.current) window.clearTimeout(statusUpdateMessageTimer.current)
    statusUpdateMessageTimer.current = setTimeout(() => setStatusUpdateMessage(''), 2500)
  }

  async function changeStatus(caseId: string, status: MaintenanceCaseStatus) {
    if (!supabase) return
    setBusy(true)
    const { error: e } = await supabase.from('maintenance_requests').update({ status }).eq('id', caseId)
    if (e) {
      setError(e.message)
    } else {
      setCases((prev) => prev.map((c) => (c.id === caseId ? { ...c, status } : c)))
      flashStatusUpdateMessage('Status updated.')
      void load()
    }
    setBusy(false)
  }

  // Tenant Connect: Provider Outreach V1 (Section 1) — identical
  // handler/contract to app/page.tsx's sendMaintenanceOutreach().
  async function sendOutreach(caseId: string) {
    if (!supabase) return
    setOutreachBusy(true); setOutreachError('')
    const result = await postProviderOutreach(supabase, caseId)
    setOutreachBusy(false)
    if (!result.sent) { setOutreachError(providerOutreachErrorMessage(result.reason)); return }
    await load()
  }

  // Scheduling Coordination V1 (Section 7) — identical handler/contract
  // to app/page.tsx's respondToAppointment().
  async function respondToAppointment(appointmentId: string, action: 'confirm' | 'decline') {
    if (!supabase) return
    setAppointmentBusy(true); setAppointmentError('')
    const result = await postConfirmAppointment(supabase, appointmentId, action)
    setAppointmentBusy(false)
    if (!result.ok) { setAppointmentError(appointmentErrorMessage(result.reason)); return }
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

      {/* Simplification + Maintenance Workspace V2, Phase D.2: "Maintenance,"
          not "Maintenance Command Center" — product language a landlord
          never needs. The explanatory paragraph is gone (the page is
          understandable without it); a compact "N need attention · M
          urgent" line replaces the old three-box stat grid, and "+ New
          Request" is a small, secondary-styled action beside the
          heading instead of a large primary button. Same
          .maintenanceHubHead treatment as the promoted property-level
          Maintenance tab — one visual language, not two. */}
      <section className="intro maintenanceHubIntro">
        <div className="maintenanceHubHead">
          <h1>Maintenance</h1>
          <button className="secondary" onClick={() => setShowNewRequest(true)}>+ New Request</button>
        </div>
        <p className="muted">
          {summary.activeCount} need{summary.activeCount === 1 ? 's' : ''} attention
          {summary.urgentCount > 0 ? ` · ${summary.urgentCount} urgent` : ''}
          {summary.completedCount > 0 ? ` · ${summary.completedCount} completed` : ''}
        </p>
      </section>

      {error && <div className="globalError">{error}<button onClick={() => setError('')}>×</button></div>}

      {loading ? (
        <div className="emptyState"><strong>Loading…</strong></div>
      ) : active.length === 0 && history.length === 0 ? (
        <div className="emptyState"><strong>No maintenance requests yet.</strong><span>Requests your tenants submit through Tenant Connect, and any you log yourself, will show up here.</span></div>
      ) : (
        <>
          <div className="maintenanceFilterRow" role="tablist" aria-label="Filter maintenance requests">
            <button type="button" role="tab" aria-selected={filter === 'attention'} className={`maintenanceFilterChip${filter === 'attention' ? ' active' : ''}`} onClick={() => setFilter('attention')}>Needs attention</button>
            <button type="button" role="tab" aria-selected={filter === 'all'} className={`maintenanceFilterChip${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>All requests</button>
            {summary.urgentCount > 0 && (
              <button type="button" role="tab" aria-selected={filter === 'urgent'} className={`maintenanceFilterChip${filter === 'urgent' ? ' active' : ''}`} onClick={() => setFilter('urgent')}>Urgent</button>
            )}
          </div>
          {(() => {
            const filtered = filter === 'attention' ? active : filter === 'urgent' ? active.filter((c) => c.urgent) : sorted
            if (filtered.length === 0) {
              return (
                <div className="emptyState">
                  <strong>{filter === 'urgent' ? 'No urgent requests right now.' : 'Nothing needs attention right now.'}</strong>
                </div>
              )
            }
            return (
              <div className="maintenanceCommandCenterList">
                {filtered.map((c) => (
                  <MaintenanceCaseCard key={c.id} caseRow={c} propertyLabel={propertyLabel(c.property_id)} onOpen={() => setOpenCaseId(c.id)} />
                ))}
              </div>
            )
          })()}
        </>
      )}

      {openCase && (
        <MaintenanceCaseDetail
          caseRow={openCase}
          propertyLabel={propertyLabel(openCase.property_id)}
          contacts={contactsForOpenCase}
          busy={busy}
          statusUpdateMessage={statusUpdateMessage}
          onAssign={(contactId) => void assignContact(openCase.id, contactId)}
          onStatusChange={(status) => void changeStatus(openCase.id, status)}
          onClose={() => { setOpenCaseId(null); setOutreachError(''); setAppointmentError('') }}
          outreach={outreachForOpenCase}
          outreachBusy={outreachBusy}
          outreachError={outreachError}
          onSendOutreach={() => void sendOutreach(openCase.id)}
          availabilityWindows={availabilityForOpenCase}
          entryPreference={entryPreferenceForOpenCase}
          appointment={appointmentForOpenCase}
          appointmentBusy={appointmentBusy}
          appointmentError={appointmentError}
          onConfirmAppointment={appointmentForOpenCase ? () => void respondToAppointment(appointmentForOpenCase.id, 'confirm') : undefined}
          onDeclineAppointment={appointmentForOpenCase ? () => void respondToAppointment(appointmentForOpenCase.id, 'decline') : undefined}
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

// Simplification + Maintenance Workspace V2, Phase D.2: dropped the
// priority + source pill row (matching Phase C.1's same direction for
// MaintenanceCaseDetail, and Phase D.2's identical change to the
// property-level row) — Urgent is the only pill now, so it actually
// stands out. Source folds into the quiet meta line as plain text
// instead. Mobile-first card: readable, obvious urgency, obvious
// property identity, large tap target (the whole card is the button),
// minimal horizontal scroll (no wide table anywhere in this file).
function MaintenanceCaseCard({ caseRow, propertyLabel, onOpen }: { caseRow: EnrichedMaintenanceCase; propertyLabel: string; onOpen: () => void }) {
  return (
    <button className={`maintenanceCommandCenterCard${caseRow.urgent ? ' maintenanceCommandCenterCardUrgent' : ''}`} onClick={onOpen}>
      <MaintenanceCategoryIcon category={caseRow.category} className="maintenanceCommandCenterCardIcon" />
      <span className="maintenanceCommandCenterCardBody">
        <span className="maintenanceCommandCenterCardTitle">{caseRow.title}</span>
        <strong className="maintenanceCommandCenterCardProperty">{propertyLabel}</strong>
        <span className="muted maintenanceCommandCenterCardMeta">
          Opened {new Date(caseRow.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} &middot; {caseRow.source === 'tenant' ? 'Tenant' : 'Landlord'}
        </span>
      </span>
      {showsDedicatedUrgentBadge(caseRow, caseRow.urgent) ? (
        <span className="statusPill pillBad maintenanceUrgentBadge">Urgent</span>
      ) : (
        <span className="statusPill maintenanceCommandCenterCardStatus">{caseRow.status}</span>
      )}
    </button>
  )
}
