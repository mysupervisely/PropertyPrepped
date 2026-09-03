// PropRoster Milestone 26 — Maintenance Coordination M1.1: canonical
// request origin/source vocabulary.
//
// Mirrors supabase/milestone-26-canonical-maintenance-case.sql's
// maintenance_requests.source CHECK constraint exactly, same convention
// as lib/maintenance/categories.ts (a stable, machine-readable id lives
// once, here, and every consumer imports it rather than re-typing the
// literal union). Deliberately narrow — 'tenant' and 'landlord' are the
// only two values a real M1.1 code path ever sets (the
// tenant_requests_create_maintenance_case() trigger sets 'tenant'; the
// column's own DEFAULT covers every direct landlord insert). No
// 'provider'/'system' value is added ahead of a real future feature
// that would set one — see this file's own SQL migration header for
// why. Widening MAINTENANCE_REQUEST_SOURCES later is a compatible,
// additive change on both sides (TS union + SQL CHECK) — no rewrite.

export const MAINTENANCE_REQUEST_SOURCES = ['tenant', 'landlord'] as const
export type MaintenanceRequestSource = (typeof MAINTENANCE_REQUEST_SOURCES)[number]

export function isMaintenanceRequestSource(value: string): value is MaintenanceRequestSource {
  return (MAINTENANCE_REQUEST_SOURCES as readonly string[]).includes(value)
}
