'use client'

// Investment Tools 2.0 (Part 7/9/10): Property Value & Comps.
//
// Every number on this page comes from GET .../api/valuation, which
// itself only ever returns what a configured PropertyValuationProvider
// reports (lib/valuation/provider.ts) — never anything invented by
// Claude/Anthropic or any other LLM (Part 8's CRITICAL requirement). If
// no provider is configured, this page shows exactly "Property valuation
// data is not configured yet." and nothing else pretends to be a value.
//
// UI Redesign pass: everything below the search row was rebuilt for a
// clearer, more premium presentation — but the data flow is unchanged.
// This page still makes exactly the one POST /api/valuation request per
// "Estimate Value" click; sorting and "View details" are pure client-side
// operations over the comparables already in memory (Part 9/10 — no
// additional RentCast request is triggered by sorting, expanding a card,
// or anything else on this page).

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AddressAutocomplete } from '../../../components/AddressAutocomplete'
import { PropertyPhoto } from '../../../components/PropertyPhoto'
import { PricingNavLink } from '../../../components/PricingNavLink'
import { Wordmark } from '../../../components/Wordmark'
import { useAuthUser } from '../../../lib/useAuthUser'
import { manualAddress, type NormalizedAddress } from '../../../lib/address/types'
import { buildComparableSummary } from '../../../lib/valuation/comparable-summary'
import { computeCompDeltas } from '../../../lib/valuation/comp-delta'
import { formatMatchPercent, matchQualityLabel } from '../../../lib/valuation/match-quality'
import { COMPARABLE_SORT_OPTIONS, sortComparables, type ComparableSortKey } from '../../../lib/valuation/sort-comparables'
import type { ComparableSale, PropertyFacts, PropertyValuationResult } from '../../../lib/valuation/types'

const money = (n: number | null | undefined) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(Number.isFinite(n as number) ? Number(n) : 0)

function formatSaleDate(iso: string): string {
  if (!iso) return 'Date unavailable'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `Sold ${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
}

function formatLongDate(iso: string): string {
  if (!iso) return 'Not available'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** A comp is "identified" by its address + array position — RentCast doesn't return a stable id, and addresses can repeat in edge cases (e.g. multiple sales at the same address), so position is part of the key. */
function compKey(comp: ComparableSale, index: number): string {
  return `${comp.address}-${index}`
}

type ViewState = 'idle' | 'loading' | 'not-configured' | 'error' | 'result'

export default function PropertyValueCompsPage() {
  const { user } = useAuthUser()
  const [addressText, setAddressText] = useState('')
  const [normalized, setNormalized] = useState<NormalizedAddress | null>(null)
  const [state, setState] = useState<ViewState>('idle')
  const [result, setResult] = useState<PropertyValuationResult | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [sortBy, setSortBy] = useState<ComparableSortKey>('distance')
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  async function estimateValue() {
    const trimmed = addressText.trim()
    if (!trimmed) return
    setState('loading')
    setErrorMessage('')
    setExpandedKeys(new Set())
    setSortBy('distance')
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

  function toggleExpanded(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const comparableSummary = result ? buildComparableSummary(result) : null
  // Sorting is purely client-side over the comparables already returned by
  // the one /api/valuation call above — never triggers another request.
  const sortedComparables = useMemo(
    () => (result ? sortComparables(result.comparables, sortBy) : []),
    [result, sortBy],
  )

  return (
    <main className="shell investmentShell">
      <header className="topbar">
        <Link href="/investment-tools" className="brandButton"><span className="brand"><Wordmark /></span><span className="tagline">Investment Tools</span></Link>
        <div className="accountActions">
          {user && <span>{user.email}</span>}
          <PricingNavLink />
          <Link href="/investment-tools" className="secondary">← Investment Tools</Link>
        </div>
      </header>

      <section className="intro evaluatorIntro">
        <p className="eyebrow">PROPERTY VALUE &amp; COMPS</p>
        <h1>What&apos;s this property likely worth?</h1>
        <p>Enter an address to see an estimated market value and comparable recent sales — a simple, explainable estimate, not an appraisal.</p>
      </section>

      <section className="compsSearchCard">
        <div className="compsSearchRow">
          <div className="compsAddressField">
            <label htmlFor="comps-address">Address</label>
            <div className="compsAddressInputWrap">
              <svg className="compsAddressIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 2C7.86 2 4.5 5.36 4.5 9.5c0 5.4 6.3 11.4 7.05 12.1a.6.6 0 0 0 .9 0c.75-.7 7.05-6.7 7.05-12.1C19.5 5.36 16.14 2 12 2Zm0 10.25a2.75 2.75 0 1 1 0-5.5 2.75 2.75 0 0 1 0 5.5Z" fill="currentColor" />
              </svg>
              <AddressAutocomplete
                id="comps-address"
                className="compsAddressInput"
                value={addressText}
                onTextChange={(v) => { setAddressText(v); setNormalized(null) }}
                onSelect={(addr) => { setNormalized(addr); setAddressText(addr.formattedAddress) }}
                placeholder="17 Amaryllis Lane, Lumberton, NJ 08048"
                aria-label="Property address"
              />
            </div>
          </div>
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
          <EstimatedValueCard result={result} />

          <section className="evaluatorSection compsCompsSection">
            <div className="evaluatorSectionHead compsCompsHead">
              <div>
                <h2>Comparable Sales</h2>
                <p>{result.comparables.length ? `${result.comparables.length} nearby comparable sale${result.comparables.length === 1 ? '' : 's'}.` : 'No comparable sales were available for this address.'}</p>
              </div>
              {result.comparables.length > 1 && (
                <label className="compsSortField">
                  <span>Sort by</span>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value as ComparableSortKey)}>
                    {COMPARABLE_SORT_OPTIONS.map((opt) => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
                  </select>
                </label>
              )}
            </div>

            {sortedComparables.length > 0 && (
              <div className="compGrid">
                {sortedComparables.map((comp, i) => {
                  const key = compKey(comp, i)
                  return (
                    <CompCard
                      key={key}
                      comp={comp}
                      subjectFacts={result.propertyFacts}
                      subjectEstimatedValue={result.estimatedValue}
                      expanded={expandedKeys.has(key)}
                      onToggleExpanded={() => toggleExpanded(key)}
                    />
                  )
                })}
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
            Estimates are based on automated valuation models and available comparable property data. This is not an appraisal and actual market value may differ. Property features shown depend on available provider/public-record data and may not reflect recent renovations.
          </p>
          <p className="compsProviderNote">Estimate provided by {result.providerMetadata.provider === 'rentcast' ? 'RentCast' : result.providerMetadata.provider === 'attom' ? 'ATTOM' : result.providerMetadata.provider}.</p>
        </div>
      )}
    </main>
  )
}

function EstimatedValueCard({ result }: { result: PropertyValuationResult }) {
  const facts = result.propertyFacts
  const factRows: { label: string; value: string }[] = []
  if (facts) {
    if (facts.beds !== null) factRows.push({ label: 'Beds', value: String(facts.beds) })
    if (facts.baths !== null) factRows.push({ label: 'Baths', value: String(facts.baths) })
    if (facts.squareFeet !== null) factRows.push({ label: 'Square Feet', value: facts.squareFeet.toLocaleString() })
    if (facts.yearBuilt !== null) factRows.push({ label: 'Year Built', value: String(facts.yearBuilt) })
    if (facts.lotSizeSqft !== null) factRows.push({ label: 'Lot Size', value: `${facts.lotSizeSqft.toLocaleString()} sqft` })
    if (facts.propertyType !== null) factRows.push({ label: 'Property Type', value: facts.propertyType })
  }

  return (
    <section className="compsValueCard">
      <p className="eyebrow">ESTIMATED MARKET VALUE</p>
      <div className="compsValueHero">{money(result.estimatedValue)}</div>
      <div className="compsValueMeta">
        <span className="compsRange">Likely range: {money(result.lowEstimate)} – {money(result.highEstimate)}</span>
        {result.confidence && <span className="compsConfidencePill">Confidence: {result.confidence}</span>}
      </div>

      {factRows.length > 0 && (
        <div className="compsFactsGrid">
          {factRows.map((f) => (
            <div key={f.label}><span>{f.label}</span><strong>{f.value}</strong></div>
          ))}
        </div>
      )}
    </section>
  )
}

function CompCard({
  comp, subjectFacts, subjectEstimatedValue, expanded, onToggleExpanded,
}: {
  comp: ComparableSale
  subjectFacts: PropertyFacts | null
  subjectEstimatedValue: number
  expanded: boolean
  onToggleExpanded: () => void
}) {
  const deltas = computeCompDeltas(subjectFacts, subjectEstimatedValue, comp)
  const matchLabel = matchQualityLabel(comp.matchScore)
  const matchPercent = formatMatchPercent(comp.matchScore)

  // Fields available today (from the single AVM response) that go in the
  // expanded "View details" panel but not the compact default card — see
  // lib/valuation/providers/rentcast.ts's header comment for exactly why
  // pool/roof/heating/cooling/solar/HOA/tax-assessment/garage are never
  // populated here (they'd require an additional, per-property RentCast
  // request that Part 10 explicitly says to stop short of adding).
  const detailRows: { label: string; value: string }[] = []
  if (comp.propertyType) detailRows.push({ label: 'Property type', value: comp.propertyType })
  if (comp.yearBuilt !== null) detailRows.push({ label: 'Year built', value: String(comp.yearBuilt) })
  if (comp.lotSizeSqft !== null) detailRows.push({ label: 'Lot size', value: `${comp.lotSizeSqft.toLocaleString()} sqft` })
  if (comp.listingStatus) detailRows.push({ label: 'Listing status', value: comp.listingStatus })
  if (comp.daysOnMarket !== null) detailRows.push({ label: 'Days on market', value: String(comp.daysOnMarket) })
  if (comp.saleDate) detailRows.push({ label: 'Sale date', value: formatLongDate(comp.saleDate) })
  if (matchPercent) detailRows.push({ label: 'Similarity / match', value: matchPercent })

  return (
    <article className={`compCard${expanded ? ' compCardExpanded' : ''}`}>
      <div className="compPhotoArea">
        <PropertyPhoto imageUrl={comp.imageUrl} alt={comp.address} />
        {matchLabel && <span className="compMatchBadge">{matchLabel}</span>}
      </div>

      <div className="compCardBody">
        <h3>{comp.address}</h3>
        <p className="compCardMeta">
          {comp.distanceMiles !== null ? `${comp.distanceMiles.toFixed(1)} mi away` : 'Distance unavailable'} · {formatSaleDate(comp.saleDate)}
        </p>

        <div className="compPriceRow">
          <span className="compPrice">{money(comp.salePrice)}</span>
          {comp.pricePerSqft !== null && <span className="compPricePerSqft">{money(comp.pricePerSqft)}/sqft</span>}
        </div>

        <div className="compFacts">
          {comp.beds !== null && <span>{comp.beds} bd</span>}
          {comp.baths !== null && <span>{comp.baths} ba</span>}
          {comp.squareFeet !== null && <span>{comp.squareFeet.toLocaleString()} sqft</span>}
          {comp.yearBuilt !== null && <span>Built {comp.yearBuilt}</span>}
          {comp.lotSizeSqft !== null && <span>{comp.lotSizeSqft.toLocaleString()} sqft lot</span>}
        </div>

        {deltas.length > 0 && (
          <div className="compDeltas">
            {deltas.map((d) => <span key={d.key} className="compDeltaChip">{d.label}</span>)}
          </div>
        )}

        <button type="button" className="compViewDetails" onClick={onToggleExpanded} aria-expanded={expanded}>
          {expanded ? 'Hide details' : 'View details'}
        </button>

        {expanded && (
          <div className="compDetailPanel">
            {detailRows.length > 0 ? (
              <div className="compDetailRows">
                {detailRows.map((row) => (
                  <div key={row.label}><span>{row.label}</span><strong>{row.value}</strong></div>
                ))}
              </div>
            ) : (
              <p className="compDetailEmpty">No additional details are available for this comparable.</p>
            )}
            <p className="compDetailNote">
              Additional details such as pool, roof type, heating/cooling, solar, and HOA are not currently supplied by our data provider for individual comparables — their absence here doesn&apos;t mean the property doesn&apos;t have them.
            </p>
          </div>
        )}
      </div>
    </article>
  )
}
