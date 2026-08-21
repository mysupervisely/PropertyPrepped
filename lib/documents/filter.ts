// PropRoster — Documents + Navigation + Realtor Connect Polish.
//
// Pure filtering/labeling helpers for the Documents library page
// (Section 2). No Supabase, no React — app/documents/page.tsx passes in
// the rows it already loaded (RLS already scoped them to the caller's
// own documents/properties; this module never re-checks ownership,
// that's the database's job).

export type DocumentFilter = 'All' | 'Unassigned' | 'Assigned'

export type LibraryDocument = {
  id: string
  property_id: string | null
  name: string
  category: string
  created_at: string
}

/** Newest first, then filtered by assignment status. Filtering never mutates the input array. */
export function filterDocuments<T extends { property_id: string | null }>(docs: T[], filter: DocumentFilter): T[] {
  if (filter === 'Unassigned') return docs.filter((d) => d.property_id === null)
  if (filter === 'Assigned') return docs.filter((d) => d.property_id !== null)
  return docs
}

export function sortDocumentsNewestFirst<T extends { created_at: string }>(docs: T[]): T[] {
  return [...docs].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

/** The address label to show for a document's associated property, or null when unassigned — callers render their own "Unassigned" badge for null rather than this module inventing UI copy. */
export function propertyLabelFor(propertyId: string | null, propertyLabelById: Map<string, string>): string | null {
  if (!propertyId) return null
  return propertyLabelById.get(propertyId) || null
}
