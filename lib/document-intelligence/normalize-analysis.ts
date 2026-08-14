// PropPrepped Milestone 8 (Incident 3 fix — document-type-specific provider
// schemas): converts a document-type-specific provider response
// (schemas.ts's getProviderSchemaForDocumentType() output — a small,
// named-field shape that varies per document type) into PropRoster's
// existing UNIVERSAL internal DocumentAnalysisOutput shape (classification,
// overview, summary, groups, itemsToReview, missingOrUnclear,
// sourceTraceabilityNote, applyFields — every one of the 33 applyFields
// keys always present) that the rest of the app already stores, returns,
// and renders. The internal shape itself did not change for this fix —
// only what arrives from the provider did.
//
// The conversion has two parts:
//   1. applyFields: every key the requested document type's schema didn't
//      include is deterministically null (Part 5 — "not relevant to this
//      document type" and "not identified in the document" both normalize
//      to the same null, exactly as before); every key it DID include
//      follows the same `identified ? value : null` rule Incident 2
//      established.
//   2. groups: reconstructed in TypeScript from the named fields +
//      importantNotes, using fixed section titles per document type
//      (never model-authored, unlike the old universal schema's arbitrary
//      `groups` array) — so the UI's existing "Key Details / Notes"
//      rendering keeps working unchanged. sourcePage/sourceSnippet on each
//      constructed field come from `sourceHighlights`, matched back to the
//      named field by an EXACT key match (never fuzzy text matching).
//
// Deliberately pure (document type + object in, object out) — no Zod
// parsing here, no network, no Anthropic SDK import — so it's trivially
// unit-testable and so the responsibility split stays clear: this function
// only ever RESHAPES data; providers/anthropic.ts is the one place that
// actually validates the result against the strict internal schema
// (DocumentAnalysisSchema.parse()) before returning it. Never trust
// arbitrary model output as final just because it matched the
// provider-facing schema — that's exactly why the strict re-validation
// step exists downstream of this function, not instead of it.

import { APPLY_FIELD_LABELS, DOCUMENT_TYPE_APPLY_FIELDS, type ApplyFields, type DocumentAnalysisOutput, type ExtractedField, type FieldGroup, type ProviderTypeSpecificOutput } from './schemas'
import type { DocumentType } from './types'

/** `identified ? value : null` — the one rule every wrapped field follows (Incident 2). */
function unwrap<T>(field: { value: T; identified: boolean } | undefined): T | null {
  return field?.identified ? field.value : null
}

/** Builds the full 33-key ApplyFields object: keys the document type's schema included follow `unwrap()`; every other key is deterministically null (Part 5). */
function buildApplyFields(type: DocumentType, raw: ProviderTypeSpecificOutput['applyFields']): ApplyFields {
  const includedKeys = new Set(DOCUMENT_TYPE_APPLY_FIELDS[type])
  const result = {} as ApplyFields
  for (const key of Object.keys(APPLY_FIELD_LABELS) as (keyof ApplyFields)[]) {
    result[key] = includedKeys.has(key) ? unwrap((raw as Record<string, { value: string; identified: boolean } | undefined>)[key]) : null
  }
  return result
}

/** One ExtractedField per named applyFields key this document type includes, source-matched by exact key. */
function buildKeyDetailsFields(type: DocumentType, raw: ProviderTypeSpecificOutput): ExtractedField[] {
  const keys = DOCUMENT_TYPE_APPLY_FIELDS[type]
  const highlightByField = new Map(raw.sourceHighlights.map((h) => [h.field, h]))
  return keys.map((key) => {
    const wrapped = (raw.applyFields as Record<string, { value: string; identified: boolean } | undefined>)[key]
    const identified = Boolean(wrapped?.identified)
    const highlight = highlightByField.get(key)
    return {
      label: APPLY_FIELD_LABELS[key],
      value: identified ? wrapped!.value : 'Not identified in the uploaded document',
      confidence: identified ? raw.extractionConfidence : null,
      sourcePage: unwrap(highlight?.page),
      sourceSnippet: unwrap(highlight?.snippet),
    }
  })
}

/** One ExtractedField per importantNotes entry, source-matched against the 'general' highlight bucket. */
function buildNotesFields(raw: ProviderTypeSpecificOutput): ExtractedField[] {
  const generalHighlights = raw.sourceHighlights.filter((h) => h.field === 'general')
  return raw.importantNotes.map((note, i) => {
    const highlight = generalHighlights[i]
    return {
      label: 'Note',
      value: note,
      confidence: raw.extractionConfidence,
      sourcePage: unwrap(highlight?.page),
      sourceSnippet: unwrap(highlight?.snippet),
    }
  })
}

function buildGroups(type: DocumentType, raw: ProviderTypeSpecificOutput): FieldGroup[] {
  const groups: FieldGroup[] = []
  const detailFields = buildKeyDetailsFields(type, raw)
  if (detailFields.length) groups.push({ title: 'Key Details', fields: detailFields })
  const noteFields = buildNotesFields(raw)
  if (noteFields.length) groups.push({ title: 'Notes', fields: noteFields })
  return groups
}

/**
 * Converts a document-type-specific provider response into PropRoster's
 * universal internal shape. `type` must be the SAME document type used to
 * select the provider schema this response was parsed against (see
 * getProviderSchemaForDocumentType()) — it determines which applyFields
 * keys are expected to be present in `raw.applyFields` and which
 * `sourceHighlights.field` values are meaningful.
 */
export function normalizeDocumentTypeAnalysis(type: DocumentType, raw: ProviderTypeSpecificOutput): DocumentAnalysisOutput {
  return {
    classification: raw.classification,
    overview: raw.overview,
    summary: raw.summary,
    groups: buildGroups(type, raw),
    itemsToReview: raw.itemsToReview,
    missingOrUnclear: raw.missingOrUnclear,
    sourceTraceabilityNote: raw.sourceTraceabilityNote,
    applyFields: buildApplyFields(type, raw.applyFields),
  }
}
