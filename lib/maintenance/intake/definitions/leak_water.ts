// PropRoster Milestone 27 — Guided Maintenance Intake M2 V1: Leak / Water.
// Major uncontrolled water leak/flooding is one of Section 5's explicit
// urgent triggers.

import type { IntakeTree } from '../types'

export const leakWaterIntakeTree: IntakeTree = {
  categoryId: 'leak_water',
  version: 'leak_water-v1',
  entryStepId: 'source',
  titleStepId: 'source',
  steps: {
    source: {
      id: 'source',
      question: {
        key: 'source', prompt: 'Where is the water coming from, if visible?', safetyClass: 'safe_observation', type: 'select',
        options: [
          { value: 'ceiling', label: 'Ceiling' },
          { value: 'wall', label: 'Wall' },
          { value: 'floor', label: 'Floor' },
          { value: 'fixture', label: 'Under a fixture (sink, toilet, etc.)' },
          { value: 'not_sure', label: 'Not sure' },
          { value: 'other', label: 'Something else' },
        ],
        summaryLabel: 'Source',
      },
      next: () => 'active',
    },
    active: {
      id: 'active',
      question: {
        key: 'active', prompt: 'Is the water active right now?', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'flowing', label: 'Yes, flowing' }, { value: 'dripping', label: 'Yes, dripping' }, { value: 'stopped', label: 'No, it stopped' }, { value: 'not_sure', label: 'Not sure' }],
        summaryLabel: 'Active',
      },
      next: () => 'amount',
    },
    amount: {
      id: 'amount',
      question: {
        key: 'amount', prompt: 'How much water is there?', safetyClass: 'safe_observation', type: 'select',
        options: [
          { value: 'minor', label: 'Minor damp spot' },
          { value: 'steady', label: 'Steady drip' },
          { value: 'heavy', label: 'Heavy or flowing — large area', urgentReason: 'major_flooding' },
        ],
        summaryLabel: 'Amount',
      },
      next: () => 'spreading',
    },
    spreading: {
      id: 'spreading',
      question: {
        key: 'spreading', prompt: 'Is it spreading?', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }],
        summaryLabel: 'Spreading',
      },
      next: () => 'room',
    },
    room: {
      id: 'room',
      question: { key: 'room', prompt: 'Which room is affected?', safetyClass: 'safe_observation', type: 'text', summaryLabel: 'Affected room' },
      next: () => 'photo',
    },
    photo: {
      id: 'photo',
      question: { key: 'photo', prompt: 'A photo or video helps but is optional.', safetyClass: 'safe_observation', type: 'photo', optional: true },
      next: () => null,
    },
  },
}
