// TEMPORARY M8 DIAGNOSTIC — delete this file alongside temp-diagnostics.ts.
import { describe, expect, it } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { buildTempProviderDiagnostics, TempProviderDiagnosticError } from './temp-diagnostics'

function fakeApiError(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  // Builds a real Anthropic.APIError subclass instance the exact way the
  // SDK itself constructs one from an HTTP response — matches the pattern
  // already used in provider-logging.test.ts.
  return Anthropic.APIError.generate(status, { error: body }, undefined, new Headers(headers))
}

describe('buildTempProviderDiagnostics', () => {
  it('extracts exactly the seven documented fields from a real Anthropic APIError', () => {
    const err = fakeApiError(
      400,
      { type: 'invalid_request_error', message: 'Schemas contains too many parameters with union types.' },
      { 'request-id': 'req_test123' },
    )
    const diagnostics = buildTempProviderDiagnostics(err, { provider: 'anthropic', model: 'claude-sonnet-5' })
    // err.message is however the SDK's own APIError.makeMessage() formats it
    // (status + a JSON-stringified error body when no bare top-level
    // `message` field is present) — buildProviderErrorLogFields (reused
    // here) has never re-parsed that string, it passes it through as-is,
    // so this asserts containment of the real content, not an exact format
    // this file doesn't control.
    expect(diagnostics.safeMessage).toContain('Schemas contains too many parameters with union types.')
    expect(diagnostics).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      httpStatus: 400,
      anthropicErrorType: 'invalid_request_error',
      errorClass: 'BadRequestError',
      requestId: 'req_test123',
      safeMessage: diagnostics.safeMessage,
    })
  })

  it('has exactly the seven documented keys — never an eighth field like apiKeyConfigured or documentByteSize', () => {
    const err = fakeApiError(500, { type: 'api_error', message: 'Internal server error' })
    const diagnostics = buildTempProviderDiagnostics(err, { provider: 'anthropic', model: 'claude-sonnet-5' })
    expect(Object.keys(diagnostics).sort()).toEqual(['anthropicErrorType', 'errorClass', 'httpStatus', 'model', 'provider', 'requestId', 'safeMessage'].sort())
  })

  it('caps safeMessage length the same way the permanent logger does (never an unbounded string)', () => {
    const longMessage = 'x'.repeat(5000)
    const err = fakeApiError(400, { type: 'invalid_request_error', message: longMessage })
    const diagnostics = buildTempProviderDiagnostics(err, { provider: 'anthropic', model: 'claude-sonnet-5' })
    expect(diagnostics.safeMessage!.length).toBeLessThan(400)
  })

  it('handles a plain (non-Anthropic) Error safely, with null status/type/requestId', () => {
    const diagnostics = buildTempProviderDiagnostics(new Error('The AI declined to analyze this document.'), { provider: 'anthropic', model: 'claude-sonnet-5' })
    expect(diagnostics.httpStatus).toBeNull()
    expect(diagnostics.anthropicErrorType).toBeNull()
    expect(diagnostics.requestId).toBeNull()
    expect(diagnostics.errorClass).toBe('Error')
    expect(diagnostics.safeMessage).toBe('The AI declined to analyze this document.')
  })

  it('never fabricates a requestId, status, or type for a defensive non-Error throw', () => {
    const diagnostics = buildTempProviderDiagnostics('a raw string throw', { provider: 'anthropic', model: 'claude-sonnet-5' })
    expect(diagnostics.httpStatus).toBeNull()
    expect(diagnostics.anthropicErrorType).toBeNull()
    expect(diagnostics.requestId).toBeNull()
    expect(diagnostics.safeMessage).toBeNull()
  })

  it('never includes a secret-looking substring for a realistic 401 (bad API key) error', () => {
    const err = fakeApiError(401, { type: 'authentication_error', message: 'invalid x-api-key' })
    const diagnostics = buildTempProviderDiagnostics(err, { provider: 'anthropic', model: 'claude-sonnet-5' })
    const serialized = JSON.stringify(diagnostics).toLowerCase()
    for (const forbidden of ['sk-ant-', 'authorization:', 'bearer ']) {
      expect(serialized.includes(forbidden)).toBe(false)
    }
  })
})

describe('TempProviderDiagnosticError', () => {
  it('preserves the original error message for anything that reads err.message generically', () => {
    const original = new Error('upstream failure')
    const wrapped = new TempProviderDiagnosticError(original, {
      provider: 'anthropic', model: 'claude-sonnet-5', httpStatus: null, anthropicErrorType: null, errorClass: 'Error', requestId: null, safeMessage: 'upstream failure',
    })
    expect(wrapped.message).toBe('upstream failure')
    expect(wrapped.name).toBe('TempProviderDiagnosticError')
    expect(wrapped.diagnostics.safeMessage).toBe('upstream failure')
    expect(wrapped.original).toBe(original)
  })

  it('is an instanceof Error (so generic error handling upstream still works)', () => {
    const wrapped = new TempProviderDiagnosticError(new Error('x'), {
      provider: 'anthropic', model: 'claude-sonnet-5', httpStatus: null, anthropicErrorType: null, errorClass: 'Error', requestId: null, safeMessage: null,
    })
    expect(wrapped instanceof Error).toBe(true)
  })
})
