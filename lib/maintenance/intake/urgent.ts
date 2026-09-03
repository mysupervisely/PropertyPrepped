// PropRoster Milestone 27 — Guided Maintenance Intake M2 V1: urgent
// safety guidance copy.
//
// Section 5 of the M2 brief: deterministic, human-authored urgent
// triggers only — never an AI judgment call. This file is the ONE place
// the actual safety copy lives, keyed by UrgentReason (types.ts),
// picked whenever an IntakeOption with a matching `urgentReason` is
// selected anywhere in any tree (see engine.ts's getNextStepId()).
//
// M2.1 review pass (Part 2): kept every entry short, conservative, and
// action-oriented per the review's own instruction. Never instructs the
// tenant to touch, shut off, open, or repair anything — never mentions
// electrical panels, pumps, or shutoff valves at all, even to warn
// about them, since naming the equipment invites exactly the
// interaction this copy exists to prevent. Never makes a medical,
// legal, or professional-safety guarantee, and never implies PropRoster
// itself responds to emergencies — that disclaimer is rendered once,
// persistently, on every urgent screen by GuidedIntake.tsx (not
// repeated in each entry below, so this stays short rather than
// padded). 911 is named only for the genuine life-safety cases this
// file covers — never as boilerplate for ordinary maintenance.
//
// FLAGGED FOR HUMAN/LEGAL/SAFETY REVIEW: this wording is an engineering
// best effort, not a reviewed safety or legal document. It must be
// reviewed by someone with actual safety/legal expertise before this
// reaches real tenants at any meaningful scale — see this milestone's
// own docs for the full note.

import type { UrgentReason } from './types'

export type UrgentGuidance = {
  heading: string
  body: string[]
}

export const URGENT_GUIDANCE: Record<UrgentReason, UrgentGuidance> = {
  fire_smoke: {
    heading: 'This may be a fire emergency',
    body: [
      'Leave the area now and call 911.',
      'Once everyone is safe, you can still submit this report so your landlord knows.',
    ],
  },
  gas_smell: {
    heading: 'Possible gas leak',
    body: [
      'Leave the area now — do not use light switches, appliances, or open flames on your way out.',
      'From a safe location, call your gas utility’s emergency line or 911.',
      'You can still submit this report once you are safe.',
    ],
  },
  electrical_hazard: {
    heading: 'Possible electrical hazard',
    body: [
      'Stay away from it — do not touch it and do not try to fix it yourself.',
      'If you saw sparking or smell burning, leave the area and call 911.',
      'You can still submit this report so your landlord knows right away.',
    ],
  },
  major_flooding: {
    heading: 'Active major water leak',
    body: [
      'Stay away from the water, especially near any outlets or plugged-in appliances.',
      'Do not try to fix or stop it yourself.',
      'You can still submit this report so your landlord knows right away.',
    ],
  },
  general_hazard: {
    heading: 'This sounds urgent',
    body: [
      'If anyone is in immediate danger, call 911.',
      'You can still submit this report so your landlord knows right away.',
    ],
  },
}
