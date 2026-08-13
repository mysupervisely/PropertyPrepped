// PropRoster Milestone 8 (production-hardening pass): converts the
// provider-facing analysis shape (schemas.ts's Provider* schemas — fields
// are OMITTED when unknown, never nullable) into PropRoster's existing
// internal DocumentAnalysisOutput shape (fields are always PRESENT, `null`
// when unknown) that the rest of the app already stores, returns, and
// renders.
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

function normalizeExtractedField(raw: ProviderExtractedField): ExtractedField {
  return {
    label: raw.label,
    value: raw.value,
    confidence: raw.confidence ?? null,
    sourcePage: raw.sourcePage ?? null,
    sourceSnippet: raw.sourceSnippet ?? null,
  }
}

function normalizeFieldGroup(raw: ProviderFieldGroup): FieldGroup {
  return {
    title: raw.title,
    fields: raw.fields.map(normalizeExtractedField),
  }
}

// One line per ApplyFields key, `raw.key ?? null` — deliberately explicit
// (not a generic loop over Object.keys) so TypeScript catches a missing or
// misspelled field at compile time if ApplyFieldsSchema/ProviderApplyFieldsSchema
// ever drift apart, rather than silently dropping a field at runtime.
function normalizeApplyFields(raw: ProviderApplyFields): ApplyFields {
  return {
    carrier: raw.carrier ?? null,
    policyNumber: raw.policyNumber ?? null,
    annualPremium: raw.annualPremium ?? null,
    deductible: raw.deductible ?? null,
    effectiveDate: raw.effectiveDate ?? null,
    expirationDate: raw.expirationDate ?? null,
    lender: raw.lender ?? null,
    loanNumber: raw.loanNumber ?? null,
    originalBalance: raw.originalBalance ?? null,
    currentBalance: raw.currentBalance ?? null,
    interestRate: raw.interestRate ?? null,
    monthlyPayment: raw.monthlyPayment ?? null,
    escrowAmount: raw.escrowAmount ?? null,
    loanTermYears: raw.loanTermYears ?? null,
    maturityDate: raw.maturityDate ?? null,
    tenantName: raw.tenantName ?? null,
    tenantEmail: raw.tenantEmail ?? null,
    monthlyRent: raw.monthlyRent ?? null,
    securityDeposit: raw.securityDeposit ?? null,
    startDate: raw.startDate ?? null,
    endDate: raw.endDate ?? null,
    vendor: raw.vendor ?? null,
    description: raw.description ?? null,
    cost: raw.cost ?? null,
    amount: raw.amount ?? null,
    date: raw.date ?? null,
    category: raw.category ?? null,
    name: raw.name ?? null,
    businessName: raw.businessName ?? null,
    phone: raw.phone ?? null,
    email: raw.email ?? null,
    website: raw.website ?? null,
    estimatedValue: raw.estimatedValue ?? null,
  }
}

/**
 * Converts a provider-facing analysis (fields omitted when unknown) into
 * PropRoster's internal shape (fields always present, `null` when
 * unknown) — the exact shape every other part of the app already expects.
 * No information is lost: "omitted" and "explicit null" mean the same
 * thing here ("not identified in this document"), just encoded
 * differently on the wire to Anthropic.
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
