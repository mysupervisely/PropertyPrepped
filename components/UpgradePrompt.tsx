'use client'

// PropPrepped Milestone 9: the "you've hit your property limit" modal
// (Section 8 — Upgrade Experience). Shared between the main workspace's
// Add Property flow and the Property Evaluator's Convert-to-Property flow
// so the copy/behavior can't drift between the two places a user can hit
// this boundary.

import Link from 'next/link'
import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NEXT_PLAN, PLANS, type PlanId } from '../lib/billing/plans'
import { startCheckout } from '../lib/billing/client'

const REACHED_LIMIT_COPY: Record<PlanId, string> = {
  free: "You've organized your first property.",
  investor: `You've reached your Investor plan limit (${PLANS.investor.maxProperties} properties).`,
  portfolio: `You've reached your Portfolio plan limit (${PLANS.portfolio.maxProperties} properties).`,
  portfolio_pro: `You've reached your Portfolio Pro plan limit (${PLANS.portfolio_pro.maxProperties} properties).`,
}

// Placeholder contact address — replace with your real sales/support inbox
// before launch (see the M9 completion report's Known Limitations).
const CONTACT_EMAIL = 'sales@propprepped.com'

export function UpgradePrompt({
  supabase,
  currentPlan,
  onClose,
}: {
  supabase: SupabaseClient
  currentPlan: PlanId
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const nextPlanId = NEXT_PLAN[currentPlan]

  async function handleUpgrade() {
    if (!nextPlanId) return
    setBusy(true)
    setError('')
    const result = await startCheckout(supabase, nextPlanId)
    if (result.error) {
      setError(result.error)
      setBusy(false)
    }
    // On success the browser is redirected to Stripe Checkout — no need to reset busy.
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal upgradeModal">
        <div className="modalTop">
          <h2>{nextPlanId ? 'Time to upgrade' : "Let's talk"}</h2>
          <button className="iconButton" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="upgradeLead">{REACHED_LIMIT_COPY[currentPlan]}</p>
        {nextPlanId ? (
          <p className="muted">
            Upgrade to <strong>{PLANS[nextPlanId].name}</strong> to manage up to {PLANS[nextPlanId].maxProperties} properties for ${PLANS[nextPlanId].priceMonthly.toFixed(2)}/month.
          </p>
        ) : (
          <p className="muted">
            PropPrepped&rsquo;s largest self-serve plan covers up to {PLANS.portfolio_pro.maxProperties} properties. For a larger portfolio, let&rsquo;s talk about what you need.
          </p>
        )}
        {error && <div className="statusMessage errorMessage">{error}</div>}
        <div className="modalActions">
          <Link className="secondary" href="/pricing">View Plans</Link>
          {nextPlanId ? (
            <button className="primary" disabled={busy} onClick={() => void handleUpgrade()}>
              {busy ? 'Redirecting…' : `Upgrade to ${PLANS[nextPlanId].name}`}
            </button>
          ) : (
            <a className="primary" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('PropPrepped — 21+ properties')}`}>
              Contact Us
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
