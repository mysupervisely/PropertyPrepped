import { describe, expect, it } from 'vitest'
import { APIError } from '@anthropic-ai/sdk'
import { buildProviderErrorLogFields } from './provider-logging'

const CONTEXT = {
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  apiKeyConfigured: true,
  documentByteSize: 123_456,
}

describe('buildProviderErrorLogFields — safe fields only, never secrets/payload/document content', () => {
  it('extracts status/type/requestId/message from a real Anthropic APIError shape (built the same way the SDK itself builds one from an HTTP response)', () => {
    // Mirrors AuthenticationError: a revoked/invalid API key.
    const headers = new Headers({ 'request-id': 'req_test_auth_123' })
    const err = APIError.generate(401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } }, undefined, headers)

    const fields = buildProviderErrorLogFields(err, CONTEXT)

    expect(fields.errorClass).toBe('AuthenticationError')
    expect(fields.status).toBe(401)
    expect(fields.anthropicErrorType).toBe('authentication_error')
    expect(fields.requestId).toBe('req_test_auth_123')
    expect(fields.message).toContain('invalid x-api-key')
    // Context is passed through untouched.
    expect(fields.provider).toBe('anthropic')
    expect(fields.model).toBe('claude-sonnet-5')
    expect(fields.apiKeyConfigured).toBe(true)
    expect(fields.documentByteSize).toBe(123_456)
  })

  it('correctly identifies a billing/credit error (400 invalid_request_error) — the most likely real-world "works locally, silent in prod" cause', () => {
    const err = APIError.generate(
      400,
      { error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Claude API.' } },
      undefined,
      new Headers(),
    )
    const fields = buildProviderErrorLogFields(err, CONTEXT)
    expect(fields.errorClass).toBe('BadRequestError')
    expect(fields.status).toBe(400)
    expect(fields.anthropicErrorType).toBe('invalid_request_error')
    expect(fields.message).toContain('credit balance')
  })

  it('correctly identifies a model-not-found error (404)', () => {
    const err = APIError.generate(404, { error: { type: 'not_found_error', message: 'model: bogus-model-id' } }, undefined, new Headers())
    const fields = buildProviderErrorLogFields(err, CONTEXT)
    expect(fields.errorClass).toBe('NotFoundError')
    expect(fields.status).toBe(404)
    expect(fields.anthropicErrorType).toBe('not_found_error')
  })

  it('correctly identifies a rate-limit error (429)', () => {
    const err = APIError.generate(429, { error: { type: 'rate_limit_error', message: 'Number of requests too high' } }, undefined, new Headers())
    const fields = buildProviderErrorLogFields(err, CONTEXT)
    expect(fields.errorClass).toBe('RateLimitError')
    expect(fields.status).toBe(429)
  })

  it('correctly identifies an Anthropic-side server error (5xx)', () => {
    const err = APIError.generate(529, { error: { type: 'overloaded_error', message: 'Overloaded' } }, undefined, new Headers())
    const fields = buildProviderErrorLogFields(err, CONTEXT)
    expect(fields.errorClass).toBe('InternalServerError')
    expect(fields.status).toBe(529)
  })

  it('falls back gracefully for a plain Error (e.g. a content refusal or a parse failure thrown by this codebase, not the SDK)', () => {
    const err = new Error('The AI declined to analyze this document.')
    const fields = buildProviderErrorLogFields(err, CONTEXT)
    expect(fields.errorClass).toBe('Error')
    expect(fields.status).toBeNull()
    expect(fields.anthropicErrorType).toBeNull()
    expect(fields.requestId).toBeNull()
    expect(fields.message).toBe('The AI declined to analyze this document.')
  })

  it('names a custom Error subclass correctly (e.g. UnverifiedModelError)', () => {
    class UnverifiedModelError extends Error {
      constructor(configured: string) {
        super(`DOCUMENT_INTELLIGENCE_MODEL is set to "${configured}", which is not a verified model id.`)
        this.name = 'UnverifiedModelError'
      }
    }
    const fields = buildProviderErrorLogFields(new UnverifiedModelError('gpt-5'), CONTEXT)
    expect(fields.errorClass).toBe('UnverifiedModelError')
    expect(fields.message).toContain('DOCUMENT_INTELLIGENCE_MODEL')
  })

  it('never throws and still returns a shape for a non-Error throw (defensive)', () => {
    expect(() => buildProviderErrorLogFields('a raw string throw', CONTEXT)).not.toThrow()
    expect(() => buildProviderErrorLogFields(null, CONTEXT)).not.toThrow()
    expect(() => buildProviderErrorLogFields(undefined, CONTEXT)).not.toThrow()
    const fields = buildProviderErrorLogFields({ some: 'object' }, CONTEXT)
    expect(fields.message).toBeNull()
    expect(fields.status).toBeNull()
  })

  it('truncates an unexpectedly long message rather than logging it in full', () => {
    const longMessage = 'x'.repeat(5000)
    const err = new Error(longMessage)
    const fields = buildProviderErrorLogFields(err, CONTEXT)
    expect(fields.message).not.toBeNull()
    expect(fields.message!.length).toBeLessThan(320)
  })

  it('never includes any field name/value resembling a secret, header, or payload — allowlist is exhaustive', () => {
    const err = APIError.generate(401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } }, undefined, new Headers())
    const fields = buildProviderErrorLogFields(err, CONTEXT)
    const keys = Object.keys(fields)
    expect(keys.sort()).toEqual(
      ['provider', 'model', 'apiKeyConfigured', 'documentByteSize', 'errorClass', 'status', 'anthropicErrorType', 'requestId', 'message'].sort(),
    )
    // No raw headers, no api key value, no request body ever present.
    expect(fields).not.toHaveProperty('headers')
    expect(fields).not.toHaveProperty('apiKey')
    expect(fields).not.toHaveProperty('error') // the raw parsed body — deliberately not surfaced, only its .type
  })
})
