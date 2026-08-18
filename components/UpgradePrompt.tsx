'use client'

// PropPrepped Milestone 9: the "you've hit your property limit" modal
// (Section 8 — Upgrade Experience). Shared between the main workspace's
// Add Property flow and the Property Evaluator's Convert-to-Property flow
// so the copy/behavior can't drift between the two places a user can hit
// this boundary.

import Link from 'next/link'
import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NEXT_PLAN, PLANS, type PlanId, type PurchasablePlanId } from '../lib/billing/plans'
import { startCheckout } from '../lib/billing/client'

const REACHED_LIMIT_COPY: Record<PlanId, string> = {
  free: "You've organized your first property.",
  organize: `You've reached your Organize plan limit (${PLANS.organize.maxProperties} properties).`,
  manage: `You've reached your Manage plan limit (${PLANS.manage.maxProperties} properties).`,
  // Unreachable in practice today (Automate isn't purchasable, so no
  // real subscription can carry this plan id) — present only so this
  // record stays total over PlanId.
  automate: "You've reached your Automate plan limit.",
  // LEGACY — unchanged copy, still shown correctly to any existing
  // subscriber on one of these plans (Section: Legacy Subscribers).
  investor: `You've reached your Investor plan limit (${PLANS.investor.maxProperties} properties).`,
  portfolio: `You've reached your Portfolio plan limit (${PLANS.portfolio.maxProperties} properties).`,
  portfolio_pro: `You've reached your Portfolio Pro plan limit (${PLANS.portfolio_pro.maxProperties} properties).`,
  // Unreachable in practice: an owner account's maxProperties is
  // Infinity, so the canCreateProperty() gate that triggers this modal
  // (app/page.tsx's openAddProperty, the property evaluator's
  // openConvert) never returns false for 'owner' — this modal simply
  // never opens for an owner account. Present only so this record stays
  // total over PlanId.
  owner: "You have unlimited access on the internal owner account.",
}

// Placeholder contact address — replace with your real sales/support inbox
// before launch (see the M9 completion report's Known Limitations).
const CONTACT_EMAIL = 'sales@proproster.com'

export function UpgradePrompt({
  supabase,
  currentPlan,
  onClose,
  headline,
  targetPlanId,
  description,
}: {
  supabase: SupabaseClient
  currentPlan: PlanId
  onClose: () => void
  /** Overrides the default "you've reached your property limit" framing — used for feature-gate prompts (Smart Upload, Smart Import, Rent Ledger, the AI monthly allowance, etc). */
  headline?: string
  /**
   * Overrides the NEXT_PLAN-based upsell target. Required for feature-gate
   * prompts: NEXT_PLAN only encodes "the next rung of the property-count
   * ladder" (e.g. free → organize), which may still be gated from the
   * capability that triggered this prompt (Organize doesn't include
   * Smart Upload/Rent Ledger/PropWatch/AI — only Manage does) — those
   * call sites must pass targetPlanId="manage" explicitly rather than
   * relying on the property-limit default.
   */
  targetPlanId?: PurchasablePlanId
  /** Overrides the default property-count upgrade description line. */
  description?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const nextPlanId = targetPlanId ?? NEXT_PLAN[currentPlan]

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
        <p className="upgradeLead">{headline ?? REACHED_LIMIT_COPY[currentPlan]}</p>
        {nextPlanId ? (
          <p className="muted">
            {description ?? (
              <>Upgrade to <strong>{PLANS[nextPlanId].name}</strong> to manage up to {PLANS[nextPlanId].maxProperties} properties for ${PLANS[nextPlanId].priceMonthly.toFixed(2)}/month.</>
            )}
          </p>
        ) : (
          <p className="muted">
            {/* Reached for any plan whose NEXT_PLAN is null (Manage, or a legacy plan) — describes THIS plan's own ceiling, not a hardcoded one, so it stays correct as the top purchasable tier's limit changes. */}
            PropRoster&rsquo;s largest self-serve plan covers up to {PLANS[currentPlan].maxProperties} properties. For a larger portfolio, let&rsquo;s talk about what you need.
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
            <a className="primary" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('PropRoster — 16+ properties')}`}>
              Contact Us
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
