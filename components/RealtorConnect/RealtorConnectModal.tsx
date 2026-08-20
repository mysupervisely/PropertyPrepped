'use client'

// PropRoster Milestone 21: Realtor Connect V1 — the lead-capture modal
// (Sections 4/5/6/11). Shared by both calculators; only propertyAddress/
// analysisSnapshot/source vary per caller.
//
// - Works fully signed-out (Section 4) — `user`/`supabase` are optional;
//   when present, known profile fields are prefilled but the form is
//   never blocked on that fetch, and no account/session is ever
//   required to submit.
// - Never sends analysisSnapshot fields the calculator didn't actually
//   have (Section 6) — the caller (each calculator page) already builds
//   that object via lib/realtor-leads/snapshot.ts, which omits anything
//   not genuinely available; this component just passes it through.
// - Consent is never pre-checked (Section 5).
// - Submit is disabled while busy and again once a submission has
//   already succeeded, so a repeated tap can never create a second lead
//   (Section 11).
// - Shows only the friendly copy from the spec — the API route never
//   returns raw Supabase/Postgres text (see
//   lib/realtor-leads/handle-lead-submission.ts), but this component
//   also never surfaces anything except result.error / a fixed fallback.

import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { PREFERRED_CONTACT_METHODS, type LeadAnalysisSnapshot, type LeadSource, type PreferredContactMethod } from '../../lib/realtor-leads/types'

type Draft = {
  name: string
  email: string
  phone: string
  preferredContactMethod: PreferredContactMethod
  message: string
  consent: boolean
  website: string // honeypot — must stay empty
}

function emptyDraft(): Draft {
  return { name: '', email: '', phone: '', preferredContactMethod: 'Email', message: '', consent: false, website: '' }
}

export function RealtorConnectModal({
  open,
  onClose,
  source,
  propertyAddress,
  analysisSnapshot,
  user,
  supabase,
  headline,
}: {
  open: boolean
  onClose: () => void
  source: LeadSource
  propertyAddress: string
  analysisSnapshot: LeadAnalysisSnapshot
  user: User | null
  supabase: SupabaseClient | null
  headline: string
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // Section 4: for signed-in users, prefill known profile/contact info
  // where safe — best-effort only, never blocks the form, never
  // overwrites something the user already typed.
  useEffect(() => {
    if (!open) return
    setDraft(emptyDraft())
    setError('')
    setSubmitted(false)
    if (!user || !supabase) return
    setDraft((d) => ({ ...d, email: user.email || '' }))
    supabase.from('user_profiles').select('first_name,last_name,display_name,phone').eq('id', user.id).maybeSingle().then(({ data }) => {
      if (!data) return
      const profile = data as { first_name: string | null; last_name: string | null; display_name: string | null; phone: string | null }
      const name = profile.display_name || [profile.first_name, profile.last_name].filter(Boolean).join(' ')
      setDraft((d) => ({ ...d, name: d.name || name, phone: d.phone || profile.phone || '' }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id])

  if (!open) return null

  const canSubmit = draft.name.trim().length > 0 && (draft.email.trim().length > 0 || draft.phone.trim().length > 0) && draft.consent && !busy && !submitted

  async function handleSubmit() {
    if (!canSubmit) return
    setBusy(true)
    setError('')
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (user && supabase) {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (token) headers.Authorization = `Bearer ${token}`
      }
      const res = await fetch('/api/realtor-leads', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source,
          name: draft.name.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          preferredContactMethod: draft.preferredContactMethod,
          message: draft.message.trim(),
          consent: draft.consent,
          propertyAddress,
          analysisSnapshot,
          website: draft.website,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !body.ok) {
        setError(body.error || "We couldn't send your request. Please try again.")
        setBusy(false)
        return
      }
      setSubmitted(true)
      setBusy(false)
    } catch {
      setError("We couldn't send your request. Please try again.")
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal moduleModal realtorConnectModal">
        <div className="modalTop">
          <div><p className="eyebrow">REALTOR CONNECT</p><h2>{headline}</h2></div>
          <button className="iconButton" onClick={onClose} aria-label="Close">×</button>
        </div>

        {submitted ? (
          <>
            <p className="statusMessage successMessage">Thanks. Your request was sent to PropRoster. We&rsquo;ll follow up with you about this property.</p>
            <div className="modalActions"><button className="primary" onClick={onClose}>Close</button></div>
          </>
        ) : (
          <>
            <div className="formGrid">
              <label>Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Jamie Rivera" /></label>
              <label>Email<input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="jamie@example.com" /></label>
              <label>Phone<input type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="(555) 123-4567" /></label>
              <label>Preferred contact method<select value={draft.preferredContactMethod} onChange={(e) => setDraft({ ...draft, preferredContactMethod: e.target.value as PreferredContactMethod })}>{PREFERRED_CONTACT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
              <label className="fullField">Message (optional)<input value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} placeholder="Anything else you'd like PropRoster to know?" /></label>
              {/* Honeypot — never visible/reachable to a real visitor. A real
                  browser never fills this in; a bot filling every field
                  usually will. See lib/realtor-leads/rate-limit.ts. */}
              <label className="realtorConnectHoneypot" aria-hidden="true">
                Website
                <input tabIndex={-1} autoComplete="off" value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} />
              </label>
              <label className="recurringCheck fullField">
                <input type="checkbox" checked={draft.consent} onChange={(e) => setDraft({ ...draft, consent: e.target.checked })} />
                <span>I agree to be contacted about this property</span>
                <small>I agree that PropRoster may use the information I provided to contact me and connect me with a real estate professional regarding this property.</small>
              </label>
            </div>
            {error && <p className="errorMessage">{error}</p>}
            <p className="muted realtorConnectFinePrint">PropRoster will review your request — connecting you with a real estate professional is not guaranteed and depends on availability.</p>
            <div className="modalActions">
              <button className="secondary" onClick={onClose}>Cancel</button>
              <button className="primary" disabled={!canSubmit} onClick={() => void handleSubmit()}>{busy ? 'Sending…' : 'Send Request'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
