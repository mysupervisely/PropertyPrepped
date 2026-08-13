'use client'

// Milestone 7: Property Evaluator.
//
// Calculator logic is intentionally decoupled from persistence: every input
// on this page works with no Supabase session at all, computing results
// purely from lib/investment-calculations.ts. Saving an analysis, loading a
// saved analysis, and prefilling from an existing property are the only
// parts that touch Supabase — which is what lets this route be exposed
// publicly (unauthenticated) in a later milestone without a rewrite.

import { ReactNode, Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { isSupabaseConfigured, supabase } from '../../../lib/supabase'
import { useAuthUser } from '../../../lib/useAuthUser'
import { useSubscription } from '../../../lib/useSubscription'
import { canCreateProperty } from '../../../lib/billing/entitlements'
import { UpgradePrompt } from '../../../components/UpgradePrompt'
import {
  buildAnalysis,
  buildDealIndicators,
  num,
  resolveMonthlyRent,
  type AnalysisInput,
  type AnalysisResult,
} from '../../../lib/investment-calculations'

type Mode = 'percent' | 'amount'
type UnitRentDraft = { label: string; monthlyRent: string }

type FormState = {
  name: string
  address: string
  propertyType: string
  units: string
  purchasePrice: string
  marketValue: string
  downPaymentMode: Mode
  downPaymentPercent: string
  downPaymentAmount: string
  interestRate: string
  loanTermYears: string
  closingCosts: string
  loanPoints: string
  useUnitRents: boolean
  monthlyRent: string
  unitRents: UnitRentDraft[]
  otherIncome: string
  propertyTaxesAnnual: string
  insuranceAnnual: string
  hoaMonthly: string
  managementMode: Mode
  managementPercent: string
  managementAmount: string
  maintenanceMode: Mode
  maintenancePercent: string
  maintenanceAmount: string
  vacancyPercent: string
  utilitiesMonthly: string
  otherExpensesMonthly: string
  appreciationRate: string
  rentGrowthRate: string
  expenseGrowthRate: string
  status: string
}

const propertyTypeOptions = ['Rental Property', 'Primary Residence', 'Vacation Home', 'Commercial', 'Land', 'Other']
const statusOptions = ['Analyzing', 'Considering', 'Offer Made', 'Under Contract', 'Purchased', 'Passed']

function defaultForm(): FormState {
  return {
    name: '', address: '', propertyType: 'Rental Property', units: '1',
    purchasePrice: '', marketValue: '',
    downPaymentMode: 'percent', downPaymentPercent: '20', downPaymentAmount: '',
    interestRate: '7', loanTermYears: '30', closingCosts: '', loanPoints: '',
    useUnitRents: false, monthlyRent: '', unitRents: [{ label: 'Unit 1', monthlyRent: '' }], otherIncome: '',
    propertyTaxesAnnual: '', insuranceAnnual: '', hoaMonthly: '',
    managementMode: 'percent', managementPercent: '0', managementAmount: '',
    maintenanceMode: 'percent', maintenancePercent: '5', maintenanceAmount: '',
    vacancyPercent: '5', utilitiesMonthly: '', otherExpensesMonthly: '',
    appreciationRate: '2', rentGrowthRate: '2', expenseGrowthRate: '3',
    status: 'Analyzing',
  }
}

function toAnalysisInput(form: FormState): AnalysisInput {
  return {
    purchasePrice: num(form.purchasePrice),
    marketValue: num(form.marketValue),
    units: num(form.units) || 1,
    downPaymentMode: form.downPaymentMode,
    downPaymentPercent: num(form.downPaymentPercent),
    downPaymentAmount: num(form.downPaymentAmount),
    interestRatePercent: num(form.interestRate),
    loanTermYears: num(form.loanTermYears) || 30,
    closingCosts: num(form.closingCosts),
    loanPointsPercent: num(form.loanPoints),
    useUnitRents: form.useUnitRents,
    monthlyRent: num(form.monthlyRent),
    unitRents: form.unitRents.map((u) => ({ label: u.label, monthlyRent: num(u.monthlyRent) })),
    otherMonthlyIncome: num(form.otherIncome),
    propertyTaxesAnnual: num(form.propertyTaxesAnnual),
    insuranceAnnual: num(form.insuranceAnnual),
    hoaMonthly: num(form.hoaMonthly),
    managementMode: form.managementMode,
    managementPercent: num(form.managementPercent),
    managementAmountMonthly: num(form.managementAmount),
    maintenanceMode: form.maintenanceMode,
    maintenancePercent: num(form.maintenancePercent),
    maintenanceAmountMonthly: num(form.maintenanceAmount),
    vacancyPercent: num(form.vacancyPercent),
    utilitiesMonthly: num(form.utilitiesMonthly),
    otherExpensesMonthly: num(form.otherExpensesMonthly),
    appreciationRatePercent: num(form.appreciationRate),
    rentGrowthRatePercent: num(form.rentGrowthRate),
    expenseGrowthRatePercent: num(form.expenseGrowthRate),
  }
}

const money = (n: number | null | undefined) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(Number.isFinite(n as number) ? Number(n) : 0)

const pct = (n: number | null | undefined, digits = 1) => (n === null || n === undefined || !Number.isFinite(n)) ? 'N/A' : `${n.toFixed(digits)}%`
const ratioText = (n: number | null | undefined, digits = 2) => (n === null || n === undefined || !Number.isFinite(n)) ? 'N/A' : `${n.toFixed(digits)}x`

const ratingClass: Record<string, string> = { Strong: 'ratingStrong', Moderate: 'ratingModerate', Weak: 'ratingWeak', 'N/A': 'ratingNA' }

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function NumberField({ label, value, onChange, placeholder, suffix, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; suffix?: string; hint?: string }) {
  return (
    <label className="evalField">
      <span>{label}{hint && <small>{hint}</small>}</span>
      <div className="evalInputWrap">
        <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        {suffix && <span className="evalSuffix">{suffix}</span>}
      </div>
    </label>
  )
}

function ModeField({ label, mode, onModeChange, percentValue, onPercentChange, amountValue, onAmountChange, hint }: { label: string; mode: Mode; onModeChange: (m: Mode) => void; percentValue: string; onPercentChange: (v: string) => void; amountValue: string; onAmountChange: (v: string) => void; hint?: string }) {
  return (
    <label className="evalField">
      <span>{label}{hint && <small>{hint}</small>}</span>
      <div className="modeField">
        <div className="modeToggle">
          <button type="button" className={mode === 'percent' ? 'active' : ''} onClick={() => onModeChange('percent')}>%</button>
          <button type="button" className={mode === 'amount' ? 'active' : ''} onClick={() => onModeChange('amount')}>$</button>
        </div>
        {mode === 'percent'
          ? <div className="evalInputWrap"><input inputMode="decimal" value={percentValue} onChange={(e) => onPercentChange(e.target.value)} placeholder="0" /><span className="evalSuffix">%</span></div>
          : <div className="evalInputWrap"><input inputMode="decimal" value={amountValue} onChange={(e) => onAmountChange(e.target.value)} placeholder="0" /><span className="evalSuffix">/mo</span></div>}
      </div>
    </label>
  )
}

function MetricTile({ label, value, hint, emphasis, tone }: { label: string; value: string; hint?: string; emphasis?: boolean; tone?: 'good' | 'bad' }) {
  return (
    <div className={`metricTile ${emphasis ? 'metricEmphasis' : ''} ${tone ? `metricTone-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  )
}

function ProjectionChart({ base, result }: { base: { propertyValue: number; equity: number }; result: AnalysisResult }) {
  const points = [
    { year: 0, propertyValue: base.propertyValue, equity: base.equity },
    ...result.projections.map((row) => ({ year: row.year, propertyValue: row.propertyValue, equity: row.equity })),
  ]
  const width = 640
  const height = 220
  const padding = 36
  const maxYear = Math.max(...points.map((p) => p.year), 1)
  const maxValue = Math.max(...points.map((p) => p.propertyValue), 1)
  const x = (year: number) => padding + (year / maxYear) * (width - padding * 2)
  const y = (value: number) => height - padding - (Math.max(0, value) / maxValue) * (height - padding * 2)
  const valuePath = points.map((p) => `${x(p.year)},${y(p.propertyValue)}`).join(' ')
  const equityPath = points.map((p) => `${x(p.year)},${y(p.equity)}`).join(' ')
  const equityArea = `${x(points[0].year)},${height - padding} ${equityPath} ${x(points[points.length - 1].year)},${height - padding}`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="projectionChart" role="img" aria-label="Projected property value and equity over time">
      <polygon points={equityArea} className="chartEquityArea" />
      <polyline points={valuePath} className="chartValueLine" />
      <polyline points={equityPath} className="chartEquityLine" />
      {points.map((p) => (
        <g key={p.year}>
          <circle cx={x(p.year)} cy={y(p.propertyValue)} r={4} className="chartDotValue" />
          <circle cx={x(p.year)} cy={y(p.equity)} r={4} className="chartDotEquity" />
          <text x={x(p.year)} y={height - 10} textAnchor="middle" className="chartAxisLabel">{p.year === 0 ? 'Now' : `Yr ${p.year}`}</text>
        </g>
      ))}
    </svg>
  )
}

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="evaluatorSection">
      <div className="evaluatorSectionHead"><h2>{title}</h2>{description && <p>{description}</p>}</div>
      <div className="evalGrid">{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PropertyEvaluatorPage() {
  return (
    <Suspense fallback={<main className="shell investmentShell"><div className="loadingState">Loading Property Evaluator…</div></main>}>
      <PropertyEvaluator />
    </Suspense>
  )
}

function PropertyEvaluator() {
  const { user } = useAuthUser()
  const { plan } = useSubscription(user)
  const router = useRouter()
  const searchParams = useSearchParams()
  const propertyId = searchParams.get('propertyId')
  const analysisId = searchParams.get('analysisId')

  const [form, setForm] = useState<FormState>(defaultForm())
  const [savedId, setSavedId] = useState<string | null>(null)
  const [linkedPropertyId, setLinkedPropertyId] = useState<string | null>(null)
  const [contextNote, setContextNote] = useState('')
  const [loadingContext, setLoadingContext] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [error, setError] = useState('')
  const [showConvert, setShowConvert] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [propertyCount, setPropertyCount] = useState<number | null>(null)
  const [convertDraft, setConvertDraft] = useState({ address: '', city: '', createMortgage: true, markPurchased: false })

  // Section 6/8/16: the Property Evaluator itself is free on every plan —
  // this count is only used to gate the "Save as Property" conversion
  // step, the one place this page actually creates a properties row.
  useEffect(() => {
    if (!supabase || !user) { setPropertyCount(null); return }
    supabase.from('properties').select('id', { count: 'exact', head: true }).then(({ count }) => setPropertyCount(count ?? 0))
  }, [user?.id])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  // Keep per-unit rent rows in sync with the unit count while unit rents are enabled.
  useEffect(() => {
    if (!form.useUnitRents) return
    const target = Math.max(1, Math.round(num(form.units)) || 1)
    setForm((f) => {
      if (f.unitRents.length === target) return f
      const next = [...f.unitRents]
      while (next.length < target) next.push({ label: `Unit ${next.length + 1}`, monthlyRent: '' })
      while (next.length > target) next.pop()
      return { ...f, unitRents: next }
    })
  }, [form.useUnitRents, form.units])

  // Prefill from an existing property or reload a saved analysis.
  useEffect(() => {
    if (!supabase || !user) return
    if (analysisId) void loadFromAnalysis(analysisId)
    else if (propertyId) void loadFromProperty(propertyId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, analysisId, propertyId])

  async function loadFromAnalysis(id: string) {
    if (!supabase) return
    setLoadingContext(true)
    setError('')
    const { data, error: loadError } = await supabase.from('investment_analyses').select('*').eq('id', id).single()
    if (loadError || !data) {
      setError(loadError?.message || 'That saved analysis could not be found.')
      setLoadingContext(false)
      return
    }
    setSavedId(data.id)
    setLinkedPropertyId(data.property_id)
    const snapshot = (data.assumptions || {}) as Partial<FormState>
    setForm((f) => ({ ...f, ...snapshot, status: data.status || f.status }))
    setContextNote(`Loaded saved analysis "${data.name}".`)
    setLoadingContext(false)
  }

  async function loadFromProperty(id: string) {
    if (!supabase) return
    setLoadingContext(true)
    setError('')
    const [{ data: property }, { data: mortgageRows }, { data: leaseRows }, { data: insuranceRows }, { data: txRows }] = await Promise.all([
      supabase.from('properties').select('*').eq('id', id).single(),
      supabase.from('mortgages').select('*').eq('property_id', id).order('created_at', { ascending: false }).limit(1),
      supabase.from('leases').select('*').eq('property_id', id).order('created_at', { ascending: false }).limit(1),
      supabase.from('insurance_policies').select('*').eq('property_id', id).order('created_at', { ascending: false }).limit(1),
      supabase.from('financial_transactions').select('category,amount,transaction_type').eq('property_id', id).eq('transaction_type', 'Expense').gte('transaction_date', `${new Date().getFullYear()}-01-01`),
    ])
    if (!property) {
      setError('That property could not be found.')
      setLoadingContext(false)
      return
    }
    const mortgage = mortgageRows?.[0]
    const lease = leaseRows?.[0]
    const insurance = insuranceRows?.[0]
    const expenseTotals: Record<string, number> = {}
    ;(txRows || []).forEach((tx) => { expenseTotals[tx.category] = (expenseTotals[tx.category] || 0) + Number(tx.amount || 0) })
    const monthlyFrom = (category: string) => expenseTotals[category] ? String(Number((expenseTotals[category] / 12).toFixed(2))) : ''

    setForm((f) => ({
      ...f,
      name: property.address,
      address: `${property.address}, ${property.city}`,
      propertyType: property.property_type || f.propertyType,
      purchasePrice: property.purchase_price ? String(property.purchase_price) : f.purchasePrice,
      marketValue: property.estimated_value ? String(property.estimated_value) : f.marketValue,
      monthlyRent: String(lease?.monthly_rent || property.monthly_rent || f.monthlyRent),
      downPaymentMode: 'amount',
      downPaymentAmount: mortgage ? String(Math.max(0, Number(property.purchase_price || 0) - Number(mortgage.original_balance || 0))) : f.downPaymentAmount,
      interestRate: mortgage?.interest_rate ? String(mortgage.interest_rate) : f.interestRate,
      loanTermYears: mortgage?.loan_term_years ? String(mortgage.loan_term_years) : f.loanTermYears,
      insuranceAnnual: insurance?.annual_premium ? String(insurance.annual_premium) : (expenseTotals['Insurance'] ? String(expenseTotals['Insurance']) : f.insuranceAnnual),
      propertyTaxesAnnual: expenseTotals['Taxes'] ? String(expenseTotals['Taxes']) : f.propertyTaxesAnnual,
      hoaMonthly: monthlyFrom('HOA') || f.hoaMonthly,
      utilitiesMonthly: monthlyFrom('Utilities') || f.utilitiesMonthly,
      managementMode: expenseTotals['Management'] ? 'amount' : f.managementMode,
      managementAmount: monthlyFrom('Management') || f.managementAmount,
      maintenanceMode: expenseTotals['Maintenance'] ? 'amount' : f.maintenanceMode,
      maintenanceAmount: monthlyFrom('Maintenance') || f.maintenanceAmount,
    }))
    setLinkedPropertyId(id)
    setContextNote(`Prefilled from ${property.address}. This does not change the property's saved records unless you convert and confirm.`)
    setLoadingContext(false)
  }

  const input = useMemo(() => toAnalysisInput(form), [form])
  const result = useMemo(() => buildAnalysis(input), [input])
  const indicators = useMemo(() => buildDealIndicators(result), [result])
  const yearNow = { propertyValue: result.propertyValueForAnalysis, equity: result.equityAtPurchase }

  function buildSavePayload(rentTotal: number) {
    return {
      name: form.name.trim() || form.address.trim() || 'Untitled analysis',
      address: form.address.trim() || null,
      status: form.status,
      purchase_price: num(form.purchasePrice),
      market_value: num(form.marketValue) || num(form.purchasePrice),
      units: num(form.units) || 1,
      down_payment: result.downPaymentAmount,
      interest_rate: num(form.interestRate),
      loan_term_years: num(form.loanTermYears) || 30,
      closing_costs: num(form.closingCosts),
      monthly_rent: rentTotal,
      other_income: num(form.otherIncome),
      property_taxes: num(form.propertyTaxesAnnual),
      insurance: num(form.insuranceAnnual),
      hoa: num(form.hoaMonthly),
      management: form.managementMode === 'amount' ? num(form.managementAmount) : rentTotal * (num(form.managementPercent) / 100),
      maintenance: form.maintenanceMode === 'amount' ? num(form.maintenanceAmount) : rentTotal * (num(form.maintenancePercent) / 100),
      vacancy: result.vacancyLossMonthly,
      utilities: num(form.utilitiesMonthly),
      other_expenses: num(form.otherExpensesMonthly),
      appreciation_rate: num(form.appreciationRate),
      rent_growth_rate: num(form.rentGrowthRate),
      expense_growth_rate: num(form.expenseGrowthRate),
      assumptions: form,
      results: result,
    }
  }

  async function saveAnalysis() {
    if (!supabase || !user) return
    setSaving(true)
    setError('')
    setSaveMessage('')
    const rentTotal = resolveMonthlyRent(input)
    const payload = { ...buildSavePayload(rentTotal), owner_id: user.id, property_id: linkedPropertyId }
    if (savedId) {
      const { error: updateError } = await supabase.from('investment_analyses').update(payload).eq('id', savedId)
      if (updateError) setError(updateError.message)
      else setSaveMessage('Saved.')
    } else {
      const { data, error: insertError } = await supabase.from('investment_analyses').insert(payload).select('id').single()
      if (insertError) setError(insertError.message)
      else if (data) {
        setSavedId(data.id)
        setSaveMessage('Saved.')
        router.replace(`/investment-tools/property-evaluator?analysisId=${data.id}`)
      }
    }
    setSaving(false)
  }

  function openConvert() {
    // Section 8: same pre-flight check as the main workspace's Add
    // Property button — don't open a form that was always going to be
    // rejected. propertyCount === null means it hasn't loaded yet; fail
    // open here (let the form open) since convertToProperty()'s
    // PROPERTY_LIMIT_REACHED fallback below is the real backstop either way.
    if (propertyCount !== null && !canCreateProperty(plan, propertyCount)) {
      setShowUpgrade(true)
      return
    }
    const [addr, ...rest] = form.address.split(',')
    setConvertDraft({ address: (addr || form.address).trim(), city: rest.join(',').trim(), createMortgage: result.loanAmount > 0, markPurchased: false })
    setShowConvert(true)
  }

  async function convertToProperty() {
    if (!supabase || !user || !savedId) return
    if (!convertDraft.address.trim() || !convertDraft.city.trim()) return
    setSaving(true)
    setError('')
    const rentTotal = resolveMonthlyRent(input)
    const { data: newProperty, error: insertError } = await supabase.from('properties').insert({
      owner_id: user.id,
      address: convertDraft.address.trim(),
      city: convertDraft.city.trim(),
      property_type: form.propertyType,
      estimated_value: num(form.marketValue) || num(form.purchasePrice),
      mortgage_balance: result.loanAmount,
      monthly_rent: rentTotal,
      purchase_price: num(form.purchasePrice),
      monthly_expenses: result.monthlyOperatingExpenses,
    }).select('*').single()

    if (insertError || !newProperty) {
      // See app/page.tsx's addProperty() for why PROPERTY_LIMIT_REACHED
      // gets its own branch — this is the real security boundary (the
      // database trigger), not just the propertyCount check in openConvert().
      if (insertError?.message === 'PROPERTY_LIMIT_REACHED') {
        setShowConvert(false)
        setShowUpgrade(true)
      } else {
        setError(insertError?.message || 'Unable to create the property.')
      }
      setSaving(false)
      return
    }

    if (convertDraft.createMortgage && result.loanAmount > 0) {
      await supabase.from('mortgages').insert({
        owner_id: user.id,
        property_id: newProperty.id,
        lender: 'Not yet added',
        original_balance: result.loanAmount,
        current_balance: result.loanAmount,
        interest_rate: num(form.interestRate),
        monthly_payment: result.monthlyMortgagePayment,
        loan_term_years: num(form.loanTermYears) || 30,
      })
    }

    const nextStatus = convertDraft.markPurchased ? 'Purchased' : form.status
    const { error: linkError } = await supabase.from('investment_analyses').update({ property_id: newProperty.id, status: nextStatus }).eq('id', savedId)
    if (linkError) setError(linkError.message)

    setLinkedPropertyId(newProperty.id)
    if (convertDraft.markPurchased) set('status', 'Purchased')
    setShowConvert(false)
    setSaving(false)
    setSaveMessage(`Created "${newProperty.address}" — the analysis stays saved and is now linked to it.`)
  }

  const summaryTiles: { label: string; value: string; hint?: string }[] = [
    { label: 'Monthly Cash Flow', value: money(result.monthlyCashFlow) },
    { label: 'Cap Rate', value: pct(result.capRatePercent) },
    { label: 'Cash-on-Cash', value: pct(result.cashOnCashReturnPercent) },
    { label: 'DSCR', value: ratioText(result.dscr) },
  ]

  return (
    <main className="shell investmentShell">
      <header className="topbar">
        <Link href="/investment-tools" className="brandButton"><span className="brand">PropRoster</span><span className="tagline">Investment Tools</span></Link>
        <div className="accountActions">
          {user ? <span>{user.email}</span> : isSupabaseConfigured && <Link href="/" className="secondary">Sign in to save</Link>}
          <Link href="/investment-tools" className="secondary">← Investment Tools</Link>
        </div>
      </header>

      <section className="intro evaluatorIntro">
        <p className="eyebrow">PROPERTY EVALUATOR</p>
        <h1>Run the numbers before you commit.</h1>
        <p>Enter what you know — everything recalculates instantly. Nothing here is financial advice; it's a calculator built on standard real-estate investment formulas.</p>
        {contextNote && <div className="statusMessage successMessage">{contextNote}</div>}
        {loadingContext && <div className="statusMessage">Loading property details…</div>}
      </section>

      {error && <div className="globalError">{error}<button onClick={() => setError('')}>×</button></div>}
      {saveMessage && <div className="statusMessage successMessage">{saveMessage}</div>}

      <div className="evaluatorLayout">
        <aside className="evaluatorResults">
          <div className="resultsSummaryCard">
            <p className="eyebrow">LIVE RESULTS</p>
            <div className="summaryTileGrid">
              {summaryTiles.map((tile) => <div key={tile.label} className="summaryTile"><span>{tile.label}</span><strong className={tile.label === 'Monthly Cash Flow' ? (result.monthlyCashFlow >= 0 ? 'positiveValue' : 'negativeValue') : ''}>{tile.value}</strong></div>)}
            </div>
            <a href="#fullMetrics" className="summaryLink">See full breakdown ↓</a>
            <div className="saveActions">
              {user ? (
                <>
                  <button className="primary" disabled={saving} onClick={() => void saveAnalysis()}>{saving ? 'Saving…' : savedId ? 'Update Analysis' : 'Save Analysis'}</button>
                  <button className="secondary" disabled={!savedId} title={savedId ? undefined : 'Save this analysis first'} onClick={openConvert}>Save as Property</button>
                </>
              ) : (
                <Link href="/" className="secondary saveActionsLink">Sign in to save this analysis</Link>
              )}
              {linkedPropertyId && <p className="linkedNote">Linked to a saved property.</p>}
            </div>
          </div>
        </aside>

        <div className="evaluatorInputs">
          <Section title="Property" description="What you're evaluating.">
            <NumberField label="Analysis name" value={form.name} onChange={(v) => set('name', v)} placeholder="e.g. Maple Street Duplex" />
            <NumberField label="Address or property name" value={form.address} onChange={(v) => set('address', v)} placeholder="123 Example Street, Example City, FL" />
            <label className="evalField"><span>Property type</span><select value={form.propertyType} onChange={(e) => set('propertyType', e.target.value)}>{propertyTypeOptions.map((t) => <option key={t}>{t}</option>)}</select></label>
            <NumberField label="Number of units" value={form.units} onChange={(v) => set('units', v)} placeholder="1" />
            <NumberField label="Asking / purchase price" value={form.purchasePrice} onChange={(v) => set('purchasePrice', v)} placeholder="350000" suffix="$" />
            <NumberField label="Estimated current / after-repair value" value={form.marketValue} onChange={(v) => set('marketValue', v)} placeholder="Defaults to purchase price" suffix="$" hint="Used for cap rate and equity." />
          </Section>

          <Section title="Financing" description="Loan amount, down payment and estimated payment are calculated automatically below.">
            <label className="evalField">
              <span>Down payment</span>
              <div className="modeField">
                <div className="modeToggle">
                  <button type="button" className={form.downPaymentMode === 'percent' ? 'active' : ''} onClick={() => set('downPaymentMode', 'percent')}>%</button>
                  <button type="button" className={form.downPaymentMode === 'amount' ? 'active' : ''} onClick={() => set('downPaymentMode', 'amount')}>$</button>
                </div>
                {form.downPaymentMode === 'percent'
                  ? <div className="evalInputWrap"><input inputMode="decimal" value={form.downPaymentPercent} onChange={(e) => set('downPaymentPercent', e.target.value)} placeholder="20" /><span className="evalSuffix">%</span></div>
                  : <div className="evalInputWrap"><input inputMode="decimal" value={form.downPaymentAmount} onChange={(e) => set('downPaymentAmount', e.target.value)} placeholder="70000" /><span className="evalSuffix">$</span></div>}
              </div>
            </label>
            <NumberField label="Interest rate" value={form.interestRate} onChange={(v) => set('interestRate', v)} placeholder="7" suffix="%" />
            <NumberField label="Loan term" value={form.loanTermYears} onChange={(v) => set('loanTermYears', v)} placeholder="30" suffix="years" />
            <NumberField label="Closing costs" value={form.closingCosts} onChange={(v) => set('closingCosts', v)} placeholder="Optional" suffix="$" />
            <NumberField label="Loan fees / points" value={form.loanPoints} onChange={(v) => set('loanPoints', v)} placeholder="Optional" suffix="%" hint="% of the loan amount, one-time." />
            <div className="financingSummary">
              <div><span>Loan amount</span><strong>{money(result.loanAmount)}</strong></div>
              <div><span>Down payment</span><strong>{money(result.downPaymentAmount)}</strong></div>
              <div><span>Est. principal + interest</span><strong>{money(result.monthlyMortgagePayment)}/mo</strong></div>
            </div>
          </Section>

          <Section title="Income" description="Monthly figures.">
            <NumberField label="Monthly rent" value={form.monthlyRent} onChange={(v) => set('monthlyRent', v)} placeholder="2800" suffix="$/mo" hint={form.useUnitRents ? 'Using per-unit rents below instead.' : undefined} />
            <NumberField label="Other monthly income" value={form.otherIncome} onChange={(v) => set('otherIncome', v)} placeholder="Optional — laundry, parking, storage" suffix="$/mo" />
            {num(form.units) > 1 && (
              <label className="evalField fullField recurringCheck">
                <input type="checkbox" checked={form.useUnitRents} onChange={(e) => set('useUnitRents', e.target.checked)} />
                <span>Enter rent per unit instead of one total</span>
                <small>Useful for multi-unit properties with different rents.</small>
              </label>
            )}
            {form.useUnitRents && (
              <div className="fullField unitRentRows">
                {form.unitRents.map((unit, i) => (
                  <div className="unitRentRow" key={i}>
                    <input value={unit.label} onChange={(e) => { const next = [...form.unitRents]; next[i] = { ...next[i], label: e.target.value }; set('unitRents', next) }} placeholder={`Unit ${i + 1}`} />
                    <div className="evalInputWrap"><input inputMode="decimal" value={unit.monthlyRent} onChange={(e) => { const next = [...form.unitRents]; next[i] = { ...next[i], monthlyRent: e.target.value }; set('unitRents', next) }} placeholder="0" /><span className="evalSuffix">$/mo</span></div>
                  </div>
                ))}
                <div className="unitRentTotal"><span>Total monthly rent</span><strong>{money(resolveMonthlyRent(input))}</strong></div>
              </div>
            )}
          </Section>

          <Section title="Expenses" description="Fixed dollar amounts or percentages, whichever fits.">
            <NumberField label="Property taxes" value={form.propertyTaxesAnnual} onChange={(v) => set('propertyTaxesAnnual', v)} placeholder="Optional" suffix="$/yr" />
            <NumberField label="Insurance" value={form.insuranceAnnual} onChange={(v) => set('insuranceAnnual', v)} placeholder="Optional" suffix="$/yr" />
            <NumberField label="HOA" value={form.hoaMonthly} onChange={(v) => set('hoaMonthly', v)} placeholder="Optional" suffix="$/mo" />
            <NumberField label="Utilities paid by owner" value={form.utilitiesMonthly} onChange={(v) => set('utilitiesMonthly', v)} placeholder="Optional" suffix="$/mo" />
            <ModeField label="Property management" mode={form.managementMode} onModeChange={(m) => set('managementMode', m)} percentValue={form.managementPercent} onPercentChange={(v) => set('managementPercent', v)} amountValue={form.managementAmount} onAmountChange={(v) => set('managementAmount', v)} hint="% of monthly rent, or a flat $/mo." />
            <ModeField label="Maintenance reserve" mode={form.maintenanceMode} onModeChange={(m) => set('maintenanceMode', m)} percentValue={form.maintenancePercent} onPercentChange={(v) => set('maintenancePercent', v)} amountValue={form.maintenanceAmount} onAmountChange={(v) => set('maintenanceAmount', v)} hint="% of monthly rent, or a flat $/mo." />
            <NumberField label="Vacancy" value={form.vacancyPercent} onChange={(v) => set('vacancyPercent', v)} placeholder="5" suffix="% of rent" hint="Modeled as expected lost rent, not a separate expense you pay." />
            <NumberField label="Other expenses" value={form.otherExpensesMonthly} onChange={(v) => set('otherExpensesMonthly', v)} placeholder="Optional" suffix="$/mo" />
          </Section>

          <details className="evaluatorSection evalDetails">
            <summary><h2>Projection assumptions</h2><p>Optional — defaults are conservative. Year 1/5/10 estimates below use these.</p></summary>
            <div className="evalGrid">
              <NumberField label="Annual property appreciation" value={form.appreciationRate} onChange={(v) => set('appreciationRate', v)} suffix="%/yr" />
              <NumberField label="Annual rent growth" value={form.rentGrowthRate} onChange={(v) => set('rentGrowthRate', v)} suffix="%/yr" />
              <NumberField label="Annual expense growth" value={form.expenseGrowthRate} onChange={(v) => set('expenseGrowthRate', v)} suffix="%/yr" />
            </div>
          </details>

          {user && (
            <Section title="Deal tracking" description="Only visible to you — helps you keep track of where this deal stands.">
              <label className="evalField"><span>Status</span><select value={form.status} onChange={(e) => set('status', e.target.value)}>{statusOptions.map((s) => <option key={s}>{s}</option>)}</select></label>
            </Section>
          )}
        </div>
      </div>

      <section id="fullMetrics" className="evaluatorSection">
        <div className="evaluatorSectionHead"><h2>Full metric breakdown</h2><p>All figures update instantly as you change the assumptions above.</p></div>
        <div className="fullMetricsGrid">
          <MetricTile label="Monthly Gross Income" value={money(result.monthlyGrossIncome)} hint="Scheduled rent plus other monthly income." />
          <MetricTile label="Annual Gross Income" value={money(result.annualGrossIncome)} hint="Monthly gross income × 12." />
          <MetricTile label="Operating Expenses" value={`${money(result.monthlyOperatingExpenses)}/mo`} hint={`${money(result.annualOperatingExpenses)}/yr, excludes the mortgage payment.`} />
          <MetricTile label="NOI" value={`${money(result.noiAnnual)}/yr`} hint="Net Operating Income: gross income minus operating expenses." />
          <MetricTile label="Cap Rate" value={pct(result.capRatePercent)} hint="NOI ÷ property value." />
          <MetricTile label="Monthly Mortgage (P&I)" value={money(result.monthlyMortgagePayment)} hint="Principal + interest only." />
          <MetricTile label="Monthly Cash Flow" value={money(result.monthlyCashFlow)} hint="NOI ÷ 12 minus the mortgage payment." emphasis tone={result.monthlyCashFlow >= 0 ? 'good' : 'bad'} />
          <MetricTile label="Annual Cash Flow" value={money(result.annualCashFlow)} hint="Monthly cash flow × 12." tone={result.annualCashFlow >= 0 ? 'good' : 'bad'} />
          <MetricTile label="Cash-on-Cash Return" value={pct(result.cashOnCashReturnPercent)} hint="Annual cash flow ÷ total cash invested." />
          <MetricTile label="DSCR" value={ratioText(result.dscr)} hint="NOI ÷ annual mortgage payments. Lenders often want 1.20x+." />
          <MetricTile label="GRM" value={ratioText(result.grm)} hint="Purchase price ÷ annual gross income." />
          <MetricTile label="Break-Even Occupancy" value={pct(result.breakEvenOccupancyPercent)} hint="Occupancy needed to cover expenses and debt service." />
          <MetricTile label="Total Cash Required" value={money(result.totalCashRequired)} hint="Down payment + closing costs + loan points." />
          <MetricTile label="Equity at Purchase" value={money(result.equityAtPurchase)} hint="Estimated value minus the loan amount." />
        </div>

        <details className="howCalculated">
          <summary>How this is calculated</summary>
          <div className="formulaList">
            <div><span>Loan Amount</span><code>Purchase Price − Down Payment</code></div>
            <div><span>Monthly P&amp;I</span><code>Standard amortization: M = P·r(1+r)ⁿ ÷ ((1+r)ⁿ − 1)</code></div>
            <div><span>NOI</span><code>Annual Gross Income − Annual Operating Expenses</code></div>
            <div><span>Cap Rate</span><code>NOI ÷ Property Value</code></div>
            <div><span>Cash Flow</span><code>NOI − Annual Debt Service</code></div>
            <div><span>Cash-on-Cash Return</span><code>Annual Cash Flow ÷ Total Cash Invested</code></div>
            <div><span>DSCR</span><code>NOI ÷ Annual Debt Service</code></div>
            <div><span>GRM</span><code>Purchase Price ÷ Annual Gross Income</code></div>
            <div><span>Break-Even Occupancy</span><code>(Operating Expenses + Debt Service) ÷ Gross Income</code></div>
            <div><span>Equity</span><code>Property Value − Remaining Loan Balance</code></div>
          </div>
        </details>
      </section>

      <section className="evaluatorSection">
        <div className="evaluatorSectionHead"><h2>Analysis summary</h2><p>Based on the assumptions entered — not financial advice. Change any input above and this updates instantly.</p></div>
        <div className="dealIndicatorList">
          {indicators.map((indicator) => (
            <div className="dealIndicatorRow" key={indicator.label}>
              <span className="indicatorLabel">{indicator.label}</span>
              <span className={`ratingPill ${ratingClass[indicator.rating]}`}>{indicator.rating}</span>
              <span className="indicatorDetail">{indicator.detail}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="evaluatorSection">
        <div className="evaluatorSectionHead"><h2>5 & 10-year projection</h2><p>Assumes {form.appreciationRate || 0}% annual appreciation, {form.rentGrowthRate || 0}% rent growth and {form.expenseGrowthRate || 0}% expense growth — all editable above.</p></div>
        <ProjectionChart base={yearNow} result={result} />
        <div className="ledgerWrap projectionTableWrap">
          <table className="ledger projectionTable">
            <thead><tr><th>Year</th><th>Property Value</th><th>Mortgage Balance</th><th>Equity</th><th>Monthly Rent</th><th>Annual Cash Flow</th><th>Cumulative Cash Flow</th></tr></thead>
            <tbody>
              <tr><td>Now</td><td>{money(result.propertyValueForAnalysis)}</td><td>{money(result.loanAmount)}</td><td>{money(result.equityAtPurchase)}</td><td>{money(resolveMonthlyRent(input))}</td><td>{money(result.annualCashFlow)}</td><td>—</td></tr>
              {result.projections.map((row) => (
                <tr key={row.year}><td>Year {row.year}</td><td>{money(row.propertyValue)}</td><td>{money(row.mortgageBalance)}</td><td>{money(row.equity)}</td><td>{money(row.monthlyRent)}</td><td className={row.annualCashFlow >= 0 ? 'incomeCell' : ''}>{money(row.annualCashFlow)}</td><td>{money(row.cumulativeCashFlow)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ledgerNote">Projections are estimates based on the growth assumptions above, not guarantees. Straight lines are drawn between the years shown.</p>
      </section>

      {showConvert && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowConvert(false)}>
          <div className="modal">
            <div className="modalTop"><div><p className="eyebrow">SAVE AS PROPERTY</p><h2>Create a property from this analysis</h2></div><button className="iconButton" onClick={() => setShowConvert(false)}>×</button></div>
            <p className="deleteWarning">This creates a new property pre-filled from your analysis. The saved analysis stays exactly as it is and links to the new property — nothing here is deleted.</p>
            <div className="formGrid">
              <label>Street address<input value={convertDraft.address} onChange={(e) => setConvertDraft((d) => ({ ...d, address: e.target.value }))} placeholder="123 Example Street" /></label>
              <label>City, state & ZIP<input value={convertDraft.city} onChange={(e) => setConvertDraft((d) => ({ ...d, city: e.target.value }))} placeholder="Example City, FL 12345" /></label>
            </div>
            {result.loanAmount > 0 && (
              <label className="recurringCheck fullField"><input type="checkbox" checked={convertDraft.createMortgage} onChange={(e) => setConvertDraft((d) => ({ ...d, createMortgage: e.target.checked }))} /><span>Also create a mortgage record</span><small>Uses the loan amount, rate and term from this analysis.</small></label>
            )}
            <label className="recurringCheck fullField"><input type="checkbox" checked={convertDraft.markPurchased} onChange={(e) => setConvertDraft((d) => ({ ...d, markPurchased: e.target.checked }))} /><span>Also mark this analysis as Purchased</span><small>Leave unchecked if you haven't closed yet.</small></label>
            <div className="modalActions"><button className="secondary" onClick={() => setShowConvert(false)}>Cancel</button><button className="primary" disabled={saving || !convertDraft.address.trim() || !convertDraft.city.trim()} onClick={() => void convertToProperty()}>{saving ? 'Creating…' : 'Create Property'}</button></div>
          </div>
        </div>
      )}

      {showUpgrade && supabase && (
        <UpgradePrompt supabase={supabase} currentPlan={plan} onClose={() => setShowUpgrade(false)} />
      )}
    </main>
  )
}
