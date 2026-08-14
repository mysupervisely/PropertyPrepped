import { describe, expect, it } from 'vitest'
import { normalizeDocumentTypeAnalysis } from './normalize-analysis'
import { ApplyFieldsSchema, DocumentAnalysisSchema, type ProviderTypeSpecificOutput } from './schemas'

const notFound = { value: '', identified: false }
const found = (value: string) => ({ value, identified: true })

function baseRaw(overrides: Partial<ProviderTypeSpecificOutput> = {}): ProviderTypeSpecificOutput {
  return {
    classification: { documentType: 'Insurance Policy', confidence: 'High' },
    overview: 'A homeowners policy with standard coverage.',
    summary: 'This policy appears to provide $425,000 in dwelling coverage.',
    extractionConfidence: 'High',
    importantNotes: [],
    itemsToReview: ['Confirm the hurricane deductible with your agent.'],
    missingOrUnclear: ['Flood coverage was not identified in the uploaded document.'],
    sourceTraceabilityNote: 'Page references reflect the uploaded PDF.',
    applyFields: {
      carrier: notFound, policyNumber: notFound, annualPremium: notFound, deductible: notFound, effectiveDate: notFound, expirationDate: notFound,
    },
    sourceHighlights: [],
    ...overrides,
  } as ProviderTypeSpecificOutput
}

describe('normalizeDocumentTypeAnalysis — applyFields', () => {
  it('every one of the 33 internal ApplyFields keys is always present — included keys follow identified/value, all others are deterministically null', () => {
    const normalized = normalizeDocumentTypeAnalysis('Insurance Policy', baseRaw({ applyFields: { carrier: found('Acme Insurance'), policyNumber: notFound, annualPremium: notFound, deductible: notFound, effectiveDate: notFound, expirationDate: notFound } }))
    const allKeys = Object.keys(ApplyFieldsSchema.shape)
    expect(Object.keys(normalized.applyFields).sort()).toEqual(allKeys.sort())
    expect(normalized.applyFields.carrier).toBe('Acme Insurance')
    // Not-identified within the type's own schema -> null.
    expect(normalized.applyFields.policyNumber).toBeNull()
    // Not part of Insurance's schema at all (e.g. a Lease-only key) -> also null, deterministically (Part 5).
    expect(normalized.applyFields.tenantName).toBeNull()
    expect(normalized.applyFields.lender).toBeNull()
  })

  it('a genuinely zero/empty-looking value with identified:true survives — never confused with "not identified"', () => {
    const normalized = normalizeDocumentTypeAnalysis(
      'Mortgage / Loan Statement',
      baseRaw({
        classification: { documentType: 'Mortgage / Loan Statement', confidence: 'High' },
        applyFields: { lender: found('First Bank'), loanNumber: notFound, originalBalance: notFound, currentBalance: notFound, interestRate: found('0'), monthlyPayment: notFound, escrowAmount: notFound, loanTermYears: notFound, maturityDate: notFound },
      }),
    )
    expect(normalized.applyFields.interestRate).toBe('0')
    expect(normalized.applyFields.interestRate).not.toBeNull()
  })

  it('identified:false always normalizes to null regardless of whatever placeholder is in value', () => {
    const normalized = normalizeDocumentTypeAnalysis(
      'Mortgage / Loan Statement',
      baseRaw({
        classification: { documentType: 'Mortgage / Loan Statement', confidence: 'High' },
        applyFields: { lender: notFound, loanNumber: notFound, originalBalance: notFound, currentBalance: notFound, interestRate: { value: '99999', identified: false }, monthlyPayment: notFound, escrowAmount: notFound, loanTermYears: notFound, maturityDate: notFound },
      }),
    )
    expect(normalized.applyFields.interestRate).toBeNull()
  })

  it('a document type with no applyFields at all (e.g. Property Tax) still returns all 33 keys, all null', () => {
    const normalized = normalizeDocumentTypeAnalysis('Property Tax Document', baseRaw({ classification: { documentType: 'Property Tax Document', confidence: 'High' }, applyFields: {} }))
    const allKeys = Object.keys(ApplyFieldsSchema.shape)
    for (const key of allKeys) expect(normalized.applyFields[key as keyof typeof normalized.applyFields]).toBeNull()
  })
})

describe('normalizeDocumentTypeAnalysis — groups (built deterministically, never model-authored)', () => {
  it('builds a "Key Details" group from the type\'s named applyFields, with source references matched by exact field key', () => {
    const normalized = normalizeDocumentTypeAnalysis(
      'Insurance Policy',
      baseRaw({
        applyFields: { carrier: found('Acme Insurance'), policyNumber: notFound, annualPremium: notFound, deductible: notFound, effectiveDate: notFound, expirationDate: notFound },
        sourceHighlights: [{ field: 'carrier', page: { value: 1, identified: true }, snippet: { value: 'Insured by Acme...', identified: true } }],
      }),
    )
    const keyDetails = normalized.groups.find((g) => g.title === 'Key Details')!
    const carrierField = keyDetails.fields.find((f) => f.label === 'Carrier')!
    expect(carrierField.value).toBe('Acme Insurance')
    expect(carrierField.sourcePage).toBe(1)
    expect(carrierField.sourceSnippet).toBe('Insured by Acme...')
  })

  it('a not-identified named field shows the "Not identified" convention with no confidence and no source reference', () => {
    const normalized = normalizeDocumentTypeAnalysis('Insurance Policy', baseRaw())
    const keyDetails = normalized.groups.find((g) => g.title === 'Key Details')!
    const carrierField = keyDetails.fields.find((f) => f.label === 'Carrier')!
    expect(carrierField.value).toBe('Not identified in the uploaded document')
    expect(carrierField.confidence).toBeNull()
    expect(carrierField.sourcePage).toBeNull()
  })

  it('builds a "Notes" group from importantNotes, source-matched against "general" highlights by position', () => {
    const normalized = normalizeDocumentTypeAnalysis(
      'HOA Document',
      baseRaw({
        classification: { documentType: 'HOA Document', confidence: 'Medium' },
        applyFields: {},
        importantNotes: ['Monthly dues are $395.', 'A special assessment of $2,000 was mentioned.'],
        sourceHighlights: [{ field: 'general', page: { value: 4, identified: true }, snippet: notFound }],
      }),
    )
    const notes = normalized.groups.find((g) => g.title === 'Notes')!
    expect(notes.fields).toHaveLength(2)
    expect(notes.fields[0].value).toBe('Monthly dues are $395.')
    expect(notes.fields[0].sourcePage).toBe(4)
    expect(notes.fields[1].sourcePage).toBeNull() // no second highlight supplied
  })

  it('omits the "Key Details" group entirely for a document type with no applyFields (e.g. Inspection Report)', () => {
    const normalized = normalizeDocumentTypeAnalysis(
      'Inspection Report',
      baseRaw({ classification: { documentType: 'Inspection Report', confidence: 'High' }, applyFields: {}, importantNotes: ['Roof appears original, recommend evaluation.'] }),
    )
    expect(normalized.groups.find((g) => g.title === 'Key Details')).toBeUndefined()
    expect(normalized.groups.find((g) => g.title === 'Notes')).toBeDefined()
  })

  it('produces an empty groups array (never a fabricated empty section) when there is nothing at all to show', () => {
    const normalized = normalizeDocumentTypeAnalysis('Property Tax Document', baseRaw({ classification: { documentType: 'Property Tax Document', confidence: 'Low' }, applyFields: {}, importantNotes: [] }))
    expect(normalized.groups).toEqual([])
  })
})

describe('normalizeDocumentTypeAnalysis — top-level passthrough + strict internal validation', () => {
  it('passes non-wrapped top-level fields through unchanged', () => {
    const normalized = normalizeDocumentTypeAnalysis('Insurance Policy', baseRaw())
    expect(normalized.classification).toEqual({ documentType: 'Insurance Policy', confidence: 'High' })
    expect(normalized.overview).toBe('A homeowners policy with standard coverage.')
    expect(normalized.itemsToReview).toEqual(['Confirm the hurricane deductible with your agent.'])
    expect(normalized.missingOrUnclear).toEqual(['Flood coverage was not identified in the uploaded document.'])
    expect(normalized.sourceTraceabilityNote).toBe('Page references reflect the uploaded PDF.')
  })

  it('every normalized output passes the strict internal DocumentAnalysisSchema (defense in depth, not just a type cast)', () => {
    const normalized = normalizeDocumentTypeAnalysis('Insurance Policy', baseRaw())
    expect(() => DocumentAnalysisSchema.parse(normalized)).not.toThrow()
  })

  it('a fully-populated Contractor Invoice response normalizes and validates', () => {
    const raw = baseRaw({
      classification: { documentType: 'Contractor Invoice / Receipt', confidence: 'High' },
      applyFields: {
        vendor: found('Acme Plumbing'), description: found('Water heater replacement'), cost: found('850.00'), amount: found('850.00'),
        date: found('2026-03-01'), category: found('Plumbing'), name: notFound, businessName: found('Acme Plumbing LLC'), phone: notFound, email: notFound, website: notFound,
      },
    })
    const normalized = normalizeDocumentTypeAnalysis('Contractor Invoice / Receipt', raw)
    const result = DocumentAnalysisSchema.safeParse(normalized)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.applyFields.vendor).toBe('Acme Plumbing')
      expect(result.data.applyFields.cost).toBe('850.00')
      expect(result.data.applyFields.tenantName).toBeNull() // unrelated key, deterministically null
    }
  })
})
