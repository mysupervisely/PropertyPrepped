// PropPrepped Milestone 8: Anthropic (Claude) implementation of
// DocumentIntelligenceProvider. This is the only file in the codebase that
// imports the Anthropic SDK — every other module talks to the
// DocumentIntelligenceProvider interface instead.
//
// Server-only: this file (and the SDK client it constructs) must never be
// imported from a 'use client' component. ANTHROPIC_API_KEY is read by the
// SDK from the environment and never sent to, or accepted from, the browser.

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { DocumentAnalysisSchema, type DocumentAnalysisOutput } from '../schemas'
import { buildSystemPrompt, buildUserPrompt } from '../prompts'
import type { AnalyzeProviderInput, AnalyzeProviderResult, DocumentIntelligenceProvider } from '../provider'

// Configurable so a deployment can move to a cheaper/faster model (cost
// control, Section S) without a code change. Defaults to Sonnet: strong
// extraction accuracy at a materially lower per-document cost than Opus,
// which matters once analyses are metered per user.
const MODEL = process.env.DOCUMENT_INTELLIGENCE_MODEL || 'claude-sonnet-5'

export class AnthropicDocumentIntelligenceProvider implements DocumentIntelligenceProvider {
  readonly name = 'anthropic'
  private client: Anthropic

  constructor() {
    // Reads ANTHROPIC_API_KEY from the environment. Never pass a key from
    // client input — this constructor only runs on the server.
    this.client = new Anthropic()
  }

  async analyzeDocument(input: AnalyzeProviderInput): Promise<AnalyzeProviderResult> {
    const base64 = Buffer.from(input.fileBuffer).toString('base64')

    const response = await this.client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: buildSystemPrompt(),
      output_config: {
        format: zodOutputFormat(DocumentAnalysisSchema),
        effort: 'medium',
      },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            },
            { type: 'text', text: buildUserPrompt(input.documentType, input.fileName) },
          ],
        },
      ],
    })

    if (response.stop_reason === 'refusal') {
      throw new Error('The AI declined to analyze this document.')
    }
    if (!response.parsed_output) {
      throw new Error('The AI response could not be parsed into the expected structure.')
    }

    return {
      output: response.parsed_output as DocumentAnalysisOutput,
      modelName: response.model,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
    }
  }
}
