import { describe, expect, it } from 'vitest'
import { DEFAULT_MODEL, UnverifiedModelError, VERIFIED_MODELS, resolveDocumentIntelligenceModel } from './model-config'

describe('resolveDocumentIntelligenceModel', () => {
  it('returns the verified default when DOCUMENT_INTELLIGENCE_MODEL is unset', () => {
    expect(resolveDocumentIntelligenceModel({})).toBe(DEFAULT_MODEL)
    expect(VERIFIED_MODELS).toContain(DEFAULT_MODEL)
  })

  it('returns the verified default when the env var is an empty string', () => {
    expect(resolveDocumentIntelligenceModel({ DOCUMENT_INTELLIGENCE_MODEL: '' })).toBe(DEFAULT_MODEL)
  })

  it('accepts any verified model override', () => {
    for (const model of VERIFIED_MODELS) {
      expect(resolveDocumentIntelligenceModel({ DOCUMENT_INTELLIGENCE_MODEL: model })).toBe(model)
    }
  })

  it('11. fails gracefully (a typed, catchable error) on an invalid/unsupported model configuration — never forwards it to the API unexamined', () => {
    expect(() => resolveDocumentIntelligenceModel({ DOCUMENT_INTELLIGENCE_MODEL: 'gpt-4o' })).toThrow(UnverifiedModelError)
    expect(() => resolveDocumentIntelligenceModel({ DOCUMENT_INTELLIGENCE_MODEL: 'claude-3-opus-20240229' })).toThrow(UnverifiedModelError)
    expect(() => resolveDocumentIntelligenceModel({ DOCUMENT_INTELLIGENCE_MODEL: 'not-a-real-model' })).toThrow(/not a verified model id/)
  })

  it('the thrown error names the supported values so a misconfiguration is diagnosable from logs', () => {
    try {
      resolveDocumentIntelligenceModel({ DOCUMENT_INTELLIGENCE_MODEL: 'bogus-model' })
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(UnverifiedModelError)
      expect(String(err)).toContain('claude-sonnet-5')
    }
  })
})
