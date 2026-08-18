// PropRoster — Smart Upload Foundation: shared vocabulary. Nothing here
// talks to Supabase/React — the pure logic in this directory (matching,
// idempotency, review-flow selection) is unit-testable without a
// database or network call, same convention as
// lib/document-intelligence/types.ts.

export type SmartUploadProperty = {
  id: string
  address: string
  city: string
}

export type SmartUploadContact = {
  id: string
  name: string
  business_name: string | null
}

export type SmartUploadSystem = {
  id: string
  property_id: string
  system_type: string
  name: string | null
}

// Mirrors supabase/milestone-12-smart-upload.sql's smart_upload_items
// table — the workflow-state row for one uploaded file.
export type SmartUploadItemRow = {
  id: string
  owner_id: string
  document_id: string
  batch_id: string
  confirmed_property_id: string | null
  created_financial_transaction_id: string | null
  created_maintenance_record_id: string | null
  created_contact_id: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

// Which review experience a classified document type gets (Part 10 vs.
// Part 16/17 — "make receipts a polished V1 experience", "prepare
// extension points, do not build full automation" for lease/insurance/
// tax/etc.). Purely a UI routing decision, never persisted.
export type SmartUploadReviewKind = 'Receipt' | 'PrepareOnly'
