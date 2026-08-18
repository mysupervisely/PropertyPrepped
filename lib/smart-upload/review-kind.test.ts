import { describe, expect, it } from 'vitest'
import { reviewKindFor } from './review-kind'

describe('reviewKindFor', () => {
  it('routes Contractor Invoice / Receipt to the Receipt review flow', () => {
    expect(reviewKindFor('Contractor Invoice / Receipt')).toBe('Receipt')
  })
  it('routes every other document type to PrepareOnly', () => {
    expect(reviewKindFor('Lease')).toBe('PrepareOnly')
    expect(reviewKindFor('Insurance Policy')).toBe('PrepareOnly')
    expect(reviewKindFor('Mortgage / Loan Statement')).toBe('PrepareOnly')
    expect(reviewKindFor('Property Tax Document')).toBe('PrepareOnly')
    expect(reviewKindFor('Other')).toBe('PrepareOnly')
  })
})
