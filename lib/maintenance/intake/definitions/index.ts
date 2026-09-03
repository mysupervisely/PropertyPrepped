// PropRoster Milestone 27 — Guided Maintenance Intake M2 V1: the
// category -> tree registry. One entry per canonical category id
// (lib/maintenance/categories.ts) — every category has a real,
// versioned tree in V1 (Heating/AC is the deep flagship; the rest are
// intentionally conservative per Section 7 of the M2 brief).

import type { MaintenanceCategoryId } from '../../categories'
import type { IntakeTree } from '../types'
import { heatingAcIntakeTree } from './heating_ac'
import { plumbingIntakeTree } from './plumbing'
import { toiletIntakeTree } from './toilet'
import { electricalIntakeTree } from './electrical'
import { applianceIntakeTree } from './appliance'
import { lockDoorIntakeTree } from './lock_door'
import { leakWaterIntakeTree } from './leak_water'
import { otherIntakeTree } from './other'

export const INTAKE_DEFINITIONS: Record<MaintenanceCategoryId, IntakeTree> = {
  heating_ac: heatingAcIntakeTree,
  plumbing: plumbingIntakeTree,
  toilet: toiletIntakeTree,
  electrical: electricalIntakeTree,
  appliance: applianceIntakeTree,
  lock_door: lockDoorIntakeTree,
  leak_water: leakWaterIntakeTree,
  other: otherIntakeTree,
}

export function intakeTreeFor(categoryId: MaintenanceCategoryId): IntakeTree {
  return INTAKE_DEFINITIONS[categoryId]
}
