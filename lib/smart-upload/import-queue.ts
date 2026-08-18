// PropRoster — Smart Import V1: pure review-queue logic (status
// derivation, progress summary, grouping). No Supabase/React here —
// exactly the same "pure logic lives in lib/, Supabase calls live in the
// component" split every other Smart Upload module already uses.

export type ImportRawStatus = 'Uploading' | 'Analyzing' | 'Ready' | 'Failed' | 'Unsupported'

export type ImportItemForStatus = {
  status: ImportRawStatus
  confirmedPropertyId: string | null
  completedAt: string | null
  possibleDuplicateDismissed: boolean
  hasPossibleDuplicate: boolean
}

// The queue states item 6 asks for. "Ready to save/apply" is
// deliberately not a separate persisted status here — it's the same
// underlying item as "Ready to review," shown once the user opens it and
// sees the existing ReceiptReview/PrepareOnlyReview Save action (Smart
// Upload's own review screens, reused as-is); inventing a second stored
// status for the same underlying state would be exactly the kind of
// unnecessary state machinery this milestone's "do not build an
// enterprise document-management interface" guidance warns against.
export type ImportDisplayStatus = 'Uploading' | 'Analyzing' | 'Needs attention' | 'Needs property' | 'Ready to review' | 'Completed' | 'Failed'

/** Derives the one status a review-queue row shows from the item's actual fields — never a second source of truth that could drift from them. */
export function deriveImportStatus(item: ImportItemForStatus): ImportDisplayStatus {
  if (item.completedAt) return 'Completed'
  if (item.status === 'Failed' || item.status === 'Unsupported') return 'Failed'
  if (item.status === 'Uploading') return 'Uploading'
  if (item.status === 'Analyzing') return 'Analyzing'
  // status === 'Ready': analysis succeeded.
  if (item.hasPossibleDuplicate && !item.possibleDuplicateDismissed) return 'Needs attention'
  if (!item.confirmedPropertyId) return 'Needs property'
  return 'Ready to review'
}

export type ImportProgressSummary = {
  total: number
  analyzed: number // Ready, Needs attention, Needs property, Ready to review, or Completed — analysis has actually finished
  readyToReview: number
  needsAttention: number
  needsProperty: number
  completed: number
  failed: number
}

/** The simple batch progress line item 11 asks for ("12 of 20 analyzed, 5 ready to review, 2 need attention, 1 failed"). */
export function summarizeImportProgress(statuses: ImportDisplayStatus[]): ImportProgressSummary {
  const total = statuses.length
  const count = (s: ImportDisplayStatus) => statuses.filter((x) => x === s).length
  const failed = count('Failed')
  const completed = count('Completed')
  const readyToReview = count('Ready to review')
  const needsAttention = count('Needs attention')
  const needsProperty = count('Needs property')
  const uploadingOrAnalyzing = count('Uploading') + count('Analyzing')
  // "Analyzed" means the analysis step has finished one way or another —
  // matches item 11's own example (12 of 20 analyzed = 20 total minus 3
  // still Uploading minus 5 still Analyzing), so a Failed item still
  // counts as "analyzed" (attempted, not still in flight), same as
  // Ready-to-review/Needs-attention/Needs-property/Completed do.
  return {
    total,
    analyzed: total - uploadingOrAnalyzing,
    readyToReview,
    needsAttention,
    needsProperty,
    completed,
    failed,
  }
}

export type GroupableImportItem = { id: string; confirmedPropertyId: string | null; documentType?: string }

/** Groups items by their confirmed property (or "Unassigned" for anything not yet confirmed) — item 6's "By property" filter. */
export function groupImportItemsByProperty<T extends GroupableImportItem>(items: T[]): { propertyId: string | null; items: T[] }[] {
  const groups = new Map<string | null, T[]>()
  for (const item of items) {
    const key = item.confirmedPropertyId
    const bucket = groups.get(key) || []
    bucket.push(item)
    groups.set(key, bucket)
  }
  return Array.from(groups.entries()).map(([propertyId, groupItems]) => ({ propertyId, items: groupItems }))
}

/** Groups items by document type (or "Unclassified") — item 6's "By document type" filter. */
export function groupImportItemsByDocumentType<T extends GroupableImportItem>(items: T[]): { documentType: string; items: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = item.documentType || 'Unclassified'
    const bucket = groups.get(key) || []
    bucket.push(item)
    groups.set(key, bucket)
  }
  return Array.from(groups.entries()).map(([documentType, groupItems]) => ({ documentType, items: groupItems }))
}
