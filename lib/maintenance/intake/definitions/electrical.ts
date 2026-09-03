// PropRoster Milestone 27 — Guided Maintenance Intake M2 V1: Electrical.
// NEVER instructs panel work, voltage testing, or any electrical panel
// interaction — sparking/burning smell immediately escalates.

import type { IntakeTree } from '../types'

export const electricalIntakeTree: IntakeTree = {
  categoryId: 'electrical',
  version: 'electrical-v1',
  entryStepId: 'affected',
  titleStepId: 'symptom',
  steps: {
    affected: {
      id: 'affected',
      question: {
        key: 'affected', prompt: 'What is affected?', safetyClass: 'safe_observation', type: 'select',
        options: [
          { value: 'one_outlet', label: 'One outlet' },
          { value: 'one_light', label: 'One light fixture' },
          { value: 'multiple', label: 'Multiple outlets or lights' },
          { value: 'whole_unit', label: 'Whole unit / no power' },
          { value: 'other', label: 'Something else' },
        ],
        summaryLabel: 'Affected',
      },
      next: () => 'symptom',
    },
    symptom: {
      id: 'symptom',
      question: {
        key: 'symptom', prompt: "What's happening?", safetyClass: 'safe_observation', type: 'select',
        options: [
          { value: 'no_power', label: 'No power' },
          { value: 'flickering', label: 'Flickering' },
          { value: 'sparking', label: 'Sparking or arcing', urgentReason: 'electrical_hazard' },
          { value: 'burning_smell', label: 'Burning smell', urgentReason: 'electrical_hazard' },
          { value: 'warm', label: 'Warm or hot to the touch' },
          { value: 'other', label: 'Something else' },
        ],
        summaryLabel: 'Symptom',
      },
      next: () => 'photo',
    },
    photo: {
      id: 'photo',
      question: { key: 'photo', prompt: 'A photo helps but is optional.', helpText: 'Only take a photo if it is safe to do so — never touch the affected outlet or fixture.', safetyClass: 'safe_observation', type: 'photo', optional: true },
      next: () => null,
    },
  },
}
