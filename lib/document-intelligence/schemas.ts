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
import { CONFIDENCE_LEVELS, DOCUMENT_TYPES, type DocumentType } from './types'

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
// Provider-facing schema. NOT a new data shape — a differently-ENCODED
// version of the exact same information, used only for the Anthropic
// structured-output request. Everything above this line is unchanged and
// remains the shape stored in the database, returned from the API route,
// and rendered by the UI.
//
// ---- INCIDENT 1 (union-parameter limit) ----
// Root cause: Anthropic's structured-output feature caps a schema at 16
// "parameters with union types" (nullable fields are encoded as
// `anyOf: [{type: X}, {type: "null"}]`, which counts as a union). The
// schema above has 36 — the 33 flat nullable fields on ApplyFieldsSchema
// plus confidence/sourcePage/sourceSnippet (3) on ExtractedFieldSchema —
// confirmed by generating the actual JSON Schema this app sends
// (zodOutputFormat(DocumentAnalysisSchema)) and counting real `anyOf`
// occurrences: exactly 36, matching Anthropic's reported count exactly.
//
// First fix attempt: `.nullable()` -> `.optional()` on those 36 fields.
// This took the union count from 36 to 0 (verified) and shipped — but see
// Incident 2 below, confirmed against a REAL production request, for why
// that wasn't the whole story.
//
// ---- INCIDENT 2 (optional-parameter limit — the actual production fix) ----
// One real production analysis after Incident 1 shipped, Anthropic still
// rejected the request: "Schemas contains too many optional parameters
// (36)...". Root cause, empirically confirmed against the real
// zodOutputFormat()/z.toJSONSchema() pipeline (see schemas.test.ts):
// Anthropic ALSO caps how many object properties may be absent from their
// parent's `required` array ("optional parameters") — a SEPARATE
// constraint from the union cap, and `.optional()` (no `.nullable()`)
// produces exactly that: a key omitted from `required`. The same 36
// fields that used to be unions are now exactly the 36 optional
// parameters Anthropic reported — an exact match again.
//
// The fix this time cannot be another blanket keyword swap (the task that
// produced this fix was explicit: do not just try nullable -> optional
// again) — it has to avoid BOTH constraints simultaneously. Every
// "may be unknown" field is now wrapped in `unknownableField()`: a
// REQUIRED nested object `{ value: <T>, identified: boolean }`. Because
// every key at every level of this wrapper is required (no `.optional()`
// anywhere in this schema) and no field is ever `.nullable()`, both the
// union count AND the optional-parameter count are 0 — verified against
// the real SDK pipeline in schemas.test.ts, the same way both prior counts
// were confirmed.
//
// This also happens to solve a problem neither prior fix addressed:
// `identified` is an independent boolean, never inferred from whether
// `value` looks empty/zero — so a genuinely-zero numeric value (an
// interest rate of 0%, say) can never be confused with "not found," and a
// real empty string can never be either. `.nullable()`/`.optional()` on a
// bare primitive could never make that distinction; this shape can.
//
// This is why a normalization step exists (normalize-analysis.ts): the
// model sends `{value, identified}` for these fields, not the internal
// schema's plain nullable value — normalize-analysis.ts converts
// `identified ? value : null` for every one of them, and the result is
// re-validated against the strict schemas above before this provider ever
// returns it. Runtime validation is not weakened by any of this: the
// exact same DocumentAnalysisSchema.parse() that would have run before
// still runs, just after normalization instead of directly on the raw
// model output.
// ============================================================================

/**
 * Wraps a value type that the model might not find in the document.
 * REQUIRED at every level (never `.optional()`, never `.nullable()`) so
 * this can never re-trigger either the union-parameter or the
 * optional-parameter limit, no matter how many fields use it — see the
 * file comment above for the two production incidents this shape fixes.
 */
function unknownableField<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({
    value: valueSchema,
    /** True when the model found and is reporting a real value in `value`. False means "not found" — `value` is then ignored (see normalize-analysis.ts) and must never be treated as a real, if unusual, value. */
    identified: z.boolean(),
  })
}

/** Provider-facing mirror of ExtractedFieldSchema — 0 unions, 0 optional parameters (was 3 unions, then 3 optional parameters). */
export const ProviderExtractedFieldSchema = z.object({
  label: z.string(),
  value: z.string(),
  confidence: unknownableField(z.enum(CONFIDENCE_LEVELS)),
  sourcePage: unknownableField(z.number().int()),
  sourceSnippet: unknownableField(z.string()),
})

/** Provider-facing mirror of FieldGroupSchema. */
export const ProviderFieldGroupSchema = z.object({
  title: z.string(),
  fields: z.array(ProviderExtractedFieldSchema),
})

/** Provider-facing mirror of ApplyFieldsSchema — 0 unions, 0 optional parameters (was 33 unions, then 33 optional parameters). */
export const ProviderApplyFieldsSchema = z.object({
  carrier: unknownableField(z.string()),
  policyNumber: unknownableField(z.string()),
  annualPremium: unknownableField(z.string()),
  deductible: unknownableField(z.string()),
  effectiveDate: unknownableField(z.string()),
  expirationDate: unknownableField(z.string()),
  lender: unknownableField(z.string()),
  loanNumber: unknownableField(z.string()),
  originalBalance: unknownableField(z.string()),
  currentBalance: unknownableField(z.string()),
  interestRate: unknownableField(z.string()),
  monthlyPayment: unknownableField(z.string()),
  escrowAmount: unknownableField(z.string()),
  loanTermYears: unknownableField(z.string()),
  maturityDate: unknownableField(z.string()),
  tenantName: unknownableField(z.string()),
  tenantEmail: unknownableField(z.string()),
  monthlyRent: unknownableField(z.string()),
  securityDeposit: unknownableField(z.string()),
  startDate: unknownableField(z.string()),
  endDate: unknownableField(z.string()),
  vendor: unknownableField(z.string()),
  description: unknownableField(z.string()),
  cost: unknownableField(z.string()),
  amount: unknownableField(z.string()),
  date: unknownableField(z.string()),
  category: unknownableField(z.string()),
  name: unknownableField(z.string()),
  businessName: unknownableField(z.string()),
  phone: unknownableField(z.string()),
  email: unknownableField(z.string()),
  website: unknownableField(z.string()),
  estimatedValue: unknownableField(z.string()),
})

/**
 * Provider-facing mirror of DocumentAnalysisSchema — 0 total unions (was
 * 36), 0 total optional parameters (was 36).
 *
 * ---- INCIDENT 3 (compiled grammar too large — why this is no longer sent) ----
 * A real production request that reached Anthropic with THIS exact schema
 * still failed: "The compiled grammar is too large... Simplify your tool
 * schemas or reduce the number of strict tools." Measured directly against
 * the real zodOutputFormat() pipeline (see schemas.test.ts): 8,008 bytes,
 * 41 nested objects, 122 total properties, all stemming from one universal
 * schema trying to hold every document type's fields (33 applyFields) PLUS
 * an open-ended `groups` array whose items are themselves an array of rich
 * 5-key objects (3 of them nested sentinel objects) — an unbounded array of
 * unbounded arrays of complex objects is exactly the shape that makes a
 * constrained-decoding grammar expensive to compile, independent of the
 * union/optional counts that were already both 0.
 *
 * This schema (and the Provider*FieldGroup/ExtractedField/ApplyFields
 * schemas above it) is kept defined ONLY as a regression anchor — proving
 * Incidents 1 and 2 stay fixed if anyone ever re-measures it — and is
 * asserted, by name, to no longer appear in providers/anthropic.ts's real
 * request (see schemas.test.ts's "Incident 3" describe block). Production
 * now sends one of the much smaller getProviderSchemaForDocumentType()
 * schemas below instead — see that section for the actual fix.
 */
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

// ============================================================================
// Document-type-specific provider schemas (Incident 3 fix — the actual
// architecture change). Instead of one universal schema with a slot for
// every document type's fields plus an open-ended `groups` array, each
// document type gets its OWN small schema containing only the fields that
// type actually uses — selected once, before the Anthropic call, from the
// document type PropRoster already knows (the user's chosen category, or
// the document's previously-stored classification — see
// analyze-request.ts's `requestedType`, unchanged by this fix). This is
// the same value already flowing through AnalyzeProviderInput.documentType
// today; no new plumbing was needed to reach it.
//
// Compactness choices, each directly targeting what made the universal
// schema's compiled grammar expensive (see the comment on
// ProviderDocumentAnalysisSchema above):
//   - No `groups` array. A document type's extraction fields are fixed,
//     named applyFields keys (a SUBSET of the existing 33 — reusing them,
//     never inventing new internal fields) — never an open-ended
//     model-authored array of arbitrary field objects.
//   - `importantNotes` replaces free-form grouped commentary (renewal
//     terms, coverage exclusions, inspection findings, HOA rules, etc.) as
//     one bounded array of short strings — still expressive, far cheaper
//     to compile than an array of rich objects.
//   - ONE shared `extractionConfidence` (not per-field confidence) and ONE
//     shared, bounded `sourceHighlights` array (not a wrapper object per
//     field) — ".max()" bounds are applied to every array in this section,
//     since an unbounded "repeat any number of times" is itself a real
//     grammar-compilation cost, independent of how simple each item is.
//   - Every "may be unknown" field still uses the SAME unknownableField()
//     wrapper Incident 2 established (required {value, identified}) — the
//     fix here is shrinking how many fields and how much array structure
//     exist per request, never reintroducing a union or an optional
//     parameter, both proven-safe mechanisms this deliberately keeps.
// ============================================================================

const APPLY_FIELD_KEYS = Object.keys(ApplyFieldsSchema.shape) as (keyof ApplyFields)[]

/** Every applyFields value is a plain string internally, so one wrapped-string schema per key covers all 33 — built once, reused by whichever document types include that key. */
const WRAPPED_APPLY_FIELD_SCHEMAS = Object.fromEntries(
  APPLY_FIELD_KEYS.map((key) => [key, unknownableField(z.string())])
) as Record<keyof ApplyFields, ReturnType<typeof unknownableField<z.ZodString>>>

/** Human-readable label for each applyFields key, used only to build the internal `groups` display (see normalize-analysis.ts) — never sent to Anthropic. */
export const APPLY_FIELD_LABELS: Record<keyof ApplyFields, string> = {
  carrier: 'Carrier', policyNumber: 'Policy Number', annualPremium: 'Annual Premium', deductible: 'Deductible', effectiveDate: 'Effective Date', expirationDate: 'Expiration Date',
  lender: 'Lender', loanNumber: 'Loan Number', originalBalance: 'Original Balance', currentBalance: 'Current Balance', interestRate: 'Interest Rate', monthlyPayment: 'Monthly Payment', escrowAmount: 'Escrow / Month', loanTermYears: 'Loan Term (years)', maturityDate: 'Maturity Date',
  tenantName: 'Tenant Name', tenantEmail: 'Tenant Email', monthlyRent: 'Monthly Rent', securityDeposit: 'Security Deposit', startDate: 'Start Date', endDate: 'End Date',
  vendor: 'Vendor', description: 'Description', cost: 'Cost', amount: 'Amount', date: 'Date', category: 'Category',
  name: 'Contact Name', businessName: 'Business Name', phone: 'Phone', email: 'Email', website: 'Website',
  estimatedValue: 'Estimated Value',
}

/**
 * Which of the 33 existing applyFields keys are relevant to each document
 * type — reused directly from the field partitioning already documented on
 * ApplyFieldsSchema above (Insurance/Mortgage/Lease/Invoice/Contact/
 * Appraisal groupings). Types with an empty list here never filled
 * applyFields before this fix either (Closing Disclosure, Inspection
 * Report, Property Tax Document, HOA Document, Other) — their content
 * lives in `importantNotes` instead, exactly as it did in the internal
 * `groups` free text before.
 */
export const DOCUMENT_TYPE_APPLY_FIELDS: Record<DocumentType, (keyof ApplyFields)[]> = {
  'Insurance Policy': ['carrier', 'policyNumber', 'annualPremium', 'deductible', 'effectiveDate', 'expirationDate'],
  Lease: ['tenantName', 'tenantEmail', 'monthlyRent', 'securityDeposit', 'startDate', 'endDate'],
  'Mortgage / Loan Statement': ['lender', 'loanNumber', 'originalBalance', 'currentBalance', 'interestRate', 'monthlyPayment', 'escrowAmount', 'loanTermYears', 'maturityDate'],
  'Closing Disclosure / Settlement Statement': [],
  'Inspection Report': [],
  Appraisal: ['estimatedValue', 'effectiveDate'],
  'Contractor Invoice / Receipt': ['vendor', 'description', 'cost', 'amount', 'date', 'category', 'name', 'businessName', 'phone', 'email', 'website'],
  'Property Tax Document': [],
  'HOA Document': [],
  Other: [],
}

const MAX_NOTES = 8
const MAX_REVIEW_ITEMS = 6
const MAX_SOURCE_HIGHLIGHTS = 8

function buildDocumentTypeProviderSchema(type: DocumentType) {
  const applyKeys = DOCUMENT_TYPE_APPLY_FIELDS[type]
  const applyFieldsShape = Object.fromEntries(applyKeys.map((key) => [key, WRAPPED_APPLY_FIELD_SCHEMAS[key]]))
  // 'general' is always a valid highlight target (a note not tied to a
  // specific named field) even for types with no applyFields at all —
  // z.enum requires at least one value, so this also guarantees that.
  const highlightFieldKeys = [...applyKeys, 'general'] as unknown as [string, ...string[]]

  return z.object({
    classification: z.object({
      documentType: z.enum(DOCUMENT_TYPES),
      confidence: z.enum(CONFIDENCE_LEVELS),
    }),
    overview: z.string(),
    summary: z.string(),
    /** One shared confidence for every extracted field/note in this analysis — see the file comment above for why this replaces per-field confidence. */
    extractionConfidence: z.enum(CONFIDENCE_LEVELS),
    /** Short, concise points not already captured by a named field — renewal terms, coverage exclusions, inspection findings, HOA rules, tax due dates, etc., depending on document type (see prompts.ts's per-type guidance). */
    importantNotes: z.array(z.string()).max(MAX_NOTES),
    itemsToReview: z.array(z.string()).max(MAX_REVIEW_ITEMS),
    missingOrUnclear: z.array(z.string()).max(MAX_REVIEW_ITEMS),
    sourceTraceabilityNote: z.string(),
    applyFields: z.object(applyFieldsShape),
    /** Bounded, optional-in-practice-but-required-in-schema page/snippet pointers, matched back to a named field (or 'general') by exact key — never fuzzy value matching. */
    sourceHighlights: z.array(
      z.object({
        field: z.enum(highlightFieldKeys),
        page: unknownableField(z.number().int()),
        snippet: unknownableField(z.string()),
      })
    ).max(MAX_SOURCE_HIGHLIGHTS),
  })
}

const PROVIDER_SCHEMA_BY_TYPE = Object.fromEntries(
  DOCUMENT_TYPES.map((type) => [type, buildDocumentTypeProviderSchema(type)])
) as Record<DocumentType, ReturnType<typeof buildDocumentTypeProviderSchema>>

/**
 * The ONE place that decides which small, document-type-specific schema
 * goes to Anthropic (Part 3 — "do not scatter switch statements
 * throughout the codebase"). Falls back to the 'Other' schema for any
 * unrecognized type rather than throwing — callers already resolve a
 * valid DocumentType before this point (analyze-request.ts's
 * `requestedType` defaults to 'Other'), so this fallback is defense in
 * depth, not the primary mechanism.
 */
export function getProviderSchemaForDocumentType(type: DocumentType) {
  return PROVIDER_SCHEMA_BY_TYPE[type] ?? PROVIDER_SCHEMA_BY_TYPE.Other
}

export type ProviderTypeSpecificOutput = z.infer<ReturnType<typeof buildDocumentTypeProviderSchema>>
