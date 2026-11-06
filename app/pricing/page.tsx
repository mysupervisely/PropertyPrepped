'use client'

import { useState } from 'react'
import Link from 'next/link'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'
import { useSubscription } from '../../lib/useSubscription'
import {
  EARLY_ACCESS_PRICING, PLANS, PUBLIC_PLAN_ORDER,
  TENANT_CONNECT_PRICING_NOTE, PLAN_FEATURE_HIGHLIGHTS, CORE_FEATURES_STATEMENT, CORE_FEATURES,
  type PurchasablePlanId,
} from '../../lib/billing/plans'
import { startCheckout } from '../../lib/billing/client'
import { PricingNavLink } from '../../components/PricingNavLink'
import { Wordmark } from '../../components/Wordmark'
import { AuthHeader } from '../../components/AuthHeader'
import { LegalFooter } from '../../components/LegalFooter'

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
    <main className="shell investmentShell pricingPage">
      {ready && user ? <AuthHeader /> : (
        <header className="topbar">
          <Link href="/" className="brandButton"><span className="brand"><Wordmark /></span><span className="tagline">Your real estate portfolio, all in one place.</span></Link>
          <div className="accountActions">
            <PricingNavLink />
            <Link className="primary" href="/">Sign In</Link>
          </div>
        </header>
      )}

      <section className="intro">
        <p className="eyebrow">PRICING</p>
        <h1>Simple pricing for your properties.</h1>
        <p>All plans include the same features. Choose by the number of properties you manage.</p>
      </section>

      {error && <div className="globalError">{error}<button onClick={() => setError('')}>×</button></div>}
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
          const isOwner = ready && user && currentPlan === 'owner'
          const isPaid = planId !== 'free'
          return (
            <article className={`pricingCard${def.mostPopular ? ' pricingCardPopular' : ''}`} key={planId}>
              {def.mostPopular && <span className="pricingBadge">Most Popular</span>}
              <h2>{def.name}</h2>
              <div className="pricingPrice">
                <strong>${def.priceMonthly.toFixed(2)}</strong>
                <span>/month</span>
              </div>
              <p className="pricingLimit pricingPropertyLimit"><strong>{def.maxProperties === 1 ? '1 property' : `Up to ${def.maxProperties} properties`}</strong></p>
              {isPaid && EARLY_ACCESS_PRICING && <span className="statusPill pricingEarlyAccess">Early Access Pricing</span>}
              {PLAN_FEATURE_HIGHLIGHTS[planId] && (
                <ul className="pricingFeatureList">
                  {PLAN_FEATURE_HIGHLIGHTS[planId]!.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
              )}
              {TENANT_CONNECT_PRICING_NOTE[planId] && <p className="pricingTenantConnectNote">{TENANT_CONNECT_PRICING_NOTE[planId]}</p>}
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

      </div>

      <div className="pricingContactStrip"><span>More than 15 properties?</span><a href="mailto:hello@proproster.com?subject=PropRoster%20larger%20portfolio">Contact us for a larger portfolio</a></div>

      <section className="pricingCoreFeatures">
        <h2>Included with every plan</h2>
        <p className="pricingCoreFeaturesStatement">{CORE_FEATURES_STATEMENT}</p>
        <ul className="pricingFeatureList pricingCoreFeaturesList">
          {CORE_FEATURES.map((feature) => <li key={feature}>{feature}</li>)}
        </ul>
      </section>

      <section className="pricingFooterNote">
        <p className="muted">
          The Rental Property Analyzer is free, even without an account.
          {' '}Every plan includes up to 50 AI document analyses per month across Smart Upload, Portfolio Import, and Document Intelligence.
        </p>
      </section>

      <LegalFooter />
    </main>
  )
}
