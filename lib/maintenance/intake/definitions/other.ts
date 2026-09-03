// PropRoster Milestone 27 — Guided Maintenance Intake M2 V1: Other.
// No structured symptom taxonomy exists for a catch-all category, so
// this tree includes an explicit deterministic safety gate rather than
// relying on keyword-scanning the tenant's free text (which would not
// be deterministic/testable the way Section 3 requires).

import type { IntakeTree } from '../types'

export const otherIntakeTree: IntakeTree = {
  categoryId: 'other',
  version: 'other-v1',
  entryStepId: 'safety_gate',
  titleStepId: 'description',
  steps: {
    safety_gate: {
      id: 'safety_gate',
      question: {
        key: 'safety_gate', prompt: 'Does this involve fire, smoke, a gas smell, sparking, or major flooding?', safetyClass: 'safe_observation', type: 'select',
        options: [
          { value: 'yes', label: 'Yes', urgentReason: 'general_hazard' },
          { value: 'no', label: 'No' },
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
