// PropRoster Milestone 27 — Guided Maintenance Intake M2 V1: draft
// persistence (Section 9: "ability to resume an unfinished intake").
//
// Deliberately localStorage-only, per-device, never DB-backed — see
// this milestone's own schema audit (docs/tenant-connect-maintenance-
// m2-guided-intake.md): maintenance_intake_sessions.request_id is NOT
// NULL and references tenant_requests(id), so a session literally
// cannot exist before a real tenant_requests row does. Persisting an
// in-progress (not-yet-submitted) draft therefore has no safe home in
// the existing schema without a migration this milestone doesn't need —
// localStorage is the correct, lowest-risk choice, not a shortcut.
//
// Pure serialization functions only, so the round-trip and key
// derivation are testable without mocking window/localStorage — the
// component (GuidedIntake.tsx) does the actual
// localStorage.getItem/setItem/removeItem calls, wrapped in try/catch
// since a private-browsing tab or disabled storage must never break the
// intake flow itself.

import type { MaintenanceCategoryId } from '../categories'

export type IntakeDraft = {
  category: MaintenanceCategoryId
  stepHistory: string[]
  answers: Record<string, string>
}

/** One draft per (tenant_access_id) — a tenant with access to more than one property never collides with themselves, since tenant_access_id is per property/lease, not per tenant account. */
export function draftStorageKey(tenantAccessId: string): string {
  return `proproster-intake-draft-${tenantAccessId}`
}

export function serializeDraft(draft: IntakeDraft): string {
  return JSON.stringify(draft)
}

/** Never throws — a corrupted or unexpected localStorage value is treated as "no draft", not a crash. */
export function parseDraft(raw: string | null): IntakeDraft | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.category !== 'string' || !Array.isArray(parsed.stepHistory) || typeof parsed.answers !== 'object') return null
    return parsed as IntakeDraft
  } catch {
    return null
  }
}
