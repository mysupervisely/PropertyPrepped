import { describe, expect, it } from 'vitest'
import { guessDocumentType } from './guess-document-type'

describe('guessDocumentType', () => {
  it('guesses Receipt for an image (Part 10 priority use case)', () => {
    expect(guessDocumentType('image/jpeg')).toBe('Contractor Invoice / Receipt')
    expect(guessDocumentType('image/png')).toBe('Contractor Invoice / Receipt')
  })
  it('guesses Other for a PDF (a PDF could reasonably be any type)', () => {
    expect(guessDocumentType('application/pdf')).toBe('Other')
  })
})
