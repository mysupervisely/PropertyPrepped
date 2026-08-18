// PropRoster — Smart Upload Foundation: the ONE document type guess sent
// with the automatic first analysis (Part 7 — exactly one AI call per
// upload, so this has to be decided up front, not refined by a second
// call). Document Intelligence's per-type schemas are intentionally
// narrow (see schemas.ts's "Incident 3" history) — only the fields the
// REQUESTED type includes come back usable, regardless of what the
// model's own classification says. A photo capture is overwhelmingly a
// receipt/invoice in real-world use (Part 10's named priority V1 case),
// so images request the Receipt schema; a PDF could reasonably be
// anything, so it requests 'Other' — the safe generic schema that still
// returns propertyAddress (for matching) and an honest self-reported
// classification, even though it won't extract lease/insurance/receipt-
// specific fields on this first pass. Documented as a real, known
// limitation in the completion report, not hidden.

import type { DocumentType } from '../document-intelligence/types'

export function guessDocumentType(mimeType: string): DocumentType {
  return mimeType.startsWith('image/') ? 'Contractor Invoice / Receipt' : 'Other'
}
