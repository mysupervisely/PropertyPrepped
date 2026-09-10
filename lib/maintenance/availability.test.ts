import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  flattenAvailabilityInput, sortWindows, groupWindowsByDate, windowsForRequestId,
  windowsForMaintenanceRequest, entryPreferenceForMaintenanceRequest,
  buildProviderSafeAvailability, parseLocalDateTime, isTimeWithinWindow, matchProposedTime,
  formatLocalTimestampForStorage, parseStoredLocalTimestamp, formatAppointmentDateTime,
  WINDOW_LABEL_RANGE, ENTRY_PREFERENCE_LABEL, type AvailabilityWindow, type TenantRequestAvailabilityLink,
} from './availability'

describe('flattenAvailabilityInput', () => {
  it('produces one row per selected block, in the order supplied', () => {
    const rows = flattenAvailabilityInput([{ date: '2026-09-15', morning: true, afternoon: false, evening: true }])
    expect(rows).toEqual([
      { window_date: '2026-09-15', window_label: 'morning' },
      { window_date: '2026-09-15', window_label: 'evening' },
    ])
  })

  it('supports multiple days', () => {
    const rows = flattenAvailabilityInput([
      { date: '2026-09-15', morning: true, afternoon: false, evening: false },
      { date: '2026-09-16', morning: false, afternoon: true, evening: false },
    ])
    expect(rows).toEqual([
      { window_date: '2026-09-15', window_label: 'morning' },
      { window_date: '2026-09-16', window_label: 'afternoon' },
    ])
  })

  it('drops a day with no date entered', () => {
    expect(flattenAvailabilityInput([{ date: '', morning: true, afternoon: true, evening: true }])).toEqual([])
  })

  it('drops a day with no block selected', () => {
    expect(flattenAvailabilityInput([{ date: '2026-09-15', morning: false, afternoon: false, evening: false }])).toEqual([])
  })

  it('never forces a selection — an entirely empty list is valid (tenant may skip availability)', () => {
    expect(flattenAvailabilityInput([])).toEqual([])
  })

  it('deduplicates an accidental duplicate day+block', () => {
    const rows = flattenAvailabilityInput([
      { date: '2026-09-15', morning: true, afternoon: false, evening: false },
      { date: '2026-09-15', morning: true, afternoon: false, evening: false },
    ])
    expect(rows).toEqual([{ window_date: '2026-09-15', window_label: 'morning' }])
  })
})

const rows: AvailabilityWindow[] = [
  { id: 'w1', request_id: 'r1', window_date: '2026-09-16', window_label: 'evening' },
  { id: 'w2', request_id: 'r1', window_date: '2026-09-15', window_label: 'afternoon' },
  { id: 'w3', request_id: 'r1', window_date: '2026-09-15', window_label: 'morning' },
  { id: 'w4', request_id: 'r2', window_date: '2026-09-20', window_label: 'morning' },
]

describe('sortWindows', () => {
  it('orders chronologically, then morning/afternoon/evening within a day', () => {
    expect(sortWindows(rows.filter((w) => w.request_id === 'r1')).map((w) => w.id)).toEqual(['w3', 'w2', 'w1'])
  })
})

describe('groupWindowsByDate', () => {
  it('groups same-day windows together in display order', () => {
    expect(groupWindowsByDate(rows.filter((w) => w.request_id === 'r1'))).toEqual([
      { date: '2026-09-15', labels: ['morning', 'afternoon'] },
      { date: '2026-09-16', labels: ['evening'] },
    ])
  })

  it('returns an empty list for no windows', () => {
    expect(groupWindowsByDate([])).toEqual([])
  })
})

describe('windowsForRequestId — strict per-request scoping', () => {
  it('never leaks another request\'s windows', () => {
    expect(windowsForRequestId(rows, 'r1').map((w) => w.id)).toEqual(['w1', 'w2', 'w3'])
    expect(windowsForRequestId(rows, 'r2').map((w) => w.id)).toEqual(['w4'])
    expect(windowsForRequestId(rows, 'r-unknown')).toEqual([])
  })
})

const tenantRequestLinks: TenantRequestAvailabilityLink[] = [
  { id: 'r1', maintenance_request_id: 'mr1', entry_preference: 'someone_home' },
  { id: 'r2', maintenance_request_id: 'mr2', entry_preference: null },
  { id: 'r3', maintenance_request_id: null },
]

describe('windowsForMaintenanceRequest — the same one-hop join category already uses', () => {
  it('resolves windows via the linked tenant_requests row', () => {
    expect(windowsForMaintenanceRequest(rows, tenantRequestLinks, 'mr1').map((w) => w.id).sort()).toEqual(['w1', 'w2', 'w3'])
  })

  it('a landlord-created case (no linked tenant_requests row) has no availability, not an error', () => {
    expect(windowsForMaintenanceRequest(rows, tenantRequestLinks, 'mr-landlord-created')).toEqual([])
  })
})

describe('entryPreferenceForMaintenanceRequest', () => {
  it('resolves the linked tenant_requests row\'s entry preference', () => {
    expect(entryPreferenceForMaintenanceRequest(tenantRequestLinks, 'mr1')).toBe('someone_home')
  })

  it('null when the tenant skipped it', () => {
    expect(entryPreferenceForMaintenanceRequest(tenantRequestLinks, 'mr2')).toBeNull()
  })

  it('null for a landlord-created case with no tenant_requests link at all', () => {
    expect(entryPreferenceForMaintenanceRequest(tenantRequestLinks, 'mr-landlord-created')).toBeNull()
  })
})

describe('buildProviderSafeAvailability — explicit allowlist', () => {
  it('strips request_id/id — a provider never sees which request or tenant a window belongs to beyond what the page already scoped', () => {
    const safe = buildProviderSafeAvailability(rows.filter((w) => w.request_id === 'r1'))
    for (const w of safe) {
      expect(Object.keys(w).sort()).toEqual(['window_date', 'window_label'])
    }
  })

  it('still sorts chronologically', () => {
    const safe = buildProviderSafeAvailability(rows.filter((w) => w.request_id === 'r1'))
    expect(safe[0]).toEqual({ window_date: '2026-09-15', window_label: 'morning' })
  })
})

describe('parseLocalDateTime', () => {
  it('parses a well-formed datetime-local value', () => {
    expect(parseLocalDateTime('2026-09-15T10:30')).toEqual({ date: '2026-09-15', hour: 10, minute: 30 })
  })

  it('rejects malformed input rather than guessing', () => {
    expect(parseLocalDateTime('not-a-date')).toBeNull()
    expect(parseLocalDateTime('2026-09-15')).toBeNull()
    expect(parseLocalDateTime('2026-09-15T25:00')).toBeNull()
  })
})

describe('WINDOW_LABEL_RANGE — the single source of truth for both display copy and matching', () => {
  it('matches the milestone\'s own suggested defaults', () => {
    expect(WINDOW_LABEL_RANGE.morning).toEqual({ startHour: 8, endHour: 12, display: '8 AM–12 PM' })
    expect(WINDOW_LABEL_RANGE.afternoon).toEqual({ startHour: 12, endHour: 17, display: '12 PM–5 PM' })
    expect(WINDOW_LABEL_RANGE.evening).toEqual({ startHour: 17, endHour: 20, display: '5 PM–8 PM' })
  })
})

describe('isTimeWithinWindow / matchProposedTime — deterministic, no AI', () => {
  const windows = [{ window_date: '2026-09-15', window_label: 'morning' as const }]

  it('MATCHED: a time inside the window\'s range on the same date', () => {
    expect(matchProposedTime(windows, { date: '2026-09-15', hour: 10 })).toBe(true)
  })

  it('ALTERNATIVE: same date, outside the range', () => {
    expect(matchProposedTime(windows, { date: '2026-09-15', hour: 14 })).toBe(false)
  })

  it('ALTERNATIVE: same time-of-day, different date', () => {
    expect(matchProposedTime(windows, { date: '2026-09-16', hour: 10 })).toBe(false)
  })

  it('ALTERNATIVE: no availability supplied at all', () => {
    expect(matchProposedTime([], { date: '2026-09-15', hour: 10 })).toBe(false)
  })

  it('range end is exclusive — noon is Afternoon, not Morning', () => {
    expect(isTimeWithinWindow({ window_date: '2026-09-15', window_label: 'morning' }, { date: '2026-09-15', hour: 12 })).toBe(false)
    expect(isTimeWithinWindow({ window_date: '2026-09-15', window_label: 'afternoon' }, { date: '2026-09-15', hour: 12 })).toBe(true)
  })
})

describe('Entry preference — a distinct concept from availability, never combined with it', () => {
  it('has exactly the three options this milestone specifies, none implying authorization to enter', () => {
    expect(ENTRY_PREFERENCE_LABEL.someone_home).toBe('Someone will be home')
    expect(ENTRY_PREFERENCE_LABEL.contact_before_entering).toBe('Contact me before entering')
    expect(ENTRY_PREFERENCE_LABEL.other).toBe('Other / discuss with landlord')
    for (const label of Object.values(ENTRY_PREFERENCE_LABEL)) {
      expect(label.toLowerCase()).not.toMatch(/permission|authoriz|consent to enter|legal/i)
    }
  })
})

// Scheduling V1 Timezone Correction — proves 10:00 AM (property-local,
// as the provider typed it) survives storage-formatting and display
// unchanged, regardless of what timezone the code executing these
// functions happens to run in. These tests do NOT mock Date/Intl or
// TZ env vars — they instead prove the property under test structurally:
// none of these functions ever construct `new Date(aWallClockString)`
// for the TIME portion, so there is nothing for a runtime timezone to
// reinterpret in the first place.
describe('Scheduling V1 Timezone Correction — proposed time survives storage/display unshifted', () => {
  it('formatLocalTimestampForStorage never round-trips through a Date object — it is pure string formatting', () => {
    expect(formatLocalTimestampForStorage({ date: '2026-09-15', hour: 10, minute: 0 })).toBe('2026-09-15T10:00:00')
    expect(formatLocalTimestampForStorage({ date: '2026-09-15', hour: 9, minute: 5 })).toBe('2026-09-15T09:05:00')
  })

  it('parseStoredLocalTimestamp reads back exactly what was stored, ignoring any trailing seconds/fraction Postgres/PostgREST might add', () => {
    expect(parseStoredLocalTimestamp('2026-09-15T10:00:00')).toEqual({ date: '2026-09-15', hour: 10, minute: 0 })
    expect(parseStoredLocalTimestamp('2026-09-15T10:00:00.000000')).toEqual({ date: '2026-09-15', hour: 10, minute: 0 })
  })

  it('formatLocalTimestampForStorage never produces a timezone offset or "Z" — a regression reintroducing timestamptz/UTC conversion would', () => {
    const stored = formatLocalTimestampForStorage({ date: '2026-09-15', hour: 10, minute: 0 })
    expect(stored).not.toMatch(/[+-]\d{2}:?\d{2}$|Z$/)
    expect(stored).toBe('2026-09-15T10:00:00')
  })

  it('formatAppointmentDateTime shows 10:00 AM for a 10:00 stored value — never shifted to a different hour', () => {
    const display = formatAppointmentDateTime('2026-09-15T10:00:00')
    expect(display).toContain('10:00 AM')
    expect(display).not.toMatch(/\b(9:00|11:00|1:00)\s*(AM|PM)\b/)
  })

  it('formats midnight and noon boundaries correctly (12-hour conversion, not a Date-derived one)', () => {
    expect(formatAppointmentDateTime('2026-09-15T00:00:00')).toContain('12:00 AM')
    expect(formatAppointmentDateTime('2026-09-15T12:00:00')).toContain('12:00 PM')
    expect(formatAppointmentDateTime('2026-09-15T23:30:00')).toContain('11:30 PM')
  })

  it('the storage format is exactly what matchProposedTime already matches against — proving the stored value and the matched value are the same wall-clock time, never two different ones', () => {
    const parsed = parseLocalDateTime('2026-09-15T10:00')!
    const stored = formatLocalTimestampForStorage(parsed)
    const readBack = parseStoredLocalTimestamp(stored)!
    expect(readBack).toEqual(parsed)
    expect(matchProposedTime([{ window_date: '2026-09-15', window_label: 'morning' }], readBack)).toBe(true)
  })

  it('never uses new Date(...) on a raw datetime-local-shaped string anywhere in this module\'s exported storage/parse path (source-level guard)', () => {
    // Read this file's own source rather than importing the compiled
    // module — a direct, cheap regression guard against a future edit
    // reintroducing `new Date(someLocalString)` in the storage/parse
    // functions specifically (the noon-anchored trick used ONLY for
    // calendar-date labels elsewhere in this file is a separate,
    // already-safe, pre-existing pattern and is not what this guards).
    const source = readFileSync(join(__dirname, 'availability.ts'), 'utf8')
    // Strip comments first — the doc comments explaining this very
    // guard legitimately mention "new Date(...)" in prose (describing
    // both what these two functions deliberately avoid, and the
    // separate, already-safe noon-anchor trick the NEXT function down
    // uses for calendar-date labels only); only the executable code
    // matters for this guard.
    const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const withoutComments = stripComments(source)
    const storageFnBody = withoutComments.slice(withoutComments.indexOf('export function formatLocalTimestampForStorage'), withoutComments.indexOf('export function parseStoredLocalTimestamp'))
    const parseFnBody = withoutComments.slice(withoutComments.indexOf('export function parseStoredLocalTimestamp'), withoutComments.indexOf('export function formatAppointmentDateTime'))
    expect(storageFnBody).not.toContain('new Date(')
    expect(parseFnBody).not.toContain('new Date(')
  })

  it('matched-vs-alternative determination still works correctly end to end with the corrected storage format', () => {
    const windows = [{ window_date: '2026-09-15', window_label: 'morning' as const }]
    const matchedProposal = parseLocalDateTime('2026-09-15T10:00')!
    const alternativeProposal = parseLocalDateTime('2026-09-15T14:00')!
    expect(matchProposedTime(windows, matchedProposal)).toBe(true)
    expect(matchProposedTime(windows, alternativeProposal)).toBe(false)
  })
})
