import * as React from 'react'
import type { PropertyTaxSummary } from '../../lib/tax-center/types'
import { propertyMoneyActivity, filledPieWedge } from '../../lib/dashboard/property-expense-breakdown'

const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value))}`

export function PropertyExpenseDonut({ summary, year, financingStatus, compact = false }: { summary: PropertyTaxSummary; year: string; financingStatus?: string | null; compact?: boolean }) {
  const data = propertyMoneyActivity(summary, financingStatus)
  const slices = data?.activitySlices ?? []
  let offset = 0
  const legend = slices.length > 0 ? <ul className="propertyExpenseLegend">{slices.map(slice => <li key={slice.key}><span><i style={{ backgroundColor: slice.color }} aria-hidden="true" />{slice.label}</span><strong className={slice.key === 'rent' || slice.key === 'otherIncome' ? 'propertyPieIncomeValue' : undefined}>{money(slice.amount)}</strong></li>)}</ul> : <p className="propertyExpenseNote">No income or cost amounts recorded for {year}.</p>
  const note = <p className="propertyExpenseNote">Saved records only. Pie slices compare income and cost entries, not profit percentages. Includes operating costs and entered mortgage interest; excludes principal and capital improvements.{data?.interestMissing ? ' Mortgage interest has not been entered.' : ''}</p>
  return <section className={`propertyExpenseBreakdown${compact ? ' propertyExpenseCompact' : ''}`} aria-label={`${year} recorded income and cost activity`}>
    <div className="propertyExpenseHeading"><h3>Income &amp; costs</h3><span>{year}</span></div>
    <div className="propertyExpenseLayout">
      <div className="propertyExpenseDonut propertyFilledPie" aria-hidden="true">
        <svg viewBox="0 0 120 120" focusable="false">
          {slices.length === 0 ? <circle cx="60" cy="60" r="52" fill="#e4e7e5" /> : slices.map(slice => {
            const fraction = slice.amount / data!.activityTotal
            const start = offset; offset += fraction
            return slices.length === 1 ? <circle key={slice.key} cx="60" cy="60" r="52" fill={slice.color} /> : <path key={slice.key} d={filledPieWedge(start, fraction)} fill={slice.color} stroke="#f5f8f6" strokeWidth="1.2" />
          })}
        </svg>
      </div>
      {compact && slices.length > 0 && <div className="propertyPieKeys">{slices.map(slice => <span key={slice.key}><i style={{ backgroundColor: slice.color }} />{slice.label}</span>)}</div>}
      <dl className="propertyExpenseNet">
        <div><dt>Recorded income</dt><dd>{data ? `+${money(data.income)}` : 'Not enough data'}</dd></div>
        <div><dt>Costs + entered interest</dt><dd className="propertyExpenseNegative">{data ? `−${money(data.expenses)}` : 'Not enough data'}</dd></div>
        <div className="propertyExpenseNetTotal"><dt>Recorded net</dt><dd className={data && data.net < 0 ? 'propertyExpenseNegative' : ''}>{data ? signed(data.net) : 'Not enough data'}</dd></div>
      </dl>
    </div>
    {compact && data?.interestMissing && <p className="propertyExpenseNote">Partial: interest missing</p>}
    {compact ? <details className="propertyExpenseDetails"><summary>Income &amp; cost details</summary>{legend}{note}</details> : <>{legend}{note}</>}
  </section>
}
