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
// construction: every read here goes through tenant-scoped surfaces
// defined in supabase/milestone-24-tenant-connect-v1.sql — this page
// NEVER queries public.properties or public.leases (the owner-facing
// base tables) directly. Property/lease reads go through
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

import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'
import { Wordmark } from '../../components/Wordmark'
import { TENANT_REQUEST_CATEGORIES, TENANT_REQUEST_STATUSES, type TenantRequest, type TenantRequestCategory } from '../../lib/tenant-connect/types'
import type { TenantPropertyAccess, PropertyMessage } from '../../lib/tenant-connect/types'
import { notifyTenantConnect } from '../../lib/tenant-connect/notify-client'

type PropertyRef = { id: string; address: string; city: string }
type LeaseRef = { id: string; tenant_name: string; monthly_rent: number; start_date: string; end_date: string; rent_due_day: number | null }

function money(n: number | null | undefined) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0)
}

export default function TenantPortalPage() {
  const { user, ready } = useAuthUser()
  // Tenant Connect Onboarding V2: read manually via window.location.search
  // (the same deliberate choice app/page.tsx/app/rent-ledger/page.tsx/
  // app/account/billing/page.tsx already make) rather than next/
  // navigation's useSearchParams, so this page never needs a Suspense
  // boundary. This id is the SAME opaque tenant_property_access.id the
  // invite email's CTA links to — see lib/tenant-connect/notify.ts's own
  // comment for why carrying it in the URL is safe (it grants nothing by
  // itself; RLS and accept_tenant_invite() both re-derive identity from
  // the signed-in session every time).
  const [inviteId, setInviteId] = useState<string | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    setInviteId(new URLSearchParams(window.location.search).get('invite'))
  }, [])

  if (!ready) return <main className="authShell"><div className="loadingState">Loading…</div></main>

  if (!user) return <TenantAuthGate hasInvite={Boolean(inviteId)} />

  return <TenantPortal userId={user.id} inviteId={inviteId} />
}

// Tenant Connect Onboarding V2, Section 3/10: a tenant arriving from an
// invitation email is very likely a first-time, non-landlord visitor —
// sending them to "/" would land them on the full landlord marketing
// LandingPage (components/LandingPage.tsx), which this milestone
// explicitly must not do (no giant marketing hero, no landlord nav).
// This is a small, self-contained sign-in/sign-up form scoped to this
// page only — every other secondary route in this app (Documents, Tax
// Center, Rent Ledger, etc.) keeps its existing "Sign in required -> Go
// to sign in" link to "/" unchanged; that's the right behavior for an
// existing landlord user who already knows the app, just not for this
// specific, tenant-facing entry point. Same real Supabase calls
// (signInWithPassword/signUp) LandingPage itself uses — no new auth
// logic, no new provider.
function TenantAuthGate({ hasInvite }: { hasInvite: boolean }) {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  function switchMode(mode: 'signin' | 'signup') {
    setAuthMode(mode)
    setError('')
    setMessage('')
  }

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
    }
    setBusy(false)
  }

  return (
    <main className="authShell">
      <section className="authCard">
        <p className="eyebrow">PROPROSTER &middot; TENANT PORTAL</p>
        <h1>{authMode === 'signin' ? 'Sign in to connect' : 'Create your account'}</h1>
        <p className="authIntro">
          {hasInvite
            ? 'Sign in or create an account using the email address that received your invitation.'
            : 'Sign in to view your Tenant Portal.'}
        </p>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} onKeyDown={(e) => e.key === 'Enter' && void submit()} placeholder="Your password" /></label>
        {error && <p className="errorMessage">{error}</p>}
        {message && <p className="statusMessage successMessage">{message}</p>}
        <button className="primary authSubmit" disabled={busy || !email.trim() || password.length < 6} onClick={() => void submit()}>{busy ? 'Working…' : authMode === 'signin' ? 'Sign in' : 'Create account'}</button>
        <button className="authSwitch" onClick={() => switchMode(authMode === 'signin' ? 'signup' : 'signin')}>{authMode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button>
      </section>
    </main>
  )
}

function TenantPortal({ userId, inviteId }: { userId: string; inviteId: string | null }) {
  const [access, setAccess] = useState<TenantPropertyAccess[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAccessId, setSelectedAccessId] = useState<string | null>(null)
  const [property, setProperty] = useState<PropertyRef | null>(null)
  const [lease, setLease] = useState<LeaseRef | null>(null)
  const [view, setView] = useState<'Lease' | 'Requests'>('Requests')
  const [error, setError] = useState('')
  const [acceptBusy, setAcceptBusy] = useState<string | null>(null)
  // Tenant Connect Onboarding V2, Section 7: set right after a successful
  // acceptInvite() call, cleared the moment the tenant taps through — a
  // one-time interstitial, never a multi-step wizard.
  const [justAcceptedId, setJustAcceptedId] = useState<string | null>(null)
  // Section 3/5: a wrong-account (or revoked/expired/nonexistent) denial
  // can be dismissed only when the signed-in account ALSO has other,
  // genuinely its own access — see the render logic below.
  const [dismissWrongInvite, setDismissWrongInvite] = useState(false)

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
    const { error: err } = await supabase.rpc('accept_tenant_invite', { p_access_id: accessId })
    setAcceptBusy(null)
    if (err) { setError(err.message); return }
    await load()
    // Explicit, not relying on load()'s own "prev || firstActive"
    // default — guarantees the newly accepted property is the one shown
    // next, even if the tenant already had other active access
    // elsewhere.
    setSelectedAccessId(accessId)
    setJustAcceptedId(accessId)
  }

  if (loading) return <main className="tenantPortalShell"><div className="loadingState">Loading your Tenant Portal…</div></main>

  // Section 3/5: the invitation link named a specific access id, but it
  // isn't anywhere in what THIS signed-in account can see. RLS
  // (tenant_access_select) already makes "wrong account," "revoked,"
  // "already claimed by someone else," and "doesn't exist" all look
  // identical from here — deliberately, so this page can't be used to
  // probe which case applies (the same zero-disclosure design
  // accept_tenant_invite()'s own error message already uses). One
  // honest, generic message covers all of them without guessing.
  const wrongInvite = Boolean(inviteId) && !access.some((a) => a.id === inviteId)
  if (wrongInvite && !dismissWrongInvite) {
    return (
      <main className="tenantPortalShell">
        <header className="tenantPortalHeader">
          <span className="brand"><Wordmark /></span>
          <span className="tenantPortalHeaderLabel">Tenant Portal</span>
        </header>
        <section className="tenantPortalEmpty">
          <p className="eyebrow">INVITATION NOT FOUND</p>
          <h1>This invitation isn&rsquo;t available for this account</h1>
          <p className="muted">We couldn&rsquo;t find that invitation for your signed-in account. If your landlord invited a different email address, sign out and sign back in with that email. If you believe this is a mistake, contact your landlord.</p>
          <div className="tenantPortalEmptyActions">
            <button type="button" className="primary" onClick={() => void supabase?.auth.signOut()}>Sign out</button>
            {access.length > 0 && <button type="button" className="secondary" onClick={() => setDismissWrongInvite(true)}>Continue to your Tenant Portal</button>}
          </div>
        </section>
      </main>
    )
  }

  // Section 6/7: a lightweight, one-time "you're connected" confirmation
  // right after acceptance — never a multi-step wizard, no profile
  // questionnaire. Reuses the SAME property/selected state already being
  // fetched below for the normal portal; no extra query.
  if (justAcceptedId && selected?.id === justAcceptedId) {
    return (
      <main className="tenantPortalShell">
        <header className="tenantPortalHeader">
          <span className="brand"><Wordmark /></span>
          <span className="tenantPortalHeaderLabel">Tenant Portal</span>
        </header>
        <section className="tenantPortalWelcome">
          <p className="eyebrow">YOU&rsquo;RE CONNECTED</p>
          <h1>{property?.address || 'Your property'}</h1>
          <p className="muted">You can now view your lease details and submit requests to your landlord.</p>
          <button type="button" className="primary" onClick={() => setJustAcceptedId(null)}>View Tenant Portal</button>
        </section>
      </main>
    )
  }

  return (
    <main className="tenantPortalShell">
      <header className="tenantPortalHeader">
        <span className="brand"><Wordmark /></span>
        <span className="tenantPortalHeaderLabel">Tenant Portal</span>
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
            {(['Requests', 'Lease'] as const).map((tab) => (
              <button key={tab} role="tab" aria-selected={view === tab} className={view === tab ? 'active' : ''} onClick={() => setView(tab)}>{tab}</button>
            ))}
          </nav>

          {view === 'Lease' && <TenantLeaseView lease={lease} />}
          {view === 'Requests' && supabase && <TenantRequestsView supabase={supabase} propertyId={selected.property_id} ownerId={selected.owner_id} tenantAccessId={selected.id} propertyAddress={property?.address || 'your property'} />}
        </>
      )}
    </main>
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
  const [draft, setDraft] = useState<{ category: TenantRequestCategory; title: string; description: string }>({ category: 'General Maintenance', title: '', description: '' })
  const [saving, setSaving] = useState(false)

  const [openId, setOpenId] = useState<string | null>(null)
  const [threadMessages, setThreadMessages] = useState<PropertyMessage[]>([])
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

  async function submitRequest() {
    if (!draft.title.trim() || !draft.description.trim()) return
    setSaving(true)
    setError('')
    const { data: userData } = await supabase.auth.getUser()
    const { data: conv, error: convErr } = await supabase
      .from('property_conversations')
      .insert({ property_id: propertyId, owner_id: ownerId, tenant_access_id: tenantAccessId, subject: draft.title.trim(), conversation_type: 'Maintenance' })
      .select('id')
      .single()
    if (convErr || !conv) { setSaving(false); setError(convErr?.message || 'Could not submit request.'); return }
    const { error: msgErr } = await supabase.from('property_messages').insert({ conversation_id: conv.id, sender_user_id: userData.user?.id, sender_role: 'Tenant', message: draft.description.trim() })
    if (msgErr) { setSaving(false); setError(msgErr.message); return }
    const { data: request, error: reqErr } = await supabase
      .from('tenant_requests')
      .insert({ property_id: propertyId, owner_id: ownerId, tenant_access_id: tenantAccessId, conversation_id: conv.id, category: draft.category, title: draft.title.trim(), description: draft.description.trim() })
      .select('id')
      .single()
    setSaving(false)
    if (reqErr || !request) { setError(reqErr?.message || 'Could not submit request.'); return }
    void notifyTenantConnect(supabase, 'new_request', { requestId: request.id })
    setShowNew(false)
    setDraft({ category: 'General Maintenance', title: '', description: '' })
    await load()
  }

  async function openRequest(request: TenantRequest) {
    setOpenId(request.id)
    setReplyText('')
    setAttachFile(null)
    const { data, error: err } = await supabase.from('property_messages').select('*').eq('conversation_id', request.conversation_id).order('created_at', { ascending: true })
    if (err) { setError(err.message); return }
    setThreadMessages((data as PropertyMessage[]) || [])
  }

  const open = requests.find((r) => r.id === openId) || null

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
        <button className="primary" onClick={() => setShowNew(true)}>+ New Request</button>
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
              <span className="muted">{r.category}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">No requests yet. Use + New Request to report an issue.</p>
      )}

      {showNew && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowNew(false)}>
          <div className="modal">
            <div className="modalTop"><h2>New Request</h2><button className="iconButton" onClick={() => setShowNew(false)}>×</button></div>
            <label>Category<select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as TenantRequestCategory }))}>{TENANT_REQUEST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label>Title<input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Kitchen sink leaking" /></label>
            <label>Description<textarea rows={4} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Describe what's happening…" /></label>
            <div className="modalActions"><button className="secondary" onClick={() => setShowNew(false)}>Cancel</button><button className="primary" disabled={saving || !draft.title.trim() || !draft.description.trim()} onClick={() => void submitRequest()}>{saving ? 'Submitting…' : 'Submit Request'}</button></div>
          </div>
        </div>
      )}

      {open && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpenId(null)}>
          <div className="modal tenantConnectThreadModal">
            <div className="modalTop">
              <div><p className="eyebrow">{open.category.toUpperCase()}</p><h2>{open.title}</h2></div>
              <button className="iconButton" onClick={() => setOpenId(null)}>×</button>
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
