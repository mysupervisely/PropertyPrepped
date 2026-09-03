// PropRoster Milestone 27 — Guided Maintenance Intake M2 V1.
// Heating / AC — the most complete V1 flow (Section 6 of the M2 brief).
// The "AC is running but not cooling" branch is the flagship, deep
// example the brief itself specifies question-by-question; the other
// symptom branches are intentionally shallower.
//
// Safety note: this tree never asks whether a compressor is running or
// spinning, and never asks the tenant to open, touch, or approach the
// outdoor unit — only whether it can be safely OBSERVED from a distance
// (Section 6's explicit instruction).

import type { IntakeTree } from '../types'

const THERMOSTAT_MODE_OPTIONS = [
  { value: 'cool', label: 'COOL' },
  { value: 'heat', label: 'HEAT' },
  { value: 'auto', label: 'AUTO' },
  { value: 'off', label: 'OFF' },
  { value: 'not_sure', label: 'Not sure' },
]

const FILTER_OPTIONS = [
  { value: 'clean', label: 'Clean' },
  { value: 'dirty', label: 'Dirty' },
  { value: 'not_sure', label: 'Not sure' },
  { value: 'cannot_access', label: 'Cannot safely access' },
]

const SMELL_OPTIONS = [
  { value: 'none', label: 'No unusual smell' },
  { value: 'musty', label: 'Musty or dusty' },
  { value: 'burning', label: 'Burning / electrical smell', urgentReason: 'electrical_hazard' as const },
  { value: 'gas', label: 'Gas or rotten-egg smell', urgentReason: 'gas_smell' as const },
  { value: 'other', label: 'Something else' },
]

export const heatingAcIntakeTree: IntakeTree = {
  categoryId: 'heating_ac',
  version: 'heating_ac-v1',
  entryStepId: 'hvac_symptom',
  titleStepId: 'hvac_symptom',
  steps: {
    // ===== Entry: top-level symptom picker =====
    hvac_symptom: {
      id: 'hvac_symptom',
      question: {
        key: 'hvac_symptom',
        prompt: "What's happening?",
        safetyClass: 'safe_observation',
        type: 'select',
        options: [
          { value: 'ac_not_cooling', label: 'AC is running but not cooling' },
          { value: 'no_airflow', label: 'No air is coming from the vents' },
          { value: 'wont_turn_on', label: 'System will not turn on' },
          { value: 'heating_not_working', label: 'Heating is not working' },
          { value: 'water_ice', label: 'Water or ice near the system' },
          { value: 'unusual_sound', label: 'Unusual sound' },
          { value: 'unusual_smell', label: 'Unusual smell' },
          { value: 'something_else', label: 'Something else' },
        ],
        summaryLabel: 'Symptom',
      },
      next: (a) => {
        switch (a.hvac_symptom) {
          case 'ac_not_cooling': return 'thermostat_mode'
          case 'no_airflow': return 'no_air_zones'
          case 'wont_turn_on': return 'wont_turn_on_screen'
          case 'heating_not_working': return 'thermostat_mode_heat'
          case 'water_ice': return 'water_ice_active'
          case 'unusual_sound': return 'sound_type'
          case 'unusual_smell': return 'smell_type_top'
          default: return 'hvac_other_description'
        }
      },
    },

    // ===== Branch: AC not cooling (flagship, deep) =====
    thermostat_mode: {
      id: 'thermostat_mode',
      question: { key: 'thermostat_mode', prompt: 'Is the thermostat set to COOL?', safetyClass: 'safe_observation', type: 'select', options: THERMOSTAT_MODE_OPTIONS, summaryLabel: 'Thermostat' },
      next: () => 'set_temperature',
    },
    set_temperature: {
      id: 'set_temperature',
      question: { key: 'set_temperature', prompt: 'What temperature is it set to?', helpText: 'Just the number is fine.', safetyClass: 'safe_observation', type: 'text', summaryLabel: 'Set temperature', unitSuffix: '°F' },
      next: () => 'current_temperature',
    },
    current_temperature: {
      id: 'current_temperature',
      question: { key: 'current_temperature', prompt: 'What temperature does the thermostat currently show?', safetyClass: 'safe_observation', type: 'text', summaryLabel: 'Current temperature', unitSuffix: '°F' },
      next: () => 'airflow',
    },
    airflow: {
      id: 'airflow',
      question: {
        key: 'airflow', prompt: 'Is air coming from the vents?', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'normal', label: 'Normal' }, { value: 'weak', label: 'Weak' }, { value: 'none', label: 'None' }],
        summaryLabel: 'Airflow',
      },
      next: () => 'air_feel',
    },
    air_feel: {
      id: 'air_feel',
      question: {
        key: 'air_feel', prompt: 'Does the air from the vents feel...', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'cool', label: 'Cool' }, { value: 'warm', label: 'Warm' }, { value: 'not_sure', label: 'Not sure' }],
        summaryLabel: 'Supply air',
      },
      next: () => 'filter_condition',
    },
    filter_condition: {
      id: 'filter_condition',
      question: { key: 'filter_condition', prompt: 'Is the air filter clean or dirty?', helpText: 'Only check if you can safely and easily access it — skip if you\'re not comfortable.', safetyClass: 'safe_simple_action', type: 'select', options: FILTER_OPTIONS, summaryLabel: 'Filter' },
      next: () => 'outdoor_unit_running',
    },
    outdoor_unit_running: {
      id: 'outdoor_unit_running',
      question: {
        key: 'outdoor_unit_running',
        prompt: 'If you can safely see the outdoor unit WITHOUT touching it, does it look or sound like it\'s running?',
        helpText: 'Only answer if you can observe it from a distance. Never approach or touch the outdoor unit.',
        safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'yes', label: 'Yes, running' }, { value: 'no', label: 'No, not running' }, { value: 'not_sure', label: 'Not sure' }, { value: 'cannot_see', label: 'Could not safely check' }],
        summaryLabel: 'Outdoor unit',
      },
      next: () => 'water_or_ice_visible',
    },
    water_or_ice_visible: {
      id: 'water_or_ice_visible',
      question: {
        key: 'water_or_ice_visible', prompt: 'Do you see any water or ice near the indoor unit?', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }],
        summaryLabel: 'Visible water/ice',
      },
      next: () => 'unusual_sound_ac',
    },
    unusual_sound_ac: {
      id: 'unusual_sound_ac',
      question: {
        key: 'unusual_sound_ac', prompt: 'Any unusual sound?', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'none', label: 'No unusual sound' }, { value: 'yes', label: 'Yes' }],
        summaryLabel: 'Unusual sound',
      },
      next: (a) => (a.unusual_sound_ac === 'yes' ? 'unusual_sound_detail_ac' : 'unusual_smell_ac'),
    },
    unusual_sound_detail_ac: {
      id: 'unusual_sound_detail_ac',
      question: { key: 'unusual_sound_detail_ac', prompt: 'What does the sound sound like?', helpText: 'e.g. banging, squealing, humming, clicking', safetyClass: 'safe_observation', type: 'text', summaryLabel: 'Sound description' },
      next: () => 'unusual_smell_ac',
    },
    unusual_smell_ac: {
      id: 'unusual_smell_ac',
      question: { key: 'unusual_smell_ac', prompt: 'Any unusual smell?', safetyClass: 'safe_observation', type: 'select', options: SMELL_OPTIONS, summaryLabel: 'Unusual smell' },
      next: () => null,
    },

    // ===== Branch: No airflow =====
    no_air_zones: {
      id: 'no_air_zones',
      question: {
        key: 'no_air_zones', prompt: 'Is this happening in the whole home, or just one room or zone?', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'whole_home', label: 'Whole home' }, { value: 'one_room', label: 'One room / zone' }, { value: 'not_sure', label: 'Not sure' }],
        summaryLabel: 'Affected area',
      },
      next: () => 'no_air_thermostat_display',
    },
    no_air_thermostat_display: {
      id: 'no_air_thermostat_display',
      question: {
        key: 'no_air_thermostat_display', prompt: 'Is the thermostat screen on or blank?', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'on', label: 'On' }, { value: 'blank', label: 'Blank' }, { value: 'not_sure', label: 'Not sure' }],
        summaryLabel: 'Thermostat display',
      },
      next: () => 'no_air_sound',
    },
    no_air_sound: {
      id: 'no_air_sound',
      question: {
        key: 'no_air_sound', prompt: 'Do you hear any sound from the system when you set it to cool or heat?', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }],
        summaryLabel: 'System sound when set',
      },
      next: () => 'no_air_filter',
    },
    no_air_filter: {
      id: 'no_air_filter',
      question: { key: 'no_air_filter', prompt: 'Is the air filter clean or dirty?', helpText: 'Only check if you can safely and easily access it — skip if you\'re not comfortable.', safetyClass: 'safe_simple_action', type: 'select', options: FILTER_OPTIONS, summaryLabel: 'Filter' },
      next: () => null,
    },

    // ===== Branch: System will not turn on =====
    wont_turn_on_screen: {
      id: 'wont_turn_on_screen',
      question: {
        key: 'wont_turn_on_screen', prompt: 'Is the thermostat screen completely blank?', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'yes', label: 'Yes, blank' }, { value: 'no', label: 'No, it shows something' }, { value: 'not_sure', label: 'Not sure' }],
        summaryLabel: 'Thermostat display',
      },
      next: () => 'wont_turn_on_set_temp',
    },
    wont_turn_on_set_temp: {
      id: 'wont_turn_on_set_temp',
      question: { key: 'wont_turn_on_set_temp', prompt: 'What temperature is it set to?', safetyClass: 'safe_observation', type: 'text', summaryLabel: 'Set temperature', unitSuffix: '°F', optional: true },
      next: () => 'wont_turn_on_current_temp',
    },
    wont_turn_on_current_temp: {
      id: 'wont_turn_on_current_temp',
      question: { key: 'wont_turn_on_current_temp', prompt: 'What temperature does it currently show?', safetyClass: 'safe_observation', type: 'text', summaryLabel: 'Current temperature', unitSuffix: '°F', optional: true },
      next: () => 'wont_turn_on_any_response',
    },
    wont_turn_on_any_response: {
      id: 'wont_turn_on_any_response',
      question: {
        key: 'wont_turn_on_any_response', prompt: 'Do you hear or feel anything at all when you try to turn it on?', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No, nothing' }, { value: 'not_sure', label: 'Not sure' }],
        summaryLabel: 'Any response',
      },
      next: () => null,
    },

    // ===== Branch: Heating not working (mirrors AC-not-cooling for heat mode) =====
    thermostat_mode_heat: {
      id: 'thermostat_mode_heat',
      question: { key: 'thermostat_mode_heat', prompt: 'Is the thermostat set to HEAT?', safetyClass: 'safe_observation', type: 'select', options: THERMOSTAT_MODE_OPTIONS, summaryLabel: 'Thermostat' },
      next: () => 'set_temperature_heat',
    },
    set_temperature_heat: {
      id: 'set_temperature_heat',
      question: { key: 'set_temperature_heat', prompt: 'What temperature is it set to?', safetyClass: 'safe_observation', type: 'text', summaryLabel: 'Set temperature', unitSuffix: '°F' },
      next: () => 'current_temperature_heat',
    },
    current_temperature_heat: {
      id: 'current_temperature_heat',
      question: { key: 'current_temperature_heat', prompt: 'What temperature does the thermostat currently show?', safetyClass: 'safe_observation', type: 'text', summaryLabel: 'Current temperature', unitSuffix: '°F' },
      next: () => 'airflow_heat',
    },
    airflow_heat: {
      id: 'airflow_heat',
      question: {
        key: 'airflow_heat', prompt: 'Is air coming from the vents?', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'normal', label: 'Normal' }, { value: 'weak', label: 'Weak' }, { value: 'none', label: 'None' }],
        summaryLabel: 'Airflow',
      },
      next: () => 'air_feel_heat',
    },
    air_feel_heat: {
      id: 'air_feel_heat',
      question: {
        key: 'air_feel_heat', prompt: 'Does the air from the vents feel...', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'warm', label: 'Warm' }, { value: 'cool', label: 'Cool' }, { value: 'not_sure', label: 'Not sure' }],
        summaryLabel: 'Supply air',
      },
      next: () => 'filter_condition_heat',
    },
    filter_condition_heat: {
      id: 'filter_condition_heat',
      question: { key: 'filter_condition_heat', prompt: 'Is the air filter clean or dirty?', helpText: 'Only check if you can safely and easily access it — skip if you\'re not comfortable.', safetyClass: 'safe_simple_action', type: 'select', options: FILTER_OPTIONS, summaryLabel: 'Filter' },
      next: () => 'smell_heat',
    },
    smell_heat: {
      id: 'smell_heat',
      question: {
        key: 'smell_heat', prompt: 'Any unusual smell?', helpText: 'A faint smell the first time heat runs each season can be normal, but let us know either way.', safetyClass: 'safe_observation', type: 'select',
        options: [
          { value: 'none', label: 'No unusual smell' },
          { value: 'faint', label: 'Faint smell' },
          { value: 'burning', label: 'Strong burning smell', urgentReason: 'electrical_hazard' },
          { value: 'gas', label: 'Gas or rotten-egg smell', urgentReason: 'gas_smell' },
        ],
        summaryLabel: 'Unusual smell',
      },
      next: () => null,
    },

    // ===== Branch: Water or ice near the system =====
    water_ice_active: {
      id: 'water_ice_active',
      question: {
        key: 'water_ice_active', prompt: 'Is there water actively dripping or pooling on the floor right now?', safetyClass: 'safe_observation', type: 'select',
        options: [
          { value: 'yes_large', label: 'Yes, a lot / spreading', urgentReason: 'major_flooding' },
          { value: 'yes_small', label: 'Yes, a small amount' },
          { value: 'no', label: 'No' },
          { value: 'not_sure', label: 'Not sure' },
        ],
        summaryLabel: 'Active water',
      },
      next: () => 'ice_visible',
    },
    ice_visible: {
      id: 'ice_visible',
      question: {
        key: 'ice_visible', prompt: 'Do you see ice on any pipes or the indoor unit?', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }],
        summaryLabel: 'Visible ice',
      },
      next: () => 'water_ice_smell',
    },
    water_ice_smell: {
      id: 'water_ice_smell',
      question: { key: 'water_ice_smell', prompt: 'Any unusual smell?', safetyClass: 'safe_observation', type: 'select', options: SMELL_OPTIONS, summaryLabel: 'Unusual smell' },
      next: () => null,
    },

    // ===== Branch: Unusual sound =====
    sound_type: {
      id: 'sound_type',
      question: {
        key: 'sound_type', prompt: 'What best describes the sound?', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'banging', label: 'Banging' }, { value: 'squealing', label: 'Squealing' }, { value: 'humming', label: 'Humming/buzzing' }, { value: 'clicking', label: 'Clicking' }, { value: 'other', label: 'Something else' }],
        summaryLabel: 'Sound type',
      },
      next: () => 'sound_when',
    },
    sound_when: {
      id: 'sound_when',
      question: {
        key: 'sound_when', prompt: 'When do you hear it?', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'constant', label: 'Constant' }, { value: 'on_start', label: 'Only when it starts' }, { value: 'on_stop', label: 'Only when it stops' }, { value: 'intermittent', label: 'On and off' }],
        summaryLabel: 'When it happens',
      },
      next: () => null,
    },

    // ===== Branch: Unusual smell =====
    smell_type_top: {
      id: 'smell_type_top',
      question: { key: 'smell_type_top', prompt: 'What best describes the smell?', safetyClass: 'safe_observation', type: 'select', options: SMELL_OPTIONS, summaryLabel: 'Smell type' },
      next: (a) => (a.smell_type_top === 'other' ? 'smell_detail_top' : null),
    },
    smell_detail_top: {
      id: 'smell_detail_top',
      question: { key: 'smell_detail_top', prompt: 'Can you describe the smell?', safetyClass: 'safe_observation', type: 'text', summaryLabel: 'Smell description' },
      next: () => null,
    },

    // ===== Branch: Something else =====
    hvac_other_description: {
      id: 'hvac_other_description',
      question: { key: 'hvac_other_description', prompt: "Please describe what's happening.", safetyClass: 'safe_observation', type: 'text', summaryLabel: 'Description' },
      next: () => 'hvac_other_severity',
    },
    hvac_other_severity: {
      id: 'hvac_other_severity',
      question: {
        key: 'hvac_other_severity', prompt: 'How would you describe it?', safetyClass: 'safe_observation', type: 'select',
        options: [{ value: 'minor', label: 'Minor — not urgent' }, { value: 'moderate', label: 'Moderate — affects comfort' }, { value: 'severe', label: 'Severe — affects daily life' }],
        summaryLabel: 'Severity',
      },
      next: () => null,
    },
  },
}
