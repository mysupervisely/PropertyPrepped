'use client'

// PropRoster — Subscription Management: internal Billing / Subscriptions
// view (admin only).
//
// - NOT in the public/customer navigation — reachable only by direct URL,
//   same convention as app/admin/realtor-leads/page.tsx.
// - Authorization is the SAME internal 'owner' plan check used
//   everywhere else in this codebase (app/admin/realtor-leads/page.tsx,
//   app/account/billing/page.tsx, app/pricing/page.tsx). The client-side
//   check below is UX only — the REAL enforcement is server-side, in
//   app/api/admin/subscriptions/route.ts, which re-verifies the caller's
//   own plan before ever reading another account's data.
// - All cross-account data comes from that one API route — this page
//   never queries user_subscriptions/user_profiles directly (RLS would
//   only return the caller's own row anyway).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { useAuthUser } from '../../../lib/useAuthUser'
import { useSubscription } from '../../../lib/useSubscription'
import { AuthHeader } from '../../../components/AuthHeader'
import type { AdminStatusLabel, AdminSubscriptionRow, AdminSubscriptionSummary } from '../../../lib/billing/admin-subscriptions'

const STATUS_PILL_CLASS: Record<AdminStatusLabel, string> = {
  Active: 'pillGood',
  Trial: 'pillGood',
  Canceling: 'pillWarn',
  'Past Due': 'pillBad',
  Unpaid: 'pillBad',
  Canceled: 'pillNeutral',
  Incomplete: 'pillNeutral',
  Paused: 'pillNeutral',
  Free: 'pillNeutral',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatMoney(amount: number) {
  return `$${amount.toFixed(2)}`
}

export default function AdminSubscriptionsPage() {
  const { user, ready } = useAuthUser()
  const { plan, loading: planLoading } = useSubscription(user)
  const [rows, setRows] = useState<AdminSubscriptionRow[]>([])
  const [summary, setSummary] = useState<AdminSubscriptionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const authorized = plan === 'owner'

  async function load() {
    if (!supabase) return
    setLoading(true)
    setError('')
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      setError('Please sign in again.')
      setLoading(false)
      return
    }
    const res = await fetch('/api/admin/subscriptions', { headers: { Authorization: `Bearer ${token}` } })
    const body = (await res.json().catch(() => ({}))) as { rows?: AdminSubscriptionRow[]; summary?: AdminSubscriptionSummary; error?: string }
    if (!res.ok) {
      setError(body.error || 'We couldn’t load subscriptions right now. Please try again.')
      setLoading(false)
      return
    }
    setRows(body.rows || [])
    setSummary(body.summary || null)
    setLoading(false)
  }

  useEffect(() => {
    if (authorized) void load()
    else setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized])

  if (!ready || (user && planLoading)) return <main className="authShell"><div className="loadingState">Loading…</div></main>

  if (!user) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Sign in required</h1>
          <p className="authIntro">Sign in to continue.</p>
          <Link className="primary authSubmit" href="/">Go to sign in</Link>
        </section>
      </main>
    )
  }

  if (!authorized) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Not available</h1>
          <p className="authIntro">This page isn’t available on your account.</p>
          <Link className="primary authSubmit" href="/">Back to Dashboard</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <AuthHeader hideMobileNav />

      <section className="intro">
        <p className="eyebrow">ADMIN · BILLING</p>
        <h1>Subscriptions.</h1>
        <p>Every PropRoster subscriber, synchronized from Stripe. Internal only — never shown to landlord, tenant, vendor, or PropCrew accounts.</p>
      </section>

      {error && <div className="globalError">{error}<button onClick={() => setError('')}>×</button></div>}

      {summary && (
        <div className="financialStats">
          <div className="financialStat"><span>Active subscriptions</span><strong>{summary.activeSubscriptions}</strong></div>
          <div className="financialStat"><span>Monthly recurring revenue</span><strong>{formatMoney(summary.monthlyRecurringRevenue)}</strong></div>
          <div className="financialStat"><span>Canceling</span><strong>{summary.cancelingSubscriptions}</strong></div>
          <div className="financialStat"><span>Past due</span><strong>{summary.pastDueSubscriptions}</strong></div>
        </div>
      )}

      {loading ? (
        <div className="emptyState"><strong>Loading subscriptions…</strong></div>
      ) : rows.length === 0 ? (
        <div className="emptyState"><strong>No subscribers yet.</strong><span>Paid accounts will appear here as soon as Stripe confirms a subscription.</span></div>
      ) : (
        <div className="adminSubList">
          {rows.map((row) => (
            <article className="recordCard" key={row.ownerId}>
              <div className="recordTop">
                <div>
                  <span className={`statusPill ${STATUS_PILL_CLASS[row.statusLabel]}`}>{row.statusLabel}</span>
                  <h3>{row.displayName || row.email || row.ownerId}</h3>
                  <p>{row.email || 'No email on file'} · {row.plan === 'free' ? 'Free' : row.plan === 'owner' ? 'Owner' : `${row.plan[0].toUpperCase()}${row.plan.slice(1)}`}{row.priceMonthly > 0 ? ` · ${formatMoney(row.priceMonthly)}/mo` : ''}</p>
                </div>
              </div>
              <div className="recordRows">
                <div><span>Stripe customer</span><strong>{row.stripeCustomerId || '—'}</strong></div>
                <div><span>Stripe subscription</span><strong>{row.stripeSubscriptionId || '—'}</strong></div>
                <div><span>Subscription start</span><strong>{formatDate(row.createdAt)}</strong></div>
                <div><span>Last successful payment</span><strong>{formatDate(row.lastSuccessfulPaymentAt)}</strong></div>
                <div><span>Next renewal</span><strong>{formatDate(row.currentPeriodEnd)}</strong></div>
                {row.cancelAtPeriodEnd && (
                  <div><span>Scheduled cancellation</span><strong>{formatDate(row.currentPeriodEnd)}</strong></div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}
