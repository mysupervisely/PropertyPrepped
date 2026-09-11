// PropRoster — Simplification + Maintenance Workspace V2, Phase D.1.
//
// One shared render of "the small category icon for a request row" —
// used by all three places a maintenance/tenant-request row renders
// (app/page.tsx's MaintenanceRequestRow, app/maintenance/page.tsx's
// MaintenanceCaseCard, TenantRequestsPanel's row), so the kind->icon
// mapping exists in exactly one place, not copy-pasted three times.
// Wraps the deterministic, pure maintenanceCategoryIconKind() — never
// guesses, never emoji.

import { maintenanceCategoryIconKind } from '../../lib/maintenance/category-icon'
import { WrenchIcon, DropletIcon, BoltIcon, BoxIcon } from './NavIcons'

export function MaintenanceCategoryIcon({ category, className }: { category: string | null | undefined; className?: string }) {
  const kind = maintenanceCategoryIconKind(category)
  if (kind === 'plumbing') return <DropletIcon className={className} />
  if (kind === 'electrical') return <BoltIcon className={className} />
  if (kind === 'appliance') return <BoxIcon className={className} />
  // 'hvac' and 'general' both reuse the wrench — a general "maintenance"
  // glyph is an honest, neutral stand-in for HVAC specifically (no
  // reliable, simple line-icon shorthand for "heating/AC" at this
  // size), and the exact same neutral fallback every unrecognized/
  // absent category already uses.
  return <WrenchIcon className={className} />
}
