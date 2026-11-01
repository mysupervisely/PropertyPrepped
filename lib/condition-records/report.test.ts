import { it, expect } from 'vitest'
import { conditionReport } from './report'
import { defaultRooms, makeChecklist, type Inspection, type Media } from './model'
const record: Inspection = { id: 'a', owner_id: 'owner', property_id: 'property', lease_id: 'lease', stage: 'move_out', inspected_on: '2026-10-01', inspector: '<script>bad()</script>', status: 'finalized', checklist: makeChecklist('move_out'), rooms: defaultRooms(), baseline_id: 'before', amendment_of: null, amendment_note: '', version: 1, template_version: 1, created_at: '', finalized_at: '2026-10-01' }
it('escapes all user text and excludes expiring private URLs from exported reports', () => {
  const baseline = { ...record, id: 'before', stage: 'move_in' as const, baseline_id: null }
  const file: Media = { id: 'file', inspection_id: 'a', property_id: 'property', owner_id: 'owner', room_id: 'room-0', storage_path: 'private-owner-path', original_name: '<img onerror=bad()>', mime_type: 'video/mp4', size_bytes: 100, status: 'ready', captured_on: null, created_at: '2026-10-01' }
  const html = conditionReport(record, [record, baseline], [file], 'Example <Property>', 'Tenant', { file: 'https://private.example/token' })
  expect(html).not.toContain('<script>bad')
  expect(html).toContain('&lt;script&gt;')
  expect(html).not.toContain('https://private.example/token')
  expect(html).toContain('Move-in baseline')
  expect(html).toContain('Media ID: file')
  expect(html).toContain('downloaded separately')
})
