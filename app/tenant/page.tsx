'use client'

// PropRoster — Tenant Connect V1 (Milestone 24): the tenant-facing
// portal.
//
// Deliberately its OWN small page, not any part of the landlord's
// application (Section 4: "Do NOT expose the landlord's normal
// PropRoster application"). No AuthHeader/AuthNavMenu (those carry the
// landlord's Dashboard/Documents/Tax Center/PropCrew/Investment Tools/
// Profile/Pricing — none of which belong here) — just a minimal
// "PropRoster · Tenant Portal" header and Log out. Least-privilege by
// construction: every read here goes through tenant-scoped surfaces —
// originally designed in supabase/milestone-24-tenant-connect-v1.sql,
// actually created in production by
// supabase/milestone-25-maintenance-coordination-foundation.sql (M1
// foundation repair — see docs/tenant-connect-maintenance-m1-foundation.md;
// milestone-24's own migration was never applied to production) — this
// page NEVER queries public.properties or public.leases (the
// owner-facing base tables) directly. Property/lease reads go through
// public.tenant_property_view / public.tenant_lease_view instead — two
// narrow, column-limited views that expose only address/city and
// tenant_name/monthly_rent/start_date/end_date/rent_due_day
// respectively, scoped to the caller's own active tenant_property_access
// row. This is a deliberate, database-level fix (Round 6, Concern 2):
// RLS on the base tables is row-level only, so a policy letting a
// tenant read "their" property/lease row would still hand back every
// column on it, including landlord-only financial/valuation/private
// fields (estimated_value, mortgage_balance, purchase_price,
// monthly_expenses, purchase_date, property_tax_annual, hoa_monthly,
// financing_status, leases.notes) — neither base table has ANY
// tenant-facing SELECT policy any more; the views are the only tenant
// read path, and they can never return a column they don't select.
// tenant_property_access/property_conversations/property_messages/
// tenant_requests policies M10 and this migration already define cover
// everything else this page queries. This page never has a
// service-role key, and a bug here can only ever surface what these
// views/policies already allow, never bypass them.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'
import { Wordmark } from '../../components/Wordmark'
import type { TenantRequest } from '../../lib/tenant-connect/types'
import type { TenantPropertyAccess, PropertyMessage } from '../../lib/tenant-connect/types'
import { notifyTenantConnect } from '../../lib/tenant-connect/notify-client'
import { maintenanceCategoryLabel } from '../../lib/maintenance/categories'
import { GuidedIntake } from '../../components/tenant-connect/GuidedIntake'

type PropertyRef = { id: string; address: string; city: string }
type LeaseRef = { id: string; tenant_name: string; monthly_rent: number; start_date: string; end_date: string; rent_due_day: number | null }
type RentPaymentRef = { id: string; lease_id: string; rent_period: string; date_received: string; amount: number; payment_method: string }
type TenantDocumentRef = { id: string; property_id: string; name: string; category: string; storage_path: string; created_at: string }

function money(n: number | null | undefined) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0)
}

export default function TenantPortalPage() {
  const { user, ready } = useAuthUser()

  if (!ready) return <main className="authShell"><div className="loadingState">Loading…</div></main>

  // Tenant-Facing Experience V1 (Section: "if the invited person does
  // NOT yet have a PropRoster account... registration should open in
  // tenant context; do not make them navigate through the landlord
  // dashboard"). This is the whole fix: sign-up/sign-in happens right
  // here, not via a "Go to sign in" link back to "/" (the landlord
  // app). Authorization is untouched either way — RLS's own email-
  // match (tenant_access_select) and accept_tenant_invite()'s own
  // re-check are what actually decide whether an invite is visible or
  // acceptable, exactly as before this page existed.
  if (!user) return <TenantSignIn />

  return <TenantPortal userId={user.id} />
}

function TenantSignIn() {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  // Read manually (not next/navigation's useSearchParams) so this
  // client-only page never needs a Suspense boundary — same convention
  // app/account/billing/page.tsx already established. Purely a UX hint
  // (which invite prompted this visit) — NEVER a security token; see
  // lib/tenant-connect/notify.ts's tenantInviteLink() for why knowing
  // this id grants nothing by itself.
  const [inviteHint, setInviteHint] = useState(false)
  useEffect(() => {
    setInviteHint(new URLSearchParams(window.location.search).has('invite'))
  }, [])

  async function submit() {
    if (!supabase || !email.trim() || password.length < 6) return
    setBusy(true)
    setError('')
    setMessage('')
    if (authMode === 'signin') {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (err) setError(err.message)
    } else {
      const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password })
      if (err) setError(err.message)
      else if (!data.session) setMessage('Account created. Check your email to confirm your address, then sign in.')
      // If a session came back immediately, this component just
      // unmounts on the next render (useAuthUser's own auth-state
      // listener picks it up) and TenantPortal takes over — no
      // redirect needed, we're already on the right page.
    }
    setBusy(false)
  }

  return (
    <main className="authShell">
      <section className="authCard">
        <p className="eyebrow">PROPROSTER · TENANT</p>
        <h1>{authMode === 'signin' ? 'Sign in' : 'Create your account'}</h1>
        <p className="authIntro">
          {inviteHint
            ? 'Sign in or create an account with the email your landlord invited to accept your Tenant Connect invitation.'
            : 'Sign in or create an account to view your rental, submit maintenance requests, and more.'}
        </p>
        <label htmlFor="tenant-auth-email">Email</label>
        <input id="tenant-auth-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="tenant-auth-password">Password</label>
        <input id="tenant-auth-password" type="password" autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} />
        {error && <div className="statusMessage errorMessage" role="alert">{error}</div>}
        {message && <div className="statusMessage successMessage" role="status">{message}</div>}
        <button className="primary authSubmit" disabled={busy} onClick={() => void submit()}>{busy ? 'Working…' : authMode === 'signin' ? 'Sign in' : 'Create account'}</button>
        <button className="authSwitch" onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setError(''); setMessage('') }}>
          {authMode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </section>
    </main>
  )
}

type TenantView = 'My Rental' | 'Lease' | 'Rent' | 'Requests' | 'Documents'
const TENANT_VIEWS: TenantView[] = ['My Rental', 'Lease', 'Rent', 'Requests', 'Documents']

function TenantPortal({ userId }: { userId: string }) {
  const [access, setAccess] = useState<TenantPropertyAccess[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAccessId, setSelectedAccessId] = useState<string | null>(null)
  const [property, setProperty] = useState<PropertyRef | null>(null)
  const [lease, setLease] = useState<LeaseRef | null>(null)
  const [view, setView] = useState<TenantView>('My Rental')
  const [error, setError] = useState('')
  const [acceptBusy, setAcceptBusy] = useState<string | null>(null)
  // Dual role (Tenant-Facing Experience V1) — Owner and Tenant are not
  // mutually exclusive; a tenant account that ALSO owns properties gets
  // a lightweight way back to that context. Same "existence check only,
  // RLS decides the real answer" approach as AuthNavMenu's own
  // hasTenantAccess check.
  const [hasOwnedProperties, setHasOwnedProperties] = useState(false)

  async function load() {
    if (!supabase) return
    setLoading(true)
    const { data, error: err } = await supabase.from('tenant_property_access').select('*').order('created_at', { ascending: false })
    if (err) setError(err.message)
    const rows = (data as TenantPropertyAccess[]) || []
    setAccess(rows)
    const firstActive = rows.find((r) => r.status === 'Active')
    setSelectedAccessId((prev) => prev || firstActive?.id || null)
    setLoading(false)
  }

  useEffect(() => { void load() }, [userId])

  useEffect(() => {
    if (!supabase) return
    supabase.from('properties').select('id').limit(1).then(({ data }) => setHasOwnedProperties(Boolean(data && data.length)))
  }, [userId])

  const activeRows = access.filter((a) => a.status === 'Active')
  const pendingRows = access.filter((a) => a.status === 'Invited')
  const selected = activeRows.find((a) => a.id === selectedAccessId) || activeRows[0] || null

  useEffect(() => {
    if (!supabase || !selected) { setProperty(null); setLease(null); return }
    // Reads go through the restricted tenant views, never the
    // owner-facing public.properties/public.leases base tables — see
    // the file header. Both views already carry exactly this column
    // set, so select('*') is equivalent to naming them explicitly and
    // stays correct automatically if the view's own column list ever
    // changes.
    supabase.from('tenant_property_view').select('*').eq('id', selected.property_id).maybeSingle().then(({ data }) => setProperty((data as PropertyRef) || null))
    if (selected.lease_id) {
      supabase.from('tenant_lease_view').select('*').eq('id', selected.lease_id).maybeSingle().then(({ data }) => setLease((data as LeaseRef) || null))
    } else {
      setLease(null)
    }
  }, [selected?.id, selected?.property_id, selected?.lease_id])

  async function acceptInvite(accessId: string) {
    if (!supabase) return
    setAcceptBusy(accessId)
    setError('')
    // TEMPORARY diagnostic (real-device "This invite is not available to
    // accept." investigation, PR #60). Static tracing of this file found
    // no frontend bug — accessId is the exact tenant_property_access.id
    // just rendered, the RPC arg key matches p_access_id, and the same
    // singleton supabase client/session serves both the SELECT that
    // showed the invite and this call. This only captures what the user
    // themselves already asked to see confirmed on the failing device:
    // the access id submitted, the authenticated user id/email
    // getUser() itself reports at the moment of the click, and whether
    // a session exists — never a token, refresh token, or JWT. Only
    // surfaced on a failure, appended to the existing error banner (no
    // separate log line the tester would need devtools to see). Remove
    // once the real cause is found.
    let diag = ''
    try {
      const [{ data: authData }, { data: sessionData }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()])
      diag = ` [diag: accessId=${accessId} authUserId=${authData.user?.id ?? 'none'} authEmail=${authData.user?.email ?? 'none'} hasSession=${Boolean(sessionData.session)}]`
    } catch {
      diag = ' [diag: unavailable]'
    }
    const { error: err } = await supabase.rpc('accept_tenant_invite', { p_access_id: accessId })
    setAcceptBusy(null)
    if (err) { setError(err.message + diag); return }
    // Section: "After accepting, route them directly to the tenant-
    // facing experience for the invited rental." load() re-fetches
    // access (the newly-Active row now becomes `selected` since it's
    // the only/first Active row), and 'My Rental' is already this
    // component's default view — no separate redirect needed, this
    // page IS that experience already.
    await load()
  }

  if (loading) return <main className="tenantPortalShell"><div className="loadingState">Loading your Tenant Portal…</div></main>

  return (
    <main className="tenantPortalShell">
      <header className="tenantPortalHeader">
        <span className="brand"><Wordmark /></span>
        <span className="tenantPortalHeaderLabel">Tenant Portal</span>
        {hasOwnedProperties && <Link href="/" className="secondary tenantPortalSwitchContext">Landlord Dashboard</Link>}
        <button type="button" className="secondary tenantPortalLogout" onClick={() => void supabase?.auth.signOut()}>Log out</button>
      </header>

      {error && <div className="globalError">{error}<button onClick={() => setError('')}>×</button></div>}

      {pendingRows.length > 0 && (
        <section className="tenantPortalInviteSection">
          {pendingRows.map((a) => (
            <div className="tenantPortalInviteCard" key={a.id}>
              <p>Your landlord has invited you to connect on PropRoster.</p>
              <button className="primary" disabled={acceptBusy === a.id} onClick={() => void acceptInvite(a.id)}>{acceptBusy === a.id ? 'Accepting…' : 'Accept invitation'}</button>
            </div>
          ))}
        </section>
      )}

      {!selected ? (
        pendingRows.length === 0 && (
          <section className="tenantPortalEmpty">
            <p>You don&rsquo;t have any active Tenant Connect access yet.</p>
          </section>
        )
      ) : (
        <>
          {activeRows.length > 1 && (
            <div className="tenantPortalPropertySwitch">
              {activeRows.map((a) => (
                <button key={a.id} className={a.id === selected.id ? 'active' : ''} onClick={() => setSelectedAccessId(a.id)}>{a.property_id === selected.property_id ? property?.address : a.property_id}</button>
              ))}
            </div>
          )}
          <section className="tenantPortalPropertyHead">
            <p className="eyebrow">YOUR PROPERTY</p>
            <h1>{property?.address || 'Loading…'}</h1>
            {property?.city && <p className="muted">{property.city}</p>}
          </section>

          <nav className="tenantPortalTabs" role="tablist" aria-label="Tenant Portal sections">
            {TENANT_VIEWS.map((tab) => (
              <button key={tab} role="tab" aria-selected={view === tab} className={view === tab ? 'active' : ''} onClick={() => setView(tab)}>{tab}</button>
            ))}
          </nav>

          {view === 'My Rental' && <TenantMyRentalView property={property} lease={lease} />}
          {view === 'Lease' && <TenantLeaseView lease={lease} />}
          {view === 'Rent' && supabase && <TenantRentView supabase={supabase} lease={lease} />}
          {view === 'Requests' && supabase && <TenantRequestsView supabase={supabase} propertyId={selected.property_id} ownerId={selected.owner_id} tenantAccessId={selected.id} propertyAddress={property?.address || 'your property'} />}
          {view === 'Documents' && supabase && <TenantDocumentsView supabase={supabase} propertyId={selected.property_id} />}
        </>
      )}
    </main>
  )
}

// "My Rental" (Section: property address, basic landlord-shared rental
// information, lease dates, monthly rent, rent due date) — a read-only
// summary built entirely from data this component already fetches
// (property/lease), no new query.
function TenantMyRentalView({ property, lease }: { property: PropertyRef | null; lease: LeaseRef | null }) {
  return (
    <section className="tenantPortalSection">
      <div className="detailRows">
        <div><span>Address</span><strong>{property?.address || '—'}{property?.city ? `, ${property.city}` : ''}</strong></div>
        {lease ? (
          <>
            <div><span>Monthly rent</span><strong>{money(lease.monthly_rent)}</strong></div>
            {lease.rent_due_day != null && <div><span>Rent due day</span><strong>{lease.rent_due_day}</strong></div>}
            <div><span>Lease start</span><strong>{new Date(`${lease.start_date}T12:00:00`).toLocaleDateString()}</strong></div>
            <div><span>Lease end</span><strong>{new Date(`${lease.end_date}T12:00:00`).toLocaleDateString()}</strong></div>
          </>
        ) : (
          <div><span>Lease</span><strong>No lease on file yet.</strong></div>
        )}
      </div>
    </section>
  )
}

function TenantLeaseView({ lease }: { lease: LeaseRef | null }) {
  if (!lease) return <section className="tenantPortalSection"><p className="muted">No lease on file yet.</p></section>
  return (
    <section className="tenantPortalSection">
      <div className="detailRows">
        <div><span>Monthly rent</span><strong>{money(lease.monthly_rent)}</strong></div>
        <div><span>Lease start</span><strong>{new Date(`${lease.start_date}T12:00:00`).toLocaleDateString()}</strong></div>
        <div><span>Lease end</span><strong>{new Date(`${lease.end_date}T12:00:00`).toLocaleDateString()}</strong></div>
        {lease.rent_due_day != null && <div><span>Rent due day</span><strong>{lease.rent_due_day}</strong></div>}
      </div>
    </section>
  )
}

// "Rent" (Section: monthly rent, due date, payment status/history the
// LANDLORD has documented — "do NOT imply PropRoster collects rent").
// Reads tenant_rent_payments_view — never public.rent_payments
// directly, same narrow-view convention tenant_property_view/
// tenant_lease_view already established (Migration 29).
function TenantRentView({ supabase, lease }: { supabase: SupabaseClient; lease: LeaseRef | null }) {
  const [payments, setPayments] = useState<RentPaymentRef[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!lease) { setPayments([]); setLoading(false); return }
    setLoading(true)
    supabase.from('tenant_rent_payments_view').select('*').eq('lease_id', lease.id).order('rent_period', { ascending: false }).then(({ data }) => {
      setPayments((data as RentPaymentRef[]) || [])
      setLoading(false)
    })
  }, [lease?.id])

  return (
    <section className="tenantPortalSection">
      <div className="detailRows">
        <div><span>Monthly rent</span><strong>{money(lease?.monthly_rent)}</strong></div>
        {lease?.rent_due_day != null && <div><span>Rent due day</span><strong>{lease.rent_due_day}</strong></div>}
      </div>
      <h3 className="tenantPortalSubheading">Payment history</h3>
      <p className="muted tenantPortalRentNote">PropRoster does not collect rent — this reflects what your landlord has recorded.</p>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : payments.length ? (
        <div className="tenantPortalRentList">
          {payments.map((p) => (
            <div className="tenantPortalRentRow" key={p.id}>
              <span>{new Date(`${p.rent_period}T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
              <span className="muted">{new Date(`${p.date_received}T12:00:00`).toLocaleDateString()}</span>
              <span className="muted">{p.payment_method}</span>
              <strong>{money(p.amount)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No payments recorded yet.</p>
      )}
    </section>
  )
}

// "Documents" (Section: ONLY documents explicitly appropriate/shared
// for the tenant). Reads tenant_documents_view (tenant_visible = true
// rows only, Migration 29) — a document with an actual file gets its
// signed URL via app/api/tenant-connect/document-url, never a
// client-side createSignedUrl call (the storage bucket's own RLS stays
// owner-only, unchanged — see that route's own header).
function TenantDocumentsView({ supabase, propertyId }: { supabase: SupabaseClient; propertyId: string }) {
  const [docs, setDocs] = useState<TenantDocumentRef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openingId, setOpeningId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    supabase.from('tenant_documents_view').select('*').eq('property_id', propertyId).order('created_at', { ascending: false }).then(({ data }) => {
      setDocs((data as TenantDocumentRef[]) || [])
      setLoading(false)
    })
  }, [propertyId])

  async function openDoc(doc: TenantDocumentRef) {
    setOpeningId(doc.id)
    setError('')
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) { setOpeningId(null); return }
    const res = await fetch('/api/tenant-connect/document-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ documentId: doc.id }),
    })
    const body = await res.json().catch(() => ({ url: null }))
    setOpeningId(null)
    if (!body.url) { setError('Could not open that document. Please try again in a moment.'); return }
    window.open(body.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="tenantPortalSection">
      {error && <p className="statusMessage errorMessage">{error}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : docs.length ? (
        <div className="tenantPortalRequestList">
          {docs.map((doc) => (
            <button key={doc.id} className="tenantPortalRequestRow" disabled={openingId === doc.id} onClick={() => void openDoc(doc)}>
              <span className="tenantPortalRequestRowTitle">{doc.name}</span>
              <span className="muted">{doc.category}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">No documents have been shared with you yet.</p>
      )}
    </section>
  )
}

function TenantRequestsView({ supabase, propertyId, ownerId, tenantAccessId, propertyAddress }: {
  supabase: SupabaseClient
  propertyId: string
  ownerId: string
  tenantAccessId: string
  propertyAddress: string
}) {
  const [requests, setRequests] = useState<TenantRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNew, setShowNew] = useState(false)

  const [openId, setOpenId] = useState<string | null>(null)
  const openIdRef = useRef<string | null>(null)
  const [threadMessages, setThreadMessages] = useState<PropertyMessage[]>([])
  const [attachmentsByMessage, setAttachmentsByMessage] = useState<Map<string, string[]>>(new Map())
  const [replyText, setReplyText] = useState('')
  const [attachFile, setAttachFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase.from('tenant_requests').select('*').eq('tenant_access_id', tenantAccessId).order('created_at', { ascending: false })
    if (err) setError(err.message)
    setRequests((data as TenantRequest[]) || [])
    setLoading(false)
  }

  useEffect(() => { void load() }, [tenantAccessId])

  async function handleGuidedIntakeSubmitted(tenantRequestId: string) {
    void notifyTenantConnect(supabase, 'new_request', { requestId: tenantRequestId })
    setShowNew(false)
    await load()
  }

  // M2.1 review pass (Part 6): forRequestId guards against a rapid
  // "open A, then open B before A's fetch resolves" race — see the
  // identical note in TenantRequestsPanel.tsx's own loadAttachments().
  async function loadAttachments(messages: PropertyMessage[], forRequestId: string) {
    if (!messages.length) { if (openIdRef.current === forRequestId) setAttachmentsByMessage(new Map()); return }
    const { data } = await supabase.from('property_message_attachments').select('message_id, storage_path').in('message_id', messages.map((m) => m.id))
    const rows = (data as { message_id: string; storage_path: string }[]) || []
    const byMessage = new Map<string, string[]>()
    for (const row of rows) {
      const { data: signed } = await supabase.storage.from('tenant-connect-attachments').createSignedUrl(row.storage_path, 3600)
      if (signed?.signedUrl) byMessage.set(row.message_id, [...(byMessage.get(row.message_id) || []), signed.signedUrl])
    }
    if (openIdRef.current === forRequestId) setAttachmentsByMessage(byMessage)
  }

  async function openRequest(request: TenantRequest) {
    setOpenId(request.id)
    openIdRef.current = request.id
    setReplyText('')
    setAttachFile(null)
    const { data, error: err } = await supabase.from('property_messages').select('*').eq('conversation_id', request.conversation_id).order('created_at', { ascending: true })
    if (err) { setError(err.message); return }
    const messages = (data as PropertyMessage[]) || []
    if (openIdRef.current !== request.id) return
    setThreadMessages(messages)
    void loadAttachments(messages, request.id)
  }

  const open = requests.find((r) => r.id === openId) || null

  function closeThread() {
    setOpenId(null)
    openIdRef.current = null
  }

  async function sendReply() {
    if (!open || !replyText.trim()) return
    setBusy(true)
    setError('')
    const { data: userData } = await supabase.auth.getUser()
    const { data: msg, error: msgErr } = await supabase
      .from('property_messages')
      .insert({ conversation_id: open.conversation_id, sender_user_id: userData.user?.id, sender_role: 'Tenant', message: replyText.trim() })
      .select('id')
      .single()
    if (msgErr || !msg) { setBusy(false); setError(msgErr?.message || 'Could not send message.'); return }
    if (attachFile) {
      const path = `${open.conversation_id}/${crypto.randomUUID()}-${attachFile.name}`
      const { error: uploadErr } = await supabase.storage.from('tenant-connect-attachments').upload(path, attachFile)
      if (!uploadErr) await supabase.from('property_message_attachments').insert({ message_id: msg.id, storage_path: path, mime_type: attachFile.type, size_bytes: attachFile.size })
      else setError(`Message sent, but the attachment failed to upload: ${uploadErr.message}`)
    }
    setBusy(false)
    setReplyText('')
    setAttachFile(null)
    await openRequest(open)
  }

  return (
    <section className="tenantPortalSection">
      <div className="tenantPortalSectionHead">
        <h2>Requests</h2>
        <button className="primary" onClick={() => setShowNew(true)}>+ Report an issue</button>
      </div>
      {error && <div className="statusMessage errorMessage">{error}<button onClick={() => setError('')}>×</button></div>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : requests.length ? (
        <div className="tenantPortalRequestList">
          {requests.map((r) => (
            <button key={r.id} className="tenantPortalRequestRow" onClick={() => void openRequest(r)}>
              <span className={`statusPill ${r.status === 'New' ? 'pillWarn' : r.status === 'Resolved' ? 'pillGood' : ''}`}>{r.status}</span>
              <span className="tenantPortalRequestRowTitle">{r.title}</span>
              <span className="muted">{maintenanceCategoryLabel(r.category)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">No requests yet. Use + Report an issue to tell your landlord what's going on.</p>
      )}

      {showNew && (
        <GuidedIntake
          supabase={supabase}
          propertyId={propertyId}
          ownerId={ownerId}
          tenantAccessId={tenantAccessId}
          onClose={() => setShowNew(false)}
          onSubmitted={(tenantRequestId) => void handleGuidedIntakeSubmitted(tenantRequestId)}
        />
      )}

      {open && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && closeThread()}>
          <div className="modal tenantConnectThreadModal">
            <div className="modalTop">
              <div><p className="eyebrow">{maintenanceCategoryLabel(open.category).toUpperCase()}</p><h2>{open.title}</h2></div>
              <button className="iconButton" onClick={closeThread}>×</button>
            </div>
            <div className="tenantConnectThreadMeta">
              <span className={`statusPill ${open.status === 'New' ? 'pillWarn' : open.status === 'Resolved' ? 'pillGood' : ''}`}>{open.status}</span>
              <span className="muted">{propertyAddress}</span>
            </div>
            <p className="requestDescription">{open.description}</p>
            <div className="tenantConnectThread">
              {threadMessages.map((m) => (
                <div key={m.id} className={`tenantConnectBubble tenantConnectBubble${m.sender_role}`}>
                  <div className="tenantConnectBubbleMeta"><strong>{m.sender_role}</strong><span>{new Date(m.created_at).toLocaleString()}</span></div>
                  <p>{m.message}</p>
                  {(attachmentsByMessage.get(m.id) || []).length > 0 && (
                    <div className="tenantConnectBubbleAttachments">
                      {(attachmentsByMessage.get(m.id) || []).map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="Attached photo" /></a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {!threadMessages.length && <p className="muted">No replies yet.</p>}
            </div>
            <div className="tenantConnectCompose">
              <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} placeholder="Write a reply…" />
              <div className="tenantConnectComposeRow">
                <label className="secondary tenantConnectAttachLabel">
                  {attachFile ? attachFile.name : 'Attach photo'}
                  <input type="file" accept="image/*" onChange={(e) => setAttachFile(e.target.files?.[0] || null)} hidden />
                </label>
                <button className="primary" disabled={busy || !replyText.trim()} onClick={() => void sendReply()}>{busy ? 'Sending…' : 'Reply'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
