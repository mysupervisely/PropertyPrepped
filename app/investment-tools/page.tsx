'use client'

// Milestone 7: Investment Tools hub. Reachable even when the user isn't
// inside a specific property. Lists available tools (just the Property
// Evaluator for now) and, for signed-in users, their saved analyses.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'

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
      <header className="topbar">
        <Link href="/" className="brandButton"><span className="brand">PropPrepped</span><span className="tagline">Your properties. Organized.</span></Link>
        <div className="accountActions">{ready && user && <span>{user.email}</span>}<Link href="/" className="secondary">← All Properties</Link></div>
      </header>

      <section className="intro">
        <p className="eyebrow">INVESTMENT TOOLS</p>
        <h1>Evaluate before you buy. Analyze what you already own.</h1>
        <p>Run the numbers on a potential deal, or reassess a property already in your portfolio — with standard real-estate investment math, explained as you go.</p>
      </section>

      <section className="toolGrid">
        <Link href="/investment-tools/property-evaluator" className="toolCard">
          <span className="toolIcon">%</span>
          <div>
            <h3>Property Evaluator</h3>
            <p>Enter a price, financing terms, income and expenses to see cash flow, cap rate, cash-on-cash return, DSCR and a 5/10-year projection — instantly, as you type.</p>
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
            <span>Sign in from the PropPrepped home page, then save an analysis from the Property Evaluator to see it here.</span>
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
                  <Link className="secondary" href={`/investment-tools/property-evaluator?analysisId=${row.id}`}>Open</Link>
                  <button className="dangerLink" onClick={() => void removeAnalysis(row.id)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="emptyState">
            <strong>No saved analyses yet</strong>
            <span>Open the Property Evaluator and save your first analysis.</span>
          </div>
        )}
      </section>
    </main>
  )
}
