// PropPrepped Milestone 8 (hardening pass): verified Anthropic model
// configuration.
//
// VERIFICATION SOURCE — not a guess. The default below, "claude-sonnet-5",
// was cross-checked against two independent sources at the time this file
// was written, using the exact @anthropic-ai/sdk version installed in this
// project (see package.json — 0.116.0 at the time of writing):
//
//   1. The installed SDK's own type definitions ship the current model
//      list as a union type:
//        node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts
//        export type Model = 'claude-sonnet-5' | 'claude-fable-5' |
//          'claude-mythos-5' | 'claude-opus-5' | 'claude-opus-4-8' |
//          'claude-opus-4-7' | ... | 'claude-haiku-4-5' | ...
//      "claude-sonnet-5" is a first-class member of that union, not a
//      free-form string — the SDK itself knows this model exists.
//   2. The SDK's CHANGELOG.md records its introduction explicitly:
//        "api: add support for claude-sonnet-5"
//      confirming it is a real, currently-supported model id and not a
//      deprecated/renamed/placeholder string.
//
// Feature support relevant to this file's usage (PDF document input via a
// `document` content block, structured outputs via `output_config.format`,
// and adaptive thinking) is documented as available on Claude Sonnet 5 by
// Anthropic — Sonnet-class models are the recommended balance of extraction
// accuracy and per-document cost for this workload (Section S: cost
// control), which is why Sonnet was chosen over an Opus-tier default.
//
// DOCUMENT_INTELLIGENCE_MODEL remains OPTIONAL: if unset, the verified
// default below is used. If it IS set, it must name one of the
// VERIFIED_MODELS below — an unrecognized value fails fast with a clear
// error (caught by analyze-request.ts and surfaced as a graceful "analysis
// failed" response) rather than being sent to the API unexamined. This
// satisfies "do not invent a model identifier" for both the default AND any
// operator override.
//
// Re-verified during the M8 production-diagnostics pass (live analysis was
// failing with a generic error and no server-side trace): "claude-sonnet-5"
// is still present in the installed SDK's Model union (still 0.116.0 — see
// package.json), and is independently listed as a current, real model id in
// this assistant's own runtime context (separate from the SDK's own
// self-reported types). NOT changed here without live evidence — being
// present in a TypeScript union has never guaranteed callability for a
// specific API key/account (billing/credits, revoked keys, and
// account-level model access restrictions are all real failure modes a
// type check can't catch), and swapping the model without a confirmed
// signal would be a guess. lib/document-intelligence/provider-logging.ts
// (added in that same pass) now logs the model name alongside Anthropic's
// own error type/status on every failure, so the NEXT production attempt
// will show definitively whether the model itself is the problem (e.g. a
// 404/not_found_error naming this model) versus something else entirely
// (401 = bad key, 400 mentioning credits = billing not enabled, 429 = rate
// limited). See the diagnostics report for the exact next test to run.

export const DEFAULT_MODEL = 'claude-sonnet-5'

// Every id here is present in the installed SDK's `Model` union type
// (see verification note above) and is documented by Anthropic as
// supporting PDF document input + structured outputs (output_config.format)
// + adaptive thinking — the three Messages API features this provider uses.
export const VERIFIED_MODELS = [
  'claude-sonnet-5',
  'claude-opus-5',
  'claude-haiku-4-5',
  'claude-opus-4-8',
  'claude-fable-5',
] as const

export type VerifiedModel = (typeof VERIFIED_MODELS)[number]

export class UnverifiedModelError extends Error {
  constructor(configured: string) {
    super(
      `DOCUMENT_INTELLIGENCE_MODEL is set to "${configured}", which is not a verified model id. ` +
        `Supported values: ${VERIFIED_MODELS.join(', ')}. Unset the variable to use the default (${DEFAULT_MODEL}).`,
    )
    this.name = 'UnverifiedModelError'
  }
}

/**
 * Resolves the model id to use, validating any operator override against
 * the verified list. Throws UnverifiedModelError rather than silently
 * forwarding an unrecognized string to the Anthropic API.
 */
export function resolveDocumentIntelligenceModel(env: Record<string, string | undefined> = process.env): string {
  const configured = env.DOCUMENT_INTELLIGENCE_MODEL?.trim()
  if (!configured) return DEFAULT_MODEL
  if (!(VERIFIED_MODELS as readonly string[]).includes(configured)) {
    throw new UnverifiedModelError(configured)
  }
  return configured
}
