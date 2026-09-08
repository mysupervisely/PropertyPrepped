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

const CONFIRMATIONS: Record<Exclude<ProviderOutreachStatus, 'sent'>, string> = {
  accepted: 'Thanks. The property owner has been notified that you can help.',
  declined: 'Thanks for letting us know. The property owner has been notified.',
  needs_information: 'Thanks — your question has been sent to the property owner.',
}

export function ProviderResponseActions({
  token, initialStatus, initialMessage,
}: {
  token: string
  initialStatus: ProviderOutreachStatus
  initialMessage: string | null
}) {
  const [status, setStatus] = useState<ProviderOutreachStatus>(initialStatus)
  const [message, setMessage] = useState(initialMessage || '')
  const [showQuestionField, setShowQuestionField] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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

  if (status !== 'sent') {
    return (
      <div className="providerConfirmation">
        <p>{CONFIRMATIONS[status]}</p>
        {status === 'needs_information' && message && <p className="providerQuestionEcho muted">&quot;{message}&quot;</p>}
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
