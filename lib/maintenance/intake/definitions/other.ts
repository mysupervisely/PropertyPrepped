// PropRoster Milestone 27 — Guided Maintenance Intake M2 V1: Other.
// No structured symptom taxonomy exists for a catch-all category, so
// this tree includes an explicit deterministic safety gate rather than
// relying on keyword-scanning the tenant's free text (which would not
// be deterministic/testable the way Section 3 requires).
//
// M2.1 review pass (Part 2): the original V1 gate was one coarse
// yes/no question that routed every hazard into the single generic
// 'general_hazard' guidance, losing the specific, correctly-tailored
// copy (fire vs. gas vs. electrical vs. flooding) every other category
// gets from its own embedded triggers. Replaced with the SAME specific
// hazard options Section 5 actually lists, each mapped to its real
// urgentReason — still exactly one question/one step (not a bigger
// tree, not an AI classifier), just as precise as every other
// category's coverage.

import type { IntakeTree } from '../types'

export const otherIntakeTree: IntakeTree = {
  categoryId: 'other',
  version: 'other-v2',
  entryStepId: 'safety_gate',
  titleStepId: 'description',
  steps: {
    safety_gate: {
      id: 'safety_gate',
      question: {
        key: 'safety_gate', prompt: 'Does this involve any of the following?', safetyClass: 'safe_observation', type: 'select',
        options: [
          { value: 'fire', label: 'Fire', urgentReason: 'fire_smoke' },
          { value: 'smoke', label: 'Visible smoke', urgentReason: 'fire_smoke' },
          { value: 'gas', label: 'A gas smell', urgentReason: 'gas_smell' },
          { value: 'sparking', label: 'Electrical sparking or arcing', urgentReason: 'electrical_hazard' },
          { value: 'burning_smell', label: 'A strong burning smell', urgentReason: 'electrical_hazard' },
          { value: 'flooding', label: 'Major uncontrolled water / flooding', urgentReason: 'major_flooding' },
          { value: 'none', label: 'None of these' },
        ],
      },
      next: () => 'description',
    },
    description: {
      id: 'description',
      question: { key: 'description', prompt: "Please describe what's happening.", safetyClass: 'safe_observation', type: 'text', summaryLabel: 'Description' },
      next: () => 'location',
    },
    location: {
      id: 'location',
      question: { key: 'location', prompt: 'Where is this, in the home?', safetyClass: 'safe_observation', type: 'text', summaryLabel: 'Location' },
      next: () => 'severity',
    },
    severity: {
      id: 'severity',
      question: {
        key: 'severity', prompt: 'How would you describe it?', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'low', label: 'Low — not urgent' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High — affects daily life' }],
        summaryLabel: 'Severity',
      },
      next: () => 'photo',
    },
    photo: {
      id: 'photo',
      question: { key: 'photo', prompt: 'A photo or video helps but is optional.', safetyClass: 'safe_observation', type: 'photo', optional: true },
      next: () => null,
    },
  },
}
