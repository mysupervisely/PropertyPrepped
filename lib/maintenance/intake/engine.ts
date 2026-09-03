// PropRoster Milestone 27 — Guided Maintenance Intake M2 V1: the
// deterministic intake engine.
//
// Pure functions only, no Supabase/React/network/AI — every function
// here is a plain transformation of (tree, answers) -> result. The
// SAME category + SAME prior safe answers always produces the SAME
// next question (Section 3 of the M2 brief: "The intake engine should
// select questions from deterministic definitions based on category +
// previous safe answers"). This determinism is what makes an intake
// tree testable and versionable at all — see each definitions/*.ts
// file's own `version` string.
//
// AI EXTENSION POINT (not built here, per Section 3: "AI must never be
// required for the intake to function"): buildSummary() below returns
// plain, deterministic text built entirely from question.summaryLabel +
// the chosen option's label. A future milestone could feed that SAME
// structured {label, value}[] list to a model to produce nicer prose —
// but the structured data, the urgent-safety routing, and the DB
// linkage all work completely today with zero AI involvement.

import type { IntakeTree, IntakeStep, IntakeQuestion } from './types'
import { URGENT_STEP_ID } from './types'

export type AnsweredStep = { step: IntakeStep; value: string }

/**
 * The next step id after answering `stepId` with `value`, given every
 * answer collected so far (already includes this one). Returns
 * URGENT_STEP_ID if the chosen option is itself a high-risk observation
 * (Section 5) — this check happens HERE, once, for every tree, rather
 * than inside each tree's own next() function, so a tree definition
 * cannot forget to route an urgent answer correctly.
 */
export function getNextStepId(tree: IntakeTree, stepId: string, answers: Record<string, string>): string | null {
  const step = tree.steps[stepId]
  if (!step) return null
  const value = answers[step.question.key]
  const chosenOption = step.question.options?.find((o) => o.value === value)
  if (chosenOption?.urgentReason) return URGENT_STEP_ID
  return step.next(answers)
}

/** True once the tenant has answered a question whose chosen option is urgent-flagged. Convenience wrapper around getNextStepId for call sites that only care about the boolean. */
export function isUrgent(tree: IntakeTree, stepId: string, answers: Record<string, string>): boolean {
  return getNextStepId(tree, stepId, answers) === URGENT_STEP_ID
}

/** Walks every already-answered step, in the order they were actually asked (branch-aware — never assumes a fixed linear order), by following the tree from entryStepId through `answers`. Stops at the first unanswered or urgent step. */
export function answeredStepsInOrder(tree: IntakeTree, answers: Record<string, string>): AnsweredStep[] {
  const result: AnsweredStep[] = []
  let currentId: string | null = tree.entryStepId
  const seen = new Set<string>()
  while (currentId && currentId !== URGENT_STEP_ID && !seen.has(currentId)) {
    seen.add(currentId)
    const step: IntakeStep | undefined = tree.steps[currentId]
    if (!step) break
    const value = answers[step.question.key]
    if (value === undefined) break
    result.push({ step, value })
    currentId = getNextStepId(tree, currentId, answers)
  }
  return result
}

function renderAnswerLabel(question: IntakeQuestion, value: string): string {
  if (question.type === 'select') {
    const opt = question.options?.find((o) => o.value === value)
    return opt?.label ?? value
  }
  return question.unitSuffix ? `${value}${question.unitSuffix}` : value
}

/**
 * The landlord-facing title, derived from tree.titleStepId's answer
 * (never just "whatever was answered first" — see that field's own
 * doc comment for why). Falls back to `fallback` (normally the
 * category's own display label) if titleStepId hasn't been reached yet
 * — reachable in practice only via a defensive caller bug, since the
 * urgent path and the review screen are both only ever shown after the
 * relevant step has already been answered.
 */
export function deriveTitle(tree: IntakeTree, answers: Record<string, string>, fallback: string): string {
  const step = tree.steps[tree.titleStepId]
  if (!step) return fallback
  const value = answers[step.question.key]
  if (value === undefined) return fallback
  const label = renderAnswerLabel(step.question, value)
  if (!label) return fallback
  // A titleStepId pointing at a free-text question (e.g. the "Other"
  // category's open-ended description) could otherwise make the title
  // a full paragraph — cap it for display; the untruncated text still
  // lives in full in the description body buildSummary() produces.
  const MAX_TITLE_LENGTH = 70
  return label.length > MAX_TITLE_LENGTH ? `${label.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : label
}

export type StructuredSummary = {
  /** Short landlord-facing title, e.g. "AC not cooling". */
  title: string
  /** Multi-line structured observation block — NOT a diagnosis, matching the brief's own Heating/AC example format exactly. */
  description: string
}

/**
 * Builds the landlord-facing structured summary from every answered
 * step that carries a summaryLabel (steps without one — e.g. an
 * optional closing free-text note — are intentionally excluded from
 * this block and, where applicable, appended separately by the caller).
 * `title` is the caller-supplied short symptom title (the tenant's own
 * top-level "what's happening" choice, or free text for the Other
 * category) — this function never invents wording beyond what the
 * tenant actually selected/typed.
 */
export function buildSummary(tree: IntakeTree, answers: Record<string, string>, title: string): StructuredSummary {
  const lines = answeredStepsInOrder(tree, answers)
    .filter(({ step }) => step.question.summaryLabel)
    .map(({ step, value }) => `${step.question.summaryLabel}: ${renderAnswerLabel(step.question, value)}`)

  const description = [title.toUpperCase(), '', 'Tenant observations:', ...lines].join('\n')
  return { title, description }
}
