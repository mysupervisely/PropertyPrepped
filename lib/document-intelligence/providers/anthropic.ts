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
import { resolveDocumentIntelligenceModel } from '../model-config'
import type { AnalyzeProviderInput, AnalyzeProviderResult, DocumentIntelligenceProvider } from '../provider'

export class AnthropicDocumentIntelligenceProvider implements DocumentIntelligenceProvider {
  readonly name = 'anthropic'
  private client: Anthropic
  private model: string

  constructor() {
    // Reads ANTHROPIC_API_KEY from the environment. Never pass a key from
    // client input — this constructor only runs on the server.
    this.client = new Anthropic()
    // Throws UnverifiedModelError immediately (before any network call) if
    // DOCUMENT_INTELLIGENCE_MODEL is set to something unrecognized — see
    // model-config.ts for the verification source and the full model list.
    this.model = resolveDocumentIntelligenceModel()
  }

  // Source traceability design note (hardening pass, Section on citations):
  // Anthropic's Messages API also offers a native "citations" feature that
  // grounds output in exact document locations, but as of this SDK version
  // it is not usable together with `output_config.format` structured
  // outputs — the two features occupy the same response-shaping mechanism,
  // and this provider depends on structured outputs for the whole
  // groups/fields/itemsToReview extraction shape. `sourcePage`/
  // `sourceSnippet` below are therefore the model's own best-effort recall
  // of where it saw a value, produced by prompting it to self-report a page
  // number (see prompts.ts) — NOT the SDK's verified citation mechanism.
  // Every layer that surfaces these values (schemas.ts field docs,
  // analyze-request.ts, DocumentIntelligencePanel.tsx) must keep calling
  // them "AI-extracted references to verify," never "citations."
  //
  // Future path (not implemented here): a citation-enabled pipeline would
  // need to drop structured outputs and instead prompt for each field
  // individually (or post-process free text into the current shape) so
  // `citations: { enabled: true }` can be set per document block — a larger
  // change deliberately out of scope for this hardening pass.
  async analyzeDocument(input: AnalyzeProviderInput): Promise<AnalyzeProviderResult> {
    const base64 = Buffer.from(input.fileBuffer).toString('base64')

    const response = await this.client.messages.parse({
      model: this.model,
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
