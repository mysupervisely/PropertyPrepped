import { describe, expect, it } from 'vitest'
import { buildManualWatchDraft } from './manual'

const NOW = new Date('2026-08-14T12:00:00')

describe('buildManualWatchDraft', () => {
  it('builds a manual item with the expected identity (source_type manual, source_id null)', () => {
    const draft = buildManualWatchDraft(
      { ownerId: 'owner-1', propertyId: 'prop-1', category: 'Inspection', title: 'Pool inspection', eventDate: '2026-09-15', warningDays: 30 },
      NOW
    )
    expect(draft.source_type).toBe('manual')
    expect(draft.source_id).toBeNull()
    expect(draft.title).toBe('Pool inspection')
    expect(draft.event_date).toBe('2026-09-15')
  })

  it('is Upcoming while outside its own warning window, Needs Attention once inside it', () => {
    const farOut = buildManualWatchDraft({ ownerId: 'o', propertyId: 'p', category: 'Other', title: 'x', eventDate: '2026-12-01', warningDays: 30 }, NOW)
    expect(farOut.status).toBe('Upcoming')
    const soon = buildManualWatchDraft({ ownerId: 'o', propertyId: 'p', category: 'Other', title: 'x', eventDate: '2026-08-20', warningDays: 30 }, NOW)
    expect(soon.status).toBe('Needs Attention')
  })

  it('is never gated by the generic 90-day window — a manual reminder exists immediately, however far out', () => {
    const draft = buildManualWatchDraft({ ownerId: 'o', propertyId: 'p', category: 'Other', title: 'x', eventDate: '2027-06-01' }, NOW)
    expect(draft).not.toBeNull()
    expect(draft.status).toBe('Upcoming')
  })

  it('works with no date at all', () => {
    const draft = buildManualWatchDraft({ ownerId: 'o', propertyId: 'p', category: 'Other', title: 'A reminder with no date' }, NOW)
    expect(draft.event_date).toBeNull()
    expect(draft.status).toBe('Upcoming')
    expect(draft.priority).toBe('Normal')
  })

  it('trims title and description', () => {
    const draft = buildManualWatchDraft({ ownerId: 'o', propertyId: 'p', category: 'Other', title: '  Pool inspection  ', description: '  bring chlorine  ', eventDate: null }, NOW)
    expect(draft.title).toBe('Pool inspection')
    expect(draft.description).toBe('bring chlorine')
  })
})
