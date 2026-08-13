import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDocumentIntelligenceProvider, isDocumentIntelligenceConfigured } from './provider'
import { UnverifiedModelError } from './model-config'

const ORIGINAL_MODEL_ENV = process.env.DOCUMENT_INTELLIGENCE_MODEL
const ORIGINAL_KEY_ENV = process.env.ANTHROPIC_API_KEY

afterEach(() => {
  if (ORIGINAL_MODEL_ENV === undefined) delete process.env.DOCUMENT_INTELLIGENCE_MODEL
  else process.env.DOCUMENT_INTELLIGENCE_MODEL = ORIGINAL_MODEL_ENV
  if (ORIGINAL_KEY_ENV === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY_ENV
  vi.restoreAllMocks()
})

describe('isDocumentIntelligenceConfigured', () => {
  it('is false without ANTHROPIC_API_KEY, true with it', () => {
    delete process.env.ANTHROPIC_API_KEY
    expect(isDocumentIntelligenceConfigured()).toBe(false)
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    expect(isDocumentIntelligenceConfigured()).toBe(true)
  })
})

describe('getDocumentIntelligenceProvider — diagnostics pass: construction failures are logged, not silently swallowed', () => {
  it('logs a safe diagnostic line and still throws (unchanged behavior) when DOCUMENT_INTELLIGENCE_MODEL is invalid', () => {
    process.env.DOCUMENT_INTELLIGENCE_MODEL = 'not-a-real-model'
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => getDocumentIntelligenceProvider()).toThrow(UnverifiedModelError)

    expect(spy).toHaveBeenCalledTimes(1)
    const [logLabel, fields] = spy.mock.calls[0]
    expect(logLabel).toBe('document-intelligence provider error')
    expect(fields).toMatchObject({ provider: 'anthropic', errorClass: 'UnverifiedModelError' })
    // Never logs the raw env value as a top-level secret-shaped field —
    // it may appear inside the (length-capped) message string, which is
    // fine (it's an operator-set config value, not a secret or user data).
    expect(fields).not.toHaveProperty('apiKey')
    expect(fields).not.toHaveProperty('DOCUMENT_INTELLIGENCE_MODEL')
  })

  it('constructs successfully (no throw, no log) with a valid/unset model config', () => {
    delete process.env.DOCUMENT_INTELLIGENCE_MODEL
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => getDocumentIntelligenceProvider()).not.toThrow()
    expect(spy).not.toHaveBeenCalled()
  })
})
