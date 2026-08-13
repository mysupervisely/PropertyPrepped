// PropPrepped Milestone 8: AI Document Intelligence — shared vocabulary.
//
// Nothing in this file talks to Supabase, Next.js, or any AI provider — it's
// the vocabulary every other module (schemas, prompts, providers, API route,
// UI) shares, so the document-type list and status machine only exist once.

export const DOCUMENT_TYPES = [
  'Insurance Policy',
  'Lease',
  'Mortgage / Loan Statement',
  'Closing Disclosure / Settlement Statement',
  'Inspection Report',
  'Appraisal',
  'Contractor Invoice / Receipt',
  'Property Tax Document',
  'HOA Document',
  'Other',
] as const

export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === 'string' && (DOCUMENT_TYPES as readonly string[]).includes(value)
}

// Not Analyzed → Processing → Completed | Failed. "Queued" is reserved for a
// future async/batch pipeline — the current implementation is a synchronous
// request/response, so it goes straight from Not Analyzed to Processing.
export const ANALYSIS_STATUSES = ['Not Analyzed', 'Queued', 'Processing', 'Completed', 'Failed'] as const
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number]

export const CLASSIFICATION_SOURCES = ['User', 'AI'] as const
export type ClassificationSource = (typeof CLASSIFICATION_SOURCES)[number]

export const CONFIDENCE_LEVELS = ['High', 'Medium', 'Low'] as const
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number]
