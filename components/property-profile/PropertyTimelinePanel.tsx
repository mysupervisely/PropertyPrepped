'use client'

// PropRoster — Property Profile 2.0, Section 9: Property Timeline
// display. Purely presentational — every event is already computed by
// lib/property-timeline/derive-timeline.ts before it reaches this
// component (see that module's doc comment for the "fully derived, not
// event-backed" architecture rationale). No Supabase calls here at all.

import type { TimelineEvent } from '../../lib/property-timeline/types'

const money = (n: number | null) => n == null ? null : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function PropertyTimelinePanel({ events, limit }: { events: TimelineEvent[]; limit?: number }) {
  const visible = limit ? events.slice(0, limit) : events

  if (!events.length) {
    return <p className="muted">No timeline events yet — this fills in automatically as you add leases, insurance, maintenance, systems and expenses.</p>
  }

  return (
    <ul className="timelineList">
      {visible.map((event) => (
        <li className="timelineItem" key={event.id}>
          <div className="timelineDate">{formatDate(event.date)}</div>
          <div className="timelineBody">
            <strong>{event.title}</strong>
            {event.detail && <span>{event.detail}</span>}
          </div>
          {event.amount != null && <div className="timelineAmount">{money(event.amount)}</div>}
        </li>
      ))}
      {limit && events.length > limit && <li className="timelineMore">+{events.length - limit} earlier event{events.length - limit === 1 ? '' : 's'}</li>}
    </ul>
  )
}
