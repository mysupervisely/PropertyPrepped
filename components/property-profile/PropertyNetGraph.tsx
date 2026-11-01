import * as React from 'react'
import type { PropertyYearTimeline } from '../../lib/dashboard/property-year-timeline'
import type { PropertyNet } from '../../lib/dashboard/property-net'

export function PropertyNetGraph({ totals, year, timeline }: { totals?: PropertyNet | null; year: string; timeline?: PropertyYearTimeline }) {
  const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value))}`
  const scale = timeline ? Math.max(1, ...timeline.points.flatMap(point => [point.income, point.costs])) : 1
  const x = (progress: number) => 4 + progress * 232
  const line = (key: 'income' | 'costs') => timeline?.points.map(point => `${x(point.progress)},${51 - point[key] / scale * 43}`).join(' ')
  const currentMonth = timeline ? new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(timeline.year, timeline.month, 15)) : '' 
  const detail = totals ? `${year} recorded income ${money(totals.income)}, operating expenses plus entered mortgage interest ${money(totals.expenses)}, recorded net ${signed(totals.net)}. ${totals.interestMissing ? 'Mortgage interest has not been entered. ' : ''}Only saved records are included. Excludes mortgage principal, capital improvements and other financing costs. Missing expenses are not confirmed zero. Annual manual totals are not prorated into months.` : `${year}: add income and expense records to see recorded net.`
  return <figure className="propertyNetGraph" title={detail} aria-label={detail}>
    <figcaption>{year} recorded net</figcaption>
    <strong className={totals && totals.net < 0 ? 'propertyNetNegative' : ''}>{totals ? signed(totals.net) : '—'}</strong>
    {totals ? <>
      <div className="propertyNetLine"><span>Income</span><b>+{money(totals.income)}</b></div>
      <div className="propertyNetLine propertyNetCosts"><span>Costs</span><b>−{money(totals.expenses)}</b></div>
      {timeline && <svg className="propertyYearChart" viewBox="0 0 240 75" role="img" aria-label={`Cumulative dated income and operating costs, January through ${currentMonth} ${year}. Future months are empty.${timeline.hasUndatedTotals ? ' Annual manual totals, including entered interest, are not plotted.' : ''}`}>
        <title>January to December · dated activity through {currentMonth}</title>
        <line x1="4" x2="236" y1="52" y2="52" stroke="#d5ded8" />
        {[0, 3, 6, 9, 12].map(month => <line key={month} x1={x(month / 12)} x2={x(month / 12)} y1="50" y2="55" stroke="#d5ded8" />)}
        <line x1={x(timeline.progress)} x2={x(timeline.progress)} y1="3" y2="53" stroke="#8e9e94" strokeDasharray="2 3" />
        {timeline.hasData && <>
          <polyline points={line('income')} fill="none" stroke="#2f7052" strokeWidth="2.5" strokeLinejoin="round" />
          <polyline points={line('costs')} fill="none" stroke="#ba7962" strokeWidth="2.5" strokeLinejoin="round" />
        </>}
        <text x="4" y="70">Jan</text><text x="120" y="70" textAnchor="middle">Jul</text><text x="236" y="70" textAnchor="end">Dec</text>
        <text x={Math.min(232, Math.max(15, x(timeline.progress)))} y="10" textAnchor="middle">{currentMonth}</text>
      </svg>}
      {timeline && <small className="propertyTimelineNote">{!timeline.hasData ? 'No dated activity' : timeline.hasUndatedTotals ? 'Dated activity · annual totals not plotted' : 'Dated activity · cumulative'}</small>}
      <small>{totals.interestMissing ? 'Partial · interest missing' : 'Saved records only'}</small>
    </> : <small>Add financial records</small>}
  </figure>
}
