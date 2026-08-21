// PropRoster — Documents + Navigation + Realtor Connect Polish.
//
// Single source of truth for "is this document linked to a record that
// lives on its current property?" — previously a private, inline
// DOCUMENT_LINK_CHECKS array/loop inside app/page.tsx's Move / Refile
// feature (QA Cleanup Bundle). Pulled out here, unchanged, so the new
// Documents page's Assign/Move actions (lib/documents/reassign.ts) use
// the EXACT same table list instead of a second, drifting copy — moving
// a document to a different property while it's still the supporting
// file for a financial transaction, maintenance record, lease, insurance
// policy, mortgage, or property system would leave that record pointing
// at a document now filed under a different property, so both call
// sites block-and-explain instead of guessing.

import type { SupabaseClient } from '@supabase/supabase-js'

export const DOCUMENT_LINK_CHECKS: { table: string; label: string }[] = [
  { table: 'financial_transactions', label: 'a financial transaction' },
  { table: 'maintenance_records', label: 'a maintenance record' },
  { table: 'leases', label: 'a lease' },
  { table: 'insurance_policies', label: 'an insurance policy' },
  { table: 'mortgages', label: 'a mortgage' },
  { table: 'property_system_documents', label: 'a property system' },
]

/** Real adapter: queries each linked table via the caller's own RLS-scoped client. Returns the human-readable labels of every table this document is currently linked from. */
export async function findDocumentLinks(client: SupabaseClient, documentId: string): Promise<string[]> {
  const results = await Promise.all(
    DOCUMENT_LINK_CHECKS.map(({ table }) => client.from(table).select('id', { count: 'exact', head: true }).eq('document_id', documentId)),
  )
  return DOCUMENT_LINK_CHECKS.filter((_, i) => (results[i].count || 0) > 0).map((c) => c.label)
}
