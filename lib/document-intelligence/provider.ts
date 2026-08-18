// PropPrepped Milestone 8: AI provider abstraction (Section A).
//
// Nothing outside this module (the API route, analyze-document.ts, the UI)
// knows this is Anthropic. Swapping providers later means writing a new
// class that satisfies DocumentIntelligenceProvider and changing the single
// line in getDocumentIntelligenceProvider() below — no other file changes.

import type { DocumentType } from './types'
import type { DocumentAnalysisOutput } from './schemas'
import { AnthropicDocumentIntelligenceProvider } from './providers/anthropic'
import { logProviderError } from './provider-logging'

export type AnalyzeProviderInput = {
  documentType: DocumentType
  fileBuffer: ArrayBuffer
  fileName: string
  // Smart Upload Foundation: which content-block shape to send to
  // Anthropic (document vs. image) — see providers/anthropic.ts.
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'
}

export type AnalyzeProviderResult = {
  output: DocumentAnalysisOutput
  modelName: string
  usage: { inputTokens: number; outputTokens: number }
}

export interface DocumentIntelligenceProvider {
  readonly name: string
  analyzeDocument(input: AnalyzeProviderInput): Promise<AnalyzeProviderResult>
}

/**
 * True only when the required environment variable is present. The rest of
 * the app must keep working when this is false (Section A) — callers use
 * this to show "AI document analysis has not been configured yet." instead
 * of attempting a request.
 */
export function isDocumentIntelligenceConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

/**
 * Diagnostics pass: construction can throw before analyzeDocument() is ever
 * entered — most notably UnverifiedModelError if DOCUMENT_INTELLIGENCE_MODEL
 * is set to something not in model-config.ts's verified list. Without this
 * try/catch, that failure previously reached analyze-request.ts's generic
 * `catch { ... }` with zero server-side trace, identical in symptom to a
 * real Anthropic API failure ("green" function invocation, generic client
 * message, nothing in the logs). Logged and re-thrown unchanged — the
 * client-facing behavior is untouched either way.
 */
export function getDocumentIntelligenceProvider(): DocumentIntelligenceProvider {
  try {
    return new AnthropicDocumentIntelligenceProvider()
  } catch (err) {
    logProviderError(err, {
      provider: 'anthropic',
      // The model that failed to resolve is exactly what's unverified —
      // not available as a clean value here (that's the whole problem),
      // so this stays a fixed marker rather than guessing.
      model: 'unresolved (construction failed)',
      apiKeyConfigured: isDocumentIntelligenceConfigured(),
      documentByteSize: -1,
    })
    throw err
  }
}
