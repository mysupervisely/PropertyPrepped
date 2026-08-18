'use client'

// PropPrepped Milestone 9, relaunched under Launch Pricing (capability-based
// relaunch): public pricing page (Section 7).
//
// Reachable whether or not the visitor is signed in — a real acquisition
// page, not something hidden behind auth. Property Evaluator stays free
// regardless of plan (Section 16); this page's CTAs are only about the
// property-management side of the product.
//
// Positioned by CAPABILITY, not property count (Launch Pricing's explicit
// goal) — PLAN_FEATURE_HIGHLIGHTS leads with what each plan DOES, property
// count is one bullet among several, never the headline. Legacy plans
// (investor/portfolio/portfolio_pro) are intentionally absent from
// PUBLIC_PLAN_ORDER — never offered to new customers — but an existing
// legacy subscriber visiting this page still sees an accurate note about
// their current plan rather than the page looking like it forgot them.

import { useState } from 'react'
import Link from 'next/link'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'
import { useSubscription } from '../../lib/useSubscription'
import {
  CONTACT_TIER, EARLY_ACCESS_PRICING, PLANS, PUBLIC_PLAN_ORDER, COMING_SOON_PLAN_ORDER,
  TENANT_CONNECT_PRICING_NOTE, PLAN_FEATURE_HIGHLIGHTS, type PurchasablePlanId,
} from '../../lib/billing/plans'
import { startCheckout } from '../../lib/billing/client'
import { PricingNavLink } from '../../components/PricingNavLink'
import { Wordmark } from '../../components/Wordmark'

const LEGACY_PLAN_IDS = new Set(['investor', 'portfolio', 'portfolio_pro'])

export default function PricingPage() {
  const { user, ready } = useAuthUser()
  const { plan: currentPlan } = useSubscription(user)
  const [busyPlan, setBusyPlan] = useState<PurchasablePlanId | null>(null)
  const [error, setError] = useState('')

  async function handleUpgrade(plan: PurchasablePlanId) {
    if (!supabase) return
    setError('')
    setBusyPlan(plan)
    const result = await startCheckout(supabase, plan)
    if (result.error) {
      setError(result.error)
      setBusyPlan(null)
    }
  }

  const onLegacyPlan = ready && user && LEGACY_PLAN_IDS.has(currentPlan)

  return (
    <main className="shell investmentShell">
      <header className="topbar">
        <Link href="/" className="brandButton"><span className="brand"><Wordmark /></span><span className="tagline">Your real estate portfolio, all in one place.</span></Link>
        <div className="accountActions">
          <PricingNavLink />
          {ready && user ? <Link className="secondary" href="/account/billing">Account &amp; Billing</Link> : null}
          {ready && !user ? <Link className="primary" href="/">Sign In</Link> : null}
        </div>
      </header>

      <section className="intro">
        <p className="eyebrow">PRICING</p>
        <h1>Plans built around what you need PropRoster to do.</h1>
        <p>Start free to try it out. Upgrade for AI-powered document handling, rent tracking, and PropWatch — not just more property slots.</p>
      </section>

      {error && <div className="globalError">{error}<button onClick={() => setError('')}>×</button></div>}

      {/* Legacy subscribers are never shown a public card for their own
          plan (Section: Legacy Subscribers — no longer offered to new
          customers), so this note is what keeps the page from looking
          like it forgot them — their plan/billing is completely
          unchanged, this is copy only. */}
      {onLegacyPlan && (
        <div className="statusMessage pricingLegacyNote">
          You&rsquo;re on the <strong>{PLANS[currentPlan].name}</strong> plan. Your plan and billing are unchanged — manage it from{' '}
          <Link href="/account/billing">Account &amp; Billing</Link>.
        </div>
      )}

      <div className="pricingGrid">
        {PUBLIC_PLAN_ORDER.map((planId) => {
          const def = PLANS[planId]
          const isCurrent = ready && user && currentPlan === planId
          // Internal owner accounts (never shown as a card here — see
          // PUBLIC_PLAN_ORDER, which deliberately omits 'owner') already have
          // full access and must never be offered a real Stripe Checkout
          // for a lesser paid tier they don't need.
          const isOwner = ready && user && currentPlan === 'owner'
          const isPaid = planId !== 'free'
          return (
            <article className={`pricingCard${def.mostPopular ? ' pricingCardPopular' : ''}`} key={planId}>
              {def.mostPopular && <span className="pricingBadge">Most Popular</span>}
              <h2>{def.name}</h2>
              <p className="pricingTagline">{def.tagline}</p>
              <div className="pricingPrice">
                <strong>${def.priceMonthly.toFixed(2)}</strong>
                <span>/month</span>
              </div>
              {isPaid && EARLY_ACCESS_PRICING && <span className="statusPill pricingEarlyAccess">Early Access Pricing</span>}
              {PLAN_FEATURE_HIGHLIGHTS[planId] && (
                <ul className="pricingFeatureList">
                  {PLAN_FEATURE_HIGHLIGHTS[planId]!.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
              )}
              {TENANT_CONNECT_PRICING_NOTE[planId] && <p className="pricingTenantConnectNote">{TENANT_CONNECT_PRICING_NOTE[planId]}</p>}
              {/* Pushed to the bottom of the flex-column card via margin-top:auto
                  (app/globals.css .pricingCardCta) regardless of how much copy
                  sits above it on this card vs. its siblings — this is what
                  keeps all four CTAs on one horizontal baseline on desktop. */}
              <div className="pricingCardCta">
                {isOwner ? (
                  <span className="muted pricingFreeNote">Included in your account.</span>
                ) : isCurrent ? (
                  <button className="secondary" disabled>Current Plan</button>
                ) : !ready ? (
                  <button className="primary" disabled>Loading…</button>
                ) : !user ? (
                  <Link className="primary" href="/">{isPaid ? 'Sign In to Upgrade' : 'Get Started Free'}</Link>
                ) : planId === 'free' ? (
                  <span className="muted pricingFreeNote">Your account starts here.</span>
                ) : !isSupabaseConfigured ? (
                  <button className="primary" disabled>Billing is not configured yet.</button>
                ) : (
                  <button className="primary" disabled={busyPlan === planId} onClick={() => void handleUpgrade(planId as PurchasablePlanId)}>
                    {busyPlan === planId ? 'Redirecting…' : `Upgrade to ${def.name}`}
                  </button>
                )}
              </div>
            </article>
          )
        })}

        {/* Automate: Coming Soon, never purchasable (Launch Pricing —
            "Do not show Automate as purchasable"). Same PLANS/
            PLAN_FEATURE_HIGHLIGHTS definitions as every other card, just
            never wired to Checkout — the disabled button is the only
            difference from a real plan card. */}
        {COMING_SOON_PLAN_ORDER.map((planId) => {
          const def = PLANS[planId]
          return (
            <article className="pricingCard pricingCardComingSoon" key={planId}>
              <span className="pricingBadge pricingBadgeComingSoon">Coming Soon</span>
              <h2>{def.name}</h2>
              <p className="pricingTagline">{def.tagline}</p>
              {PLAN_FEATURE_HIGHLIGHTS[planId] && (
                <ul className="pricingFeatureList">
                  {PLAN_FEATURE_HIGHLIGHTS[planId]!.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
              )}
              <div className="pricingCardCta">
                <button className="secondary" disabled>Coming Soon</button>
              </div>
            </article>
          )
        })}

        <article className="pricingCard pricingCardContact">
          <h2>{CONTACT_TIER.label}</h2>
          <p className="pricingTagline">{CONTACT_TIER.tagline}</p>
          <p className="pricingLimit">Managing a larger portfolio? Let&rsquo;s build a plan for your properties.</p>
          <a className="primary" href="mailto:sales@proproster.com?subject=PropRoster%20%E2%80%94%2016%2B%20properties">Contact Us</a>
        </article>
      </div>

      <section className="pricingFooterNote">
        <p className="muted">
          The Property Evaluator investment-analysis tool is always free to use, on every plan — including before you create an account.
          Manage includes 50 AI-powered document analyses per month (Smart Upload, Portfolio Import, and Document Intelligence draw from the same monthly allowance).
        </p>
      </section>
    </main>
  )
}
