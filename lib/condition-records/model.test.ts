import { expect, it } from 'vitest'
import { checklistProgress, comparisonBaseline, defaultRooms, finalizationProblems, makeChecklist, recordMedia, validateConditionFile, type Inspection, type Media } from './model'
const record = (change: Partial<Inspection> = {}): Inspection => ({ id: 'a', owner_id: 'owner', property_id: 'property', lease_id: 'lease', stage: 'move_in', inspected_on: '2026-10-01', inspector: 'Owner', status: 'draft', checklist: makeChecklist('move_in'), rooms: defaultRooms(), baseline_id: null, amendment_of: null, amendment_note: '', version: 1, template_version: 1, created_at: '', finalized_at: null, ...change })
const media = (change: Partial<Media> = {}): Media => ({ id: 'file', inspection_id: 'a', property_id: 'property', owner_id: 'owner', room_id: 'room-0', storage_path: 'private', original_name: 'Photo.jpg', mime_type: 'image/jpeg', size_bytes: 10, status: 'ready', captured_on: null, created_at: '', ...change })
it('copies independent stage checklists and retains completed tasks in progress while excluding N/A', () => {
  const first = makeChecklist('move_in'), second = makeChecklist('move_in'), out = makeChecklist('move_out')
  first[0].status = 'done'; first[1].status = 'na'
  expect(second[0].status).toBe('todo'); expect(out[0].id).not.toBe(first[0].id)
  expect(checklistProgress(first)).toMatchObject({ completed: 1, total: first.length - 1 })
  expect(checklistProgress(first.map(task => ({ ...task, status: 'na' })))).toEqual({ completed: 0, total: 0, percent: null })
})
it('links comparisons only to a finalized baseline for exactly the same property and lease', () => {
  const baseline = record({ id: 'baseline', status: 'finalized' }), out = record({ id: 'out', stage: 'move_out', baseline_id: 'baseline' })
  expect(comparisonBaseline(out, [baseline])).toBe(baseline)
  for (const changed of [{ property_id: 'other' }, { lease_id: 'other' }, { status: 'draft' as const }]) expect(comparisonBaseline(out, [{ ...baseline, ...changed }])).toBeNull()
  expect(comparisonBaseline({ ...out, lease_id: null }, [baseline])).toBeNull()
})
it('inherits original amendment media without allowing cross-property or cross-lease inheritance', () => {
  const original = record({ status: 'finalized' }), amendment = record({ id: 'amend', amendment_of: 'a' })
  expect(recordMedia(amendment, [original, amendment], [media()])).toHaveLength(1)
  expect(recordMedia(amendment, [{ ...original, lease_id: 'other' }, amendment], [media()])).toEqual([])
})
it('requires a lease, resolved tasks, checked rooms and verified per-room media to finalize', () => {
  const draft = record({ lease_id: null })
  expect(finalizationProblems(draft, [draft], [])).toContain('Link this record to a lease.')
  const ready = record({ checklist: makeChecklist('move_in').map(task => ({ ...task, status: 'done' })), rooms: [{ id: 'room-0', name: 'Living', condition: 'good', notes: '' }] })
  expect(finalizationProblems(ready, [ready], [media()])).toEqual([])
  expect(finalizationProblems(ready, [ready], [media({ status: 'pending' })])).toContain('Resolve or remove unfinished uploads.')
  expect(finalizationProblems(ready, [ready], [])).toContain('Save at least one photo or video for each applicable room.')
})
it('validates real mobile image/video formats and separate size limits', () => {
  expect(validateConditionFile({ name: 'camera.MOV', type: '', size: 123 })).toEqual({ mime: 'video/quicktime' })
  expect(validateConditionFile({ name: 'photo.jpg', type: 'application/javascript', size: 123 }).error).toBeTruthy()
  for (const size of [0, 21 * 1024 * 1024]) expect(validateConditionFile({ name: 'photo.jpg', type: 'image/jpeg', size }).error).toBeTruthy()
  expect(validateConditionFile({ name: 'video.mp4', type: 'video/mp4', size: 49 * 1024 * 1024 }).error).toBeUndefined()
  expect(validateConditionFile({ name: 'video.mp4', type: 'video/mp4', size: 51 * 1024 * 1024 }).error).toBeTruthy()
})
