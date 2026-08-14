import { describe, expect, it } from 'vitest'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod/v4'
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

// Regression tests for BOTH real production incidents (see schemas.ts's
// "Provider-facing schema" comment for the full history):
//   1. "36 parameters with type arrays or anyOf... limit: 16 parameters
//      with unions" — fixed by nullable -> optional. This eliminated the
//      unions, but:
//   2. A subsequent real production request then hit "Schemas contains
//      too many optional parameters (36)" — a SEPARATE Anthropic limit
//      that the optional-only fix didn't address. Fixed by wrapping every
//      "may be unknown" field in a REQUIRED {value, identified} object.
// These tests count the REAL JSON Schema this app sends (the exact
// zodOutputFormat() pipeline providers/anthropic.ts uses) for BOTH the
// union count and the optional-parameter count, so a future schema change
// can't silently regress either incident.
describe('Production-hardening pass — Anthropic union AND optional-parameter limits', () => {
  function countAnyOf(schema: unknown): number {
    return (JSON.stringify(schema).match(/"anyOf"/g) || []).length
  }

  /** Recursively counts object properties absent from their parent's `required` array — the exact thing Anthropic's "too many optional parameters" error counts. */
  function countOptionalParameters(schema: unknown): number {
    let count = 0
    function walk(node: unknown): void {
      if (!node || typeof node !== 'object') return
      const obj = node as Record<string, unknown>
      if (obj.type === 'object' && obj.properties && typeof obj.properties === 'object') {
        const required = new Set((obj.required as string[] | undefined) ?? [])
        for (const [key, propSchema] of Object.entries(obj.properties as Record<string, unknown>)) {
          if (!required.has(key)) count++
          walk(propSchema)
        }
      }
      if (obj.items) walk(obj.items)
      if (obj.$defs && typeof obj.$defs === 'object') for (const v of Object.values(obj.$defs as Record<string, unknown>)) walk(v)
      if (Array.isArray(obj.anyOf)) for (const v of obj.anyOf) walk(v)
    }
    walk(schema)
    return count
  }

  it('the OLD internal-shaped request would have produced exactly 36 union parameters (documents Incident 1\'s root cause, does not regress it — this schema is never sent to Anthropic directly anymore)', () => {
    const format = zodOutputFormat(DocumentAnalysisSchema)
    expect(countAnyOf(format.schema)).toBe(36)
  })

  it('the provider-facing schema actually sent to Anthropic produces ZERO union parameters (Incident 1 stays fixed)', () => {
    const format = zodOutputFormat(ProviderDocumentAnalysisSchema)
    expect(countAnyOf(format.schema)).toBe(0)
  })

  it('a schema with 36 fields made merely .optional() (not wrapped) would reproduce exactly Incident 2\'s reported count of 36 optional parameters — documents why that first fix attempt was insufficient, without reintroducing it into the real provider schema', () => {
    // A minimal standalone reproduction — NOT ProviderDocumentAnalysisSchema
    // (which no longer does this) — of the exact shape Incident 1's fix
    // produced, to prove the "optional parameters" count really is a
    // distinct, separate thing from the union count.
    const wouldHaveShipped = z.object(
      Object.fromEntries(Array.from({ length: 36 }, (_, i) => [`field${i}`, z.string().optional()])),
    )
    const format = zodOutputFormat(wouldHaveShipped)
    expect(countAnyOf(format.schema)).toBe(0) // no unions — this is exactly why Incident 1's fix looked complete
    expect(countOptionalParameters(format.schema)).toBe(36) // but Anthropic's separate optional-parameter cap still rejects it
  })

  it('the provider-facing schema actually sent to Anthropic produces ZERO optional parameters (Incident 2 is fixed)', () => {
    const format = zodOutputFormat(ProviderDocumentAnalysisSchema)
    expect(countOptionalParameters(format.schema)).toBe(0)
  })

  it('ProviderApplyFieldsSchema has exactly the same keys as ApplyFieldsSchema (no field silently dropped/added by the provider-facing mirror)', () => {
    expect(Object.keys(ProviderApplyFieldsSchema.shape).sort()).toEqual(Object.keys(ApplyFieldsSchema.shape).sort())
  })

  it('ProviderExtractedFieldSchema has exactly the same keys as ExtractedFieldSchema', () => {
    expect(Object.keys(ProviderExtractedFieldSchema.shape).sort()).toEqual(Object.keys(ExtractedFieldSchema.shape).sort())
  })

  it('every field that is nullable on the internal schema is a REQUIRED {value, identified} object on the provider-facing mirror — the actual mechanism that eliminates both the unions AND the optional parameters', () => {
    for (const [key, fieldSchema] of Object.entries(ApplyFieldsSchema.shape)) {
      const providerFieldSchema = ProviderApplyFieldsSchema.shape[key as keyof typeof ProviderApplyFieldsSchema.shape]
      // Internal: value can be null.
      expect(fieldSchema.safeParse(null).success, `${key} should be nullable on the internal schema`).toBe(true)
      // Provider-facing: the wrapper object itself is REQUIRED (rejects undefined/omission)...
      expect(providerFieldSchema.safeParse(undefined).success, `${key} should be a required object on the provider-facing schema, not optional`).toBe(false)
      // ...and both its own keys are required too.
      expect(providerFieldSchema.safeParse({ value: 'x' }).success, `${key}'s wrapper must require "identified"`).toBe(false)
      expect(providerFieldSchema.safeParse({ identified: true }).success, `${key}'s wrapper must require "value"`).toBe(false)
      expect(providerFieldSchema.safeParse({ value: 'x', identified: true }).success, `${key}'s wrapper should accept a fully-populated object`).toBe(true)
    }
  })

  it('a real zero-like value with identified:true is distinguishable from identified:false — never confused as "unknown"', () => {
    const zeroButIdentified = ProviderApplyFieldsSchema.shape.interestRate.safeParse({ value: '0', identified: true })
    expect(zeroButIdentified.success).toBe(true)
    if (zeroButIdentified.success) {
      expect(zeroButIdentified.data.identified).toBe(true)
      expect(zeroButIdentified.data.value).toBe('0')
    }
  })
})
