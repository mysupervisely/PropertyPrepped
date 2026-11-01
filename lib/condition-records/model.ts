export type Stage = 'move_in' | 'move_out'
export type TaskStatus = 'todo' | 'done' | 'na'
export type Task = { id: string; label: string; section: string; status: TaskStatus; notes: string; due_on: string; completed_at?: string | null; completed_by?: string | null }
export type Room = { id: string; name: string; condition: 'not_checked' | 'good' | 'worn' | 'damaged' | 'not_applicable'; notes: string }
export type Inspection = { id: string; owner_id: string; property_id: string; lease_id: string | null; stage: Stage; inspected_on: string; inspector: string; status: 'draft' | 'finalized'; checklist: Task[]; rooms: Room[]; baseline_id: string | null; amendment_of: string | null; amendment_note: string; version: number; template_version: number; created_at: string; finalized_at: string | null; lease_snapshot?: { tenant_name: string; start_date: string; end_date: string }; property_label_snapshot?: string }
export type Media = { id: string; inspection_id: string; property_id: string; owner_id: string; room_id: string; storage_path: string; original_name: string; mime_type: string; size_bytes: number; status: 'pending' | 'ready' | 'removing'; captured_on: string | null; created_at: string }
const BEFORE = ['Confirm tenant, lease, move-in date and walkthrough', 'Confirm signed lease and agreed payment status', 'Confirm utility arrangements and tenant contact details', 'Review cleaning, repairs and unresolved issues']
const WALK_IN = ['Check locks, alarms, appliances and visible plumbing', 'Complete room-by-room condition notes', 'Photograph or film each applicable room and existing damage', 'Record meter readings, keys, remotes and included items', 'Review access and maintenance-reporting instructions']
const AFTER_IN = ['Verify uploaded photos and videos open correctly', 'Review and finalize the move-in report', 'Record key handover and follow-up items']
const OUT_BEFORE = ['Confirm move-out date, walkthrough and access return', 'Review this lease’s move-in baseline', 'Confirm utilities and forwarding contact details']
const OUT_WALK = ['Complete the same room-by-room condition review', 'Capture photos and videos before cleaning or repairs', 'Compare condition changes with the move-in baseline', 'Record meters, inventory and returned or missing keys', 'Note cleaning or repair follow-ups and supporting estimates']
const OUT_AFTER = ['Verify uploads and review the move-out report', 'Review the recorded rent balance separately', 'Review deposit disposition and required notices with appropriate advice', 'Record access handover and remaining owner follow-ups']
export function makeChecklist(stage: Stage): Task[] {
  const groups = stage === 'move_in' ? [BEFORE, WALK_IN, AFTER_IN] : [OUT_BEFORE, OUT_WALK, OUT_AFTER]
  return groups.flatMap((labels, group) => labels.map((label, i) => ({ id: `${stage}-${group}-${i}`, label, section: ['Before', 'Walkthrough', 'After'][group], status: 'todo' as const, notes: '', due_on: '' })))
}
export function defaultRooms(): Room[] { return ['Exterior', 'Living room', 'Kitchen', 'Bedroom', 'Bathroom'].map((name, i) => ({ id: `room-${i}`, name, condition: 'not_checked', notes: '' })) }
export function checklistProgress(tasks: Task[]) { const applicable = tasks.filter(t => t.status !== 'na'); const completed = applicable.filter(t => t.status === 'done').length; return { completed, total: applicable.length, percent: applicable.length ? Math.round(completed / applicable.length * 100) : null } }
export function recordChain(record: Inspection, records: Inspection[]): string[] { const ids: string[] = []; let current: Inspection | undefined = record; while (current && !ids.includes(current.id)) { ids.push(current.id); current = records.find(row => row.id === current!.amendment_of && row.property_id === record.property_id && row.owner_id === record.owner_id && row.lease_id === record.lease_id && row.stage === record.stage) } return ids }
export function recordMedia(record: Inspection, records: Inspection[], media: Media[]): Media[] { const ids = new Set(recordChain(record, records)); return media.filter(row => ids.has(row.inspection_id) && row.property_id === record.property_id && row.owner_id === record.owner_id) }
export function comparisonBaseline(record: Inspection, records: Inspection[]): Inspection | null { return records.find(row => row.id === record.baseline_id && row.status === 'finalized' && row.stage === 'move_in' && row.property_id === record.property_id && row.owner_id === record.owner_id && row.lease_id === record.lease_id && record.lease_id !== null) ?? null }
export function finalizationProblems(record: Inspection, records: Inspection[], media: Media[]): string[] {
  const problems: string[] = []; if (!record.lease_id) problems.push('Link this record to a lease.'); if (!record.inspector.trim()) problems.push('Enter the name of the person completing the walkthrough.'); if (record.checklist.some(t => t.status === 'todo')) problems.push('Complete or mark every checklist task not applicable.')
  const applicable = record.rooms.filter(room => room.condition !== 'not_applicable'); if (!applicable.length) problems.push('Include at least one applicable room.'); if (applicable.some(room => room.condition === 'not_checked')) problems.push('Record a condition for each applicable room.')
  const files = recordMedia(record, records, media); if (files.some(row => row.status !== 'ready')) problems.push('Resolve or remove unfinished uploads.'); if (applicable.some(room => !files.some(row => row.room_id === room.id && row.status === 'ready'))) problems.push('Save at least one photo or video for each applicable room.'); return problems
}
export const CONDITIONS_BUCKET = 'condition-record-media'
export const MEDIA_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm,.heic,.heif,.mov,.mp4,.webm'
const EXT: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' }
export function validateConditionFile(file: { name: string; type: string; size: number }): { mime: string; error?: string } {
  const mime = file.type || EXT[file.name.split('.').pop()?.toLowerCase() ?? ''] || ''
  if (!Object.values(EXT).includes(mime)) return { mime, error: 'Choose JPEG, PNG, WebP, HEIC, HEIF, MP4, MOV or WebM.' }
  const limit = mime.startsWith('video/') ? 50 * 1024 * 1024 : 20 * 1024 * 1024
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > limit) return { mime, error: mime.startsWith('video/') ? 'Videos must be between 1 byte and 50 MB.' : 'Photos must be between 1 byte and 20 MB.' }
  return { mime }
}
export function isMissingConditionSetup(error: { code?: string; message?: string } | null | undefined): boolean { return !!error && (['42P01', 'PGRST205'].includes(error.code ?? '') || /condition_inspections.*schema cache/i.test(error.message ?? '')) }
