import { describe, expect, it } from 'vitest'
import { normalizeProviderAnalysis } from './normalize-analysis'
import { ApplyFieldsSchema, DocumentAnalysisSchema, type ProviderDocumentAnalysisOutput } from './schemas'

function baseProviderOutput(overrides: Partial<ProviderDocumentAnalysisOutput> = {}): ProviderDocumentAnalysisOutput {
  return {
    classification: { documentType: 'Insurance Policy', confidence: 'High' },
    overview: 'A homeowners policy with standard coverage.',
    summary: 'This policy appears to provide $425,000 in dwelling coverage.',
    groups: [
      {
        title: 'Coverage',
        // Deliberately omits sourcePage/sourceSnippet on this field — the
        // provider-facing shape allows that; confidence is present.
        fields: [{ label: 'Dwelling Coverage', value: '$425,000', confidence: 'High' }],
      },
    ],
    itemsToReview: ['Confirm the hurricane deductible with your agent.'],
    missingOrUnclear: ['Flood coverage was not identified in the uploaded document.'],
    sourceTraceabilityNote: 'Page references reflect the uploaded PDF.',
    // Deliberately empty — a real model response omits every ApplyFields
    // key it has no value for, rather than sending 33 explicit nulls.
    applyFields: {},
    ...overrides,
  }
}

describe('normalizeProviderAnalysis — converts omitted-when-unknown to explicit-null-when-unknown', () => {
  it('normalizes a minimal provider response (everything else omitted) into a fully-populated internal shape with nulls', () => {
    const normalized = normalizeProviderAnalysis(baseProviderOutput())

    expect(normalized.groups[0].fields[0]).toEqual({
      label: 'Dwelling Coverage',
      value: '$425,000',
      confidence: 'High',
      sourcePage: null,
      sourceSnippet: null,
    })

    // Every one of the 33 ApplyFields keys must be present and null — not
    // missing, not undefined — since the internal schema requires every
    // key to always be present.
    const applyFieldsKeys = Object.keys(ApplyFieldsSchema.shape)
    expect(Object.keys(normalized.applyFields).sort()).toEqual(applyFieldsKeys.sort())
    for (const key of applyFieldsKeys) {
      expect(normalized.applyFields[key as keyof typeof normalized.applyFields]).toBeNull()
    }
  })

  it('preserves every value the model DID provide, unchanged', () => {
    const normalized = normalizeProviderAnalysis(
      baseProviderOutput({
        applyFields: { carrier: 'Acme Insurance', annualPremium: '1200.00', vendor: 'Acme Plumbing' },
      }),
    )
    expect(normalized.applyFields.carrier).toBe('Acme Insurance')
    expect(normalized.applyFields.annualPremium).toBe('1200.00')
    expect(normalized.applyFields.vendor).toBe('Acme Plumbing')
    // Untouched fields are still null, not missing.
    expect(normalized.applyFields.lender).toBeNull()
    expect(normalized.applyFields.tenantName).toBeNull()
  })

  it('preserves sourcePage/sourceSnippet/confidence when the model does provide them', () => {
    const normalized = normalizeProviderAnalysis(
      baseProviderOutput({
        groups: [
          {
            title: 'Coverage',
            fields: [{ label: 'Wind Deductible', value: '2%', confidence: 'Low', sourcePage: 12, sourceSnippet: 'wind ded...' }],
          },
        ],
      }),
    )
    expect(normalized.groups[0].fields[0]).toEqual({
      label: 'Wind Deductible',
      value: '2%',
      confidence: 'Low',
      sourcePage: 12,
      sourceSnippet: 'wind ded...',
    })
  })

  it('normalizes multiple groups and multiple fields per group correctly', () => {
    const normalized = normalizeProviderAnalysis(
      baseProviderOutput({
        groups: [
          { title: 'Coverage', fields: [{ label: 'A', value: '1' }, { label: 'B', value: '2', confidence: 'Medium' }] },
          { title: 'Dates', fields: [{ label: 'C', value: '3', sourcePage: 4 }] },
        ],
      }),
    )
    expect(normalized.groups).toHaveLength(2)
    expect(normalized.groups[0].fields).toHaveLength(2)
    expect(normalized.groups[0].fields[1].confidence).toBe('Medium')
    expect(normalized.groups[1].fields[0].sourcePage).toBe(4)
  })

  it('passes non-nullable top-level fields through unchanged', () => {
    const normalized = normalizeProviderAnalysis(baseProviderOutput())
    expect(normalized.classification).toEqual({ documentType: 'Insurance Policy', confidence: 'High' })
    expect(normalized.overview).toBe('A homeowners policy with standard coverage.')
    expect(normalized.itemsToReview).toEqual(['Confirm the hurricane deductible with your agent.'])
    expect(normalized.missingOrUnclear).toEqual(['Flood coverage was not identified in the uploaded document.'])
    expect(normalized.sourceTraceabilityNote).toBe('Page references reflect the uploaded PDF.')
  })

  it('handles an empty groups array', () => {
    const normalized = normalizeProviderAnalysis(baseProviderOutput({ groups: [] }))
    expect(normalized.groups).toEqual([])
  })
})

describe('normalizeProviderAnalysis output always passes the strict internal DocumentAnalysisSchema (defense in depth, not just a type cast)', () => {
  it('a minimal provider response normalizes into something DocumentAnalysisSchema.parse() accepts', () => {
    const normalized = normalizeProviderAnalysis(baseProviderOutput())
    expect(() => DocumentAnalysisSchema.parse(normalized)).not.toThrow()
  })

  it('a fully-populated provider response (every ApplyFields key present, every ExtractedField field present) normalizes and validates', () => {
    const fullApplyFields = Object.fromEntries(Object.keys(ApplyFieldsSchema.shape).map((k) => [k, `value-for-${k}`]))
    const normalized = normalizeProviderAnalysis(
      baseProviderOutput({
        applyFields: fullApplyFields,
        groups: [
          {
            title: 'Everything',
            fields: [{ label: 'x', value: 'y', confidence: 'High', sourcePage: 1, sourceSnippet: 'snip' }],
          },
        ],
      }),
    )
    const result = DocumentAnalysisSchema.safeParse(normalized)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.applyFields.carrier).toBe('value-for-carrier')
      expect(result.data.applyFields.estimatedValue).toBe('value-for-estimatedValue')
    }
  })
})
