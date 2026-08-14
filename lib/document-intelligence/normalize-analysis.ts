// PropPrepped Milestone 8 (production-hardening pass): converts the
// provider-facing analysis shape (schemas.ts's Provider* schemas — every
// "may be unknown" field is a required `{ value, identified }` object,
// never a bare nullable/optional value — see schemas.ts's file comment for
// the two production incidents that shape fixes) into PropRoster's
// existing internal DocumentAnalysisOutput shape (fields are always
// PRESENT, `null` when unknown) that the rest of the app already stores,
// returns, and renders.
//
// The conversion rule is the same for all 36 wrapped fields:
// `identified ? value : null`. `identified` is what's authoritative — a
// real zero-like value (e.g. an interest rate of 0%) with identified:true
// survives normalization unchanged, and identified:false always becomes
// null regardless of whatever placeholder happens to be in `value`, so
// "found" and "not found" can never be confused with each other.
//
// Deliberately pure (object in, object out) — no Zod parsing here, no
// network, no Anthropic SDK import — so it's trivially unit-testable and
// so the responsibility split stays clear: this function only ever
// RESHAPES data; providers/anthropic.ts is the one place that actually
// validates the result against the strict internal schema
// (DocumentAnalysisSchema.parse()) before returning it. Never trust
// arbitrary model output as final just because it matched the
// provider-facing schema — that's exactly why the strict re-validation
// step exists downstream of this function, not instead of it.

import type {
  ApplyFields,
  DocumentAnalysisOutput,
  ExtractedField,
  FieldGroup,
  ProviderApplyFields,
  ProviderDocumentAnalysisOutput,
  ProviderExtractedField,
  ProviderFieldGroup,
} from './schemas'

/** `identified ? value : null` — the one rule every wrapped field follows. */
function unwrap<T>(field: { value: T; identified: boolean }): T | null {
  return field.identified ? field.value : null
}

function normalizeExtractedField(raw: ProviderExtractedField): ExtractedField {
  return {
    label: raw.label,
    value: raw.value,
    confidence: unwrap(raw.confidence),
    sourcePage: unwrap(raw.sourcePage),
    sourceSnippet: unwrap(raw.sourceSnippet),
  }
}

function normalizeFieldGroup(raw: ProviderFieldGroup): FieldGroup {
  return {
    title: raw.title,
    fields: raw.fields.map(normalizeExtractedField),
  }
}

// One line per ApplyFields key, `unwrap(raw.key)` — deliberately explicit
// (not a generic loop over Object.keys) so TypeScript catches a missing or
// misspelled field at compile time if ApplyFieldsSchema/ProviderApplyFieldsSchema
// ever drift apart, rather than silently dropping a field at runtime.
function normalizeApplyFields(raw: ProviderApplyFields): ApplyFields {
  return {
    carrier: unwrap(raw.carrier),
    policyNumber: unwrap(raw.policyNumber),
    annualPremium: unwrap(raw.annualPremium),
    deductible: unwrap(raw.deductible),
    effectiveDate: unwrap(raw.effectiveDate),
    expirationDate: unwrap(raw.expirationDate),
    lender: unwrap(raw.lender),
    loanNumber: unwrap(raw.loanNumber),
    originalBalance: unwrap(raw.originalBalance),
    currentBalance: unwrap(raw.currentBalance),
    interestRate: unwrap(raw.interestRate),
    monthlyPayment: unwrap(raw.monthlyPayment),
    escrowAmount: unwrap(raw.escrowAmount),
    loanTermYears: unwrap(raw.loanTermYears),
    maturityDate: unwrap(raw.maturityDate),
    tenantName: unwrap(raw.tenantName),
    tenantEmail: unwrap(raw.tenantEmail),
    monthlyRent: unwrap(raw.monthlyRent),
    securityDeposit: unwrap(raw.securityDeposit),
    startDate: unwrap(raw.startDate),
    endDate: unwrap(raw.endDate),
    vendor: unwrap(raw.vendor),
    description: unwrap(raw.description),
    cost: unwrap(raw.cost),
    amount: unwrap(raw.amount),
    date: unwrap(raw.date),
    category: unwrap(raw.category),
    name: unwrap(raw.name),
    businessName: unwrap(raw.businessName),
    phone: unwrap(raw.phone),
    email: unwrap(raw.email),
    website: unwrap(raw.website),
    estimatedValue: unwrap(raw.estimatedValue),
  }
}

/**
 * Converts a provider-facing analysis (every "may be unknown" field is a
 * required `{ value, identified }` object) into PropRoster's internal
 * shape (fields always present, `null` when unknown) — the exact shape
 * every other part of the app already expects. No information is lost:
 * `identified: false` and "internal null" mean the same thing here ("not
 * identified in this document"), just encoded differently on the wire to
 * Anthropic.
 */
export function normalizeProviderAnalysis(raw: ProviderDocumentAnalysisOutput): DocumentAnalysisOutput {
  return {
    classification: raw.classification,
    overview: raw.overview,
    summary: raw.summary,
    groups: raw.groups.map(normalizeFieldGroup),
    itemsToReview: raw.itemsToReview,
    missingOrUnclear: raw.missingOrUnclear,
    sourceTraceabilityNote: raw.sourceTraceabilityNote,
    applyFields: normalizeApplyFields(raw.applyFields),
  }
}
