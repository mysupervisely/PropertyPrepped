'use client'

// PropPrepped Milestone 9: Account & Billing (Section 12).
//
// Shows current plan, property usage against the plan's limit, and — for
// paid plans — subscription status/renewal/cancellation state plus a
// "Manage Subscription" link into Stripe's hosted Customer Portal. All
// subscription data is read RLS-scoped (the caller's own row); the portal
// session itself is created server-side after verifying the caller's
// identity (see app/api/billing/portal/route.ts).
//
// Subscription Management milestone: adds self-service cancel (always
// scheduled for the end of the current paid period, behind an explicit
// confirmation step — never immediate, never hidden) and resume, plus a
// lightweight payment-method/invoice summary. The cancel/resume actions
// themselves call app/api/billing/cancel and .../resume, which derive the
// Stripe subscription id from the caller's own RLS-scoped row server-side
// (see lib/billing/subscription-actions.ts) — this page never sends a
// Stripe id anywhere.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { isSupabaseConfigured, supabase } from '../../../lib/supabase'
import { useAuthUser } from '../../../lib/useAuthUser'
import { useSubscription } from '../../../lib/useSubscription'
import { PLANS, PUBLIC_PLAN_ORDER } from '../../../lib/billing/plans'
import { openBillingPortal, scheduleCancellation, resumeSubscription, fetchBillingSummary, type BillingSummary } from '../../../lib/billing/client'
import { buildCheckoutSyncSchedule, shouldContinueCheckoutSync } from '../../../lib/billing/checkout-sync'
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
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [resumeBusy, setResumeBusy] = useState(false)
  const [summary, setSummary] = useState<BillingSummary>({ paymentMethod: null, invoices: [] })
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

  // Payment method summary + recent invoices — a lightweight inline view
  // only; full management still lives in the Stripe Customer Portal
  // ("Manage Subscription" below). Never fetched for Free/owner accounts,
  // which have no Stripe customer.
  useEffect(() => {
    if (!supabase || !user || plan === 'free' || plan === 'owner') return
    let cancelled = false
    void fetchBillingSummary(supabase).then((result) => {
      if (!cancelled) setSummary(result)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, plan])

  // Issue 5 fix: a single fixed-delay retry raced the Stripe webhook and,
  // once it lost that race, never tried again — the page could show a
  // stale Free plan indefinitely until manually reloaded. This is now a
  // short BOUNDED sequence of retries (lib/billing/checkout-sync.ts)
  // that stops the instant the paid plan is actually confirmed, and
  // also stops on its own after ~19s if it never arrives — never an
  // infinite loop, and never anything but a read of the real DB row
  // (never a fabricated/optimistic paid state). Only ever runs when
  // ?checkout=success is present; a normal visit to this page never
  // schedules anything here.
  const [checkoutSyncAttempts, setCheckoutSyncAttempts] = useState(0)
  const checkoutSyncSchedule = useMemo(() => buildCheckoutSyncSchedule(), [])
  const checkoutSyncing = shouldContinueCheckoutSync({
    checkoutState, plan, attemptsFired: checkoutSyncAttempts, schedule: checkoutSyncSchedule,
  })

  useEffect(() => {
    if (!checkoutSyncing) return
    const step = checkoutSyncSchedule[checkoutSyncAttempts]
    const t = setTimeout(() => {
      void refresh()
      setCheckoutSyncAttempts((n) => n + 1)
    }, step.delayMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutSyncing, checkoutSyncAttempts])

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

  async function handleConfirmCancel() {
    if (!supabase) return
    setError('')
    setCancelBusy(true)
    const result = await scheduleCancellation(supabase)
    setCancelBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setShowCancelConfirm(false)
    void refresh()
  }

  async function handleResume() {
    if (!supabase) return
    setError('')
    setResumeBusy(true)
    const result = await resumeSubscription(supabase)
    setResumeBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    void refresh()
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
  // Whether a REAL better self-serve ceiling exists — not the same
  // question as NEXT_PLAN (which only governs safe direct-Checkout
  // routing, and is intentionally null for legacy plans to avoid a
  // double-subscription risk). A legacy Investor/Portfolio subscriber
  // hitting their limit genuinely can see more room on Manage even
  // though our Checkout won't auto-switch them there — /pricing is
  // still the right link. Only a plan whose own ceiling already meets
  // or beats every purchasable plan's has truly nothing better to buy.
  const hasRoomToUpgrade = maxProperties < Math.max(...PUBLIC_PLAN_ORDER.map((id) => PLANS[id].maxProperties))

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
        <div className="statusMessage successMessage">
          Thanks! If you just subscribed, this page will update automatically within a few seconds once Stripe confirms the payment.
          {/* Issue 5: only shown while a bounded background re-check is
              actually still in flight — never claims to be "confirming"
              once that loop has stopped, whether because the paid plan
              landed or because the bounded window ran out. */}
          {checkoutSyncing && <><br /><span className="checkoutSyncingNote">Confirming your subscription…</span></>}
        </div>
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
          </div>
        )}

        {/* Cancellation: always scheduled for the end of the paid period,
            never immediate — the action is always visible here (never
            hidden behind support or a hard-to-find setting), and once
            scheduled it's replaced by clear status text plus a Resume
            action rather than just disappearing. */}
        {plan !== 'free' && plan !== 'owner' && details?.status !== 'canceled' && (
          <div className="billingCancelRow">
            {details?.cancel_at_period_end ? (
              <>
                <p className="muted">
                  Your subscription is scheduled to cancel on <strong>{formatDate(details?.current_period_end ?? null)}</strong>. You&rsquo;ll keep full access until then — no data is deleted.
                </p>
                <button className="secondary" disabled={resumeBusy} onClick={() => void handleResume()}>
                  {resumeBusy ? 'Resuming…' : 'Resume Subscription'}
                </button>
              </>
            ) : (
              <button className="dangerLink" onClick={() => setShowCancelConfirm(true)}>Cancel Subscription</button>
            )}
          </div>
        )}

        {details?.status === 'canceled' && (
          <p className="muted">Your subscription has ended. <Link href="/pricing">Choose a plan</Link> to subscribe again.</p>
        )}

        {usedProperties >= maxProperties && (
          <p className="ledgerNote">
            You&rsquo;re using {usedProperties} of {maxProperties} properties on the {def.name} plan.{' '}
            {hasRoomToUpgrade ? <Link href="/pricing">Upgrade for more room</Link> : 'Contact us if you need room for more.'}
          </p>
        )}
      </section>

      {plan !== 'free' && plan !== 'owner' && (summary.paymentMethod || summary.invoices.length > 0) && (
        <section className="billingCard">
          <div className="recordTop">
            <div>
              <h3>Payment &amp; invoices</h3>
              <p>Full payment-method and invoice management is available in the Stripe Customer Portal above.</p>
            </div>
          </div>
          {summary.paymentMethod && (
            <div className="recordRows">
              <div><span>Payment method</span><strong>{summary.paymentMethod.brand.toUpperCase()} •••• {summary.paymentMethod.last4}</strong></div>
            </div>
          )}
          {summary.invoices.length > 0 && (
            <div className="recordRows">
              {summary.invoices.map((invoice) => (
                <div key={invoice.id}>
                  <span>{formatDate(invoice.created)}</span>
                  <strong>
                    ${invoice.amountPaid.toFixed(2)} · {invoice.status === 'paid' ? 'Paid' : invoice.status || '—'}
                    {invoice.hostedInvoiceUrl && <> · <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">View</a></>}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="billingLinksSection">
        <Link href="/pricing" className="secondary">View All Plans</Link>
      </section>

      {showCancelConfirm && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowCancelConfirm(false)}>
          <div className="modal">
            <div className="modalTop">
              <div>
                <p className="eyebrow">CANCEL SUBSCRIPTION</p>
                <h2>Cancel your {def.name} plan?</h2>
              </div>
              <button className="iconButton" onClick={() => setShowCancelConfirm(false)}>×</button>
            </div>
            <p className="deleteWarning">
              Your subscription will stay active and you&rsquo;ll keep full access through <strong>{formatDate(details?.current_period_end ?? null)}</strong> — the end of your current paid period. You won&rsquo;t be charged again after that date. Your properties, tenants, maintenance history, tax records, and documents are never deleted or affected.
            </p>
            <div className="modalActions">
              <button className="secondary" onClick={() => setShowCancelConfirm(false)}>Keep my subscription</button>
              <button className="primary" disabled={cancelBusy} onClick={() => void handleConfirmCancel()}>
                {cancelBusy ? 'Canceling…' : 'Yes, cancel subscription'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
