// PropRoster Milestone 11: Property Watch — deduplication / source identity.
//
// CRITICAL (Section 2): Property Watch must never create duplicate
// reminders when a page loads, a document is re-analyzed, a lease is
// edited, or a sync runs. The strategy:
//
//   1. Every draft carries (source_type, source_id, event_key) — see
//      PropertyWatchDraft in types.ts.
//   2. `event_key` names WHICH ASPECT of a source this item tracks, not
//      the date's value — e.g. 'lease_expiration', not
//      'lease_expiration:2026-11-30'. That's what makes an update an
//      UPDATE instead of a new row: when a lease is renewed and its
//      end_date changes, the new draft has the exact same
//      (source_type='lease', source_id=<lease id>, event_key=
//      'lease_expiration') identity as the old one, so reconcile.ts finds
//      the existing row and refreshes its event_date/title/priority in
//      place — see reconcile.ts for the full rule (including why a
//      Dismissed/Completed item is left alone when nothing about its
//      source actually changed).
//   3. The database also enforces this: property_watch_items has
//      `unique (owner_id, source_type, source_id, event_key)` — an
//      application bug or a race between two tabs can produce a duplicate
//      insert attempt, but never a duplicate ROW.
//   4. source_id is intentionally NULL for 'manual' items. Postgres unique
//      constraints treat every NULL as distinct from every other NULL, so
//      any number of manual reminders coexist without colliding — which is
//      correct, because each manual reminder is a deliberate, independent
//      thing with no natural "source row" to key off of.
//   5. Ledger-derived items (Property Tax / HOA — see generators/ledger.ts)
//      and the maintenance-recurrence signal (generators/maintenance.ts)
//      have no single natural source row either (they're derived from many
//      financial_transactions / maintenance_records rows), so they use the
//      PROPERTY's id as source_id instead of null — deliberately, so they
//      DO dedupe (one "2026 property tax increase" item per property, not
//      one per transaction).

/** Canonical event_key values. Centralized so no generator invents its own ad hoc string. */
export const EVENT_KEYS = {
  leaseExpiration: 'lease_expiration',
  insuranceRenewal: 'insurance_renewal',
  mortgageMaturity: 'mortgage_maturity',
  taxIncrease: (year: number) => `tax_increase:${year}`,
  hoaIncrease: (year: number) => `hoa_increase:${year}`,
  maintenanceRecurrence: (category: string) => `maintenance_recurrence:${category.trim().toLowerCase()}`,
  documentField: (field: string) => `document_field:${field}`,
  manual: 'manual',
} as const
