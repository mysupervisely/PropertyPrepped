// PropRoster Milestone 27 — Guided Maintenance Intake M2 V1: Lock / Door.

import type { IntakeTree } from '../types'

export const lockDoorIntakeTree: IntakeTree = {
  categoryId: 'lock_door',
  version: 'lock_door-v1',
  entryStepId: 'door',
  titleStepId: 'issue',
  steps: {
    door: {
      id: 'door',
      question: {
        key: 'door', prompt: 'Which door?', safetyClass: 'safe_observation', type: 'select',
        options: [
          { value: 'front', label: 'Front door' },
          { value: 'back', label: 'Back door' },
          { value: 'interior', label: 'Interior door' },
          { value: 'garage', label: 'Garage door' },
          { value: 'other', label: 'Something else' },
        ],
        summaryLabel: 'Door',
      },
      next: () => 'issue',
    },
    issue: {
      id: 'issue',
      question: {
        key: 'issue', prompt: "What's happening?", safetyClass: 'safe_observation', type: 'select',
        options: [
          { value: 'wont_lock', label: "Won't lock" },
          { value: 'wont_unlock', label: "Won't unlock" },
          { value: 'key_issue', label: "Key won't turn / is stuck" },
          { value: 'hardware_damaged', label: 'Handle or hardware is damaged' },
          { value: 'wont_close', label: "Door won't close properly" },
          { value: 'locked_out', label: 'I am currently locked out' },
          { value: 'other', label: 'Something else' },
        ],
        summaryLabel: 'Issue',
      },
      next: () => 'security_concern',
    },
    security_concern: {
      id: 'security_concern',
      question: {
        key: 'security_concern', prompt: 'Is this door currently unable to be secured (e.g. left open to the outside)?', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'yes', label: 'Yes, it cannot be secured right now' }, { value: 'no', label: 'No' }],
        summaryLabel: 'Security concern',
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
