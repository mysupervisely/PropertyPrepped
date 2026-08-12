// PropPrepped Milestone 8: structured extraction schema.
//
// One uniform shape covers every supported document type (Section D). The
// *prompt* (prompts.ts) tells the model which fields matter for a given
// document type; this schema just constrains the shape of whatever it finds,
// so the UI never has to branch on document type to render a result and the
// AI can never return unconstrained prose instead of structured data.
//
// Built with Zod so the same definition is (a) the runtime validator the
// Anthropic SDK's structured-outputs feature validates against, and (b) the
// source of the TypeScript types below — one definition, not two to keep in sync.

// The Anthropic SDK's zodOutputFormat() helper (used in providers/anthropic.ts)
// is built against the Zod v4 API (it calls z.toJSONSchema, a v4-only
// function) even though the installed package is zod@3.25+, which ships v4
// under this subpath as a transitional bridge. Import from 'zod/v4'
// everywhere in this file so the schema types line up with what the helper
// expects — importing plain 'zod' here would be a type mismatch.
import { z } from 'zod/v4'
import { CONFIDENCE_LEVELS, DOCUMENT_TYPES } from './types'

/**
 * One extracted fact, always carrying a confidence level and a source
 * pointer (Sections L, M).
 *
 * Source traceability note: sourcePage/sourceSnippet are the model's own
 * self-reported recall of where it saw a value in the uploaded PDF — a
 * prompted best-effort pointer (see prompts.ts), NOT Anthropic's built-in
 * citations feature. This provider uses structured outputs
 * (output_config.format) for the whole extraction shape, which is not
 * currently combinable with citations grounding — see the design note atop
 * providers/anthropic.ts for why, and for the future path if citations are
 * ever added. Treat these fields everywhere downstream (API responses, DB
 * storage, UI) as "AI-extracted references to verify against the source
 * document," never as guaranteed/audited citations.
 */
export const ExtractedFieldSchema = z.object({
  label: z.string(),
  /** Display-ready text, e.g. "$425,000" or "Not identified in the uploaded document". Never omitted. */
  value: z.string(),
  confidence: z.enum(CONFIDENCE_LEVELS).nullable(),
  /** 1-indexed page number, only when the model is confident which page it came from. Self-reported by the model — never fabricated, but also never independently verified. Always show as a reference to check, not a guaranteed citation. */
  sourcePage: z.number().int().nullable(),
  /** A short verbatim-ish snippet supporting the value, when practical to include. Same caveat as sourcePage — an aid for manual verification, not a proven quote. */
  sourceSnippet: z.string().nullable(),
})

/** A themed section of the intelligence view — "Key Details", "Important Dates", "Coverage", etc. */
export const FieldGroupSchema = z.object({
  title: z.string(),
  fields: z.array(ExtractedFieldSchema),
})

/**
 * Flat, well-known fields used to pre-fill PropPrepped's existing Lease /
 * Mortgage / Insurance / Maintenance / Financials / Contacts / Property-edit
 * forms (Section O). Field names intentionally match those forms' own draft
 * state so applying a value is a plain object spread, not a mapping layer.
 * Numbers are plain digit strings (no "$", no ","); dates are YYYY-MM-DD.
 * Everything is optional — a document that doesn't mention a field leaves it null.
 */
export const ApplyFieldsSchema = z.object({
  // Insurance
  carrier: z.string().nullable(),
  policyNumber: z.string().nullable(),
  annualPremium: z.string().nullable(),
  deductible: z.string().nullable(),
  effectiveDate: z.string().nullable(),
  expirationDate: z.string().nullable(),
  // Mortgage
  lender: z.string().nullable(),
  loanNumber: z.string().nullable(),
  originalBalance: z.string().nullable(),
  currentBalance: z.string().nullable(),
  interestRate: z.string().nullable(),
  monthlyPayment: z.string().nullable(),
  escrowAmount: z.string().nullable(),
  loanTermYears: z.string().nullable(),
  maturityDate: z.string().nullable(),
  // Lease
  tenantName: z.string().nullable(),
  tenantEmail: z.string().nullable(),
  monthlyRent: z.string().nullable(),
  securityDeposit: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  // Invoice → Maintenance / Financial expense
  vendor: z.string().nullable(),
  description: z.string().nullable(),
  cost: z.string().nullable(),
  amount: z.string().nullable(),
  date: z.string().nullable(),
  category: z.string().nullable(),
  // Invoice → Contact
  name: z.string().nullable(),
  businessName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  // Appraisal → Property
  estimatedValue: z.string().nullable(),
})

export const DocumentAnalysisSchema = z.object({
  classification: z.object({
    documentType: z.enum(DOCUMENT_TYPES),
    confidence: z.enum(CONFIDENCE_LEVELS),
  }),
  /** One or two sentences — the TL;DR shown at the top of the intelligence view. */
  overview: z.string(),
  /** The full plain-English summary (Section E: "easy for a normal property owner to understand"). */
  summary: z.string(),
  groups: z.array(FieldGroupSchema),
  itemsToReview: z.array(z.string()),
  missingOrUnclear: z.array(z.string()),
  /** e.g. "Page references reflect the uploaded PDF." or "Page-level references were not available for this document." */
  sourceTraceabilityNote: z.string(),
  applyFields: ApplyFieldsSchema,
})

export type ExtractedField = z.infer<typeof ExtractedFieldSchema>
export type FieldGroup = z.infer<typeof FieldGroupSchema>
export type ApplyFields = z.infer<typeof ApplyFieldsSchema>
export type DocumentAnalysisOutput = z.infer<typeof DocumentAnalysisSchema>
