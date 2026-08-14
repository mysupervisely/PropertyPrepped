'use client'

// PropRoster Milestone 11: internal admin analytics — the ONLY UI surface
// this milestone builds. Read the completion report before extending
// this file.
//
// This is deliberately NOT a customer-support tool: there is no "view
// user portfolio" action, no document viewer, no tenant-message viewer,
// no property-address search, no map. Every number on this page comes
// from GET /api/admin/analytics, which itself only ever returns
// aggregate counts/sums/averages (see lib/admin/types.ts) — this
// component never receives, and therefore can never render, a raw
// property/document/tenant/lease/mortgage/insurance/financial row.
//
// Access control: the server route is the real gate (it re-verifies
// admin status via the is_admin() RPC on every request, independent of
// anything this component believes). This page's own check is a UX
// nicety — showing a fast, friendly "Access restricted" state instead of
// a flash of empty charts — never the actual security boundary.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'
import { Wordmark } from '../../components/Wordmark'

type AdminAnalyticsResponse = {
  overview: { totalUsers: number; newUsersThisMonth: number; activeUsers30d: number }
  subscriptions: {
    countsByPlan: Record<string, number>
    countsByStatus: Record<string, number>
    activePaidSubscriptions: number
    canceledSubscriptions: number
    pastDueSubscriptions: number
    mrrUsd: number
  }
  portfolioUsage: {
    totalProperties: number
    ownersWithProperties: number
    avgPropertiesPerOwner: number
    medianPropertiesPerOwner: number
    avgPropertiesPerRegisteredUser: number
    distribution: { onePropertyCount: number; twoToFourCount: number; fiveToNineCount: number; tenToTwentyCount: number; twentyOnePlusCount: number }
  }
  featureAdoption: {
    investmentToolsUsers: number
    investmentAnalysesCount: number
    documentIntelligenceUsers: number
    documentAnalysesCount: number
    tenantConnectOwnerCount: number
    tenantConnectActiveRelationships: number
  }
  aiUsage: {
    analysesThisMonth: number
    inputTokensThisMonth: number
    outputTokensThisMonth: number
    activeAiUsersThisMonth: number
    estimatedCostThisMonthUsd: number | null
    daily: { date: string; model: string; analysesCount: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number | null }[]
  }
}

const PLAN_LABEL: Record<string, string> = {
  free: 'Free',
  investor: 'Investor',
  portfolio: 'Portfolio',
  portfolio_pro: 'Portfolio Pro',
  owner: 'Internal Owner',
}

function formatNumber(n: number) {
  return n.toLocaleString('en-US')
}
function formatUsd(n: number | null) {
  if (n === null) return 'unknown'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n < 10 ? 4 : 2 })
}
function formatPct(part: number, total: number) {
  if (total <= 0) return '0%'
  return `${Math.round((part / total) * 100)}%`
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="barRow">
      <span className="barLabel">{label}</span>
      <span className="barTrack">
        <span className="barFill" style={{ width: `${pct}%` }} />
      </span>
      <span className="barValue">{formatNumber(value)}</span>
    </div>
  )
}

export default function AdminAnalyticsPage() {
  const { user, ready } = useAuthUser()
  const [data, setData] = useState<AdminAnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    if (!ready) return
    if (!supabase || !user) {
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setForbidden(false)
      const { data: sessionData } = await supabase!.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        if (!cancelled) {
          setError('Please sign in again.')
          setLoading(false)
        }
        return
      }
      const res = await fetch('/api/admin/analytics', { headers: { Authorization: `Bearer ${token}` } })
      if (cancelled) return
      if (res.status === 403) {
        setForbidden(true)
        setLoading(false)
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Something went wrong loading admin analytics.')
        setLoading(false)
        return
      }
      const body = (await res.json()) as AdminAnalyticsResponse
      setData(body)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [ready, user?.id])

  if (!ready || loading) {
    return (
      <div className="shell">
        <header className="topbar">
          <Link href="/" className="brandButton"><Wordmark /></Link>
        </header>
        <p className="muted" style={{ marginTop: 40 }}>Loading…</p>
      </div>
    )
  }

  if (!isSupabaseConfigured || !user) {
    return (
      <div className="shell">
        <header className="topbar">
          <Link href="/" className="brandButton"><Wordmark /></Link>
        </header>
        <div className="adminNotice" style={{ marginTop: 40 }}>Please sign in to continue.</div>
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="shell">
        <header className="topbar">
          <Link href="/" className="brandButton"><Wordmark /></Link>
        </header>
        <div className="adminNotice" style={{ marginTop: 40 }}>
          <strong>Access restricted.</strong> This page is limited to authorized PropRoster admins.
        </div>
        <Link href="/" className="secondary">Back to PropRoster</Link>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="shell">
        <header className="topbar">
          <Link href="/" className="brandButton"><Wordmark /></Link>
        </header>
        <div className="adminNotice" style={{ marginTop: 40 }}>{error || 'No data available.'}</div>
      </div>
    )
  }

  const { overview, subscriptions, portfolioUsage, featureAdoption, aiUsage } = data
  const planCounts = subscriptions.countsByPlan
  const maxPlanCount = Math.max(1, ...Object.values(planCounts))
  const dist = portfolioUsage.distribution
  const maxBucket = Math.max(1, dist.onePropertyCount, dist.twoToFourCount, dist.fiveToNineCount, dist.tenToTwentyCount, dist.twentyOnePlusCount)
  const dailyByDate = aiUsage.daily.reduce<Record<string, { count: number; cost: number | null }>>((acc, row) => {
    const existing = acc[row.date] || { count: 0, cost: 0 }
    existing.count += row.analysesCount
    existing.cost = row.estimatedCostUsd === null || existing.cost === null ? null : existing.cost + row.estimatedCostUsd
    acc[row.date] = existing
    return acc
  }, {})
  const dailyDates = Object.keys(dailyByDate).sort().slice(-14)
  const maxDailyAnalyses = Math.max(1, ...dailyDates.map((d) => dailyByDate[d].count))

  return (
    <div className="shell workspaceShell">
      <header className="topbar">
        <Link href="/" className="brandButton"><Wordmark /></Link>
        <nav style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 13 }}>Admin analytics</span>
          <Link href="/" className="secondary">Back to PropRoster</Link>
        </nav>
      </header>

      <div className="intro">
        <p className="eyebrow">INTERNAL — PROPROSTER STAFF ONLY</p>
        <h1 style={{ fontSize: 30 }}>Admin Analytics</h1>
        <p>
          Aggregate, platform-level metrics only. Customer portfolio contents (property addresses, documents,
          tenants, leases, mortgages, insurance, financials, and messages) are private by default and are never
          exposed here — see every number below is a count, sum, or average, never an individual record.
        </p>
      </div>

      <div className="adminNav">
        <a href="#overview">Overview</a>
        <a href="#subscriptions">Subscriptions</a>
        <a href="#usage">Usage</a>
        <a href="#ai-usage">AI Usage</a>
        <a href="#feature-adoption">Feature Adoption</a>
      </div>

      <section className="adminSection" id="overview">
        <h2>Overview</h2>
        <p className="muted">User growth and platform activity.</p>
        <div className="stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat"><span>Total registered users</span><strong>{formatNumber(overview.totalUsers)}</strong></div>
          <div className="stat"><span>New users this month</span><strong>{formatNumber(overview.newUsersThisMonth)}</strong></div>
          <div className="stat"><span>Active users (last 30 days)</span><strong>{formatNumber(overview.activeUsers30d)}</strong></div>
        </div>
      </section>

      <section className="adminSection" id="subscriptions">
        <h2>Subscriptions</h2>
        <p className="muted">Plan mix, MRR, and churn indicators.</p>
        <div className="adminGrid" style={{ marginBottom: 20 }}>
          <div className="stat"><span>MRR (estimate)</span><strong>{formatUsd(subscriptions.mrrUsd)}</strong></div>
          <div className="stat"><span>Active paid subscriptions</span><strong>{formatNumber(subscriptions.activePaidSubscriptions)}</strong></div>
          <div className="stat"><span>Past due</span><strong>{formatNumber(subscriptions.pastDueSubscriptions)}</strong></div>
          <div className="stat"><span>Canceled</span><strong>{formatNumber(subscriptions.canceledSubscriptions)}</strong></div>
        </div>
        <p className="muted" style={{ marginBottom: 6, fontSize: 13, fontWeight: 650 }}>Plan distribution (all statuses)</p>
        {Object.entries(planCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([plan, count]) => (
            <Bar key={plan} label={PLAN_LABEL[plan] || plan} value={count} max={maxPlanCount} />
          ))}
      </section>

      <section className="adminSection" id="usage">
        <h2>Portfolio Usage</h2>
        <p className="muted">Aggregate property counts only — never which user owns which property, never an address.</p>
        <div className="adminGrid" style={{ marginBottom: 20 }}>
          <div className="stat"><span>Total properties stored</span><strong>{formatNumber(portfolioUsage.totalProperties)}</strong></div>
          <div className="stat"><span>Avg properties / registered user</span><strong>{portfolioUsage.avgPropertiesPerRegisteredUser.toFixed(2)}</strong></div>
          <div className="stat"><span>Avg properties / owner (with ≥1)</span><strong>{portfolioUsage.avgPropertiesPerOwner.toFixed(2)}</strong></div>
          <div className="stat"><span>Median properties / owner (with ≥1)</span><strong>{portfolioUsage.medianPropertiesPerOwner}</strong></div>
        </div>
        <p className="muted" style={{ marginBottom: 6, fontSize: 13, fontWeight: 650 }}>Properties-per-account distribution</p>
        <Bar label="1 property" value={dist.onePropertyCount} max={maxBucket} />
        <Bar label="2–4 properties" value={dist.twoToFourCount} max={maxBucket} />
        <Bar label="5–9 properties" value={dist.fiveToNineCount} max={maxBucket} />
        <Bar label="10–20 properties" value={dist.tenToTwentyCount} max={maxBucket} />
        <Bar label="21+ properties" value={dist.twentyOnePlusCount} max={maxBucket} />
      </section>

      <section className="adminSection" id="ai-usage">
        <h2>AI Usage</h2>
        <p className="muted">
          Aggregate AI Document Intelligence usage and estimated Anthropic spend — never the uploaded document or
          extracted content.
        </p>
        <div className="adminGrid" style={{ marginBottom: 20 }}>
          <div className="stat"><span>Analyses this month</span><strong>{formatNumber(aiUsage.analysesThisMonth)}</strong></div>
          <div className="stat"><span>Input tokens this month</span><strong>{formatNumber(aiUsage.inputTokensThisMonth)}</strong></div>
          <div className="stat"><span>Output tokens this month</span><strong>{formatNumber(aiUsage.outputTokensThisMonth)}</strong></div>
          <div className="stat"><span>Est. cost this month</span><strong>{formatUsd(aiUsage.estimatedCostThisMonthUsd)}</strong></div>
          <div className="stat">
            <span>Avg analyses / active AI user</span>
            <strong>{aiUsage.activeAiUsersThisMonth > 0 ? (aiUsage.analysesThisMonth / aiUsage.activeAiUsersThisMonth).toFixed(1) : '0'}</strong>
          </div>
        </div>
        {dailyDates.length > 0 && (
          <>
            <p className="muted" style={{ marginBottom: 6, fontSize: 13, fontWeight: 650 }}>Analyses / day (last {dailyDates.length} days with usage)</p>
            {dailyDates.map((d) => (
              <Bar key={d} label={d} value={dailyByDate[d].count} max={maxDailyAnalyses} />
            ))}
          </>
        )}
        {dailyDates.length === 0 && <p className="muted">No AI usage recorded yet.</p>}
      </section>

      <section className="adminSection" id="feature-adoption">
        <h2>Feature Adoption</h2>
        <p className="muted">Aggregate counts of accounts and saved records — never their contents.</p>
        <table className="adminTable">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Accounts using it</th>
              <th>Saved / total records</th>
              <th>Adoption</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Investment Tools</td>
              <td>{formatNumber(featureAdoption.investmentToolsUsers)}</td>
              <td>{formatNumber(featureAdoption.investmentAnalysesCount)} saved analyses</td>
              <td>{formatPct(featureAdoption.investmentToolsUsers, overview.totalUsers)}</td>
            </tr>
            <tr>
              <td>AI Document Intelligence</td>
              <td>{formatNumber(featureAdoption.documentIntelligenceUsers)}</td>
              <td>{formatNumber(featureAdoption.documentAnalysesCount)} analyses run</td>
              <td>{formatPct(featureAdoption.documentIntelligenceUsers, overview.totalUsers)}</td>
            </tr>
            <tr>
              <td>Tenant Connect</td>
              <td>{formatNumber(featureAdoption.tenantConnectOwnerCount)} owners</td>
              <td>{formatNumber(featureAdoption.tenantConnectActiveRelationships)} active relationships</td>
              <td>{formatPct(featureAdoption.tenantConnectOwnerCount, overview.totalUsers)}</td>
            </tr>
            <tr>
              <td className="muted">Property Watch</td>
              <td className="muted" colSpan={3}>Not built yet</td>
            </tr>
            <tr>
              <td className="muted">Home Purchase Calculator</td>
              <td className="muted" colSpan={3}>Not built yet</td>
            </tr>
            <tr>
              <td className="muted">Property Value &amp; Comps</td>
              <td className="muted" colSpan={3}>Not built yet</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  )
}
