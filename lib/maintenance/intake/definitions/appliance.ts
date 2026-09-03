// PropRoster Milestone 27 — Guided Maintenance Intake M2 V1: Appliance.

import type { IntakeTree } from '../types'

export const applianceIntakeTree: IntakeTree = {
  categoryId: 'appliance',
  version: 'appliance-v1',
  entryStepId: 'appliance_type',
  titleStepId: 'appliance_type',
  steps: {
    appliance_type: {
      id: 'appliance_type',
      question: {
        key: 'appliance_type', prompt: 'Which appliance?', safetyClass: 'safe_observation', type: 'select',
        options: [
          { value: 'refrigerator', label: 'Refrigerator' },
          { value: 'range_oven', label: 'Range / Oven' },
          { value: 'dishwasher', label: 'Dishwasher' },
          { value: 'washer', label: 'Washer' },
          { value: 'dryer', label: 'Dryer' },
          { value: 'water_heater', label: 'Water heater' },
          { value: 'garbage_disposal', label: 'Garbage disposal' },
          { value: 'other', label: 'Something else' },
        ],
        summaryLabel: 'Appliance',
      },
      next: () => 'powers_on',
    },
    powers_on: {
      id: 'powers_on',
      question: {
        key: 'powers_on', prompt: 'Does it power on?', safetyClass: 'safe_simple_action', type: 'select',
        options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'partially', label: 'Partially' }],
        summaryLabel: 'Powers on',
      },
      next: () => 'error_code',
    },
    error_code: {
      id: 'error_code',
      question: {
        key: 'error_code', prompt: 'Is an error code or light displayed?', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }],
        summaryLabel: 'Error code shown',
      },
      next: (a) => (a.error_code === 'yes' ? 'error_code_detail' : 'leak'),
    },
    error_code_detail: {
      id: 'error_code_detail',
      question: { key: 'error_code_detail', prompt: 'What does the code or display say?', safetyClass: 'safe_observation', type: 'text', summaryLabel: 'Error code' },
      next: () => 'leak',
    },
    leak: {
      id: 'leak',
      question: {
        key: 'leak', prompt: 'Is there a leak?', safetyClass: 'safe_observation', type: 'select',
        options: [
          { value: 'yes_major', label: 'Yes, a lot of water', urgentReason: 'major_flooding' },
          { value: 'yes_minor', label: 'Yes, a small amount' },
          { value: 'no', label: 'No' },
        ],
        summaryLabel: 'Leak',
      },
      next: () => 'unusual_smell_sound',
    },
    unusual_smell_sound: {
      id: 'unusual_smell_sound',
      question: {
        key: 'unusual_smell_sound', prompt: 'Any unusual smell or sound?', safetyClass: 'safe_observation', type: 'select',
        options: [
          { value: 'none', label: 'No' },
          { value: 'burning', label: 'Burning smell', urgentReason: 'electrical_hazard' },
          { value: 'gas', label: 'Gas smell', urgentReason: 'gas_smell' },
          { value: 'other', label: 'Something else' },
        ],
        summaryLabel: 'Unusual smell/sound',
      },
      next: () => 'photo',
    },
    photo: {
      id: 'photo',
      question: { key: 'photo', prompt: 'A photo of the error code or issue helps but is optional.', safetyClass: 'safe_observation', type: 'photo', optional: true },
      next: () => null,
    },
  },
}
