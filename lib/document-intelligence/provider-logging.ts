// PropRoster Milestone 8 (diagnostics pass): safe, structured logging for
// AI provider failures.
//
// Root problem this fixes: lib/document-intelligence/analyze-request.ts's
// `catch { ... }` around the provider call previously discarded the actual
// error entirely — nothing about *why* Anthropic failed ever reached the
// server logs, only the generic client-facing message. That message must
// stay exactly as-is (it's deliberately generic — never surface raw
// provider errors to the browser, which could echo request internals or an
// UnverifiedModelError naming an internal config value). This module exists
// so the REAL cause is still diagnosable from Netlify function logs.
//
// Field extraction is a pure function (error in, plain object out) on
// purpose — it needs no live Anthropic client, network call, or API key to
// unit test, unlike the provider class itself.
//
// Allowed fields ONLY (matches the diagnostics report's explicit allowlist):
// error class/name, HTTP/status code, Anthropic error type, model name,
// whether ANTHROPIC_API_KEY is configured (boolean only), request/document
// byte size, provider name — plus Anthropic's own opaque requestId, which
// is safe (no user data, just an id you'd hand to Anthropic support) and
// significantly speeds up real diagnosis.
//
// NEVER included, by construction: the API key itself, any Authorization
// header, the raw request/response body, PDF bytes or base64, signed
// Supabase URLs, or document text. `message` is only ever populated from
// Anthropic's own short structured error string (e.g. "Your credit balance
// is too low to access the Claude API", "invalid x-api-key") or from an
// Error this codebase itself threw (e.g. "The AI declined to analyze this
// document.") — Anthropic's error responses do not echo request content
// back, so this can never contain document text. Still length-capped as a
// second line of defense against an unexpectedly long message.

import { APIError } from '@anthropic-ai/sdk'

export type ProviderErrorLogContext = {
  provider: string
  model: string
  apiKeyConfigured: boolean
  documentByteSize: number
}

export type ProviderErrorLogFields = ProviderErrorLogContext & {
  errorClass: string
  status: number | null
  anthropicErrorType: string | null
  requestId: string | null
  message: string | null
}

const MAX_MESSAGE_LENGTH = 300

function truncate(message: string): string {
  return message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…` : message
}

/**
 * Pulls only the safe diagnostic fields out of a caught provider error.
 * Handles three shapes: an Anthropic APIError (or subclass — Authentication/
 * PermissionDenied/RateLimit/NotFound/BadRequest/UnprocessableEntity/
 * InternalServer/Connection error, all extend APIError and carry
 * status/type/requestID), a plain Error (thrown by this codebase, e.g. a
 * refusal or an UnverifiedModelError), or a non-Error throw (defensive —
 * should not happen, but never crash the logger over it).
 */
export function buildProviderErrorLogFields(err: unknown, context: ProviderErrorLogContext): ProviderErrorLogFields {
  if (err instanceof APIError) {
    return {
      ...context,
      errorClass: err.constructor.name,
      status: typeof err.status === 'number' ? err.status : null,
      anthropicErrorType: err.type ?? null,
      requestId: err.requestID ?? null,
      message: typeof err.message === 'string' && err.message ? truncate(err.message) : null,
    }
  }

  if (err instanceof Error) {
    return {
      ...context,
      errorClass: err.constructor?.name || err.name || 'Error',
      status: null,
      anthropicErrorType: null,
      requestId: null,
      message: err.message ? truncate(err.message) : null,
    }
  }

  return {
    ...context,
    errorClass: typeof err,
    status: null,
    anthropicErrorType: null,
    requestId: null,
    message: null,
  }
}

/** Logs the safe fields to the server console (Netlify function logs). */
export function logProviderError(err: unknown, context: ProviderErrorLogContext): void {
  console.error('document-intelligence provider error', buildProviderErrorLogFields(err, context))
}
