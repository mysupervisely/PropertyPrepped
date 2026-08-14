// ============================================================================
// TEMPORARY — M8 production AI diagnostic (Netlify function logs outage).
//
// This ENTIRE FILE is a temporary, easily-removable production diagnostic
// mechanism. It exists only so an authorized internal PropRoster account can
// see a sanitized category of why "Analyze with PropRoster AI" is failing in
// production, while Netlify's function-log service is unavailable. Delete
// this file — and the ~6 lines it's wired into in providers/anthropic.ts,
// analyze-request.ts, and app/api/document-intelligence/analyze/route.ts,
// all marked "TEMPORARY M8 DIAGNOSTIC" — once the new production failure is
// diagnosed. See the completion report for the exact removal list.
//
// This does NOT make a second Anthropic API call. It only re-packages the
// SAME error object the existing (unchanged) logProviderError() call in
// providers/anthropic.ts already has in hand — the extraction logic itself
// is imported from provider-logging.ts, not duplicated, so there is exactly
// one place that decides which fields are safe to surface.
//
// Field contract (matches the task's explicit allowlist exactly):
//   provider, model, httpStatus, anthropicErrorType, errorClass, requestId,
//   safeMessage (Anthropic's own short structured error string, length-capped)
//
// NEVER included, by construction — this file never reads or forwards any
// of these, and the underlying extraction (buildProviderErrorLogFields)
// never captures them in the first place:
//   ANTHROPIC_API_KEY, Authorization headers, the Supabase service-role key,
//   signed storage URLs, PDF/base64 contents, document text, the raw
//   request payload, the raw response body, other environment variables,
//   tenant information, other users' information.
// ============================================================================

import { buildProviderErrorLogFields } from './provider-logging'

export type TempProviderDiagnostics = {
  provider: string
  model: string
  httpStatus: number | null
  anthropicErrorType: string | null
  errorClass: string
  requestId: string | null
  /** Anthropic's own short structured error message, already length-capped by buildProviderErrorLogFields. */
  safeMessage: string | null
}

/**
 * Builds the sanitized diagnostic object from an already-caught provider
 * error. Pure — no network call, no re-invocation of Anthropic. Reuses the
 * exact same field-extraction logic the permanent safe-logging pass
 * (provider-logging.ts) already uses, so this can never expose anything the
 * existing, audited server logs don't already expose.
 */
export function buildTempProviderDiagnostics(err: unknown, context: { provider: string; model: string }): TempProviderDiagnostics {
  const fields = buildProviderErrorLogFields(err, {
    provider: context.provider,
    model: context.model,
    // Not part of the diagnostic contract exposed to the client (the task's
    // field list is provider/model/httpStatus/anthropicErrorType/
    // errorClass/requestId/safeMessage only) — passed as safe placeholders
    // purely to satisfy buildProviderErrorLogFields' existing signature,
    // never read back out below.
    apiKeyConfigured: false,
    documentByteSize: -1,
  })
  return {
    provider: fields.provider,
    model: fields.model,
    httpStatus: fields.status,
    anthropicErrorType: fields.anthropicErrorType,
    errorClass: fields.errorClass,
    requestId: fields.requestId,
    safeMessage: fields.message,
  }
}

/**
 * Thrown by providers/anthropic.ts INSTEAD OF the original error so the
 * sanitized diagnostics computed once, at the point of failure, can travel
 * up through analyze-document.ts (an untouched pass-through) to
 * analyze-request.ts without a second Anthropic call or a second parse of
 * the original error. `original` is kept only for completeness/debugging
 * within this process — it is never serialized into any HTTP response.
 */
export class TempProviderDiagnosticError extends Error {
  readonly diagnostics: TempProviderDiagnostics
  readonly original: unknown

  constructor(original: unknown, diagnostics: TempProviderDiagnostics) {
    super(original instanceof Error ? original.message : 'AI provider request failed.')
    this.name = 'TempProviderDiagnosticError'
    this.diagnostics = diagnostics
    this.original = original
  }
}
