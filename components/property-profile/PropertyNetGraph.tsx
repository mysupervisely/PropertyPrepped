import * as React from 'react'
import type { PropertyNet } from '../../lib/dashboard/property-net'

export function PropertyNetGraph({ totals, year }: { totals?: PropertyNet | null; year: string }) {
  const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value))}`
  const scale = totals ? Math.max(totals.income, totals.expenses, 1) : 1
  const detail = totals ? `${year} recorded income ${money(totals.income)}, operating expenses plus entered mortgage interest ${money(totals.expenses)}, recorded net ${signed(totals.net)}. ${totals.interestMissing ? 'Mortgage interest has not been entered. ' : ''}Only saved records are included. Excludes mortgage principal, capital improvements and other financing costs. Missing expenses are not confirmed zero. Annual manual totals are not prorated into months.` : `${year}: add income and expense records to see recorded net.`
  return <figure className="propertyNetGraph" title={detail} aria-label={detail}>
    <figcaption>{year} recorded net</figcaption>
    <strong className={totals && totals.net < 0 ? 'propertyNetNegative' : ''}>{totals ? signed(totals.net) : '—'}</strong>
    {totals ? <>
      <div className="propertyNetLine"><span>Income</span><b>+{money(totals.income)}</b></div>
      <div className="propertyNetTrack" aria-hidden="true"><i style={{ width: `${totals.income / scale * 100}%` }} /></div>
      <div className="propertyNetLine"><span>Costs</span><b>−{money(totals.expenses)}</b></div>
      <div className="propertyNetTrack propertyNetCostTrack" aria-hidden="true"><i style={{ width: `${totals.expenses / scale * 100}%` }} /></div>
      <small>{totals.interestMissing ? 'Partial · interest missing' : 'Saved records only'}</small>
    </> : <small>Add financial records</small>}
  </figure>
}
