'use client'

// Investment Tools 2.0 (Part 6): Home Purchase Calculator — a completely
// separate primary-residence calculator from the Rental Property
// Analyzer. Deliberately never asks about rent, vacancy, property
// management, NOI, cap rate, cash-on-cash, or DSCR — none of those
// concepts appear anywhere on this page or in
// lib/investment-tools/home-purchase-calculations.ts.
//
// No persistence yet (Part 6 doesn't ask for saved Home Purchase
// analyses) — purely a live calculator, same "everything recalculates
// instantly" feel as the Rental Property Analyzer.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AddressAutocomplete } from '../../../components/AddressAutocomplete'
import { PricingNavLink } from '../../../components/PricingNavLink'
import { Wordmark } from '../../../components/Wordmark'
import { AuthHeader } from '../../../components/AuthHeader'
import { useAuthUser } from '../../../lib/useAuthUser'
import { num } from '../../../lib/investment-calculations'
import { buildHomePurchaseAnalysis, type HomePurchaseInput, type PercentOrAmountMode } from '../../../lib/investment-tools/home-purchase-calculations'

type FormState = {
  address: string
  purchasePrice: string
  downPaymentMode: PercentOrAmountMode
  downPaymentPercent: string
  downPaymentAmount: string
  interestRate: string
  loanTermYears: string
  propertyTaxesAnnual: string
  homeInsuranceAnnual: string
  hoaMonthly: string
  pmiMonthly: string
  closingCostsMode: PercentOrAmountMode
  closingCostsPercent: string
  closingCostsAmount: string
}

function defaultForm(): FormState {
  return {
    address: '',
    purchasePrice: '',
    downPaymentMode: 'percent', downPaymentPercent: '20', downPaymentAmount: '',
    interestRate: '6.5', loanTermYears: '30',
    propertyTaxesAnnual: '', homeInsuranceAnnual: '', hoaMonthly: '', pmiMonthly: '',
    closingCostsMode: 'percent', closingCostsPercent: '3', closingCostsAmount: '',
  }
}

function toHomePurchaseInput(form: FormState): HomePurchaseInput {
  return {
    purchasePrice: num(form.purchasePrice),
    downPaymentMode: form.downPaymentMode,
    downPaymentPercent: num(form.downPaymentPercent),
    downPaymentAmount: num(form.downPaymentAmount),
    interestRatePercent: num(form.interestRate),
    loanTermYears: num(form.loanTermYears) || 30,
    propertyTaxesAnnual: num(form.propertyTaxesAnnual),
    homeInsuranceAnnual: num(form.homeInsuranceAnnual),
    hoaMonthly: num(form.hoaMonthly),
    pmiMonthly: num(form.pmiMonthly),
    closingCostsMode: form.closingCostsMode,
    closingCostsPercent: num(form.closingCostsPercent),
    closingCostsAmount: num(form.closingCostsAmount),
  }
}

const money = (n: number | null | undefined) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(Number.isFinite(n as number) ? Number(n) : 0)

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

function ModeField({ label, mode, onModeChange, percentValue, onPercentChange, amountValue, onAmountChange, hint }: { label: string; mode: PercentOrAmountMode; onModeChange: (m: PercentOrAmountMode) => void; percentValue: string; onPercentChange: (v: string) => void; amountValue: string; onAmountChange: (v: string) => void; hint?: string }) {
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
          : <div className="evalInputWrap"><input inputMode="decimal" value={amountValue} onChange={(e) => onAmountChange(e.target.value)} placeholder="0" /><span className="evalSuffix">$</span></div>}
      </div>
    </label>
  )
}

export default function HomePurchaseCalculatorPage() {
  const { user } = useAuthUser()
  const [form, setForm] = useState<FormState>(defaultForm())
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  const input = useMemo(() => toHomePurchaseInput(form), [form])
  const result = useMemo(() => buildHomePurchaseAnalysis(input), [input])

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
        <p className="eyebrow">HOME PURCHASE CALCULATOR</p>
        <h1>What will this home actually cost you each month?</h1>
        <p>For buying a place to live — not a rental. Enter what you know; everything recalculates instantly. This is a calculator, not a loan offer or a commitment to lend.</p>
      </section>

      <div className="evaluatorLayout">
        <aside className="evaluatorResults">
          <div className="resultsSummaryCard">
            <p className="eyebrow">ESTIMATED TOTAL MONTHLY PAYMENT</p>
            <div className="homePurchaseHero">{money(result.totalMonthlyPayment)}<small>/mo</small></div>
            <div className="summaryTileGrid">
              <div className="summaryTile"><span>Principal &amp; interest</span><strong>{money(result.principalAndInterestMonthly)}</strong></div>
              <div className="summaryTile"><span>Property tax</span><strong>{money(result.propertyTaxMonthly)}</strong></div>
              <div className="summaryTile"><span>Insurance</span><strong>{money(result.insuranceMonthly)}</strong></div>
              <div className="summaryTile"><span>PMI</span><strong>{money(result.pmiMonthly)}</strong></div>
              <div className="summaryTile"><span>HOA</span><strong>{money(result.hoaMonthly)}</strong></div>
            </div>
            <div className="homePurchaseCashRow">
              <div><span>Loan amount</span><strong>{money(result.loanAmount)}</strong></div>
              <div><span>Down payment</span><strong>{money(result.downPaymentAmount)}</strong></div>
              <div><span>Est. closing costs</span><strong>{money(result.closingCostsAmount)}</strong></div>
              <div><span>Cash needed to close</span><strong>{money(result.cashNeededToClose)}</strong></div>
              <div><span>Loan-to-value</span><strong>{result.loanToValuePercent === null ? 'N/A' : `${result.loanToValuePercent.toFixed(1)}%`}</strong></div>
            </div>
          </div>
        </aside>

        <div className="evaluatorInputs">
          <section className="evaluatorSection">
            <div className="evaluatorSectionHead"><h2>Property</h2><p>Optional — helps you keep track of what this estimate was for.</p></div>
            <div className="evalGrid">
              <label className="evalField">
                <span>Address</span>
                <div className="evalInputWrap">
                  <AddressAutocomplete value={form.address} onTextChange={(v) => set('address', v)} onSelect={(addr) => set('address', addr.formattedAddress)} placeholder="123 Example Street, Example City, FL" />
                </div>
              </label>
            </div>
          </section>

          <section className="evaluatorSection">
            <div className="evaluatorSectionHead"><h2>Purchase &amp; financing</h2></div>
            <div className="evalGrid">
              <NumberField label="Purchase price" value={form.purchasePrice} onChange={(v) => set('purchasePrice', v)} placeholder="450000" suffix="$" />
              <ModeField label="Down payment" mode={form.downPaymentMode} onModeChange={(m) => set('downPaymentMode', m)} percentValue={form.downPaymentPercent} onPercentChange={(v) => set('downPaymentPercent', v)} amountValue={form.downPaymentAmount} onAmountChange={(v) => set('downPaymentAmount', v)} />
              <NumberField label="Interest rate" value={form.interestRate} onChange={(v) => set('interestRate', v)} placeholder="6.5" suffix="%" />
              <NumberField label="Loan term" value={form.loanTermYears} onChange={(v) => set('loanTermYears', v)} placeholder="30" suffix="yrs" />
            </div>
          </section>

          <section className="evaluatorSection">
            <div className="evaluatorSectionHead"><h2>Taxes, insurance &amp; fees</h2></div>
            <div className="evalGrid">
              <NumberField label="Annual property taxes" value={form.propertyTaxesAnnual} onChange={(v) => set('propertyTaxesAnnual', v)} placeholder="5400" suffix="$/yr" />
              <NumberField label="Annual homeowners insurance" value={form.homeInsuranceAnnual} onChange={(v) => set('homeInsuranceAnnual', v)} placeholder="1800" suffix="$/yr" />
              <NumberField label="Monthly HOA" value={form.hoaMonthly} onChange={(v) => set('hoaMonthly', v)} placeholder="0" suffix="$/mo" />
              <NumberField label="Monthly PMI" value={form.pmiMonthly} onChange={(v) => set('pmiMonthly', v)} placeholder="0" suffix="$/mo" hint="Optional — leave blank if not applicable (e.g. 20%+ down)." />
            </div>
          </section>

          <section className="evaluatorSection">
            <div className="evaluatorSectionHead"><h2>Closing costs</h2></div>
            <div className="evalGrid">
              <ModeField label="Estimated closing costs" mode={form.closingCostsMode} onModeChange={(m) => set('closingCostsMode', m)} percentValue={form.closingCostsPercent} onPercentChange={(v) => set('closingCostsPercent', v)} amountValue={form.closingCostsAmount} onAmountChange={(v) => set('closingCostsAmount', v)} hint="Typically 2–5% of purchase price." />
            </div>
          </section>

          <p className="calcDisclaimer">
            Estimate only, based on the figures you entered. Not a loan offer, pre-approval, or commitment to lend. Actual rates, taxes, insurance and fees vary by lender and location.
          </p>
        </div>
      </div>
    </main>
  )
}
