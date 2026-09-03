// PropRoster — Tenant Connect + Maintenance Coordination, M1 foundation.
//
// The initial maintenance-request category taxonomy, per the M1 brief's
// explicit instruction: "Use stable machine-readable identifiers
// separate from display labels." Mirrors
// supabase/milestone-25-maintenance-coordination-foundation.sql's
// tenant_requests.category CHECK constraint exactly — this is the ONE
// place that list exists in TypeScript, the same convention every other
// Tenant Connect vocabulary already follows (lib/tenant-connect/types.ts).
//
// This module is intentionally the ONLY thing M1 ships for "categories."
// It does NOT include per-category question trees, safety
// classifications, or any guided-intake logic — that is M2's job
// (Guided Maintenance Intake), explicitly out of scope here. This file
// exists purely so a category id can be turned into a real, readable
// label everywhere one is displayed (the tenant portal's category
// picker, the landlord Requests inbox, the new-request notification
// email), without duplicating that id->label mapping in three places.

export type MaintenanceCategoryId =
  | 'heating_ac'
  | 'plumbing'
  | 'toilet'
  | 'electrical'
  | 'appliance'
  | 'lock_door'
  | 'leak_water'
  | 'other'

export type MaintenanceCategory = { id: MaintenanceCategoryId; label: string }

// Order is deliberate — the order candidates appear in any picker UI,
// matching the order the M1 brief itself lists them in.
export const MAINTENANCE_CATEGORIES: MaintenanceCategory[] = [
  { id: 'heating_ac', label: 'Heating / AC' },
  { id: 'plumbing', label: 'Plumbing' },
  { id: 'toilet', label: 'Toilet' },
  { id: 'electrical', label: 'Electrical' },
  { id: 'appliance', label: 'Appliance' },
  { id: 'lock_door', label: 'Lock / Door' },
  { id: 'leak_water', label: 'Leak / Water' },
  { id: 'other', label: 'Other' },
]

export const MAINTENANCE_CATEGORY_IDS = MAINTENANCE_CATEGORIES.map((c) => c.id) as MaintenanceCategoryId[]

const LABEL_BY_ID: Record<MaintenanceCategoryId, string> = Object.fromEntries(
  MAINTENANCE_CATEGORIES.map((c) => [c.id, c.label]),
) as Record<MaintenanceCategoryId, string>

/**
 * Id -> display label. Falls back to the raw id itself for any value
 * that isn't a recognized category (defensive only — every writer of
 * tenant_requests.category is constrained by the same DB CHECK
 * constraint this list mirrors, so this fallback should never actually
 * be exercised in practice; it exists so a future, wider category
 * value never crashes a render, only shows something slightly less
 * pretty until this list is updated to match).
 */
export function maintenanceCategoryLabel(id: string): string {
  return LABEL_BY_ID[id as MaintenanceCategoryId] || id
}

export function isMaintenanceCategoryId(value: string): value is MaintenanceCategoryId {
  return Object.prototype.hasOwnProperty.call(LABEL_BY_ID, value)
}
