import * as React from 'react'
import type { DashboardDateItem, NavTarget } from '../../lib/dashboard/attention'

export function PropertyAlertsPanel({ propertyId, address, items, onClose, onOpen }: {
  propertyId: string; address: string; items: DashboardDateItem[];
  onClose: () => void; onOpen: (propertyId: string, nav: NavTarget) => void;
}) {
  const matching = items.filter(item => item.propertyId === propertyId)
  return <section className="propertyAlertsDetails" id={`property-alerts-${propertyId}`} aria-label={`Alerts for ${address}`} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
    <div className="propertyAlertsHeading"><strong>Needs attention</strong><button type="button" onClick={onClose}>Close</button></div>
    {matching.map(item => <button type="button" className="propertyAlertRow" key={`${item.type}:${item.id}`} onClick={() => onOpen(item.propertyId, item.nav)}><span><strong>{item.label}</strong><small>{item.description}</small></span><span>{new Date(`${item.date}T12:00:00`).toLocaleDateString()}</span></button>)}
    {matching.length === 0 && <p>No current alerts for this property.</p>}
  </section>
}
