// PropRoster Milestone 27 — Guided Maintenance Intake M2 V1: Toilet.

import type { IntakeTree } from '../types'

export const toiletIntakeTree: IntakeTree = {
  categoryId: 'toilet',
  version: 'toilet-v1',
  entryStepId: 'issue',
  titleStepId: 'issue',
  steps: {
    issue: {
      id: 'issue',
      question: {
        key: 'issue', prompt: "What's happening?", safetyClass: 'safe_observation', type: 'select',
        options: [
          { value: 'clogged', label: 'Clogged' },
          { value: 'overflowing', label: 'Overflowing' },
          { value: 'running', label: 'Continuously running' },
          { value: 'leaking', label: 'Leaking at the base' },
          { value: 'unusable', label: "Won't flush / unusable" },
          { value: 'other', label: 'Something else' },
        ],
        summaryLabel: 'Issue',
      },
      next: (a) => (a.issue === 'overflowing' ? 'overflow_active' : 'photo'),
    },
    overflow_active: {
      id: 'overflow_active',
      question: {
        key: 'overflow_active', prompt: 'Is water actively overflowing onto the floor right now?', safetyClass: 'safe_observation', type: 'select',
        options: [
          { value: 'yes', label: 'Yes, right now', urgentReason: 'major_flooding' },
          { value: 'no', label: 'No, it stopped' },
        ],
        summaryLabel: 'Active overflow',
      },
      next: () => 'photo',
    },
    photo: {
      id: 'photo',
      question: { key: 'photo', prompt: 'A photo helps but is optional.', safetyClass: 'safe_observation', type: 'photo', optional: true },
      next: () => null,
    },
  },
}
