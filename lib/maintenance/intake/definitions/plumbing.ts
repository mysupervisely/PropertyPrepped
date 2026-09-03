// PropRoster Milestone 27 — Guided Maintenance Intake M2 V1: Plumbing.
// Conservative V1 depth (Section 7) — enough for a landlord/technician
// to triage before scheduling anything.

import type { IntakeTree } from '../types'

export const plumbingIntakeTree: IntakeTree = {
  categoryId: 'plumbing',
  version: 'plumbing-v1',
  entryStepId: 'fixture',
  titleStepId: 'issue_type',
  steps: {
    fixture: {
      id: 'fixture',
      question: {
        key: 'fixture', prompt: 'Which fixture or area is affected?', safetyClass: 'safe_observation', type: 'select',
        options: [
          { value: 'kitchen_sink', label: 'Kitchen sink' },
          { value: 'bathroom_sink', label: 'Bathroom sink' },
          { value: 'shower', label: 'Shower' },
          { value: 'bathtub', label: 'Bathtub' },
          { value: 'washing_machine', label: 'Washing machine hookup' },
          { value: 'other', label: 'Something else' },
        ],
        summaryLabel: 'Fixture/location',
      },
      next: () => 'issue_type',
    },
    issue_type: {
      id: 'issue_type',
      question: {
        key: 'issue_type', prompt: "What's happening?", safetyClass: 'safe_observation', type: 'select',
        options: [
          { value: 'leak', label: 'Leaking' },
          { value: 'clog', label: 'Clogged / draining slowly' },
          { value: 'no_water', label: 'No water at all' },
          { value: 'low_pressure', label: 'Low water pressure' },
          { value: 'other', label: 'Something else' },
        ],
        summaryLabel: 'Issue type',
      },
      next: (a) => (a.issue_type === 'leak' ? 'leak_active' : 'severity'),
    },
    leak_active: {
      id: 'leak_active',
      question: {
        key: 'leak_active', prompt: 'Is water actively leaking right now?', safetyClass: 'safe_observation', type: 'select',
        options: [
          { value: 'yes_heavy', label: 'Yes, heavy or spreading', urgentReason: 'major_flooding' },
          { value: 'yes_dripping', label: 'Yes, dripping' },
          { value: 'no', label: 'No, it stopped' },
          { value: 'not_sure', label: 'Not sure' },
        ],
        summaryLabel: 'Active water',
      },
      next: () => 'severity',
    },
    severity: {
      id: 'severity',
      question: {
        key: 'severity', prompt: 'How would you describe it?', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'minor', label: 'Minor drip' }, { value: 'steady', label: 'Steady' }, { value: 'heavy', label: 'Heavy' }],
        summaryLabel: 'Severity',
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
