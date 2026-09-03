// PropRoster Milestone 27 — Guided Maintenance Intake M2 V1.
//
// Core principle (see docs/tenant-connect-maintenance-m2-guided-intake.md):
// TENANT REPORTS SYMPTOMS. PROFESSIONAL DIAGNOSES THE PROBLEM. This
// module is deliberately NOT an AI diagnosis engine — every tree below
// is a human-authored, versioned, deterministic decision structure.
// getNextStepId() (engine.ts) is a pure function of (tree, current
// step, answers so far) — same inputs always produce the same next
// question. No network call, no model, no randomness anywhere in this
// module. A future milestone MAY use AI to rephrase a question's
// display text or to help write buildSummary()'s prose, but the intake
// itself must never require AI to function — see engine.ts's own header.

import type { MaintenanceCategoryId } from '../categories'

// Mirrors maintenance_intake_answers.safety_class's CHECK constraint
// exactly (supabase/milestone-25-maintenance-coordination-foundation.sql).
export const SAFETY_CLASSES = ['safe_observation', 'safe_simple_action', 'professional_diagnosis_required', 'urgent_escalation'] as const
export type SafetyClass = (typeof SAFETY_CLASSES)[number]

// Why a request escalated out of the normal troubleshooting path — used
// to pick the right canned safety copy (urgent.ts). Deliberately NOT
// stored as a DB enum anywhere; it only drives which static guidance
// text is shown to the tenant client-side. The DB only ever records
// that the session's outcome was 'escalated_urgent'
// (maintenance_intake_sessions.outcome) — the specific reason lives in
// the structured summary text a landlord actually reads, not a second
// parallel taxonomy.
export const URGENT_REASONS = ['fire_smoke', 'gas_smell', 'electrical_hazard', 'major_flooding', 'general_hazard'] as const
export type UrgentReason = (typeof URGENT_REASONS)[number]

export type IntakeOption = {
  value: string
  label: string
  /** Set ONLY on an option that itself constitutes a high-risk observation (Section 5's fire/smoke/gas/arcing/burning/major-flooding list). Selecting this option routes the tenant to the urgent path regardless of the step's own next() — see engine.ts's getNextStepId(). */
  urgentReason?: UrgentReason
}

export type IntakeQuestion = {
  /** Stable, versioned key — mirrors maintenance_intake_answers.question_key. Never renamed once a version ships; a changed question is a NEW key in a NEW tree version. */
  key: string
  /** Tenant-facing plain-language prompt. No HVAC/plumbing/electrical jargon (Section 9). */
  prompt: string
  /** Optional short help/clarifying text shown under the prompt. */
  helpText?: string
  safetyClass: SafetyClass
  type: 'select' | 'text' | 'photo'
  /** Required for type 'select'. Absent for 'text'/'photo'. */
  options?: IntakeOption[]
  /** Label used when this answer is rendered into the landlord-facing structured summary (buildSummary in engine.ts). Omit to exclude this question from the summary body (used for the optional free-text "anything else" step, which is appended separately). */
  summaryLabel?: string
  /** True if the tenant may skip this question (e.g. "Not sure" is already an option, or the step is genuinely optional like photo evidence). */
  optional?: boolean
  /** For type 'text' numeric entries (e.g. a thermostat temperature) — appended to the raw value when rendered into the structured summary (buildSummary in engine.ts), so a tenant typing "72" renders as "72°F" without forcing them to type the unit themselves. */
  unitSuffix?: string
}

export type IntakeStep = {
  /** Stable within a tree version, e.g. 'thermostat_mode'. */
  id: string
  question: IntakeQuestion
  /**
   * Deterministic branching: given every answer collected so far
   * (question_key -> raw value), returns the next step id, or null if
   * this was the tree's last question (ready to summarize/submit).
   * Never reads anything except `answers` — no I/O, no AI, no clock.
   */
  next: (answers: Record<string, string>) => string | null
}

export type IntakeTree = {
  categoryId: MaintenanceCategoryId
  /** e.g. 'heating_ac-v1' — mirrors maintenance_intake_sessions.tree_version. Bump on any question/branching change; never mutate a shipped version's behavior in place. */
  version: string
  entryStepId: string
  /**
   * The step whose answer should become the landlord-facing request
   * title (engine.ts's deriveTitle()) — deliberately NOT always
   * entryStepId. Several trees ask a scoping question first (e.g.
   * plumbing's "which fixture?") before the actual symptom question
   * that makes a real title (e.g. "Leaking") — titleStepId always
   * points at the symptom-shaped question, wherever it falls in the
   * tree, so a title is never derived from an incidental first answer
   * like a fixture name or a bare "Yes"/"No".
   */
  titleStepId: string
  steps: Record<string, IntakeStep>
}

export const URGENT_STEP_ID = '__urgent__'
