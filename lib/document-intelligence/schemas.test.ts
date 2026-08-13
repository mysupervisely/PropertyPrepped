import { describe, expect, it } from 'vitest'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import {
  ApplyFieldsSchema,
  DocumentAnalysisSchema,
  ExtractedFieldSchema,
  ProviderApplyFieldsSchema,
  ProviderDocumentAnalysisSchema,
  ProviderExtractedFieldSchema,
} from './schemas'

function baseApplyFields() {
  const keys: (keyof typeof ApplyFieldsSchema.shape)[] = Object.keys(ApplyFieldsSchema.shape) as any
  return Object.fromEntries(keys.map((k) => [k, null]))
}

function validOutput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    classification: { documentType: 'Insurance Policy', confidence: 'High' },
    overview: 'A homeowners policy with standard coverage.',
    summary: 'This policy appears to provide $425,000 in dwelling coverage.',
    groups: [
      {
        title: 'Coverage',
        fields: [
          { label: 'Dwelling Coverage', value: '$425,000', confidence: 'High', sourcePage: 3, sourceSnippet: 'Coverage A: $425,000' },
        ],
      },
    ],
    itemsToReview: ['Confirm the hurricane deductible with your agent.'],
    missingOrUnclear: ['Flood coverage was not identified in the uploaded document.'],
    sourceTraceabilityNote: 'Page references reflect the uploaded PDF.',
    applyFields: baseApplyFields(),
    ...overrides,
  }
}

describe('DocumentAnalysisSchema — 1. insurance structured schema', () => {
  it('accepts a well-formed insurance policy extraction', () => {
    const result = DocumentAnalysisSchema.safeParse(validOutput())
    expect(result.success).toBe(true)
  })
})

describe('DocumentAnalysisSchema — 2. lease structured schema', () => {
  it('accepts a well-formed lease extraction', () => {
    const result = DocumentAnalysisSchema.safeParse(
      validOutput({
        classification: { documentType: 'Lease', confidence: 'High' },
        groups: [{ title: 'Financial Terms', fields: [{ label: 'Monthly Rent', value: '$2,200', confidence: 'High', sourcePage: 1, sourceSnippet: null }] }],
      }),
    )
    expect(result.success).toBe(true)
  })
})

describe('DocumentAnalysisSchema — 3. mortgage structured schema', () => {
  it('accepts a well-formed mortgage extraction', () => {
    const result = DocumentAnalysisSchema.safeParse(
      validOutput({
        classification: { documentType: 'Mortgage / Loan Statement', confidence: 'Medium' },
        groups: [{ title: 'Loan Terms', fields: [{ label: 'Interest Rate', value: '6.25%', confidence: 'Medium', sourcePage: null, sourceSnippet: null }] }],
      }),
    )
    expect(result.success).toBe(true)
  })
})

describe('DocumentAnalysisSchema — 4. invoice structured schema', () => {
  it('accepts a well-formed contractor invoice extraction', () => {
    const result = DocumentAnalysisSchema.safeParse(
      validOutput({
        classification: { documentType: 'Contractor Invoice / Receipt', confidence: 'High' },
        groups: [{ title: 'Work Performed', fields: [{ label: 'Total', value: '$450.00', confidence: 'High', sourcePage: 1, sourceSnippet: 'Total Due: $450.00' }] }],
        applyFields: { ...baseApplyFields(), vendor: 'Acme Plumbing', amount: '450.00', cost: '450.00', category: 'Plumbing' },
      }),
    )
    expect(result.success).toBe(true)
  })
})

describe('DocumentAnalysisSchema — 5. missing fields', () => {
  it('accepts a field the model could not find, using the "not identified" convention', () => {
    const result = DocumentAnalysisSchema.safeParse(
      validOutput({
        groups: [
          {
            title: 'Coverage',
            fields: [{ label: 'Flood Coverage', value: 'Not identified in the uploaded document', confidence: null, sourcePage: null, sourceSnippet: null }],
          },
        ],
      }),
    )
    expect(result.success).toBe(true)
  })

  it('accepts an empty groups array when nothing could be extracted', () => {
    const result = DocumentAnalysisSchema.safeParse(validOutput({ groups: [] }))
    expect(result.success).toBe(true)
  })
})

describe('DocumentAnalysisSchema — 6. low-confidence values', () => {
  it('accepts and preserves a Low confidence field', () => {
    const result = DocumentAnalysisSchema.safeParse(
      validOutput({
        groups: [{ title: 'Coverage', fields: [{ label: 'Wind Deductible', value: '2% (approximate)', confidence: 'Low', sourcePage: 12, sourceSnippet: 'wind ded...' }] }],
      }),
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.groups[0].fields[0].confidence).toBe('Low')
    }
  })

  it('rejects a confidence value outside High/Medium/Low', () => {
    const result = DocumentAnalysisSchema.safeParse(
      validOutput({
        groups: [{ title: 'Coverage', fields: [{ label: 'Wind Deductible', value: '2%', confidence: 'Certain', sourcePage: null, sourceSnippet: null }] }],
      }),
    )
    expect(result.success).toBe(false)
  })
})

describe('DocumentAnalysisSchema — malformed AI response shapes', () => {
  it('rejects a response missing required top-level fields', () => {
    const result = DocumentAnalysisSchema.safeParse({ summary: 'incomplete' })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown document type', () => {
    const result = DocumentAnalysisSchema.safeParse(validOutput({ classification: { documentType: 'Divorce Decree', confidence: 'High' } }))
    expect(result.success).toBe(false)
  })

  it('rejects a non-numeric, non-null sourcePage', () => {
    const result = DocumentAnalysisSchema.safeParse(
      validOutput({ groups: [{ title: 'Coverage', fields: [{ label: 'x', value: 'y', confidence: 'High', sourcePage: 'seventeen', sourceSnippet: null }] }] }),
    )
    expect(result.success).toBe(false)
  })

  it('rejects plain prose instead of the structured shape', () => {
    const result = DocumentAnalysisSchema.safeParse('This document is a homeowners insurance policy with $425,000 in dwelling coverage.')
    expect(result.success).toBe(false)
  })
})

describe('Production-hardening pass — Anthropic union-parameter limit (schema/union-limit fix)', () => {
  // Regression test for the actual production incident: Anthropic rejected
  // the request with "36 parameters with type arrays or anyOf... limit: 16
  // parameters with unions." This counts the REAL JSON Schema this app
  // sends (the exact zodOutputFormat() pipeline providers/anthropic.ts
  // uses), the same way that number was originally confirmed.
  function countAnyOf(schema: unknown): number {
    return (JSON.stringify(schema).match(/"anyOf"/g) || []).length
  }

  it('the OLD internal-shaped request would have produced exactly 36 union parameters (documents the root cause, does not regress it — this schema is never sent to Anthropic directly anymore)', () => {
    const format = zodOutputFormat(DocumentAnalysisSchema)
    expect(countAnyOf(format.schema)).toBe(36)
  })

  it('the provider-facing schema actually sent to Anthropic produces ZERO union parameters — well under the 16 limit', () => {
    const format = zodOutputFormat(ProviderDocumentAnalysisSchema)
    expect(countAnyOf(format.schema)).toBe(0)
  })

  it('ProviderApplyFieldsSchema has exactly the same keys as ApplyFieldsSchema (no field silently dropped/added by the provider-facing mirror)', () => {
    expect(Object.keys(ProviderApplyFieldsSchema.shape).sort()).toEqual(Object.keys(ApplyFieldsSchema.shape).sort())
  })

  it('ProviderExtractedFieldSchema has exactly the same keys as ExtractedFieldSchema', () => {
    expect(Object.keys(ProviderExtractedFieldSchema.shape).sort()).toEqual(Object.keys(ExtractedFieldSchema.shape).sort())
  })

  it('every field that is nullable on the internal schema is optional (not nullable) on the provider-facing mirror — this is the actual mechanism that eliminates the unions', () => {
    for (const [key, fieldSchema] of Object.entries(ApplyFieldsSchema.shape)) {
      const providerFieldSchema = ProviderApplyFieldsSchema.shape[key as keyof typeof ProviderApplyFieldsSchema.shape]
      // Internal: value can be null. Provider-facing: the same field must
      // accept undefined (optional) so it compiles to a plain type with no
      // anyOf, per the empirical zod v4 behavior this fix relies on.
      expect(fieldSchema.safeParse(null).success, `${key} should be nullable on the internal schema`).toBe(true)
      expect(providerFieldSchema.safeParse(undefined).success, `${key} should be optional on the provider-facing schema`).toBe(true)
    }
  })
})
