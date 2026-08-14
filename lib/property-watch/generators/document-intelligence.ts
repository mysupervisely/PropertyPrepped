// PropRoster Milestone 11: Property Watch — M8 Document Intelligence
// integration (Section 12).
//
// Deliberately decoupled from lib/document-intelligence's actual schema
// types (no import from there) — this file only depends on a small
// structural type describing exactly the fields it needs, so a change to
// the AI schema can never silently change Property Watch behavior without
// a type error surfacing here too.
//
// Supported fields (Section 12's list, as far as today's applyFields
// schema actually extracts them): lease endDate, insurance
// expirationDate, mortgage maturityDate. Property Tax Document and HOA
// Document analyses do NOT populate lib/document-intelligence's flat
// `applyFields` today (see prompts.ts — only groups/fields are filled for
// those two types, in free-form prose), so this generator does not attempt
// to parse tax/HOA dates out of AI-written group labels; doing so would
// mean guessing at label text rather than reading a well-known field,
// which is the opposite of "deterministic." Tax/HOA increases are instead
// covered deterministically by generators/ledger.ts, and a tax due date or
// appeal deadline can be added as a manual reminder today.
//
// CONFIDENCE POLICY (Section 12 — "do not silently convert low-confidence
// guesses into critical reminders"): applyFields itself carries no
// per-field confidence (only the free-form `groups` do, and matching a
// flat field back to a group entry would mean fuzzy string-matching
// AI-generated prose — again, not deterministic). This generator instead
// gates on the document's own overall classification.confidence, which the
// model already assigns deterministically per analysis. That is
// intentionally conservative: a document the model itself wasn't sure how
// to classify shouldn't have any of its extracted fields treated as solid.
//   - High or Medium confidence -> the item is created/updated normally,
//     with real computed priority/status (may be Urgent/Needs Attention).
//   - Low confidence -> the item is still created (never silent — it's
//     visible on the Property Watch / property page as an Upcoming item),
//     but priority is force-capped to 'Low' and status is force-capped to
//     'Upcoming' regardless of how close the date actually is, and
//     metadata.needsConfirmation is set so the UI can badge it
//     "Unconfirmed — from AI, please verify" and offer a Confirm action.
//     It can NEVER be Urgent/High and NEVER auto-lands in "Needs Your
//     Attention" on the homepage (which only shows Needs Attention status
//     items) purely from an unconfirmed extraction.

import { computeUrgency } from '../urgency'
import { formatDateDisplay, subtractDays } from '../date-utils'
import { EVENT_KEYS } from '../identity'
import type { PropertyWatchDraft, WatchActionType, WatchCategory } from '../types'
import type { PropertyLike } from './lease'

export type DocumentConfidence = 'High' | 'Medium' | 'Low'

export type DocumentAnalysisLike = {
  /** document_analyses.id — kept for provenance metadata only, never part of the dedup identity (a re-analysis gets a new id). */
  analysisId: string
  /** property_documents.id — stable across re-analysis, so THIS is what dedup keys off of. */
  documentId: string
  classificationConfidence: DocumentConfidence
  applyFields: {
    endDate?: string | null
    expirationDate?: string | null
    maturityDate?: string | null
  }
}

type SupportedField = 'endDate' | 'expirationDate' | 'maturityDate'

const FIELD_CONFIG: Record<SupportedField, { category: WatchCategory; title: string; actionType: WatchActionType; describe: (date: string) => string }> = {
  endDate: {
    category: 'Lease',
    title: 'Lease Expiring',
    actionType: 'Confirm',
    describe: (date) => `an uploaded document indicates a lease end date of ${formatDateDisplay(date)}.`,
  },
  expirationDate: {
    category: 'Insurance',
    title: 'Insurance Renewal',
    actionType: 'Confirm',
    describe: (date) => `an uploaded document indicates insurance expires ${formatDateDisplay(date)}.`,
  },
  maturityDate: {
    category: 'Mortgage',
    title: 'Mortgage Maturity',
    actionType: 'Confirm',
    describe: (date) => `an uploaded document indicates the mortgage matures ${formatDateDisplay(date)}.`,
  },
}

const WARNING_WINDOW_DAYS = 90
const AUTO_APPLY: Record<DocumentConfidence, boolean> = { High: true, Medium: true, Low: false }

function draftForField(field: SupportedField, dateIso: string, analysis: DocumentAnalysisLike, property: PropertyLike, now: Date): PropertyWatchDraft | null {
  const urgency = computeUrgency(dateIso, now)
  if (!urgency.withinWarningWindow) return null

  const autoApply = AUTO_APPLY[analysis.classificationConfidence]
  const config = FIELD_CONFIG[field]

  return {
    owner_id: property.owner_id,
    property_id: property.id,
    source_type: 'document',
    source_id: analysis.documentId,
    event_key: EVENT_KEYS.documentField(field),
    category: config.category,
    title: config.title,
    description: `${property.address} — ${config.describe(dateIso)}`,
    event_date: dateIso,
    warning_date: subtractDays(dateIso, WARNING_WINDOW_DAYS),
    // Capped, never escalated, when unconfirmed — see the confidence
    // policy note at the top of this file.
    priority: autoApply ? urgency.priority : 'Low',
    status: autoApply ? urgency.status : 'Upcoming',
    action_type: config.actionType,
    metadata: {
      documentId: analysis.documentId,
      analysisId: analysis.analysisId,
      confidence: analysis.classificationConfidence,
      needsConfirmation: !autoApply,
      extractedField: field,
    },
  }
}

export function deriveDocumentWatchDrafts(analysis: DocumentAnalysisLike, property: PropertyLike, now: Date = new Date()): PropertyWatchDraft[] {
  const drafts: PropertyWatchDraft[] = []
  const fields: SupportedField[] = ['endDate', 'expirationDate', 'maturityDate']
  for (const field of fields) {
    const value = analysis.applyFields[field]
    if (!value) continue
    const draft = draftForField(field, value, analysis, property, now)
    if (draft) drafts.push(draft)
  }
  return drafts
}
