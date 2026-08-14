// PropRoster Milestone 11 (Privacy-First Admin Analytics): deterministic
// per-model Anthropic pricing, used ONLY to estimate PropRoster's own AI
// spend for internal admin analytics. This is not a customer-facing price
// and never touches billing — ai_usage_events already records the exact
// input/output token counts for every real call; this file just prices
// those counts.
//
// Source: Anthropic's published Claude API pricing (dollars per million
// tokens), covering every model lib/document-intelligence/model-config.ts
// currently accepts (DEFAULT_MODEL + VERIFIED_MODELS) so an admin never
// sees a silently-missing cost line for a model this app can actually
// call. Standard (non-promotional) list pricing is used deliberately: as
// of this writing claude-sonnet-5 carries a lower introductory rate
// through 2026-08-31, but pricing this estimate off a temporary promo
// would make it silently wrong the moment the promo ends. This is a
// documented, stable estimate for internal operations — never an invoice,
// never shown to a customer, never used to bill anyone.
//
// If a model is ever called that isn't in this table, estimateCostUsd()
// returns null rather than guessing — the UI must render "cost unknown"
// for that row, never a fabricated number.
export const ANTHROPIC_MODEL_PRICING_USD_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5': { input: 3.0, output: 15.0 },
  'claude-opus-5': { input: 5.0, output: 25.0 },
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-opus-4-8': { input: 5.0, output: 25.0 },
  'claude-fable-5': { input: 10.0, output: 50.0 },
}

/**
 * Estimated USD cost for a batch of calls against one model. Returns null
 * (never a guess) when the model isn't in the pricing table above.
 */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const pricing = ANTHROPIC_MODEL_PRICING_USD_PER_MILLION_TOKENS[model]
  if (!pricing) return null
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
}
