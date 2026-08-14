// PropRoster Milestone 11: Property Watch — refresh entry points (Section
// 17). This is the ONE file in lib/property-watch that touches Supabase;
// everything it calls (the generators, reconcileWatchItems) is pure and
// tested on its own — this file is thin glue, matching how the rest of
// this codebase keeps Supabase orchestration separate from testable logic
// (e.g. lib/document-intelligence/analyze-document.ts vs. its API route).
//
// SYNC ARCHITECTURE (Section 17): computeWatchDrafts() is a pure,
// synchronous sweep over already-loaded data — cheap enough to run on
// every homepage/property-page load. refreshPropertyWatch() adds the
// Supabase read (existing items for this property) + reconcile + write.
// Because identity is deterministic (identity.ts) and reconcile.ts never
// re-inserts an already-matched row, calling this on every page load is
// SAFE, not just tolerated — it's what makes "runs when source data
// changes" and "runs after Document Intelligence completes" both reduce to
// the same call, with no separate change-detection machinery needed. No
// cron/external scheduler exists yet; a future scheduled job (Section 17)
// would simply loop over owners/properties and call this same function —
// nothing here assumes it's being called from a browser.
//
// The insert phase uses upsert(..., { ignoreDuplicates: true }) on the
// same (owner_id, source_type, source_id, event_key) unique constraint the
// database enforces, as a race-condition backstop on top of the
// application-level reconcile (e.g. two browser tabs refreshing the same
// property at once) — never a substitute for it, since ignoreDuplicates
// can't apply the "preserve a resolved item" rule reconcile.ts implements.

import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveLeaseWatchDraft, type LeaseLike, type PropertyLike } from './generators/lease'
import { deriveInsuranceWatchDraft, type InsurancePolicyLike } from './generators/insurance'
import { deriveMortgageWatchDraft, type MortgageLike } from './generators/mortgage'
import { deriveTaxWatchDraft, deriveHoaWatchDraft, type LedgerTransactionLike } from './generators/ledger'
import { deriveMaintenanceRecurrenceDrafts, type MaintenanceRecordLike } from './generators/maintenance'
import { deriveDocumentWatchDrafts, type DocumentAnalysisLike } from './generators/document-intelligence'
import { reconcileWatchItems, type PersistedWatchRow } from './reconcile'
import { buildManualWatchDraft, type ManualWatchInput } from './generators/manual'
import type { PropertyWatchDraft, WatchStatus } from './types'

export type { PropertyLike }

export type PropertyWatchSourceData = {
  property: PropertyLike
  leases: LeaseLike[]
  mortgages: MortgageLike[]
  insurancePolicies: InsurancePolicyLike[]
  maintenanceRecords: MaintenanceRecordLike[]
  transactions: LedgerTransactionLike[]
  documentAnalyses?: DocumentAnalysisLike[]
  now?: Date
}

/** Pure sweep — every generator, for one property, over already-loaded data. */
export function computeWatchDrafts(data: PropertyWatchSourceData): PropertyWatchDraft[] {
  const now = data.now ?? new Date()
  const drafts: PropertyWatchDraft[] = []

  for (const lease of data.leases) {
    const draft = deriveLeaseWatchDraft(lease, data.property, now)
    if (draft) drafts.push(draft)
  }

  const insuranceDraft = deriveInsuranceWatchDraft(data.insurancePolicies, data.property, now)
  if (insuranceDraft) drafts.push(insuranceDraft)

  for (const mortgage of data.mortgages) {
    const draft = deriveMortgageWatchDraft(mortgage, data.property, now)
    if (draft) drafts.push(draft)
  }

  const taxDraft = deriveTaxWatchDraft(data.transactions, data.property)
  if (taxDraft) drafts.push(taxDraft)
  const hoaDraft = deriveHoaWatchDraft(data.transactions, data.property)
  if (hoaDraft) drafts.push(hoaDraft)

  drafts.push(...deriveMaintenanceRecurrenceDrafts(data.maintenanceRecords, data.property, now))

  for (const analysis of data.documentAnalyses ?? []) {
    drafts.push(...deriveDocumentWatchDrafts(analysis, data.property, now))
  }

  return drafts
}

const WATCH_TABLE = 'property_watch_items'
const RECONCILE_COLUMNS = 'id, source_type, source_id, event_key, event_date, status, priority'

/** Full refresh for one property — every category. Safe to call on every homepage/property-page load (see file header). */
export async function refreshPropertyWatch(supabase: SupabaseClient, data: PropertyWatchSourceData): Promise<{ error: string | null }> {
  const drafts = computeWatchDrafts(data)
  return applyReconcile(supabase, data.property.id, drafts)
}

/**
 * Lighter refresh for exactly one document analysis (Section 12/17: "after
 * Document Intelligence completes"). Only touches 'document' source_type
 * items for this document, so it's cheap enough to call synchronously
 * right after an analysis is saved, without re-sweeping every other
 * category for the property.
 */
export async function refreshPropertyWatchFromDocumentAnalysis(
  supabase: SupabaseClient,
  property: PropertyLike,
  analysis: DocumentAnalysisLike,
  now: Date = new Date()
): Promise<{ error: string | null }> {
  const drafts = deriveDocumentWatchDrafts(analysis, property, now)
  return applyReconcile(supabase, property.id, drafts, { source_type: 'document', source_id: analysis.documentId })
}

/** Section 13: a manual reminder is a plain insert — no dedup, no reconcile (identity.ts point 4). */
export async function addManualWatchItem(supabase: SupabaseClient, input: ManualWatchInput): Promise<{ error: string | null }> {
  const draft = buildManualWatchDraft(input)
  const { error } = await supabase.from(WATCH_TABLE).insert(draft)
  return { error: error?.message ?? null }
}

/** Section 16: the generic Mark Complete / Dismiss / re-open actions available on any item. */
export async function setWatchItemStatus(supabase: SupabaseClient, id: string, status: WatchStatus): Promise<{ error: string | null }> {
  const { error } = await supabase.from(WATCH_TABLE).update({ status }).eq('id', id)
  return { error: error?.message ?? null }
}

async function applyReconcile(
  supabase: SupabaseClient,
  propertyId: string,
  drafts: PropertyWatchDraft[],
  scope?: { source_type: string; source_id: string }
): Promise<{ error: string | null }> {
  let query = supabase.from(WATCH_TABLE).select(RECONCILE_COLUMNS).eq('property_id', propertyId)
  if (scope) query = query.eq('source_type', scope.source_type).eq('source_id', scope.source_id)
  const { data: existingRows, error: fetchError } = await query
  if (fetchError) return { error: fetchError.message }

  const { toInsert, toUpdate } = reconcileWatchItems((existingRows ?? []) as PersistedWatchRow[], drafts)

  if (toInsert.length) {
    const { error } = await supabase
      .from(WATCH_TABLE)
      .upsert(toInsert, { onConflict: 'owner_id,source_type,source_id,event_key', ignoreDuplicates: true })
    if (error) return { error: error.message }
  }

  for (const { id, patch } of toUpdate) {
    const { error } = await supabase.from(WATCH_TABLE).update(patch).eq('id', id)
    if (error) return { error: error.message }
  }

  return { error: null }
}
