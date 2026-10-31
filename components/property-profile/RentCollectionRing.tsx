import * as React from 'react'
import { rentCollectionPercent, type CollectionTotals } from '../../lib/dashboard/rent-collection'

export function RentCollectionRing({ totals, period }: { totals?: CollectionTotals; period: string }) {
  const percent = rentCollectionPercent(totals)
  const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
  const description = percent === null ? `Rent collection for ${period}: no data` : `Rent collected for ${period}: ${money(totals!.totalPaid)} of ${money(totals!.expectedAmount)} due, ${percent}%`
  return <figure className="propertyCollectionRing" aria-label={description} title={description}>
    <div className="propertyCollectionGraphic">
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <circle cx="32" cy="32" r="27" fill="none" stroke="#e1e9e4" strokeWidth="5" />
        {percent !== null && <circle cx="32" cy="32" r="27" fill="none" stroke="#246747" strokeWidth="5" pathLength="100" strokeDasharray={`${percent} 100`} transform="rotate(-90 32 32)" />}
      </svg>
      <strong aria-hidden="true">{percent === null ? '—' : `${percent}%`}</strong>
    </div>
    <figcaption>Rent collected<small>{percent === null ? 'No data' : period}</small></figcaption>
  </figure>
}
