// PropPrepped Milestone 8: pure orchestration between a provider and its result.
//
// Deliberately provider-agnostic and side-effect-free (no Supabase, no HTTP)
// so it's trivially testable with a fake DocumentIntelligenceProvider — see
// analyze-document.test.ts.

import type { DocumentType } from './types'
import type { DocumentAnalysisOutput } from './schemas'
import type { DocumentIntelligenceProvider } from './provider'

export type AnalyzeDocumentInput = {
  documentType: DocumentType
  fileBuffer: ArrayBuffer
  fileName: string
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'
}

export type AnalyzeDocumentResult = {
  output: DocumentAnalysisOutput
  provider: string
  modelName: string
  usage: { inputTokens: number; outputTokens: number }
}

export async function analyzeDocument(
  input: AnalyzeDocumentInput,
  provider: DocumentIntelligenceProvider,
): Promise<AnalyzeDocumentResult> {
  const result = await provider.analyzeDocument(input)
  return {
    output: result.output,
    provider: provider.name,
    modelName: result.modelName,
    usage: result.usage,
  }
}
