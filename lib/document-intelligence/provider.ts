// PropPrepped Milestone 8: AI provider abstraction (Section A).
//
// Nothing outside this module (the API route, analyze-document.ts, the UI)
// knows this is Anthropic. Swapping providers later means writing a new
// class that satisfies DocumentIntelligenceProvider and changing the single
// line in getDocumentIntelligenceProvider() below — no other file changes.

import type { DocumentType } from './types'
import type { DocumentAnalysisOutput } from './schemas'
import { AnthropicDocumentIntelligenceProvider } from './providers/anthropic'

export type AnalyzeProviderInput = {
  documentType: DocumentType
  fileBuffer: ArrayBuffer
  fileName: string
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

export function getDocumentIntelligenceProvider(): DocumentIntelligenceProvider {
  return new AnthropicDocumentIntelligenceProvider()
}
