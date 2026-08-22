'use client'

// PropRoster — Tax Center (V1 portfolio view + V2 manual entry integration).
//
// An organization and reporting tool for rental-property tax
// information, NOT tax preparation software: it never calculates final
// tax liability, never files anything, and never gives individualized
// tax advice. Every number below is the EFFECTIVE Tax Center amount —
// tracked from financial_transactions (the same ledger app/page.tsx's
// Financials tab reads/writes), replaced by a landlord's manual annual
// entry (property_tax_records, new in V2 — see
// supabase/milestone-22-tax-center-v2.sql) wherever one was entered.
// lib/tax-center/manual-entry.ts's computeCategoryValue is the ONE place
// this override rule lives — manual REPLACES tracked, it is never added
// to it, so nothing here can double-count. See
// lib/tax-center/categories.ts for the (purely informational, never
// authoritative) Schedule E reference mapping.
//
// Scope: only properties with property_type === 'Rental Property' are
// included — Schedule E is specifically for rental real estate, and a
// Primary Residence/Vacation Home/Commercial/Land property raises tax
// questions (personal-use days, business-use %, etc.) this tool isn't
// built to reason about.
//
// Manual entry itself lives on each property's own "Tax & Financials"
// tab (app/page.tsx, components/property-profile/PropertyTaxPanel.tsx) —
// this page is a read-only aggregation/reporting view over whatever was
// entered there, exactly like Tax Center V1 was a read-only view over
// the Financials ledger. Links below jump straight to that tab.
//
// Auth/page-shell pattern mirrors app/documents/page.tsx exactly
// (useAuthUser + AuthHeader + the same authShell/authCard sign-in gate,
// manual window.location.search reads, own RLS-scoped data fetch).
//
// Security: every query below goes through the SAME RLS-scoped client
// every other page uses — no service-role key. property_tax_records'
// own owner-scoped RLS policies (supabase/milestone-22-tax-center-v2.sql)
// are the only thing standing between one user's manual tax entries and
// another's; this page adds no new backend surface of its own.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'
import { AuthHeader } from '../../components/AuthHeader'
import { Wordmark } from '../../components/Wordmark'
import { SCHEDULE_E_REFERENCE, SCHEDULE_E_CAPEX_NOTE, SCHEDULE_E_MORTGAGE_NOTE } from '../../lib/tax-center/categories'
import { computePortfolioTaxSummary, computePropertyTaxSummary, filterTransactionsForYear, getAvailableTaxYears } from '../../lib/tax-center/aggregate'
import { countUnassignedTaxDocuments } from '../../lib/tax-center/readiness'
import { buildTaxCenterCsv } from '../../lib/tax-center/csv-export'
import { categoriesInGroup, type CategoryValue } from '../../lib/tax-center/manual-entry'
import type { MaintenanceRecordInput, PropertyInput, PropertyTaxSummary, ReadinessStatus, TaxRecordInput, TransactionInput } from '../../lib/tax-center/types'

const EXPENSE_CATEGORIES = categoriesInGroup('operatingExpense')

function money(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0)
}

function readinessPillClass(status: ReadinessStatus): string {
  if (status === 'Ready') return 'pillGood'
  if (status === 'Needs Review') return 'pillWarn'
  return 'pillBad'
}

function sourcePillClass(source: CategoryValue['source']): string {
  if (source === 'manual') return 'pillNeutral'
  if (source === 'tracked') return 'pillGood'
  return 'pillMuted'
}

function sourceLabel(source: CategoryValue['source']): string {
  if (source === 'manual') return 'Manual'
  if (source === 'tracked') return 'Tracked'
  return 'None'
}

export default function TaxCenterPage() {
  const { user, ready } = useAuthUser()

  if (!ready) return <main className="authShell"><div className="loadingState">Loading Tax Center…</div></main>

  if (!user) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Sign in required</h1>
          <p className="authIntro">Sign in to view your Tax Center.</p>
          <Link className="primary authSubmit" href="/">Go to sign in</Link>
        </section>
      </main>
    )
  }

  return <TaxCenterWorkspace />
}

function TaxCenterWorkspace() {
  const [properties, setProperties] = useState<PropertyInput[]>([])
  const [transactions, setTransactions] = useState<TransactionInput[]>([])
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecordInput[]>([])
  const [taxRecords, setTaxRecords] = useState<(TaxRecordInput & { property_id: string; tax_year: number })[]>([])
  const [taxDocumentCount, setTaxDocumentCount] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [year, setYear] = useState<string>(String(new Date().getFullYear()))
  const [expandedPropertyId, setExpandedPropertyId] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    async function load() {
      const [propsRes, txRes, maintRes, docsRes, taxRes] = await Promise.all([
        supabase!.from('properties').select('id,address,city,property_type').order('address'),
        supabase!.from('financial_transactions').select('id,property_id,transaction_date,transaction_type,category,amount,document_id'),
        supabase!.from('maintenance_records').select('id,property_id,service_date,category,financial_transaction_id'),
        supabase!.from('property_documents').select('id,property_id,category'),
        supabase!.from('property_tax_records').select('*'),
      ])
      if (cancelled) return
      const firstError = propsRes.error || txRes.error || maintRes.error || docsRes.error || taxRes.error
      if (firstError) setError(firstError.message)
      setProperties(((propsRes.data as PropertyInput[]) || []).filter((p) => p.property_type === 'Rental Property'))
      setTransactions((txRes.data as TransactionInput[]) || [])
      setMaintenanceRecords((maintRes.data as MaintenanceRecordInput[]) || [])
      setTaxDocumentCount(countUnassignedTaxDocuments((docsRes.data as { id: string; property_id: string | null; category: string }[]) || []))
      setTaxRecords((taxRes.data as (TaxRecordInput & { property_id: string; tax_year: number })[]) || [])
      setLoaded(true)
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const availableYears = useMemo(() => getAvailableTaxYears(transactions), [transactions])

  // Default intelligently to the current year, but if the current year
  // has no data at all and a prior year does, land on the most recent
  // year with real data instead of an empty screen — still a real,
  // deliberate choice the user sees and can change, never a silent one.
  useEffect(() => {
    if (!loaded) return
    const currentYear = String(new Date().getFullYear())
    const hasCurrentYearData = transactions.some((t) => t.transaction_date.startsWith(currentYear))
    if (!hasCurrentYearData && availableYears.length > 1 && availableYears.includes(currentYear)) {
      const mostRecentWithData = availableYears.find((y) => y !== currentYear)
      if (mostRecentWithData) setYear(mostRecentWithData)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  const yearTransactions = useMemo(() => filterTransactionsForYear(transactions, year), [transactions, year])
  const yearMaintenance = useMemo(() => maintenanceRecords.filter((m) => m.service_date.startsWith(year)), [maintenanceRecords, year])
  const yearTaxRecordByProperty = useMemo(() => {
    const map = new Map<string, TaxRecordInput>()
    for (const r of taxRecords) {
      if (String(r.tax_year) === year) map.set(r.property_id, r)
    }
    return map
  }, [taxRecords, year])

  const propertySummaries: PropertyTaxSummary[] = useMemo(
    () => properties.map((p) => computePropertyTaxSummary(p, yearTransactions, yearMaintenance, yearTaxRecordByProperty.get(p.id) || null)),
    [properties, yearTransactions, yearMaintenance, yearTaxRecordByProperty],
  )
  const portfolio = useMemo(() => computePortfolioTaxSummary(year, propertySummaries), [year, propertySummaries])

  function exportCsv() {
    const csv = buildTaxCenterCsv(year, portfolio, propertySummaries)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `proproster-tax-center-${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const generatedOn = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <main className="shell taxCenterShell">
      <AuthHeader />

      <section className="intro noPrint">
        <p className="eyebrow">TAX CENTER</p>
        <h1>Organize your rental income and expenses for tax time.</h1>
        <p>A reporting and organization tool — PropRoster does not calculate your final tax liability, file returns, or give individualized tax advice. Review everything here with your tax professional.</p>
      </section>

      {error && <p className="errorMessage noPrint">{error}</p>}

      <div className="taxYearBar noPrint">
        <label>
          Tax year
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <div className="taxYearActions">
          <button type="button" className="secondary" onClick={exportCsv}>Export CSV</button>
          <button type="button" className="secondary" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
      </div>

      {!loaded ? (
        <div className="loadingState noPrint">Loading your tax information…</div>
      ) : properties.length === 0 ? (
        <div className="emptyState noPrint">
          <strong>No rental properties yet.</strong>
          <span>Tax Center covers properties marked as Rental Property in your portfolio.</span>
        </div>
      ) : (
        <>
          <section className="noPrint">
            <div className="sectionHead"><div><h2>Portfolio summary — {year}</h2><p>Tracked from your Financials ledger, replaced by a manual entry wherever one exists on a property&apos;s Tax &amp; Financials tab — never both added together.</p></div></div>
            <div className="financialStats">
              <div className="financialStat"><span>Gross rental income</span><strong>{money(portfolio.grossIncome)}</strong></div>
              <div className="financialStat"><span>Operating expenses</span><strong>{money(portfolio.operatingExpenses)}</strong></div>
              <div className="financialStat"><span>Net rental income</span><strong>{money(portfolio.netOperatingResult)}</strong><small>Before tax-specific adjustments</small></div>
              <div className="financialStat"><span>Properties included</span><strong>{portfolio.propertiesIncluded}</strong></div>
            </div>
            <div className="taxNonOperatingNotes">
              <p><strong>Capital improvements:</strong> {money(portfolio.capitalImprovements)} — {SCHEDULE_E_CAPEX_NOTE}</p>
              <p><strong>Mortgage interest (manual entry only):</strong> {money(portfolio.mortgageInterest)} — entered on each property&apos;s Tax &amp; Financials tab from a lender statement or Form 1098. Never calculated by PropRoster.</p>
              <p><strong>Mortgage payments logged:</strong> {money(portfolio.mortgagePayments)} — {SCHEDULE_E_MORTGAGE_NOTE}</p>
            </div>
          </section>

          <section className="noPrint">
            <div className="sectionHead"><div><h2>Rental properties — {year}</h2><p>Every rental property at a glance. Select a property to review or edit its Tax &amp; Financials tab.</p></div></div>
            <div className="taxCategoryTableWrap">
              <table className="ledger taxPropertyTable">
                <thead><tr><th>Property</th><th>Rental income</th><th>Operating expenses</th><th>Mortgage interest</th><th>Capital improvements</th><th>Net result</th><th>Status</th></tr></thead>
                <tbody>
                  {propertySummaries.map((p) => (
                    <tr key={p.propertyId}>
                      <td><Link href={`/?openProperty=${p.propertyId}&openTab=Tax`}>{p.address}</Link></td>
                      <td className="moneyCell">{money(p.grossIncome)}</td>
                      <td className="moneyCell">{money(p.operatingExpenses)}</td>
                      <td className="moneyCell">{p.mortgageInterest > 0 ? money(p.mortgageInterest) : '—'}</td>
                      <td className="moneyCell">{p.capitalImprovements > 0 ? money(p.capitalImprovements) : '—'}</td>
                      <td className="moneyCell">{money(p.netOperatingResult)}</td>
                      <td><span className={`statusPill ${readinessPillClass(p.readiness.status)}`}>{p.readiness.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="noPrint">
            <div className="sectionHead"><div><h2>Expense totals by category</h2><p>Ordinary operating expenses only — capital improvements, mortgage interest, and mortgage payments are shown separately above.</p></div></div>
            <div className="taxCategoryTableWrap">
              <table className="ledger taxCategoryTable">
                <thead><tr><th>Category</th><th>Amount</th><th>Schedule E reference (informational only)</th></tr></thead>
                <tbody>
                  {EXPENSE_CATEGORIES.map((category) => (
                    <tr key={category.key}>
                      <td>{category.label}</td>
                      <td className="moneyCell">{money(portfolio.expenseByCategory[category.key] || 0)}</td>
                      <td className="muted">{category.trackedCategory ? SCHEDULE_E_REFERENCE[category.trackedCategory as keyof typeof SCHEDULE_E_REFERENCE] : 'Schedule E, Line 19 (Other) — no dedicated line'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="noPrint">
            <div className="sectionHead"><div><h2>Tax Readiness</h2><p>Not a warning system — just what&apos;s worth a second look before sending records to a CPA.</p></div></div>
            {portfolio.propertiesNeedingAttention.length === 0 && taxDocumentCount === 0 ? (
              <div className="emptyState"><strong>Everything looks ready for {year}.</strong><span>No obvious gaps found in your rental property records.</span></div>
            ) : (
              <div className="dashboardItemList">
                {taxDocumentCount > 0 && (
                  <Link href="/documents?filter=Unassigned" className="dashboardItemRow">
                    <span className="dashboardItemBody"><strong>{taxDocumentCount} tax document{taxDocumentCount === 1 ? '' : 's'} not yet assigned to a property</strong><span className="muted">Review in Documents</span></span>
                  </Link>
                )}
                {portfolio.propertiesNeedingAttention.map((p) => (
                  <div key={p.propertyId} className="dashboardItemRow dashboardItemRowStatic">
                    <span className="dashboardItemBody"><strong>{p.address}</strong><span className="muted">See property detail below</span></span>
                    <span className={`statusPill ${readinessPillClass(p.status)}`}>{p.status}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="noPrint">
            <div className="sectionHead"><div><h2>Property detail</h2><p>Expand a property to see its full category-by-category breakdown, or jump into Tax &amp; Financials to enter manual amounts.</p></div></div>
            <div className="taxPropertyList">
              {propertySummaries.map((p) => {
                const expanded = expandedPropertyId === p.propertyId
                return (
                  <div className="recordCard" key={p.propertyId}>
                    <button type="button" className="taxPropertyToggle" onClick={() => setExpandedPropertyId(expanded ? null : p.propertyId)}>
                      <div className="recordTop">
                        <div><p className="muted">{p.city}</p><h3>{p.address}</h3></div>
                        <span className={`statusPill ${readinessPillClass(p.readiness.status)}`}>{p.readiness.status}</span>
                      </div>
                    </button>
                    <div className="recordMetrics">
                      <div><span>Gross income</span><strong>{money(p.grossIncome)}</strong></div>
                      <div><span>Operating expenses</span><strong>{money(p.operatingExpenses)}</strong></div>
                      <div><span>Net operating result</span><strong>{money(p.netOperatingResult)}</strong></div>
                    </div>
                    {expanded && (
                      <>
                        <div className="recordRows">
                          {EXPENSE_CATEGORIES.filter((c) => p.categoryBreakdown[c.key].effective > 0).map((c) => {
                            const value = p.categoryBreakdown[c.key]
                            return (
                              <div key={c.key}>
                                <span>{c.label} <span className={`statusPill taxSourcePill ${sourcePillClass(value.source)}`}>{sourceLabel(value.source)}</span></span>
                                <strong>{money(value.effective)}</strong>
                              </div>
                            )
                          })}
                          {p.mortgageInterest > 0 && <div><span>Mortgage interest (manual entry)</span><strong>{money(p.mortgageInterest)}</strong></div>}
                          {p.capitalImprovements > 0 && <div><span>Capital improvements (not immediately deductible)</span><strong>{money(p.capitalImprovements)}</strong></div>}
                          {p.mortgagePayments > 0 && <div><span>Mortgage payments (reference only)</span><strong>{money(p.mortgagePayments)}</strong></div>}
                        </div>
                        {p.notes && <p className="muted taxPropertyNotes">Note: {p.notes}</p>}
                        {p.readiness.items.length > 0 && (
                          <ul className="taxReadinessItems">
                            {p.readiness.items.map((item, i) => <li key={i}>{item}</li>)}
                          </ul>
                        )}
                        <div className="maintenanceActions">
                          <Link href={`/?openProperty=${p.propertyId}&openTab=Tax`}>{p.hasManualRecord ? 'Edit manual tax entries' : 'Add manual tax entries'}</Link>
                          <Link href={`/?openProperty=${p.propertyId}&openTab=Rent&openRentSubTab=Ledger`}>Review in Ledger</Link>
                          <Link href="/documents">Review documents</Link>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {/* Print / Save as PDF summary — hidden on screen (.taxPrintSummary
              is display:none by default), shown only under @media print
              via app/globals.css. window.print() above is the entire "PDF
              export" mechanism: no PDF library, no server-side rendering —
              every modern browser's print dialog (including iOS Safari's
              share sheet) offers Save as PDF directly from this. */}
          <div className="taxPrintSummary">
            <div className="taxPrintBrand"><span className="brand"><Wordmark /></span></div>
            <p>Tax Year {year} — Portfolio Summary</p>
            <p className="muted">Generated {generatedOn}</p>
            <table>
              <tbody>
                <tr><td>Properties included</td><td>{portfolio.propertiesIncluded}</td></tr>
                <tr><td>Gross rental income</td><td>{money(portfolio.grossIncome)}</td></tr>
                <tr><td>Operating expenses</td><td>{money(portfolio.operatingExpenses)}</td></tr>
                <tr><td>Net rental income (before tax-specific adjustments)</td><td>{money(portfolio.netOperatingResult)}</td></tr>
                <tr><td>Capital improvements (not immediately deductible)</td><td>{money(portfolio.capitalImprovements)}</td></tr>
                <tr><td>Mortgage interest (manual entry only, never estimated)</td><td>{money(portfolio.mortgageInterest)}</td></tr>
                <tr><td>Mortgage payments logged (reference only)</td><td>{money(portfolio.mortgagePayments)}</td></tr>
              </tbody>
            </table>

            <h4>Portfolio expense totals by category</h4>
            <table>
              <thead><tr><th>Category</th><th>Amount</th></tr></thead>
              <tbody>
                {EXPENSE_CATEGORIES.map((c) => (
                  <tr key={c.key}><td>{c.label}</td><td>{money(portfolio.expenseByCategory[c.key] || 0)}</td></tr>
                ))}
              </tbody>
            </table>

            <h4>Property-by-property breakdown</h4>
            {propertySummaries.map((p) => (
              <div key={p.propertyId} className="taxPrintProperty">
                <h5>{p.address}, {p.city}</h5>
                <table>
                  <tbody>
                    <tr><td>Gross income</td><td>{money(p.grossIncome)}</td></tr>
                    <tr><td>Operating expenses</td><td>{money(p.operatingExpenses)}</td></tr>
                    <tr><td>Net operating result</td><td>{money(p.netOperatingResult)}</td></tr>
                    {p.mortgageInterest > 0 && <tr><td>Mortgage interest (manual entry only)</td><td>{money(p.mortgageInterest)}</td></tr>}
                    {p.capitalImprovements > 0 && <tr><td>Capital improvements (not immediately deductible)</td><td>{money(p.capitalImprovements)}</td></tr>}
                    {p.mortgagePayments > 0 && <tr><td>Mortgage payments (reference only, not deductible interest)</td><td>{money(p.mortgagePayments)}</td></tr>}
                  </tbody>
                </table>
                <table>
                  <thead><tr><th>Expense category</th><th>Amount</th><th>Source</th></tr></thead>
                  <tbody>
                    {EXPENSE_CATEGORIES.filter((c) => p.categoryBreakdown[c.key].effective > 0).map((c) => {
                      const value = p.categoryBreakdown[c.key]
                      return <tr key={c.key}><td>{c.label}</td><td>{money(value.effective)}</td><td>{sourceLabel(value.source)}</td></tr>
                    })}
                  </tbody>
                </table>
                {p.notes && <p className="muted">Note: {p.notes}</p>}
                {p.readiness.items.length > 0 && (
                  <p className="muted">Readiness notes: {p.readiness.items.join(' ')}</p>
                )}
                {p.transactionCount === 0 && !p.hasManualRecord && <p className="muted">No records found for this property in {year}.</p>}
              </div>
            ))}

            <p className="taxPrintDisclaimer">PropRoster organizes information entered into your account and does not provide tax, legal, or accounting advice. Review this information with a qualified tax professional.</p>
          </div>
        </>
      )}
    </main>
  )
}
