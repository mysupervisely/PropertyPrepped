import { describe, expect, it } from 'vitest'
import { normalizeProviderAnalysis } from './normalize-analysis'
import { ApplyFieldsSchema, DocumentAnalysisSchema, type ProviderApplyFields, type ProviderDocumentAnalysisOutput } from './schemas'

const notFound = { value: '', identified: false }
const notFoundInt = { value: 0, identified: false }
// Placeholder value is irrelevant when identified:false (it's ignored — see
// normalize-analysis.ts) — 'High' here is just a type-valid placeholder.
const notFoundConfidence = { value: 'High' as const, identified: false }
const found = (value: string) => ({ value, identified: true })
const foundConfidence = (level: 'High' | 'Medium' | 'Low') => ({ value: level, identified: true })

function baseApplyFields(): ProviderApplyFields {
  const keys = Object.keys(ApplyFieldsSchema.shape)
  return Object.fromEntries(keys.map((k) => [k, notFound])) as unknown as ProviderApplyFields
}

function baseProviderOutput(overrides: Partial<ProviderDocumentAnalysisOutput> = {}): ProviderDocumentAnalysisOutput {
  return {
    classification: { documentType: 'Insurance Policy', confidence: 'High' },
    overview: 'A homeowners policy with standard coverage.',
    summary: 'This policy appears to provide $425,000 in dwelling coverage.',
    groups: [
      {
        title: 'Coverage',
        fields: [{ label: 'Dwelling Coverage', value: '$425,000', confidence: foundConfidence('High'), sourcePage: notFoundInt, sourceSnippet: notFound }],
      },
    ],
    itemsToReview: ['Confirm the hurricane deductible with your agent.'],
    missingOrUnclear: ['Flood coverage was not identified in the uploaded document.'],
    sourceTraceabilityNote: 'Page references reflect the uploaded PDF.',
    // Every key present but identified:false — a real model response
    // reports "not found" for every applyFields key it has no value for,
    // never omits the key (it can't — the provider schema requires it).
    applyFields: baseApplyFields(),
    ...overrides,
  }
}

describe('normalizeProviderAnalysis — converts {value, identified} to explicit-null-when-not-identified', () => {
  it('normalizes a minimal provider response (everything not identified) into a fully-populated internal shape with nulls', () => {
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

  it('preserves every value the model DID identify, unchanged', () => {
    const normalized = normalizeProviderAnalysis(
      baseProviderOutput({
        applyFields: { ...baseApplyFields(), carrier: found('Acme Insurance'), annualPremium: found('1200.00'), vendor: found('Acme Plumbing') },
      }),
    )
    expect(normalized.applyFields.carrier).toBe('Acme Insurance')
    expect(normalized.applyFields.annualPremium).toBe('1200.00')
    expect(normalized.applyFields.vendor).toBe('Acme Plumbing')
    // Untouched fields are still null, not missing.
    expect(normalized.applyFields.lender).toBeNull()
    expect(normalized.applyFields.tenantName).toBeNull()
  })

  it('preserves sourcePage/sourceSnippet/confidence when the model does identify them', () => {
    const normalized = normalizeProviderAnalysis(
      baseProviderOutput({
        groups: [
          {
            title: 'Coverage',
            fields: [{ label: 'Wind Deductible', value: '2%', confidence: foundConfidence('Low'), sourcePage: { value: 12, identified: true }, sourceSnippet: found('wind ded...') }],
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
          {
            title: 'Coverage',
            fields: [
              { label: 'A', value: '1', confidence: notFoundConfidence, sourcePage: notFoundInt, sourceSnippet: notFound },
              { label: 'B', value: '2', confidence: foundConfidence('Medium'), sourcePage: notFoundInt, sourceSnippet: notFound },
            ],
          },
          { title: 'Dates', fields: [{ label: 'C', value: '3', confidence: notFoundConfidence, sourcePage: { value: 4, identified: true }, sourceSnippet: notFound }] },
        ],
      }),
    )
    expect(normalized.groups).toHaveLength(2)
    expect(normalized.groups[0].fields).toHaveLength(2)
    expect(normalized.groups[0].fields[1].confidence).toBe('Medium')
    expect(normalized.groups[1].fields[0].sourcePage).toBe(4)
  })

  it('passes non-wrapped top-level fields through unchanged', () => {
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

  it('a genuinely zero/empty-looking value with identified:true survives — never confused with "not identified"', () => {
    const normalized = normalizeProviderAnalysis(
      baseProviderOutput({ applyFields: { ...baseApplyFields(), interestRate: found('0') } }),
    )
    expect(normalized.applyFields.interestRate).toBe('0')
    expect(normalized.applyFields.interestRate).not.toBeNull()
  })

  it('identified:false always normalizes to null regardless of whatever placeholder is in value', () => {
    const normalized = normalizeProviderAnalysis(
      baseProviderOutput({ applyFields: { ...baseApplyFields(), interestRate: { value: '99999', identified: false } } }),
    )
    expect(normalized.applyFields.interestRate).toBeNull()
  })
})

describe('normalizeProviderAnalysis output always passes the strict internal DocumentAnalysisSchema (defense in depth, not just a type cast)', () => {
  it('a minimal provider response normalizes into something DocumentAnalysisSchema.parse() accepts', () => {
    const normalized = normalizeProviderAnalysis(baseProviderOutput())
    expect(() => DocumentAnalysisSchema.parse(normalized)).not.toThrow()
  })

  it('a fully-populated provider response (every ApplyFields key identified, every ExtractedField field identified) normalizes and validates', () => {
    const fullApplyFields = Object.fromEntries(Object.keys(ApplyFieldsSchema.shape).map((k) => [k, found(`value-for-${k}`)])) as unknown as ProviderApplyFields
    const normalized = normalizeProviderAnalysis(
      baseProviderOutput({
        applyFields: fullApplyFields,
        groups: [
          {
            title: 'Everything',
            fields: [{ label: 'x', value: 'y', confidence: foundConfidence('High'), sourcePage: { value: 1, identified: true }, sourceSnippet: found('snip') }],
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
