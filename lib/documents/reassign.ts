// PropRoster — Documents + Navigation + Realtor Connect Polish.
//
// The testable core behind the Documents page's "Assign to Property" and
// "Move to Another Property" actions (Sections 3/4). Both are the same
// underlying operation — set property_documents.property_id to a
// property the caller owns — presented as two different buttons
// depending on whether the document already has a property. Deliberately
// modeled as a pure function with injected dependencies (same
// ports-and-adapters shape as lib/realtor-leads/handle-lead-submission.ts
// and lib/billing/webhook-handlers.ts): the real adapter (app/documents/
// page.tsx) wires Supabase, tests wire fakes.
//
// What this function will NEVER do (Section 3):
//   - upload the document again
//   - create a duplicate document row (there is no insert dependency at
//     all — only ever one update call)
//   - rerun Smart Upload or AI analysis
//   - replace the stored file (storage_path is never touched)
//   - touch anything on the row except property_id (and the mirrored
//     document_analyses.property_id, the same invariant the existing
//     Move / Refile feature in app/page.tsx already maintains)
//
// Security (Section 7): the real Postgres RLS policy
// (documents_update_own's WITH CHECK, supabase/schema.sql) is the actual
// enforcement that a caller can only point a document at a property they
// own — this function's own isOwnedProperty pre-check is defense in
// depth (a clear, friendly error before ever hitting the database), not
// a replacement for it. Either layer refusing is reported the same way:
// a safe, friendly error, never a raw Postgres/Supabase message.

import { DOCUMENT_LINK_CHECKS } from './document-links'

export type ReassignableDocument = { id: string; property_id: string | null }

export type ReassignDeps = {
  /** True only if targetPropertyId is one of the caller's own properties. */
  isOwnedProperty: (propertyId: string) => Promise<boolean>
  /** Every human-readable label (see DOCUMENT_LINK_CHECKS) this document is currently linked from, on its CURRENT property. */
  findLinkedRecords: (documentId: string) => Promise<string[]>
  /** The one and only write to property_documents this function ever makes. */
  updateDocumentProperty: (documentId: string, propertyId: string) => Promise<{ error: string | null }>
  /** Best-effort sync of document_analyses.property_id, mirroring the document's own — never blocks/fails the reassignment itself. */
  updateAnalysisProperty: (documentId: string, propertyId: string) => Promise<void>
}

export type ReassignResult = { ok: true } | { ok: false; error: string }

export async function reassignDocumentToProperty(doc: ReassignableDocument, targetPropertyId: string, deps: ReassignDeps): Promise<ReassignResult> {
  // Re-selecting the property the document is already on is a no-op —
  // never worth a network round trip or a linked-record check.
  if (doc.property_id === targetPropertyId) return { ok: true }

  const owned = await deps.isOwnedProperty(targetPropertyId)
  if (!owned) {
    return { ok: false, error: 'You can only assign documents to properties you own.' }
  }

  // Only a genuine property CHANGE (assign-from-null included) needs the
  // linked-record check — matches app/page.tsx's existing Move / Refile
  // behavior exactly (DOCUMENT_LINK_CHECKS is the same imported list).
  const links = await deps.findLinkedRecords(doc.id)
  if (links.length) {
    return {
      ok: false,
      error: `Can't move this document to a different property — it's linked to ${links.join(', ')} on the current property. Unlink it there first, or leave this document filed where it is.`,
    }
  }

  const { error } = await deps.updateDocumentProperty(doc.id, targetPropertyId)
  if (error) {
    return { ok: false, error: "We couldn't update this document. Please try again." }
  }

  // Best-effort — mirrors the existing Move / Refile invariant
  // (document_analyses.property_id tracks its document's own) but a
  // failure here must never undo the already-successful reassignment
  // above or surface as an error to the user.
  try {
    await deps.updateAnalysisProperty(doc.id, targetPropertyId)
  } catch {
    // Swallowed deliberately — see comment above.
  }

  return { ok: true }
}

export { DOCUMENT_LINK_CHECKS }
