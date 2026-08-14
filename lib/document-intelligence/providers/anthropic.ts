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
import { DocumentAnalysisSchema, getProviderSchemaForDocumentType } from '../schemas'
import { normalizeDocumentTypeAnalysis } from '../normalize-analysis'
import { buildSystemPrompt, buildUserPrompt } from '../prompts'
import { resolveDocumentIntelligenceModel } from '../model-config'
import { logProviderError } from '../provider-logging'
// TEMPORARY M8 DIAGNOSTIC (Netlify function-log outage) — remove this
// import and the throw it enables below once the new production failure
// is diagnosed. See lib/document-intelligence/temp-diagnostics.ts for the
// full rationale; this never adds a second Anthropic call or a second
// error inspection, it only carries the SAME logProviderError() context
// forward so an authorized caller can see it without server log access.
import { TempProviderDiagnosticError, buildTempProviderDiagnostics } from '../temp-diagnostics'
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
  //
  // Schema architecture note (three production incidents — full history in
  // schemas.ts's provider-schema comments): Anthropic's structured outputs
  // separately cap a schema's UNION-typed parameters, its OPTIONAL
  // (non-required) parameters, AND the overall compiled-grammar complexity
  // of the schema as a whole. The internal DocumentAnalysisSchema (imported
  // for the final strict re-validation below, and used everywhere else in
  // this app) has 36 nullable fields and an open-ended `groups` array — a
  // single universal request schema built from it hit all three limits in
  // turn as each was fixed. The REQUEST below now uses
  // getProviderSchemaForDocumentType(input.documentType) — a small schema
  // containing only the fields THIS document type actually needs, decided
  // once, before the call, from the document type PropRoster already knows
  // (no second Anthropic call to classify first). The RESPONSE is
  // converted back to the internal shape by normalizeDocumentTypeAnalysis()
  // and then re-validated against the exact same strict
  // DocumentAnalysisSchema every caller has always received.
  async analyzeDocument(input: AnalyzeProviderInput): Promise<AnalyzeProviderResult> {
    // Diagnostics pass: everything from the API call through parsing is
    // wrapped in one try/catch so EVERY failure mode this provider can hit
    // (auth/billing/rate-limit/model errors from Anthropic, a content
    // refusal, or a structured-output parse failure) gets the same safe
    // server-side log line before propagating unchanged to the caller.
    // analyze-request.ts's own catch block (which converts any error here
    // into the generic client-facing message) is completely untouched —
    // this only ADDS a log line, it never changes what gets thrown or what
    // the client ultimately sees.
    try {
      const base64 = Buffer.from(input.fileBuffer).toString('base64')

      // The ONE schema-selection decision, made once, before the (single)
      // Anthropic call — from the document type PropRoster already knows.
      // See schemas.ts's getProviderSchemaForDocumentType() for why this is
      // centralized here rather than scattered.
      const providerSchema = getProviderSchemaForDocumentType(input.documentType)

      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: 8000,
        thinking: { type: 'adaptive' },
        system: buildSystemPrompt(),
        output_config: {
          format: zodOutputFormat(providerSchema),
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

      // response.parsed_output is already Zod-validated against the
      // document-type-specific provider schema by the SDK's own
      // zodOutputFormat() parse step — but that's still the provider-facing
      // shape (only the fields this document type's schema included, plus
      // {value,identified} wrappers). normalizeDocumentTypeAnalysis()
      // converts it to the internal universal shape, and
      // DocumentAnalysisSchema.parse() then re-validates the result against
      // the SAME strict schema every caller has always gotten — this never
      // trusts the model's output (or this file's own normalization) as
      // final without that second, independent check.
      const output = DocumentAnalysisSchema.parse(normalizeDocumentTypeAnalysis(input.documentType, response.parsed_output))

      return {
        output,
        modelName: response.model,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
        },
      }
    } catch (err) {
      // Existing M8 diagnostics-pass logging — UNCHANGED. Still the
      // permanent record of every provider failure in server logs.
      logProviderError(err, {
        provider: this.name,
        model: this.model,
        apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
        documentByteSize: input.fileBuffer.byteLength,
      })
      // TEMPORARY M8 DIAGNOSTIC: wrap (never replace the underlying cause)
      // so analyze-request.ts can, for an authorized caller only, return
      // the exact same sanitized fields already computed above — no
      // second Anthropic call, no second parse of `err`. Remove this
      // throw (revert to `throw err`) once the new production failure is
      // diagnosed.
      throw new TempProviderDiagnosticError(err, buildTempProviderDiagnostics(err, { provider: this.name, model: this.model }))
    }
  }
}
