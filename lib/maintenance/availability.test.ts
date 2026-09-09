import { describe, expect, it } from 'vitest'
import {
  flattenAvailabilityInput, sortWindows, groupWindowsByDate, windowsForRequestId,
  windowsForMaintenanceRequest, entryPreferenceForMaintenanceRequest,
  buildProviderSafeAvailability, parseLocalDateTime, isTimeWithinWindow, matchProposedTime,
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
