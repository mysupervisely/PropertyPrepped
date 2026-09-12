'use client'

// PropPrepped Milestone 9, relaunched under Launch Pricing (capability-based
// relaunch): public pricing page (Section 7).
//
// Reachable whether or not the visitor is signed in — a real acquisition
// page, not something hidden behind auth. Property Evaluator stays free
// regardless of plan (Section 16); this page's CTAs are only about the
// property-management side of the product.
//
// Property Overview + Pricing Polish V1 replaced Launch Pricing's
// "capability-first, property count is one bullet among several, never
// the headline" stance with the opposite, more honest framing: every
// plan gives the same core PropRoster experience (CORE_FEATURES_STATEMENT/
// CORE_FEATURES, stated once above the cards — see lib/billing/plans.ts),
// so property count — shown prominently right under each card's price,
// not buried in a bullet list — is what actually differs between
// Free/Organize/Manage.
//
// Stage 1 (final product decision) went further: Tenant Connect, Smart
// Upload, Portfolio Import, Document Intelligence, Rent Ledger and
// PropWatch — previously Manage-only extras called out on its own card
// (PLAN_FEATURE_HIGHLIGHTS.manage) — are now core capabilities, folded
// into the shared CORE_FEATURES list above the cards. Free, Organize and
// Manage now have NOTHING plan-specific left to list — PLAN_FEATURE_HIGHLIGHTS
// has no entry for any of them (see that constant's own comment). This
// really is "the same core PropRoster experience, different portfolio
// capacity" now, not merely "the core is shared, Manage adds more."
// Legacy plans (investor/portfolio/portfolio_pro) are intentionally
// absent from PUBLIC_PLAN_ORDER — never offered to new customers — but
// an existing legacy subscriber visiting this page still sees an
// accurate note about their current plan rather than the page looking
// like it forgot them.

import { useState } from 'react'
import Link from 'next/link'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'
import { useSubscription } from '../../lib/useSubscription'
import {
  CONTACT_TIER, EARLY_ACCESS_PRICING, PLANS, PUBLIC_PLAN_ORDER, COMING_SOON_PLAN_ORDER,
  TENANT_CONNECT_PRICING_NOTE, PLAN_FEATURE_HIGHLIGHTS, CORE_FEATURES_STATEMENT, CORE_FEATURES,
  type PurchasablePlanId,
} from '../../lib/billing/plans'
import { startCheckout } from '../../lib/billing/client'
import { PricingNavLink } from '../../components/PricingNavLink'
import { Wordmark } from '../../components/Wordmark'
import { AuthHeader } from '../../components/AuthHeader'

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
      {/* Pricing Header Consistency: signed-in visitors get the SAME
          authenticated header (avatar/hamburger menu) every other page
          uses — no separate pricing-specific header. Signed-out
          visitors (this page is a real, reachable-while-logged-out
          acquisition page) keep the lightweight marketing header below,
          since AuthNavMenu's destinations all assume an authenticated
          account. */}
      {/* Simplification + Maintenance Workspace V2, Phase D.1: Pricing is
          a public/marketing surface even for a signed-in visitor —
          excluded from the mobile bottom nav ("logged-out/public
          marketing pages" per that phase's own brief). */}
      {ready && user ? <AuthHeader hideMobileNav /> : (
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
        <p>Start free with one property. Upgrade when your portfolio grows.</p>
      </section>

      {/* Property Overview + Pricing Polish V1: stated once, above the
          cards, instead of repeating the same bullets on Free/Organize/
          Manage — see CORE_FEATURES_STATEMENT/CORE_FEATURES's own
          comment in lib/billing/plans.ts for why every item listed here
          is verified to apply on every plan today. */}
      <section className="pricingCoreFeatures">
        <p className="pricingCoreFeaturesStatement">{CORE_FEATURES_STATEMENT}</p>
        <ul className="pricingFeatureList pricingCoreFeaturesList">
          {CORE_FEATURES.map((feature) => <li key={feature}>{feature}</li>)}
        </ul>
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
              {/* Property Overview + Pricing Polish V1: property count is
                  now the clear, immediate differentiator between the
                  three cards — right under the price, not buried as one
                  bullet among several further down. */}
              <p className="pricingLimit pricingPropertyLimit"><strong>{def.maxProperties === 1 ? '1 property' : `Up to ${def.maxProperties} properties`}</strong></p>
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
          {/* Property Overview + Pricing Polish V1, Stage 1: this line
              used to name only the top tier as getting a monthly AI
              allowance — Smart Upload/Portfolio Import/Document
              Intelligence are core on every plan now, so the number
              below is a shared platform fair-use safeguard, not a
              top-tier-only perk (see lib/billing/entitlements.ts). */}
          {' '}AI-powered document analysis (Smart Upload, Portfolio Import, and Document Intelligence) is included on every plan, with a shared 50-analysis monthly limit to keep the service reliable for everyone.
        </p>
      </section>
    </main>
  )
}
