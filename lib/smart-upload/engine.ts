// PropRoster — Smart Upload / Smart Import shared engine.
//
// Milestone 14 (Smart Import V1) extracts every Supabase mutation Smart
// Upload's queue already performed (upload -> analyze -> confirm property
// -> add PropCrew contact -> save receipt/prepare-only) out of
// components/SmartUpload/SmartUploadModal.tsx and into this one plain
// module, so Smart Import can reuse the EXACT same ingestion pipeline
// instead of a second copy of it — "do not create a second document
// store, AI pipeline, or duplicate ingestion architecture." Both
// SmartUploadModal (one-at-a-time / small batch, modal UI) and
// app/smart-import/page.tsx (many-file batch, full-page review queue)
// call these same functions; only how each surface manages its own
// per-item UI state differs.
//
// Nothing here owns React state — every function takes a Supabase client
// plus plain arguments and returns a plain result. That's what makes it
// callable from two very differently-shaped UI layers without a second
// implementation, and what makes the non-UI parts of the flow testable
// without a live database (see engine.test.ts for the parts that ARE
// pure — request shaping/error paths — the actual DB calls remain
// exercised through this module's existing production usage plus the
// RLS tests in supabase/tests/, same convention as the rest of Smart
// Upload).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DocumentType } from '../document-intelligence/types'
import type { ApplyFields, DocumentAnalysisOutput } from '../document-intelligence/schemas'
import { shouldCreateFinancialTransaction, shouldCreateMaintenanceRecord } from './idempotency'
import { findMatchingContact } from './match-contact'
import type { SmartUploadContact } from './types'

export const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_')

// Which surface created a smart_upload_items row (milestone-14: adds the
// `source` column). Never changes which pipeline/tables are used — both
// values go through the identical upload/analyze/save functions below —
// it only lets each surface's "what's still unfinished" queries (Smart
// Upload's own leave-and-return, Smart Import's "Continue Smart Import")
// find their own batches without mixing the other surface's stray items.
export type UploadSource = 'SmartUpload' | 'SmartImport'

export type UploadResult =
  | { ok: true; documentId: string; itemId: string }
  | { ok: false; error: string }

/**
 * Uploads one file to the private property-documents bucket and creates
 * its ONE canonical property_documents row (property_id null — Smart
 * Upload/Import both analyze BEFORE the property is confirmed) plus its
 * smart_upload_items workflow row. Never re-uploads or creates a second
 * row for the same file — each call is for exactly one new file.
 */
export async function uploadDocumentForReview(
  supabase: SupabaseClient,
  ownerId: string,
  file: File,
  batchId: string,
  source: UploadSource,
): Promise<UploadResult> {
  const path = `${ownerId}/smart-upload/${batchId}/${crypto.randomUUID()}-${safeName(file.name)}`
  const { error: uploadError } = await supabase.storage.from('property-documents').upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (uploadError) return { ok: false, error: uploadError.message }

  const { data: docRow, error: docError } = await supabase
    .from('property_documents')
    .insert({ owner_id: ownerId, property_id: null, name: file.name, category: 'Other', storage_path: path, size_bytes: file.size, mime_type: file.type || null })
    .select('id')
    .single()
  if (docError || !docRow) {
    await supabase.storage.from('property-documents').remove([path])
    return { ok: false, error: docError?.message || 'Could not save this file.' }
  }

  const { data: itemRow, error: itemError } = await supabase
    .from('smart_upload_items')
    .insert({ owner_id: ownerId, document_id: docRow.id, batch_id: batchId, source })
    .select('id')
    .single()
  if (itemError || !itemRow) return { ok: false, error: itemError?.message || 'Could not start this upload.' }

  return { ok: true, documentId: docRow.id, itemId: itemRow.id }
}

export type AnalyzeResult =
  | { ok: true; documentType: DocumentType; analysis: DocumentAnalysisOutput }
  | { ok: false; error: string }

/**
 * Exactly ONE Document Intelligence analysis call per file — always the
 * type-agnostic 'Other' schema (the model still self-classifies honestly
 * regardless of the requested schema; see lib/document-intelligence for
 * why). Callers must never call this twice for the same document —
 * neither SmartUploadModal nor Smart Import's queue do; a Failed item
 * only re-runs this through an explicit user-triggered Retry.
 */
export async function analyzeDocument(supabase: SupabaseClient, documentId: string): Promise<AnalyzeResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { ok: false, error: 'Your session expired — please sign in again.' }
  try {
    const resp = await fetch('/api/document-intelligence/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ documentId, documentType: 'Other' as DocumentType }),
    })
    const body = await resp.json().catch(() => ({}))
    if (!resp.ok) return { ok: false, error: body?.error || 'Analysis failed.' }
  } catch {
    return { ok: false, error: 'Analysis failed. Please try again.' }
  }
  const [{ data: docRow }, { data: analysisRows }] = await Promise.all([
    supabase.from('property_documents').select('document_type').eq('id', documentId).single(),
    supabase.from('document_analyses').select('structured_data').eq('document_id', documentId).order('analysis_version', { ascending: false }).limit(1),
  ])
  const latest = analysisRows?.[0]?.structured_data as DocumentAnalysisOutput | undefined
  if (!latest) return { ok: false, error: 'Analysis completed but the result could not be loaded.' }
  return { ok: true, documentType: (docRow?.document_type as DocumentType) || 'Other', analysis: latest }
}

/**
 * Confirms which property a reviewed item belongs to. Updates the
 * canonical document, its analysis, and the workflow row together so the
 * "analysis.property_id must match its document's property_id" invariant
 * (supabase/milestone-12-smart-upload.sql) always holds.
 */
export async function confirmItemProperty(supabase: SupabaseClient, documentId: string, itemId: string, propertyId: string): Promise<void> {
  await Promise.all([
    supabase.from('property_documents').update({ property_id: propertyId }).eq('id', documentId),
    supabase.from('document_analyses').update({ property_id: propertyId }).eq('document_id', documentId),
    supabase.from('smart_upload_items').update({ confirmed_property_id: propertyId }).eq('id', itemId),
  ])
}

/**
 * Smart Import, item 5/7: "assign selected to <one owned property>" —
 * the same confirmItemProperty() call repeated for every selected item,
 * every item still confirmed individually (this is a convenience for
 * doing the same confirm N times, never a separate/looser write path).
 * Runs sequentially (not Promise.all across items) to keep this
 * predictable and easy to reason about for a large batch; each item's
 * own two-table update still runs in parallel internally.
 */
export async function bulkConfirmProperty(
  supabase: SupabaseClient,
  items: { documentId: string; itemId: string }[],
  propertyId: string,
): Promise<void> {
  for (const { documentId, itemId } of items) {
    await confirmItemProperty(supabase, documentId, itemId, propertyId)
  }
}

export type ContactResult = { id: string | null; error?: string }

/** Creates (or links an existing match for) a PropCrew provider — see components/SmartUpload/ReceiptReview.tsx for the confirmation-form UX this backs. Never silently creates a duplicate. */
export async function addContactToPropCrew(
  supabase: SupabaseClient,
  ownerId: string,
  propertyId: string | null,
  existingContacts: SmartUploadContact[],
  prefill: { name: string; businessName: string | null; phone: string | null; email: string | null; role: string },
): Promise<ContactResult> {
  if (!propertyId) return { id: null, error: 'Confirm which property this belongs to first, then add the provider to PropCrew.' }
  const existing = findMatchingContact(prefill.name, existingContacts) || findMatchingContact(prefill.businessName, existingContacts)
  if (existing) return { id: existing.id }
  const { data, error } = await supabase
    .from('property_contacts')
    .insert({ owner_id: ownerId, property_id: propertyId, name: prefill.name, business_name: prefill.businessName, role: prefill.role, phone: prefill.phone, email: prefill.email })
    .select('id')
    .single()
  if (error || !data) return { id: null, error: error?.message || 'Could not add this provider to PropCrew. Please try again.' }
  return { id: data.id }
}

export type ReceiptSaveArgs = {
  itemId: string
  documentId: string
  confirmedPropertyId: string
  createdFinancialTransactionId: string | null
  createdMaintenanceRecordId: string | null
  vendor: string
  date: string
  amount: string
  description: string
  financialCategory: string
  createMaintenanceRecord: boolean
  maintenanceCategory: string
  systemId: string | null
  contactId: string | null
}

export type SaveResult =
  | { ok: true; financialTransactionId: string | null; maintenanceRecordId: string | null; contactId: string | null }
  | { ok: false; error: string }

/** Explicit "Save" for a Receipt/Invoice item — creates the linked financial transaction (and, when chosen, the maintenance record) exactly once per item, idempotency-guarded so a repeated Save never inserts twice. */
export async function saveReceiptRecord(supabase: SupabaseClient, ownerId: string, args: ReceiptSaveArgs): Promise<SaveResult> {
  let financialTransactionId = args.createdFinancialTransactionId
  let maintenanceRecordId = args.createdMaintenanceRecordId
  const contactId = args.contactId

  if (shouldCreateFinancialTransaction({ created_financial_transaction_id: args.createdFinancialTransactionId })) {
    const { data: tx, error: txError } = await supabase
      .from('financial_transactions')
      .insert({
        owner_id: ownerId, property_id: args.confirmedPropertyId, transaction_date: args.date, transaction_type: 'Expense',
        category: args.createMaintenanceRecord ? 'Maintenance' : args.financialCategory, vendor: args.vendor || null,
        description: args.description, amount: Number(args.amount), document_id: args.documentId, is_recurring: false,
      })
      .select('id')
      .single()
    if (txError || !tx) return { ok: false, error: txError?.message || 'Could not save this expense.' }
    financialTransactionId = tx.id
  }

  if (args.createMaintenanceRecord && financialTransactionId && shouldCreateMaintenanceRecord({ created_maintenance_record_id: maintenanceRecordId })) {
    const { data: rec, error: recError } = await supabase
      .from('maintenance_records')
      .insert({
        owner_id: ownerId, property_id: args.confirmedPropertyId, service_date: args.date, status: 'Completed', category: args.maintenanceCategory,
        vendor: args.vendor || null, description: args.description, cost: Number(args.amount), document_id: args.documentId,
        financial_transaction_id: financialTransactionId, system_id: args.systemId || null, propcrew_contact_id: contactId || null,
      })
      .select('id')
      .single()
    if (recError || !rec) return { ok: false, error: recError?.message || 'Could not save this maintenance record.' }
    maintenanceRecordId = rec.id
  }

  await supabase.from('property_documents').update({ category: 'Receipts' }).eq('id', args.documentId)
  await supabase
    .from('smart_upload_items')
    .update({
      created_financial_transaction_id: financialTransactionId,
      created_maintenance_record_id: maintenanceRecordId,
      created_contact_id: contactId,
      completed_at: new Date().toISOString(),
    })
    .eq('id', args.itemId)

  return { ok: true, financialTransactionId, maintenanceRecordId, contactId }
}

// Same category-by-type mapping SmartUploadModal already used — filing
// only, never a canonical lease/insurance/mortgage/tax record. Exported
// so Smart Import's queue can label items consistently without a second
// copy of this list.
export const PREPARE_ONLY_CATEGORY_BY_TYPE: Partial<Record<DocumentType, string>> = {
  'Insurance Policy': 'Insurance', Lease: 'Lease', 'Mortgage / Loan Statement': 'Mortgage',
  'Closing Disclosure / Settlement Statement': 'Closing', 'Inspection Report': 'Inspection',
  'Property Tax Document': 'Tax', 'HOA Document': 'Other', Appraisal: 'Other',
}

/** Explicit "Save"/"Organize" for a non-receipt item (lease, insurance, mortgage, tax, inspection, other) — files the canonical document under the right category and marks the item done. Never creates or overwrites a lease/insurance/mortgage record — that stays the existing explicit Apply flow inside each module. */
export async function savePrepareOnlyRecord(supabase: SupabaseClient, itemId: string, documentId: string, documentType: DocumentType | undefined): Promise<void> {
  await supabase.from('property_documents').update({ category: (documentType && PREPARE_ONLY_CATEGORY_BY_TYPE[documentType]) || 'Other' }).eq('id', documentId)
  await supabase.from('smart_upload_items').update({ completed_at: new Date().toISOString() }).eq('id', itemId)
}

export type ApplyFieldsShape = ApplyFields
