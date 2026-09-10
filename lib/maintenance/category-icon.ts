// PropRoster — Simplification + Maintenance Workspace V2, Phase D.1
// (Mobile App Navigation + Maintenance Visual Polish).
//
// A pure, deterministic mapping from a maintenance case's category
// (lib/maintenance/categories.ts's fixed, DB-CHECK-constrained
// MaintenanceCategoryId vocabulary — never free text) onto one of a
// small, safely-derivable set of icon "kinds" a request row can render.
// Never emoji (site direction: no emoji in the final product) — the
// caller renders one of the small inline SVG icons in
// components/icons/NavIcons.tsx for whichever kind this returns.
//
// Deliberately conservative: only the 5 kinds the brief itself names
// (HVAC, plumbing, electrical, appliance, general) — not one icon per
// MaintenanceCategoryId. 'toilet' and 'leak_water' fold into
// 'plumbing' (both are, physically, plumbing work); 'lock_door' folds
// into the neutral 'general' fallback rather than inventing a sixth,
// rarely-distinguishing icon. A landlord-logged case has no category
// at all (null — see command-center.ts's own comment on
// EnrichedMaintenanceCase.category), so null/undefined/an unrecognized
// value all resolve to the same neutral fallback, never a guess.
export type MaintenanceCategoryIconKind = 'hvac' | 'plumbing' | 'electrical' | 'appliance' | 'general'

const KIND_BY_CATEGORY: Record<string, MaintenanceCategoryIconKind> = {
  heating_ac: 'hvac',
  plumbing: 'plumbing',
  toilet: 'plumbing',
  leak_water: 'plumbing',
  electrical: 'electrical',
  appliance: 'appliance',
  lock_door: 'general',
  other: 'general',
}

export function maintenanceCategoryIconKind(category: string | null | undefined): MaintenanceCategoryIconKind {
  if (!category) return 'general'
  return KIND_BY_CATEGORY[category] || 'general'
}
