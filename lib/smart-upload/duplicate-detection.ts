// PropRoster — Smart Import V1: conservative duplicate detection.
//
// Historical imports create a real duplicate risk (the same insurance
// policy or receipt scanned twice, or already living in PropRoster from
// an earlier normal upload). This is deliberately NOT another AI call —
// two cheap, honest signals only:
//
// 1. File signature: an incoming file's name + byte size exactly match
//    an existing document already owned by this user. Cheap, no
//    network/hash cost beyond what's already loaded, and a real signal —
//    two files with the same name AND the same exact size are very
//    likely the same scan.
// 2. Receipt signature: for a document Smart Import classified as a
//    receipt/invoice, its extracted vendor + date + amount matching an
//    existing financial_transaction is a real (if weaker) signal that
//    this exact expense was already recorded — offered only as a
//    warning, never used to block or auto-skip anything.
//
// Never deletes or merges anything — see review-kind's sibling flow in
// components/SmartImport/ for how a flagged item is shown "Possible
// duplicate" with Keep / Skip, always the user's call.

export type FileDuplicateCandidate = { name: string; size: number }
export type ExistingDocumentSignature = { id: string; name: string; size_bytes: number }

/** Exact filename + exact byte size match against the caller's own already-loaded documents. Null when nothing matches — never a fuzzy/partial match. */
export function findFileDuplicate(candidate: FileDuplicateCandidate, existing: ExistingDocumentSignature[]): ExistingDocumentSignature | null {
  if (!candidate.name || !candidate.size) return null
  return existing.find((d) => d.name === candidate.name && d.size_bytes === candidate.size) || null
}

export type ReceiptDuplicateCandidate = { vendor: string | null; date: string | null; amount: number | null }
export type ExistingTransactionSignature = { id: string; vendor: string | null; transaction_date: string; amount: number }

/** Vendor (case/whitespace-insensitive) + exact date + amount (within a cent) match against the caller's own already-loaded transactions. Only meaningful once all three fields are present — a document missing any of them never produces a false "duplicate." */
export function findReceiptDuplicate(candidate: ReceiptDuplicateCandidate, existing: ExistingTransactionSignature[]): ExistingTransactionSignature | null {
  if (!candidate.vendor || !candidate.date || candidate.amount == null || !Number.isFinite(candidate.amount)) return null
  const vendorNorm = candidate.vendor.trim().toLowerCase()
  if (!vendorNorm) return null
  // Compare in whole cents (rounded), not raw floating-point dollars —
  // avoids both false negatives from binary-float rounding noise on an
  // exact match and false positives from a same-cent-difference amount
  // (e.g. 184.73 vs 184.72) that Math.abs(...) < 0.01 could wrongly let through.
  const candidateCents = Math.round((candidate.amount as number) * 100)
  return existing.find((t) => (t.vendor || '').trim().toLowerCase() === vendorNorm
    && t.transaction_date === candidate.date
    && Math.round(t.amount * 100) === candidateCents) || null
}

export type DuplicateWarning = { reason: string; existingId: string; existingLabel: string }

/** Combines both signals into the one warning the review queue shows, preferring the stronger file-signature match when both happen to fire. */
export function detectDuplicate(
  file: FileDuplicateCandidate,
  receipt: ReceiptDuplicateCandidate,
  existingDocs: ExistingDocumentSignature[],
  existingTransactions: ExistingTransactionSignature[],
): DuplicateWarning | null {
  const fileMatch = findFileDuplicate(file, existingDocs)
  if (fileMatch) return { reason: 'Same filename and file size as an existing document.', existingId: fileMatch.id, existingLabel: fileMatch.name }
  const receiptMatch = findReceiptDuplicate(receipt, existingTransactions)
  if (receiptMatch) return { reason: `Matches an existing ${receiptMatch.vendor || 'expense'} transaction on ${receiptMatch.transaction_date} for the same amount.`, existingId: receiptMatch.id, existingLabel: receiptMatch.vendor || 'Existing transaction' }
  return null
}
