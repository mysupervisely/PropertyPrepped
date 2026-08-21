'use client'

// PropRoster Milestone 21: Realtor Connect V1 — the internal Lead Center
// (Section 12).
//
// - NOT in the public/customer navigation (AuthNavMenu) — reachable only
//   by typing the URL, matching the spec's "Do not expose it in the
//   normal public navigation."
// - Authorization is the SAME internal 'owner' plan check already used
//   by app/api/document-intelligence/analyze/route.ts's diagnostics
//   gate, app/account/billing/page.tsx, and app/pricing/page.tsx — never
//   a new admin-role system. The client-side check below is UX only; the
//   REAL enforcement is the RLS policy on realtor_leads itself
//   (supabase/milestone-21-realtor-connect.sql) — a non-owner querying
//   this table gets zero rows back regardless of what this page does.
// - Reads/writes go through the caller's own normal RLS-scoped
//   `supabase` client, same as every other authenticated page in this
//   app (rent-ledger, account/billing, etc.) — no service-role key here.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { useAuthUser } from '../../../lib/useAuthUser'
import { useSubscription } from '../../../lib/useSubscription'
import { AuthHeader } from '../../../components/AuthHeader'
import { LEAD_STATUSES, type LeadStatus, type RealtorLeadRow } from '../../../lib/realtor-leads/types'

const STATUS_ORDER: Record<LeadStatus, number> = { New: 0, Contacted: 1, Referred: 2, Closed: 3, Archived: 4 }
const STATUS_PILL_CLASS: Record<LeadStatus, string> = { New: 'pillWarn', Contacted: 'pillNeutral', Referred: 'pillNeutral', Closed: 'pillGood', Archived: 'pillNeutral' }
const SOURCE_LABEL: Record<string, string> = { rental_analyzer: 'Rental Property Analyzer', home_purchase: 'Home Purchase Calculator' }
const GEOGRAPHY_PILL_CLASS: Record<string, string> = { 'Tampa Bay Area': 'pillGood', 'Outside Tampa Bay Area': 'pillNeutral', Unknown: 'pillNeutral' }

function formatDate(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type EditDraft = { status: LeadStatus; notes: string; referredToName: string; referredToEmail: string; referredToState: string }

function draftFromLead(lead: RealtorLeadRow): EditDraft {
  return {
    status: lead.status,
    notes: lead.notes || '',
    referredToName: lead.referred_to_name || '',
    referredToEmail: lead.referred_to_email || '',
    referredToState: lead.referred_to_state || '',
  }
}

export default function RealtorLeadCenterPage() {
  const { user, ready } = useAuthUser()
  const { plan, loading: planLoading } = useSubscription(user)
  const [leads, setLeads] = useState<RealtorLeadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [saving, setSaving] = useState(false)

  const authorized = plan === 'owner'

  async function load() {
    if (!supabase) return
    setLoading(true)
    setError('')
    const { data, error: fetchError } = await supabase.from('realtor_leads').select('*').order('created_at', { ascending: false })
    if (fetchError) {
      // Never surface raw Postgres/RLS text — a non-owner reaching this
      // point (RLS already returns 0 rows, not an error) or a genuine
      // outage both get the same friendly message.
      setError('We couldn’t load leads right now. Please try again.')
    } else {
      setLeads((data || []) as RealtorLeadRow[])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (authorized) void load()
    else setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized])

  const sortedLeads = useMemo(
    () => [...leads].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.created_at < b.created_at ? 1 : -1)),
    [leads],
  )

  function openLead(lead: RealtorLeadRow) {
    if (expandedId === lead.id) { setExpandedId(null); setDraft(null); return }
    setExpandedId(lead.id)
    setDraft(draftFromLead(lead))
  }

  async function saveLead(lead: RealtorLeadRow) {
    if (!supabase || !draft) return
    setSaving(true)
    setError('')
    const { data, error: saveError } = await supabase
      .from('realtor_leads')
      .update({
        status: draft.status,
        notes: draft.notes.trim() || null,
        referred_to_name: draft.referredToName.trim() || null,
        referred_to_email: draft.referredToEmail.trim() || null,
        referred_to_state: draft.referredToState.trim() || null,
      })
      .eq('id', lead.id)
      .select('*')
      .single()
    if (saveError) {
      setError('We couldn’t save that change. Please try again.')
    } else {
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? (data as RealtorLeadRow) : l)))
    }
    setSaving(false)
  }

  if (!ready || (user && planLoading)) return <main className="authShell"><div className="loadingState">Loading…</div></main>

  if (!user) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Sign in required</h1>
          <p className="authIntro">Sign in to continue.</p>
          <Link className="primary authSubmit" href="/">Go to sign in</Link>
        </section>
      </main>
    )
  }

  if (!authorized) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Not available</h1>
          <p className="authIntro">This page isn’t available on your account.</p>
          <Link className="primary authSubmit" href="/">Back to Dashboard</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <AuthHeader />

      <section className="intro">
        <p className="eyebrow">REALTOR LEAD CENTER</p>
        <h1>Realtor Connect leads.</h1>
        <p>Every lead submitted from the Rental Property Analyzer and Home Purchase Calculator. Internal only — never shown to regular PropRoster users.</p>
      </section>

      {error && <div className="globalError">{error}<button onClick={() => setError('')}>×</button></div>}

      {loading ? (
        <div className="emptyState"><strong>Loading leads…</strong></div>
      ) : sortedLeads.length === 0 ? (
        <div className="emptyState"><strong>No leads yet.</strong><span>Submissions from either calculator&rsquo;s Realtor Connect CTA will appear here.</span></div>
      ) : (
        <div className="realtorLeadList">
          {sortedLeads.map((lead) => {
            const expanded = expandedId === lead.id
            return (
              <article className="recordCard realtorLeadCard" key={lead.id}>
                <button className="realtorLeadCardHead" onClick={() => openLead(lead)} aria-expanded={expanded}>
                  <div className="recordTop">
                    <div>
                      <span className={`statusPill ${STATUS_PILL_CLASS[lead.status]}`}>{lead.status}</span>
                      <h3>{lead.name}</h3>
                      <p>{formatDate(lead.created_at)} · {SOURCE_LABEL[lead.source] || lead.source}</p>
                    </div>
                    <span className={`statusPill ${GEOGRAPHY_PILL_CLASS[lead.geography_bucket]}`}>{lead.geography_bucket}</span>
                  </div>
                </button>
                <div className="recordRows">
                  <div><span>Contact</span><strong>{[lead.email, lead.phone].filter(Boolean).join(' · ') || '—'} ({lead.preferred_contact_method})</strong></div>
                  <div><span>Property</span><strong>{lead.property_address || 'Not provided'}</strong></div>
                </div>

                {expanded && draft && (
                  <div className="realtorLeadDetail">
                    {lead.message && <p className="realtorLeadMessage"><span className="muted">Message:</span> {lead.message}</p>}
                    {lead.analysis_snapshot && Object.keys(lead.analysis_snapshot).length > 1 && (
                      <div className="realtorLeadSnapshot">
                        <p className="muted">Analysis at time of request:</p>
                        <pre>{JSON.stringify(lead.analysis_snapshot, null, 2)}</pre>
                      </div>
                    )}
                    <fieldset className="formFieldset"><legend>Manage</legend><div className="formGrid">
                      <label>Status<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as LeadStatus })}>{LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
                      <label className="fullField">Notes<input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Internal notes only" /></label>
                      <label>Referred agent name<input value={draft.referredToName} onChange={(e) => setDraft({ ...draft, referredToName: e.target.value })} placeholder="Optional" /></label>
                      <label>Referred agent email<input value={draft.referredToEmail} onChange={(e) => setDraft({ ...draft, referredToEmail: e.target.value })} placeholder="Optional" /></label>
                      <label>Referred agent state<input value={draft.referredToState} onChange={(e) => setDraft({ ...draft, referredToState: e.target.value })} placeholder="Optional" /></label>
                    </div></fieldset>
                    <div className="modalActions"><button className="primary" disabled={saving} onClick={() => void saveLead(lead)}>{saving ? 'Saving…' : 'Save'}</button></div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
