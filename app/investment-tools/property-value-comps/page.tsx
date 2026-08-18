'use client'

// Investment Tools 2.0 (Part 7/9/10): Property Value & Comps.
//
// Every number on this page comes from GET .../api/valuation, which
// itself only ever returns what a configured PropertyValuationProvider
// reports (lib/valuation/provider.ts) — never anything invented by
// Claude/Anthropic or any other LLM (Part 8's CRITICAL requirement). If
// no provider is configured, this page shows exactly "Property valuation
// data is not configured yet." and nothing else pretends to be a value.

import { useState } from 'react'
import Link from 'next/link'
import { AddressAutocomplete } from '../../../components/AddressAutocomplete'
import { PricingNavLink } from '../../../components/PricingNavLink'
import { Wordmark } from '../../../components/Wordmark'
import { AuthHeader } from '../../../components/AuthHeader'
import { useAuthUser } from '../../../lib/useAuthUser'
import { manualAddress, type NormalizedAddress } from '../../../lib/address/types'
import { buildComparableSummary } from '../../../lib/valuation/comparable-summary'
import type { PropertyValuationResult } from '../../../lib/valuation/types'

const money = (n: number | null | undefined) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(Number.isFinite(n as number) ? Number(n) : 0)

function formatSaleDate(iso: string): string {
  if (!iso) return 'Date unavailable'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `Sold ${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
}

type ViewState = 'idle' | 'loading' | 'not-configured' | 'error' | 'result'

export default function PropertyValueCompsPage() {
  const { user } = useAuthUser()
  const [addressText, setAddressText] = useState('')
  const [normalized, setNormalized] = useState<NormalizedAddress | null>(null)
  const [state, setState] = useState<ViewState>('idle')
  const [result, setResult] = useState<PropertyValuationResult | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  async function estimateValue() {
    const trimmed = addressText.trim()
    if (!trimmed) return
    setState('loading')
    setErrorMessage('')
    try {
      const resp = await fetch('/api/valuation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: normalized || manualAddress(trimmed) }),
      })
      const body = (await resp.json().catch(() => ({}))) as { configured?: boolean; result?: PropertyValuationResult | null; error?: string }
      if (!body.configured) {
        setState('not-configured')
        return
      }
      if (!resp.ok || !body.result) {
        setErrorMessage(body.error || 'Something went wrong estimating this property’s value.')
        setState('error')
        return
      }
      setResult(body.result)
      setState('result')
    } catch {
      setErrorMessage('Something went wrong estimating this property’s value.')
      setState('error')
    }
  }

  const comparableSummary = result ? buildComparableSummary(result) : null

  return (
    <main className="shell investmentShell">
      {/* Core Experience Bundle, item 1: authenticated users get the same
          global header as the rest of the app; the "← Investment Tools"
          contextual link moves into the page content below instead of
          living in the header. Signed-out visitors keep the existing
          public topbar unchanged. */}
      {user ? (
        <AuthHeader />
      ) : (
        <header className="topbar">
          <Link href="/investment-tools" className="brandButton"><span className="brand"><Wordmark /></span><span className="tagline">Investment Tools</span></Link>
          <div className="accountActions">
            <PricingNavLink />
            <Link href="/investment-tools" className="secondary">← Investment Tools</Link>
          </div>
        </header>
      )}
      {user && <Link className="breadcrumbBack" href="/investment-tools">← Investment Tools</Link>}

      <section className="intro evaluatorIntro">
        <p className="eyebrow">PROPERTY VALUE &amp; COMPS</p>
        <h1>What&apos;s this property likely worth?</h1>
        <p>Enter an address to see an estimated market value and comparable recent sales — a simple, explainable estimate, not an appraisal.</p>
      </section>

      <section className="compsSearchCard">
        <div className="evalGrid" style={{ gridTemplateColumns: '1fr auto' }}>
          <label className="evalField">
            <span>Address</span>
            <div className="evalInputWrap">
              <AddressAutocomplete
                value={addressText}
                onTextChange={(v) => { setAddressText(v); setNormalized(null) }}
                onSelect={(addr) => { setNormalized(addr); setAddressText(addr.formattedAddress) }}
                placeholder="123 Example Street, Example City, FL 12345"
              />
            </div>
          </label>
          <button className="primary compsEstimateButton" disabled={!addressText.trim() || state === 'loading'} onClick={() => void estimateValue()}>
            {state === 'loading' ? 'Estimating…' : 'Estimate Value'}
          </button>
        </div>
      </section>

      {state === 'not-configured' && (
        <div className="emptyState compsEmptyState">
          <strong>Property valuation data is not configured yet.</strong>
          <span>PropRoster doesn&apos;t have a connected property-data provider (RentCast/ATTOM) configured in this environment yet — see the setup docs to add one.</span>
        </div>
      )}

      {state === 'error' && <div className="globalError">{errorMessage}<button onClick={() => setState('idle')}>×</button></div>}

      {state === 'result' && result && (
        <div className="compsResults">
          <section className="compsValueCard">
            <p className="eyebrow">ESTIMATED MARKET VALUE</p>
            <div className="homePurchaseHero">{money(result.estimatedValue)}</div>
            <p className="compsRange">Likely range: {money(result.lowEstimate)} – {money(result.highEstimate)}</p>
            {result.confidence && <p className="compsConfidence">Confidence: {result.confidence}</p>}

            {result.propertyFacts && (
              <div className="compsFactsGrid">
                {result.propertyFacts.beds !== null && <div><span>Beds</span><strong>{result.propertyFacts.beds}</strong></div>}
                {result.propertyFacts.baths !== null && <div><span>Baths</span><strong>{result.propertyFacts.baths}</strong></div>}
                {result.propertyFacts.squareFeet !== null && <div><span>Sq ft</span><strong>{result.propertyFacts.squareFeet.toLocaleString()}</strong></div>}
                {result.propertyFacts.yearBuilt !== null && <div><span>Year built</span><strong>{result.propertyFacts.yearBuilt}</strong></div>}
              </div>
            )}
          </section>

          <section className="evaluatorSection">
            <div className="evaluatorSectionHead"><h2>Comparable Sales</h2><p>{result.comparables.length ? `${result.comparables.length} nearby comparable sale${result.comparables.length === 1 ? '' : 's'}.` : 'No comparable sales were available for this address.'}</p></div>
            {result.comparables.length > 0 && (
              <div className="compsList">
                {result.comparables.map((comp, i) => (
                  <article className="compRow" key={`${comp.address}-${i}`}>
                    <div className="compMain">
                      <h3>{comp.address}</h3>
                      <p>{comp.distanceMiles !== null ? `${comp.distanceMiles.toFixed(1)} mi away` : 'Distance unavailable'} · {formatSaleDate(comp.saleDate)}</p>
                    </div>
                    <div className="compFacts">
                      {comp.beds !== null && <span>{comp.beds} bd</span>}
                      {comp.baths !== null && <span>{comp.baths} ba</span>}
                      {comp.squareFeet !== null && <span>{comp.squareFeet.toLocaleString()} sqft</span>}
                      {comp.pricePerSqft !== null && <span>{money(comp.pricePerSqft)}/sqft</span>}
                    </div>
                    <div className="compPrice">{money(comp.salePrice)}</div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {comparableSummary && (
            <section className="evaluatorSection">
              <div className="evaluatorSectionHead"><h2>Why This Estimate?</h2></div>
              <p className="compsSummaryText">{comparableSummary}</p>
            </section>
          )}

          <p className="calcDisclaimer compsDisclaimer">
            Automated estimate only. Not an appraisal. Actual market value may differ. Property condition and local market conditions may not be fully reflected in this estimate.
          </p>
          <p className="compsProviderNote">Estimate provided by {result.providerMetadata.provider === 'rentcast' ? 'RentCast' : result.providerMetadata.provider === 'attom' ? 'ATTOM' : result.providerMetadata.provider}.</p>
        </div>
      )}
    </main>
  )
}
