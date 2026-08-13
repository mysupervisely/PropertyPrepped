'use client'

// PropPrepped Milestone 9: public pricing page (Section 7).
//
// Reachable whether or not the visitor is signed in — a real acquisition
// page, not something hidden behind auth. Property Evaluator stays free
// regardless of plan (Section 16); this page's CTAs are only about the
// property-management side of the product.

import { useState } from 'react'
import Link from 'next/link'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'
import { useSubscription } from '../../lib/useSubscription'
import { CONTACT_TIER, EARLY_ACCESS_PRICING, PLANS, type PlanId, type PurchasablePlanId } from '../../lib/billing/plans'
import { startCheckout } from '../../lib/billing/client'
import { PricingNavLink } from '../../components/PricingNavLink'

const PLAN_ORDER: PlanId[] = ['free', 'investor', 'portfolio', 'portfolio_pro']

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

  return (
    <main className="shell investmentShell">
      <header className="topbar">
        <Link href="/" className="brandButton"><span className="brand">PropRoster</span><span className="tagline">Your real estate portfolio, all in one place.</span></Link>
        <div className="accountActions">
          <PricingNavLink />
          {ready && user ? <Link className="secondary" href="/account/billing">Account &amp; Billing</Link> : null}
          {ready && !user ? <Link className="primary" href="/">Sign In</Link> : null}
        </div>
      </header>

      <section className="intro">
        <p className="eyebrow">PRICING</p>
        <h1>Simple plans that grow with your portfolio.</h1>
        <p>Start free with your first property. Upgrade only when you need room for more.</p>
      </section>

      {error && <div className="globalError">{error}<button onClick={() => setError('')}>×</button></div>}

      <div className="pricingGrid">
        {PLAN_ORDER.map((planId) => {
          const def = PLANS[planId]
          const isCurrent = ready && user && currentPlan === planId
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
              <p className="pricingLimit">Up to <strong>{def.maxProperties}</strong> propert{def.maxProperties === 1 ? 'y' : 'ies'}</p>
              {isCurrent ? (
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
            </article>
          )
        })}

        <article className="pricingCard pricingCardContact">
          <h2>{CONTACT_TIER.label}</h2>
          <p className="pricingTagline">{CONTACT_TIER.tagline}</p>
          <p className="pricingLimit">Managing more than 20 properties? Let&rsquo;s build a plan for your portfolio.</p>
          <a className="primary" href="mailto:sales@proproster.com?subject=PropRoster%20%E2%80%94%2021%2B%20properties">Contact Us</a>
        </article>
      </div>

      <section className="pricingFooterNote">
        <p className="muted">
          The Property Evaluator investment-analysis tool is always free to use, on every plan — including before you create an account.
          Paid plans only affect how many properties you can organize in your portfolio.
        </p>
      </section>
    </main>
  )
}
