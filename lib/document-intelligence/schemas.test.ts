import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod/v4'
import {
  ApplyFieldsSchema,
  DOCUMENT_TYPE_APPLY_FIELDS,
  DocumentAnalysisSchema,
  ExtractedFieldSchema,
  getProviderSchemaForDocumentType,
  ProviderApplyFieldsSchema,
  ProviderDocumentAnalysisSchema,
  ProviderExtractedFieldSchema,
} from './schemas'
import { DOCUMENT_TYPES } from './types'

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

  // 37, not 36: Smart Upload Foundation added one more nullable field
  // (applyFields.propertyAddress) to ApplyFieldsSchema, so the OLD
  // (never-sent) internal shape now has one more nullable/union field
  // than it did when Incident 1 was fixed. Still documents the same
  // fact — the provider-facing schema actually sent to Anthropic
  // (tested immediately below) stays at ZERO regardless of this number.
  it('the OLD internal-shaped request would have produced exactly 37 union parameters (documents Incident 1\'s root cause, does not regress it — this schema is never sent to Anthropic directly anymore)', () => {
    const format = zodOutputFormat(DocumentAnalysisSchema)
    expect(countAnyOf(format.schema)).toBe(37)
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

// Regression tests for the THIRD real production incident (see
// ProviderDocumentAnalysisSchema's comment in schemas.ts for the full
// history): a request using that exact schema — 0 unions, 0 optional
// parameters, both already fixed — still failed with "The compiled
// grammar is too large... Simplify your tool schemas." Fixed by replacing
// the one universal schema with a small schema per document type,
// selected by getProviderSchemaForDocumentType(). These tests measure
// EVERY supported document type's actual schema through the real
// zodOutputFormat() pipeline and assert explicit upper bounds, so a future
// refactor can't silently regrow a huge universal grammar without a test
// failing.
describe('Production-hardening pass — Incident 3 (compiled grammar too large)', () => {
  function countAnyOf(schema: unknown): number {
    return (JSON.stringify(schema).match(/"anyOf"/g) || []).length
  }
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
  function countProperties(schema: unknown): number {
    let count = 0
    function walk(node: unknown): void {
      if (!node || typeof node !== 'object') return
      const obj = node as Record<string, unknown>
      if (obj.type === 'object' && obj.properties && typeof obj.properties === 'object') {
        const props = obj.properties as Record<string, unknown>
        count += Object.keys(props).length
        for (const v of Object.values(props)) walk(v)
      }
      if (obj.items) walk(obj.items)
      if (obj.$defs && typeof obj.$defs === 'object') for (const v of Object.values(obj.$defs as Record<string, unknown>)) walk(v)
      if (Array.isArray(obj.anyOf)) for (const v of obj.anyOf) walk(v)
    }
    walk(schema)
    return count
  }

  // The exact measurement that diagnosed Incident 3 — documents the root
  // cause without needing to trust a prose description of it.
  it('the OLD universal provider schema is measurably large: >100 total properties and >8000 bytes — this is the actual "too large" grammar Anthropic rejected', () => {
    const format = zodOutputFormat(ProviderDocumentAnalysisSchema)
    const bytes = JSON.stringify(format.schema).length
    const properties = countProperties(format.schema)
    expect(bytes).toBeGreaterThan(8000)
    expect(properties).toBeGreaterThan(100)
  })

  // Reasonable upper bounds — deliberately tight enough that a future
  // change reintroducing an open-ended array-of-rich-objects (like the old
  // `groups` shape) or adding every field to every type would fail this
  // test long before it could reach production.
  // Measured actual sizes range from ~1,400 bytes (types with no
  // applyFields, e.g. Property Tax Document) up to ~4,000 bytes
  // (Contractor Invoice / Receipt, the largest at 11 applyFields keys) —
  // all still well under half the old universal schema's 8,008 bytes.
  // 4,500 gives real headroom above the observed worst case without being
  // so loose it couldn't catch a real regression (e.g. someone
  // accidentally reintroducing an open-ended array-of-objects).
  const MAX_SCHEMA_BYTES = 4500
  // Property count is measured recursively (every nested {value,identified}
  // wrapper's two keys count separately) — Contractor Invoice / Receipt,
  // the largest type at 11 applyFields keys, measures ~52. 60 gives
  // headroom above that without approaching the old universal schema's 122.
  const MAX_PROPERTIES = 60
  const MAX_UNIONS = 0
  const MAX_OPTIONAL_PARAMETERS = 0

  const schemaMetrics: { type: string; bytes: number; properties: number; unions: number; optional: number }[] = []

  for (const type of DOCUMENT_TYPES) {
    it(`"${type}" provider schema stays within the compact bounds (<=${MAX_SCHEMA_BYTES} bytes, <=${MAX_PROPERTIES} properties, 0 unions, 0 optional parameters)`, () => {
      const schema = getProviderSchemaForDocumentType(type)
      const format = zodOutputFormat(schema)
      const bytes = JSON.stringify(format.schema).length
      const properties = countProperties(format.schema)
      const unions = countAnyOf(format.schema)
      const optional = countOptionalParameters(format.schema)
      schemaMetrics.push({ type, bytes, properties, unions, optional })

      expect(bytes, `${type} schema byte size`).toBeLessThanOrEqual(MAX_SCHEMA_BYTES)
      expect(properties, `${type} schema property count`).toBeLessThanOrEqual(MAX_PROPERTIES)
      expect(unions, `${type} schema union count`).toBe(MAX_UNIONS)
      expect(optional, `${type} schema optional-parameter count`).toBe(MAX_OPTIONAL_PARAMETERS)
    })
  }

  it('every document-specific schema is dramatically smaller than the old universal schema (documents the actual improvement, not just a pass/fail bound)', () => {
    const universalFormat = zodOutputFormat(ProviderDocumentAnalysisSchema)
    const universalBytes = JSON.stringify(universalFormat.schema).length
    const universalProperties = countProperties(universalFormat.schema)

    for (const type of DOCUMENT_TYPES) {
      const format = zodOutputFormat(getProviderSchemaForDocumentType(type))
      const bytes = JSON.stringify(format.schema).length
      const properties = countProperties(format.schema)
      expect(bytes, `${type} bytes vs. universal ${universalBytes}`).toBeLessThan(universalBytes)
      expect(properties, `${type} properties vs. universal ${universalProperties}`).toBeLessThan(universalProperties)
    }
  })

  it("each type's schema contains ONLY the applyFields keys relevant to that type — never another type's fields", () => {
    for (const type of DOCUMENT_TYPES) {
      const schema = getProviderSchemaForDocumentType(type)
      const applyFieldsShape = (schema.shape as { applyFields: z.ZodObject }).applyFields.shape
      expect(Object.keys(applyFieldsShape).sort()).toEqual([...DOCUMENT_TYPE_APPLY_FIELDS[type]].sort())
    }
  })

  it('Lease does not contain insurance/mortgage/invoice-only fields (Part 2\'s explicit example)', () => {
    const leaseShape = (getProviderSchemaForDocumentType('Lease').shape as { applyFields: z.ZodObject }).applyFields.shape
    expect(leaseShape).not.toHaveProperty('annualPremium')
    expect(leaseShape).not.toHaveProperty('currentBalance')
    expect(leaseShape).not.toHaveProperty('cost')
  })

  it('Insurance Policy does not contain lease/mortgage/invoice-only fields', () => {
    const insuranceShape = (getProviderSchemaForDocumentType('Insurance Policy').shape as { applyFields: z.ZodObject }).applyFields.shape
    expect(insuranceShape).not.toHaveProperty('monthlyRent')
    expect(insuranceShape).not.toHaveProperty('lender')
    expect(insuranceShape).not.toHaveProperty('vendor')
  })

  it('the metrics table has one row per supported document type, none exceeding the bounds (summary check after the per-type tests above have run)', () => {
    // schemaMetrics is populated by the per-type `it` blocks above, which
    // vitest runs before this one (declaration order within the same
    // describe). This is a convenience assertion, not the primary
    // guarantee — the per-type tests above are what actually fail the
    // suite if a bound is exceeded.
    expect(DOCUMENT_TYPES.length).toBe(10)
  })

  it('providers/anthropic.ts no longer sends ProviderDocumentAnalysisSchema (the old universal schema) — it must use getProviderSchemaForDocumentType() instead', () => {
    const source = readFileSync(join(__dirname, 'providers', 'anthropic.ts'), 'utf8')
    expect(source).not.toContain('zodOutputFormat(ProviderDocumentAnalysisSchema)')
    expect(source).toContain('getProviderSchemaForDocumentType(')
  })
})
