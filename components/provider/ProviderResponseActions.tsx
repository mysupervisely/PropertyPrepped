'use client'

// PropRoster — Tenant Connect: Provider Outreach V1. The three provider
// actions (Section 4/5) — deliberately NOT a general chat/message
// thread (Section 5's own "do NOT build a general-purpose chat thread"
// instruction, Section 10's "Service Thread" exclusion): one optional
// short question when "I Need More Information" is chosen, nothing
// else. Posts directly to the public, token-authenticated respond
// route — this component never touches Supabase itself (the token is
// the only credential it holds, and it's already scoped to exactly one
// request server-side).

import { useState } from 'react'
import type { ProviderOutreachStatus } from '../../lib/maintenance/provider-outreach'
import { groupWindowsByDate, WINDOW_LABEL_RANGE, formatAppointmentDateTime, type ProviderSafeAvailabilityWindow } from '../../lib/maintenance/availability'
import type { AppointmentRow } from '../../lib/maintenance/appointments'

const CONFIRMATIONS: Record<Exclude<ProviderOutreachStatus, 'sent'>, string> = {
  accepted: 'Thanks. The property owner has been notified that you can help.',
  declined: 'Thanks for letting us know. The property owner has been notified.',
  needs_information: 'Thanks — your question has been sent to the property owner.',
}

export function ProviderResponseActions({
  token, initialStatus, initialMessage, availability, initialAppointment,
}: {
  token: string
  initialStatus: ProviderOutreachStatus
  initialMessage: string | null
  // Scheduling Coordination V1 — both optional so this component still
  // works unchanged for every outreach that predates this milestone
  // (Section 11: "existing Provider Outreach flow remains functional").
  availability?: ProviderSafeAvailabilityWindow[]
  initialAppointment?: AppointmentRow | null
}) {
  const [status, setStatus] = useState<ProviderOutreachStatus>(initialStatus)
  const [message, setMessage] = useState(initialMessage || '')
  const [showQuestionField, setShowQuestionField] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const appointment = initialAppointment || null
  const [proposedTime, setProposedTime] = useState('')
  const [proposeBusy, setProposeBusy] = useState(false)
  const [proposeError, setProposeError] = useState('')
  const [proposed, setProposed] = useState(false)

  async function respond(action: 'accept' | 'decline' | 'needs_information', questionText?: string) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/provider-outreach/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action, message: questionText }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError('Something went wrong. Please try again in a moment.')
        setBusy(false)
        return
      }
      setStatus(data.status as ProviderOutreachStatus)
    } catch {
      setError('Something went wrong. Please try again in a moment.')
    }
    setBusy(false)
  }

  async function proposeTime() {
    setProposeBusy(true)
    setProposeError('')
    try {
      const res = await fetch('/api/provider-outreach/propose-appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, localDateTime: proposedTime }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setProposeError(data.reason === 'already_proposed' ? 'A time has already been proposed for this request.' : 'Something went wrong. Please try again in a moment.')
        setProposeBusy(false)
        return
      }
      setProposed(true)
    } catch {
      setProposeError('Something went wrong. Please try again in a moment.')
    }
    setProposeBusy(false)
  }

  // Scheduling Coordination V1 (Section 5) — only reachable once the
  // provider has already accepted; a decline/needs-info response never
  // shows scheduling at all. Deliberately ONE simple time field rather
  // than the two separate "pick a tenant window" / "propose another
  // time" flows the brief sketches as an example — matched-vs-
  // alternative is computed automatically server-side from whatever
  // time is entered (Section 6), so a second parallel UI path would add
  // no real capability, only more surface (Section 5's own "keep this
  // very simple", "do not build a full calendar UI").
  const schedulingSection = status === 'accepted' && (
    <div className="providerScheduling">
      <h3>Tenant availability</h3>
      {availability && availability.length > 0 ? (
        <ul className="providerAvailabilityList">
          {groupWindowsByDate(availability).map((g) => (
            <li key={g.date}>
              <strong>{new Date(`${g.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
              <span className="muted">{g.labels.map((l) => WINDOW_LABEL_RANGE[l].display).join(', ')}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Tenant availability not provided.</p>
      )}

      {appointment && appointment.status === 'proposed' && !proposed ? (
        <p className="providerAppointmentStatus">Proposed time sent — waiting for the property owner to confirm.</p>
      ) : proposed ? (
        <p className="providerAppointmentStatus">Proposed time sent — waiting for the property owner to confirm.</p>
      ) : appointment && appointment.status === 'confirmed' ? (
        <p className="providerAppointmentStatus">Scheduled: {formatAppointmentDateTime(appointment.proposed_local_start_at)}</p>
      ) : (
        <div className="providerProposeField">
          <label>
            <span>Choose a visit time</span>
            <input type="datetime-local" value={proposedTime} onChange={(e) => setProposedTime(e.target.value)} />
          </label>
          {proposeError && <p className="errorMessage">{proposeError}</p>}
          <button type="button" className="primary" disabled={proposeBusy || !proposedTime} onClick={() => void proposeTime()}>{proposeBusy ? 'Sending…' : 'Propose This Time'}</button>
        </div>
      )}
    </div>
  )

  if (status !== 'sent') {
    return (
      <div className="providerConfirmation">
        <p>{CONFIRMATIONS[status]}</p>
        {status === 'needs_information' && message && <p className="providerQuestionEcho muted">&quot;{message}&quot;</p>}
        {schedulingSection}
      </div>
    )
  }

  return (
    <div className="providerActions">
      {error && <p className="errorMessage">{error}</p>}
      {!showQuestionField ? (
        <>
          <button type="button" className="primary providerActionButton" disabled={busy} onClick={() => void respond('accept')}>I Can Help</button>
          <button type="button" className="secondary providerActionButton" disabled={busy} onClick={() => void respond('decline')}>I Can&apos;t Help</button>
          <button type="button" className="secondary providerActionButton" disabled={busy} onClick={() => setShowQuestionField(true)}>I Need More Information</button>
        </>
      ) : (
        <div className="providerQuestionField">
          <label>
            <span>Your question</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What size is the AC unit?" rows={3} maxLength={1000} />
          </label>
          <div className="providerQuestionActions">
            <button type="button" className="secondary" disabled={busy} onClick={() => setShowQuestionField(false)}>Back</button>
            <button type="button" className="primary" disabled={busy || !message.trim()} onClick={() => void respond('needs_information', message.trim())}>{busy ? 'Sending…' : 'Send Question'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
