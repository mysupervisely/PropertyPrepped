// PropRoster — Property Profile 2.0, Section 9: Property Timeline.
//
// ARCHITECTURE (documented per Part 9's explicit requirement — "Document
// whether timeline is: fully derived / partially materialized /
// event-backed, and why"):
//
// This timeline is FULLY DERIVED. There is no property_timeline table.
// Every event is computed, on the fly, from records the page already
// loads for its own tabs (leases, mortgages, insurance_policies,
// maintenance_records, financial_transactions, property_systems) — see
// derive-timeline.ts. Why:
//
//   - Part 9 explicitly forbids a second source of truth ("Avoid a second
//     source of truth") and requires linking back to the underlying
//     record ("Timeline must link back to the underlying source record
//     where possible") — a derived timeline can NEVER drift from the
//     records it's built from, because it IS those records, reshaped.
//   - Part 9 also forbids manual duplication ("Do NOT make users manually
//     duplicate existing records just to populate the timeline") — a
//     materialized or event-backed table would need every write path
//     (saveLease, saveMortgage, saveMaintenance, ...) to also insert a
//     timeline row, doubling every mutation's surface area and creating
//     exactly the sync-bug risk Part 9 is warning about.
//   - The cost is real but small: a derived timeline can't hold its OWN
//     freeform fields (a manually-typed timeline-only entry with no
//     backing record). If that's wanted later, a small
//     property_timeline_entries table for MANUAL-ONLY entries could sit
//     alongside this — merged and sorted together with the derived events
//     at render time — without touching this derivation or risking any
//     drift for the record-backed events, which stay fully derived.
//
// Each event carries sourceTable + sourceId so the UI can link back to
// (or open) the real record — never a floating fact with no provenance.

export type TimelineEventType =
  | 'property-acquired'
  | 'mortgage-originated'
  | 'lease-started'
  | 'lease-ended'
  | 'insurance-effective'
  | 'insurance-expired'
  | 'maintenance'
  | 'system-installed'
  | 'system-serviced'
  | 'major-expense'

export type TimelineEvent = {
  /** Stable across re-renders and re-sorts — derived from sourceTable+sourceId+type, safe as a React key. */
  id: string
  date: string
  type: TimelineEventType
  title: string
  detail: string | null
  amount: number | null
  sourceTable: string
  sourceId: string
}
