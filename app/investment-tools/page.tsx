'use client'

// Investment Tools 2.0 (Part 4): the hub now shows three distinct tools
// instead of one. Saved analyses (Rental Property Analyzer only — the
// other two tools don't persist anything yet) still list below, unchanged
// in behavior from Milestone 7.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'
import { PricingNavLink } from '../../components/PricingNavLink'
import { Wordmark } from '../../components/Wordmark'
import { AuthHeader } from '../../components/AuthHeader'

type SavedAnalysis = {
  id: string
  name: string
  address: string | null
  status: string
  property_id: string | null
  updated_at: string
  results: { monthlyCashFlow?: number; capRatePercent?: number | null } | null
}

const statusTone: Record<string, string> = {
  Analyzing: 'pillNeutral',
  Considering: 'pillNeutral',
  'Offer Made': 'pillWarn',
  'Under Contract': 'pillWarn',
  Purchased: 'pillGood',
  Passed: 'pillMuted',
}

const money = (n: number | undefined | null) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(Number.isFinite(n) ? Number(n) : 0)

export default function InvestmentToolsHub() {
  const { user, ready } = useAuthUser()
  const [analyses, setAnalyses] = useState<SavedAnalysis[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase || !user) { setAnalyses([]); return }
    setLoading(true)
    setError('')
    supabase.from('investment_analyses').select('id,name,address,status,property_id,updated_at,results').order('updated_at', { ascending: false })
      .then(({ data, error: loadError }) => {
        if (loadError) setError(loadError.message)
        else setAnalyses((data || []) as SavedAnalysis[])
        setLoading(false)
      })
  }, [user?.id])

  async function removeAnalysis(id: string) {
    if (!supabase) return
    if (!window.confirm('Delete this saved analysis? This cannot be undone.')) return
    const { error: deleteError } = await supabase.from('investment_analyses').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else setAnalyses((rows) => rows.filter((row) => row.id !== id))
  }

  return (
    <main className="shell investmentShell">
      {/* Core Experience Bundle, item 1: authenticated users get the same
          global header as the rest of the app; signed-out visitors keep
          the existing public topbar (Pricing + back link) unchanged — this
          page is reachable without signing in, and must stay that way. */}
      {ready && user ? (
        <AuthHeader />
      ) : (
        <header className="topbar">
          <Link href="/" className="brandButton"><span className="brand"><Wordmark /></span><span className="tagline">Your real estate portfolio, all in one place.</span></Link>
          <div className="accountActions"><PricingNavLink /><Link href="/" className="secondary">← All Properties</Link></div>
        </header>
      )}

      <section className="intro">
        <p className="eyebrow">INVESTMENT TOOLS</p>
        <h1>Three tools. Three clear jobs.</h1>
        <p>Evaluate a rental deal, understand what a home will really cost you each month, or see what a property is likely worth — each with standard real-estate math, explained as you go.</p>
      </section>

      <section className="toolGrid">
        <Link href="/investment-tools/rental-analyzer" className="toolCard">
          <span className="toolIcon">%</span>
          <div>
            <h3>Rental Property Analyzer</h3>
            <p>Evaluate a rental property&apos;s income, expenses and returns — cash flow, cap rate, cash-on-cash return, DSCR and a 5/10-year projection.</p>
          </div>
          <span className="toolCta">Open calculator →</span>
        </Link>

        <Link href="/investment-tools/home-purchase" className="toolCard">
          <span className="toolIcon">⌂</span>
          <div>
            <h3>Home Purchase Calculator</h3>
            <p>Understand the true monthly cost and cash needed to purchase a home — principal &amp; interest, taxes, insurance, PMI, HOA and closing costs.</p>
          </div>
          <span className="toolCta">Open calculator →</span>
        </Link>

        <Link href="/investment-tools/property-value-comps" className="toolCard">
          <span className="toolIcon">$</span>
          <div>
            <h3>Property Value &amp; Comps</h3>
            <p>Estimate market value and review comparable sales for any address — a simple, explainable estimate, never an appraisal.</p>
          </div>
          <span className="toolCta">Open calculator →</span>
        </Link>
      </section>

      <section className="savedAnalysesSection">
        <div className="sectionHead">
          <div><h2>Saved analyses</h2><p>{!isSupabaseConfigured ? 'Connect Supabase to save analyses.' : !user ? 'Sign in to save and revisit analyses.' : loading ? 'Loading…' : `${analyses.length} saved analys${analyses.length === 1 ? 'is' : 'es'}`}</p></div>
        </div>
        {error && <div className="globalError">{error}<button onClick={() => setError('')}>×</button></div>}
        {!user ? (
          <div className="emptyState">
            <strong>No saved analyses yet</strong>
            <span>Sign in from the PropRoster home page, then save an analysis from the Rental Property Analyzer to see it here.</span>
          </div>
        ) : analyses.length ? (
          <div className="analysisList">
            {analyses.map((row) => (
              <article className="analysisRow" key={row.id}>
                <div className="analysisMain">
                  <span className={`statusPill ${statusTone[row.status] || 'pillNeutral'}`}>{row.status}</span>
                  <h3>{row.name || row.address || 'Untitled analysis'}</h3>
                  {row.address && <p>{row.address}</p>}
                </div>
                <div className="analysisMetrics">
                  <div><span>Cash flow</span><strong>{money(row.results?.monthlyCashFlow)}/mo</strong></div>
                  <div><span>Cap rate</span><strong>{row.results?.capRatePercent != null ? `${row.results.capRatePercent.toFixed(1)}%` : 'N/A'}</strong></div>
                  {row.property_id && <div><span>Linked</span><strong>Property saved</strong></div>}
                </div>
                <div className="analysisActions">
                  <Link className="secondary" href={`/investment-tools/rental-analyzer?analysisId=${row.id}`}>Open</Link>
                  <button className="dangerLink" onClick={() => void removeAnalysis(row.id)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="emptyState">
            <strong>No saved analyses yet</strong>
            <span>Open the Rental Property Analyzer and save your first analysis.</span>
          </div>
        )}
      </section>
    </main>
  )
}
