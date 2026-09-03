// PropRoster Milestone 27 — Guided Maintenance Intake M2 V1: urgent
// safety guidance copy.
//
// Section 5 of the M2 brief: deterministic, human-authored urgent
// triggers only — never an AI judgment call. This file is the ONE place
// the actual safety copy lives, keyed by UrgentReason (types.ts),
// picked whenever an IntakeOption with a matching `urgentReason` is
// selected anywhere in any tree (see engine.ts's getNextStepId()).
//
// Deliberately conservative: never instructs the tenant to touch,
// shut off, open, or repair anything. PropRoster is never claimed to be
// an emergency service — every entry tells the tenant to call 911 (or
// their utility) for a genuine emergency, and PropRoster's own role is
// limited to "you can still submit this report so your landlord knows."

import type { UrgentReason } from './types'

export type UrgentGuidance = {
  heading: string
  body: string[]
}

export const URGENT_GUIDANCE: Record<UrgentReason, UrgentGuidance> = {
  fire_smoke: {
    heading: 'This may be a fire emergency',
    body: [
      'If you see fire or active smoke, leave the area right away and call 911.',
      'PropRoster is not an emergency service — do not wait for a reply here before getting to safety.',
      'Once everyone is safe, you can still submit this report so your landlord knows right away.',
    ],
  },
  gas_smell: {
    heading: 'Possible gas leak',
    body: [
      'If you smell gas, leave the area immediately.',
      'Do not use light switches, appliances, or open flames.',
      'Call your gas utility’s emergency line or 911 from a safe location.',
      'You can still submit this report once you are safe.',
    ],
  },
  electrical_hazard: {
    heading: 'Possible electrical hazard',
    body: [
      'Stay away from the affected outlet, switch, or equipment — do not touch it.',
      'If you see sparking, smoke, or smell burning, leave the area and call 911.',
      'Do not attempt to open any panel or fix this yourself.',
      'You can still submit this report so your landlord knows right away.',
    ],
  },
  major_flooding: {
    heading: 'Active major water leak',
    body: [
      'If it is safe and easy to do so, you may move valuables away from the water.',
      'Do not attempt to shut off, fix, or repair anything yourself.',
      'Stay away from any area where water is near electrical outlets or appliances.',
      'You can still submit this report so your landlord knows right away.',
    ],
  },
  general_hazard: {
    heading: 'This sounds urgent',
    body: [
      'If anyone is in danger, call 911.',
      'You can still submit this report so your landlord knows right away.',
    ],
  },
}
