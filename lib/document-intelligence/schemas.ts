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

// ============================================================================
// Provider-facing schema (production-hardening pass, Section: schema/union
// limit). NOT a new data shape — a differently-ENCODED version of the exact
// same information, used only for the Anthropic structured-output request.
// Everything above this line is unchanged and remains the shape stored in
// the database, returned from the API route, and rendered by the UI.
//
// Root cause this fixes: Anthropic's structured-output feature caps a
// schema at 16 "parameters with union types" (nullable fields are encoded
// as `anyOf: [{type: X}, {type: "null"}]`, which counts as a union). The
// schema above has 36 — the 33 flat nullable fields on ApplyFieldsSchema
// plus confidence/sourcePage/sourceSnippet (3) on ExtractedFieldSchema —
// confirmed by generating the actual JSON Schema this app sends
// (zodOutputFormat(DocumentAnalysisSchema)) and counting real `anyOf`
// occurrences: exactly 36, matching Anthropic's reported count exactly.
//
// The fix is a pure encoding change, not a data-model change:
// `.nullable()` (value present, possibly `null`) becomes `.optional()`
// (key may be absent entirely) on every field that was nullable.
// Empirically verified (against the exact zodOutputFormat()/z.toJSONSchema()
// pipeline this codebase uses) that `.optional()` alone — without
// `.nullable()` — produces a plain `{"type": "..."}` schema with NO `anyOf`
// and the key simply omitted from `required`; it does not count toward
// Anthropic's union limit at all. Applying this below takes the count from
// 36 to 0 — full headroom under the limit of 16, not a bare pass.
//
// This is why a normalization step exists (normalize-analysis.ts): the
// model may now OMIT a key instead of sending it as explicit `null`, so the
// raw parsed output is not yet a valid DocumentAnalysisOutput — it's
// converted (missing key -> null) and then re-validated against the
// strict schemas above before this provider ever returns it. Runtime
// validation is not weakened by any of this: the exact same
// DocumentAnalysisSchema.parse() that would have run before still runs,
// just after normalization instead of directly on the raw model output.
// ============================================================================

/** Provider-facing mirror of ExtractedFieldSchema — 0 unions instead of 3. */
export const ProviderExtractedFieldSchema = z.object({
  label: z.string(),
  value: z.string(),
  confidence: z.enum(CONFIDENCE_LEVELS).optional(),
  sourcePage: z.number().int().optional(),
  sourceSnippet: z.string().optional(),
})

/** Provider-facing mirror of FieldGroupSchema. */
export const ProviderFieldGroupSchema = z.object({
  title: z.string(),
  fields: z.array(ProviderExtractedFieldSchema),
})

/** Provider-facing mirror of ApplyFieldsSchema — 0 unions instead of 33. */
export const ProviderApplyFieldsSchema = z.object({
  carrier: z.string().optional(),
  policyNumber: z.string().optional(),
  annualPremium: z.string().optional(),
  deductible: z.string().optional(),
  effectiveDate: z.string().optional(),
  expirationDate: z.string().optional(),
  lender: z.string().optional(),
  loanNumber: z.string().optional(),
  originalBalance: z.string().optional(),
  currentBalance: z.string().optional(),
  interestRate: z.string().optional(),
  monthlyPayment: z.string().optional(),
  escrowAmount: z.string().optional(),
  loanTermYears: z.string().optional(),
  maturityDate: z.string().optional(),
  tenantName: z.string().optional(),
  tenantEmail: z.string().optional(),
  monthlyRent: z.string().optional(),
  securityDeposit: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  vendor: z.string().optional(),
  description: z.string().optional(),
  cost: z.string().optional(),
  amount: z.string().optional(),
  date: z.string().optional(),
  category: z.string().optional(),
  name: z.string().optional(),
  businessName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  estimatedValue: z.string().optional(),
})

/** Provider-facing mirror of DocumentAnalysisSchema — 0 total unions (was 36). */
export const ProviderDocumentAnalysisSchema = z.object({
  classification: z.object({
    documentType: z.enum(DOCUMENT_TYPES),
    confidence: z.enum(CONFIDENCE_LEVELS),
  }),
  overview: z.string(),
  summary: z.string(),
  groups: z.array(ProviderFieldGroupSchema),
  itemsToReview: z.array(z.string()),
  missingOrUnclear: z.array(z.string()),
  sourceTraceabilityNote: z.string(),
  applyFields: ProviderApplyFieldsSchema,
})

export type ProviderExtractedField = z.infer<typeof ProviderExtractedFieldSchema>
export type ProviderFieldGroup = z.infer<typeof ProviderFieldGroupSchema>
export type ProviderApplyFields = z.infer<typeof ProviderApplyFieldsSchema>
export type ProviderDocumentAnalysisOutput = z.infer<typeof ProviderDocumentAnalysisSchema>
