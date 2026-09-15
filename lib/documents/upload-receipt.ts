// PropRoster — Tax Center: usability/workflow-completion pass.
//
// The ONE place "upload a new receipt and get back a document_id to
// attach" lives, used by both the new Tax Center "+ Add Expense" flow
// (app/tax-center/page.tsx) and PropertyTaxPanel's custom-item form
// (components/property-profile/PropertyTaxPanel.tsx) — closing the
// receipt gap this milestone's own audit found: a custom/manual expense
// could only attach an ALREADY-uploaded document via a dropdown, never
// capture/upload a new one inline as part of adding the expense itself.
//
// Reuses the EXACT canonical document architecture app/page.tsx's own
// addDocumentFiles() already established — same property-documents
// bucket, same property_documents table/columns, same MIME-correction
// fix (lib/uploads/image-file.ts's resolveImageContentType/
// toUploadableImageFile — the confirmed root cause: @supabase/storage-js
// reads a File's own .type directly, never the `contentType` option, so
// an iOS-picked photo with an empty reported type must be corrected ON
// the File object itself before upload). No new bucket, no new table,
// no second upload system — every receipt lands in the SAME
// property_documents rows the Documents page, Smart Upload, and every
// existing "Attach document" dropdown already read from, tagged with
// the existing 'Receipts' category.
//
// Ports-and-adapters shape (same convention as lib/documents/reassign.ts
// and lib/billing/webhook-handlers.ts): pure orchestration logic here,
// injected async deps — the real adapters (the two call sites above)
// wire the actual Supabase Storage/table calls; tests wire fakes.

import { resolveImageContentType, toUploadableImageFile } from '../uploads/image-file'

function safeReceiptName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export type ReceiptUploadResult = { ok: true; documentId: string } | { ok: false; error: string }

export type UploadReceiptDeps = {
  /** The one Storage write — same property-documents bucket every other document upload in this app already uses. */
  uploadFile: (path: string, file: File, contentType: string | undefined) => Promise<{ error: string | null }>
  /** The one property_documents insert — returns the new row's id (or an error, never both). */
  insertDocumentRow: (row: {
    owner_id: string
    property_id: string
    name: string
    category: 'Receipts'
    storage_path: string
    size_bytes: number
    mime_type: string | null
  }) => Promise<{ id: string | null; error: string | null }>
  /** Best-effort cleanup of an orphaned Storage object if the DB insert fails after a successful upload — same pattern addDocumentFiles()/addPhotoFiles() already use. */
  removeFile: (path: string) => Promise<void>
}

/**
 * Uploads one receipt file for the given property, tagged 'Receipts',
 * and returns its new property_documents id. `file` should already be
 * the durable, in-memory-backed File produced by
 * lib/uploads/durable-file.ts's toDurableUploadableFile() — this
 * function does not itself re-read picker-tied bytes, matching every
 * other upload path in this app.
 */
export async function uploadReceiptDocument(
  ownerId: string,
  propertyId: string,
  file: File,
  deps: UploadReceiptDeps,
): Promise<ReceiptUploadResult> {
  const looksLikeImage = file.type.startsWith('image/') || (!file.type && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))
  const contentType = looksLikeImage ? resolveImageContentType(file) : file.type || undefined
  const uploadable = looksLikeImage ? toUploadableImageFile(file, contentType) : file

  const path = `${ownerId}/${propertyId}/documents/${crypto.randomUUID()}-${safeReceiptName(file.name)}`
  const { error: uploadError } = await deps.uploadFile(path, uploadable, contentType)
  if (uploadError) return { ok: false, error: uploadError }

  const { id, error: rowError } = await deps.insertDocumentRow({
    owner_id: ownerId,
    property_id: propertyId,
    name: file.name,
    category: 'Receipts',
    storage_path: path,
    size_bytes: uploadable.size,
    mime_type: uploadable.type || null,
  })
  if (rowError || !id) {
    // Storage succeeded but the DB row failed — clean up the now-
    // orphaned object rather than leaving an unreferenced file behind.
    await deps.removeFile(path)
    return { ok: false, error: rowError || 'Could not save the receipt record.' }
  }
  return { ok: true, documentId: id }
}
