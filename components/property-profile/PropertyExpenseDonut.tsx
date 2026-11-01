import * as React from 'react'
import type { PropertyTaxSummary } from '../../lib/tax-center/types'
import { propertyExpenseBreakdown } from '../../lib/dashboard/property-expense-breakdown'

const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value))}`

export function PropertyExpenseDonut({ summary, year, financingStatus, compact = false }: { summary: PropertyTaxSummary; year: string; financingStatus?: string | null; compact?: boolean }) {
  const data = propertyExpenseBreakdown(summary, financingStatus)
  let offset = 0
  const legend = data && data.slices.length > 0 ? <ul className="propertyExpenseLegend">{data.slices.map(slice => <li key={slice.key}><span><i style={{ backgroundColor: slice.color }} aria-hidden="true" />{slice.label}</span><strong>{money(slice.amount)}</strong></li>)}</ul> : <p className="propertyExpenseNote">No positive expense amounts recorded for {year}.</p>
  const note = <p className="propertyExpenseNote">Saved records only. Includes operating costs and entered mortgage interest; excludes principal and capital improvements.{data?.interestMissing ? ' Mortgage interest has not been entered.' : ''}</p>
  return <section className={`propertyExpenseBreakdown${compact ? ' propertyExpenseCompact' : ''}`} aria-label={`${year} recorded property expenses`}>
    <div className="propertyExpenseHeading"><h3>Expense breakdown</h3><span>{year}</span></div>
    <div className="propertyExpenseLayout">
      <div className="propertyExpenseDonut" aria-hidden="true">
        <svg viewBox="0 0 120 120" focusable="false">
          <circle cx="60" cy="60" r="48" fill="none" stroke="#e4e7e5" strokeWidth="12" />
          {data?.slices.map(slice => {
            const length = slice.amount / data.expenses * 100
            const start = offset; offset += length
            return <circle key={slice.key} cx="60" cy="60" r="48" fill="none" stroke={slice.color} strokeWidth="12" pathLength="100" strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={-start} transform="rotate(-90 60 60)" />
          })}
        </svg>
        <div className="propertyExpenseCenter"><strong>{data?.slices.length ? money(data.expenses) : '—'}</strong><span>Recorded costs</span></div>
      </div>
      <dl className="propertyExpenseNet">
        <div><dt>Recorded income</dt><dd>{data ? `+${money(data.income)}` : 'Not enough data'}</dd></div>
        <div><dt>Costs + entered interest</dt><dd className="propertyExpenseNegative">{data ? `−${money(data.expenses)}` : 'Not enough data'}</dd></div>
        <div className="propertyExpenseNetTotal"><dt>Recorded net</dt><dd className={data && data.net < 0 ? 'propertyExpenseNegative' : ''}>{data ? signed(data.net) : 'Not enough data'}</dd></div>
      </dl>
    </div>
    {compact && data?.interestMissing && <p className="propertyExpenseNote">Partial: interest missing</p>}
    {compact ? <details className="propertyExpenseDetails"><summary>Expense details</summary>{legend}{note}</details> : <>{legend}{note}</>}
  </section>
}
