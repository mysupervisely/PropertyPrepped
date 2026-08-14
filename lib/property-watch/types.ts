// PropRoster Milestone 11: Property Watch — shared vocabulary.
//
// One centralized engine, one table (property_watch_items), one set of
// types. Every category (Lease, Insurance, Property Tax, Mortgage, HOA,
// Warranty, Maintenance, Inspection, License, Permit, Utility, Document,
// Other) and every source (a real lease row, an insurance policy row, the
// financial ledger, a maintenance record, an AI document analysis, or a
// manually-typed reminder) produces the exact same shape below. Nothing in
// this module talks to Supabase, Next.js, or the Anthropic SDK — see
// engine.ts for the thin Supabase-touching orchestration layer.

/** Business-facing category shown to the owner — matches the milestone spec's list exactly. */
export const WATCH_CATEGORIES = [
  'Lease',
  'Insurance',
  'Property Tax',
  'Mortgage',
  'HOA',
  'Warranty',
  'Maintenance',
  'Inspection',
  'License',
  'Permit',
  'Utility',
  'Document',
  'Other',
] as const
export type WatchCategory = (typeof WATCH_CATEGORIES)[number]

export const WATCH_STATUSES = ['Upcoming', 'Needs Attention', 'Completed', 'Dismissed'] as const
export type WatchStatus = (typeof WATCH_STATUSES)[number]

export const WATCH_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const
export type WatchPriority = (typeof WATCH_PRIORITIES)[number]

/**
 * Technical provenance — which system produced this item. Distinct from
 * `category` (the business-facing label): a Property Tax item's
 * `source_type` is 'ledger' (derived from financial_transactions), not
 * 'tax', because there is no dedicated tax table in this milestone (see
 * generators/ledger.ts for why that's a deliberate choice, not an
 * oversight). This is also half of the deduplication identity — see
 * identity.ts.
 */
export const WATCH_SOURCE_TYPES = [
  'lease',
  'mortgage',
  'insurance_policy',
  'ledger',
  'maintenance_record',
  'document',
  'manual',
] as const
export type WatchSourceType = (typeof WATCH_SOURCE_TYPES)[number]

/**
 * The primary suggested action for this item. The UI always additionally
 * offers the generic "Mark Complete" / "Dismiss" actions regardless of
 * this value (Section 16) — this column only drives the category-specific
 * primary button's label/behavior (e.g. a Lease item also renders the
 * "Prepare Renewal" / "Prepare for Marketing" pair described in Section 4,
 * which are UI affordances layered on top of a 'Review' action_type, not
 * separate action_type values).
 */
export const WATCH_ACTION_TYPES = [
  'Review',
  'Review Policy',
  'Review Assessment',
  'Review Maintenance History',
  'Confirm',
  'Other',
] as const
export type WatchActionType = (typeof WATCH_ACTION_TYPES)[number]

/**
 * Free-form, JSON-serializable provenance/context. Always includes enough
 * to answer "why does this item exist and where did its data come from" —
 * e.g. { tenantName }, { premiumChange: {...} }, { documentId, analysisId,
 * confidence, needsConfirmation }, { manuallyCreated: true }. Never used to
 * store secrets, tenant PII beyond what the source record already held, or
 * anything not already visible to the owner elsewhere in PropRoster.
 */
export type WatchMetadata = Record<string, unknown>

/**
 * What a generator produces — everything needed to insert or update a row,
 * but not yet a persisted row (no id/created_at/updated_at). `event_date`
 * and `warning_date` are YYYY-MM-DD strings (date-only, matching every
 * other date column in this schema) or null when the item has no single
 * future date (e.g. a tax-increase-detected fact, or a maintenance
 * recurrence signal).
 */
export type PropertyWatchDraft = {
  owner_id: string
  property_id: string
  source_type: WatchSourceType
  /** Null only for 'manual' items — see identity.ts for why that's safe. */
  source_id: string | null
  event_key: string
  category: WatchCategory
  title: string
  description: string
  event_date: string | null
  warning_date: string | null
  priority: WatchPriority
  status: WatchStatus
  action_type: WatchActionType
  metadata: WatchMetadata
}

/** A draft that has actually been written to property_watch_items. */
export type PersistedPropertyWatchItem = PropertyWatchDraft & {
  id: string
  created_at: string
  updated_at: string
}
