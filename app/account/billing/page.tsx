'use client'

// PropPrepped Milestone 9: Account & Billing (Section 12).
//
// Shows current plan, property usage against the plan's limit, and — for
// paid plans — subscription status/renewal/cancellation state plus a
// "Manage Subscription" link into Stripe's hosted Customer Portal. All
// subscription data is read RLS-scoped (the caller's own row); the portal
// session itself is created server-side after verifying the caller's
// identity (see app/api/billing/portal/route.ts).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { isSupabaseConfigured, supabase } from '../../../lib/supabase'
import { useAuthUser } from '../../../lib/useAuthUser'
import { useSubscription } from '../../../lib/useSubscription'
import { PLANS } from '../../../lib/billing/plans'
import { openBillingPortal } from '../../../lib/billing/client'
import { AuthHeader } from '../../../components/AuthHeader'

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  trialing: 'Trial',
  past_due: 'Payment past due',
  unpaid: 'Payment failed',
  canceled: 'Canceled',
  incomplete: 'Incomplete',
  incomplete_expired: 'Expired before activation',
  paused: 'Paused',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function BillingPage() {
  const { user, ready } = useAuthUser()
  const { plan, details, loading, refresh } = useSubscription(user)
  const [propertyCount, setPropertyCount] = useState<number | null>(null)
  const [portalBusy, setPortalBusy] = useState(false)
  const [error, setError] = useState('')
  // Read manually (rather than next/navigation's useSearchParams) so this
  // client-only page never needs a Suspense boundary just to check for a
  // Checkout redirect flag.
  const [checkoutState, setCheckoutState] = useState<string | null>(null)
  useEffect(() => {
    setCheckoutState(new URLSearchParams(window.location.search).get('checkout'))
  }, [])

  useEffect(() => {
    if (!supabase || !user) return
    supabase.from('properties').select('id', { count: 'exact', head: true }).then(({ count }) => setPropertyCount(count ?? 0))
  }, [user?.id])

  useEffect(() => {
    // Give the webhook a moment to land, then refresh once so a freshly
    // completed checkout shows up without a manual page reload. Stripe
    // webhook state remains authoritative either way — this is only UX
    // polish, never what grants access (Section 1).
    if (checkoutState === 'success') {
      const t = setTimeout(() => void refresh(), 2500)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutState])

  async function handleManageSubscription() {
    if (!supabase) return
    setError('')
    setPortalBusy(true)
    const result = await openBillingPortal(supabase)
    if (result.error) {
      setError(result.error)
      setPortalBusy(false)
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="authShell">
        <section className="authCard setupCard">
          <h1>Account &amp; Billing</h1>
          <p>Supabase is not configured for this deployment yet.</p>
        </section>
      </main>
    )
  }

  if (!ready) return <main className="authShell"><div className="loadingState">Loading…</div></main>

  if (!user) {
    return (
      <main className="authShell">
        <section className="authCard setupCard">
          <h1>Account &amp; Billing</h1>
          <p>Sign in to view your plan and billing details.</p>
          <Link className="primary authSubmit" href="/">Sign In</Link>
        </section>
      </main>
    )
  }

  const def = PLANS[plan]
  const maxProperties = def.maxProperties
  const usedProperties = propertyCount ?? 0

  return (
    <main className="shell investmentShell">
      <AuthHeader />

      <section className="intro">
        <p className="eyebrow">ACCOUNT &amp; BILLING</p>
        <h1>Your plan.</h1>
        {/* Billing is a compelling account-management reason to show the
            authentication email (Authenticated Header Simplification,
            Part 9) — kept here in the page body, not the global header. */}
        <p className="muted">Signed in as {user.email}</p>
      </section>

      {checkoutState === 'success' && (
        <div className="statusMessage successMessage">Thanks! If you just subscribed, this page will update automatically within a few seconds once Stripe confirms the payment.</div>
      )}
      {checkoutState === 'cancelled' && (
        <div className="statusMessage">Checkout was cancelled — your plan hasn&rsquo;t changed.</div>
      )}
      {error && <div className="globalError">{error}<button onClick={() => setError('')}>×</button></div>}

      <section className="billingCard">
        <div className="recordTop">
          <div>
            <span className="statusPill pillNeutral">{def.name.toUpperCase()}</span>
            <h3>{def.name} plan</h3>
            <p>{loading ? 'Loading your subscription…' : def.tagline}</p>
          </div>
          {/* Internal owner accounts have no Stripe customer at all — no
              Upgrade CTA (nothing to upgrade to) and no Manage Subscription
              button (there is no subscription to manage; clicking it would
              just 404 against the portal route). */}
          {plan === 'free' ? (
            <Link className="primary" href="/pricing">Upgrade</Link>
          ) : plan === 'owner' ? null : (
            <button className="secondary" disabled={portalBusy} onClick={() => void handleManageSubscription()}>
              {portalBusy ? 'Opening…' : 'Manage Subscription'}
            </button>
          )}
        </div>

        <div className="recordMetrics">
          <div><span>Properties used</span><strong>{propertyCount === null ? '—' : maxProperties === Infinity ? 'Unlimited' : `${usedProperties} of ${maxProperties}`}</strong></div>
          <div><span>Monthly price</span><strong>${def.priceMonthly.toFixed(2)}</strong></div>
          <div><span>Status</span><strong>{details?.status ? (STATUS_LABEL[details.status] || details.status) : plan === 'free' ? 'Free' : '—'}</strong></div>
        </div>

        {/* Free and owner accounts never have real Stripe subscription data — no renewal/cancellation row for either. */}
        {plan !== 'free' && plan !== 'owner' && (
          <div className="recordRows">
            <div><span>Renews / current period ends</span><strong>{formatDate(details?.current_period_end ?? null)}</strong></div>
            <div><span>Cancel at period end</span><strong>{details?.cancel_at_period_end ? 'Yes — access continues until the date above' : 'No'}</strong></div>
          </div>
        )}

        {usedProperties >= maxProperties && (
          <p className="ledgerNote">
            You&rsquo;re using {usedProperties} of {maxProperties} properties on the {def.name} plan.{' '}
            {plan !== 'portfolio_pro' ? <Link href="/pricing">Upgrade for more room</Link> : 'Contact us if you need room for more.'}
          </p>
        )}
      </section>

      <section className="billingLinksSection">
        <Link href="/pricing" className="secondary">View All Plans</Link>
      </section>
    </main>
  )
}
