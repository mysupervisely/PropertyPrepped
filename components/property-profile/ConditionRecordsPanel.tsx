'use client'
import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beginReadingFileBytes, toDurableUploadableFile } from '../../lib/uploads/durable-file'
import { checklistProgress, comparisonBaseline, CONDITIONS_BUCKET, defaultRooms, finalizationProblems, isMissingConditionSetup, makeChecklist, MEDIA_ACCEPT, recordMedia, validateConditionFile, type Inspection, type Media, type Room, type Stage, type Task } from '../../lib/condition-records/model'
import { confirmConditionMedia, createInspection, loadConditionRecords, removeConditionMedia, reserveConditionMedia, saveInspection, uploadConditionMedia, type DraftPatch } from '../../lib/condition-records/repository'
import { conditionReport } from '../../lib/condition-records/report'

type Lease = { id: string; tenant_name: string; start_date: string; end_date: string }
type Creation = { id: string; stage: Stage; lease: string; baseline: string; date: string; inspector: string; amendment: Inspection | null; reason: string }
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
const patch = (record: Inspection): DraftPatch => ({ inspected_on: record.inspected_on, inspector: record.inspector, lease_id: record.lease_id, baseline_id: record.baseline_id, rooms: record.rooms, checklist: record.checklist, amendment_note: record.amendment_note })
const describeError = (error: unknown) => error instanceof Error ? error.message : 'The action could not be confirmed. Your draft is still here. Reload saved records before trying again.'
function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000) }

function MediaCard({ file, url, inherited, editable, busy, onDownload, onCheck, onRemove }: { file: Media; url?: string; inherited: boolean; editable: boolean; busy: boolean; onDownload: () => void; onCheck: () => void; onRemove: () => void }) {
  const [previewFailed, setPreviewFailed] = useState(false)
  useEffect(() => setPreviewFailed(false), [url])
  return <figure className="conditionMediaCard">
    {file.status === 'ready' && url && !previewFailed ? file.mime_type.startsWith('video/') ? <video controls preload="metadata" src={url} onError={() => setPreviewFailed(true)} /> : <img loading="lazy" src={url} alt={file.original_name} onError={() => setPreviewFailed(true)} /> : <p>{file.status === 'pending' ? 'Upload not yet verified' : file.status === 'removing' ? 'Removal not yet confirmed. Use Remove to finish.' : 'Preview unavailable. Download the original or refresh private previews.'}</p>}
    <figcaption><strong>{file.original_name}</strong><small>Uploaded {new Date(file.created_at).toLocaleString()}{file.captured_on ? ` · Claimed capture date ${file.captured_on}` : ''}{inherited ? ' · From the earlier finalized report' : ''}</small></figcaption>
    <div className="conditionActions">
      {file.status === 'ready' && <button type="button" className="secondary" disabled={busy} onClick={onDownload}>Download original</button>}
      {editable && !inherited && <>{file.status === 'pending' && <button type="button" className="secondary" disabled={busy} onClick={onCheck}>Check upload</button>}<button type="button" className="secondary" disabled={busy} onClick={onRemove}>Remove</button></>}
    </div>
  </figure>
}

export function ConditionRecordsPanel({ client, propertyId, ownerId, address, leases, completedBy = '', onDirtyChange }: { client: SupabaseClient; propertyId: string; ownerId: string; address: string; leases: Lease[]; completedBy?: string; onDirtyChange: (dirty: boolean) => void }) {
  const [records, setRecords] = useState<Inspection[]>([]), [media, setMedia] = useState<Media[]>([])
  const [saved, setSaved] = useState<Inspection | null>(null), [draft, setDraft] = useState<Inspection | null>(null)
  const [creation, setCreation] = useState<Creation | null>(null), [stage, setStage] = useState<Stage>('move_in')
  const [loading, setLoading] = useState(true), [missing, setMissing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [urls, setUrls] = useState<Record<string, string>>({}), [urlVersion, setUrlVersion] = useState(0)
  const [roomId, setRoomId] = useState(''), [capturedOn, setCapturedOn] = useState(''), [newTask, setNewTask] = useState(''), [newRoom, setNewRoom] = useState(''), [compare, setCompare] = useState(false)
  const working = useRef(false), mounted = useRef(true)
  const dirty = !!draft && !!saved && JSON.stringify(patch(draft)) !== JSON.stringify(patch(saved))
  const hasUnsaved = dirty || creation !== null
  const leaving = useRef(false)
  useEffect(() => { onDirtyChange(hasUnsaved || busy); return () => onDirtyChange(false) }, [hasUnsaved, busy, onDirtyChange])
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (!leaving.current && (hasUnsaved || busy)) { event.preventDefault(); event.returnValue = '' } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn) }, [hasUnsaved, busy])
  useEffect(() => {
    mounted.current = true; let active = true
    loadConditionRecords(client, propertyId, ownerId).then(data => { if (active) { setRecords(data.records); setMedia(data.media); setMissing(false) } }).catch(problem => { if (active) { if (isMissingConditionSetup(problem)) setMissing(true); else setError(describeError(problem)) } }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; mounted.current = false }
  }, [client, propertyId, ownerId])
  useEffect(() => {
    let active = true
    const paths = media.filter(file => file.status === 'ready').map(file => file.storage_path)
    setUrls({})
    if (paths.length) {
      // Chunk signing requests without exposing files publicly. URLs expire after ten minutes.
      void (async () => { const next: Record<string, string> = {}; for (let index = 0; index < paths.length; index += 100) { const result = await client.storage.from(CONDITIONS_BUCKET).createSignedUrls(paths.slice(index, index + 100), 600); if (result.error) throw result.error; for (const row of result.data ?? []) if (row.path && row.signedUrl) next[row.path] = row.signedUrl } if (active) setUrls(next) })().catch(() => { if (active) setNotice('Some private previews could not load. Use Refresh previews or download an original.') })
    }
    return () => { active = false }
  }, [client, media, urlVersion])
  useEffect(() => {
    const guardLink = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('a[href]') as HTMLAnchorElement | null : null
      if ((!hasUnsaved && !busy) || !target || target.target === '_blank' || target.closest('[data-condition-workspace]') || target.getAttribute('href')?.startsWith('#')) return
      if (!window.confirm('Leave unsaved inspection changes or an upload in progress?')) { event.preventDefault(); event.stopPropagation() } else { leaving.current = true; onDirtyChange(false) }
    }
    document.addEventListener('click', guardLink, true)
    return () => document.removeEventListener('click', guardLink, true)
  }, [hasUnsaved, busy, onDirtyChange])
  async function run(action: () => Promise<void>) {
    if (working.current) return
    working.current = true; setBusy(true); setError(''); setNotice('')
    try { await action() } catch (problem) { if (mounted.current) setError(describeError(problem)) } finally { working.current = false; if (mounted.current) setBusy(false) }
  }
  function accept(record: Inspection) { if (!mounted.current) return; setSaved(record); setDraft(record); setStage(record.stage); setRoomId(current => record.rooms.some(room => room.id === current) ? current : record.rooms[0]?.id ?? ''); setRecords(current => [record, ...current.filter(row => row.id !== record.id)]); setCreation(null) }
  function mayDiscard() { return !hasUnsaved || window.confirm('Leave these unsaved inspection changes?') }
  async function reload() {
    if (!mayDiscard()) return
    await run(async () => { const data = await loadConditionRecords(client, propertyId, ownerId); setRecords(data.records); setMedia(data.media); if (draft) { const current = data.records.find(row => row.id === draft.id); setSaved(current ?? null); setDraft(current ?? null) } setMissing(false) })
  }
  async function persist(next: Inspection) { if (!saved) return; const result = await saveInspection(client, saved, patch(next)); accept(result); setNotice('Draft saved.') }
  function taskChange(id: string, change: Partial<Task>) { if (!draft || draft.status !== 'draft' || working.current) return; const next = { ...draft, checklist: draft.checklist.map(task => task.id === id ? { ...task, ...change } : task) }; setDraft(next); void run(() => persist(next)) }
  function updateRoom(id: string, change: Partial<Room>) { if (draft) setDraft({ ...draft, rooms: draft.rooms.map(room => room.id === id ? { ...room, ...change } : room) }) }
  function startCreation(nextStage: Stage, amendment: Inspection | null = null) {
    if (!mayDiscard()) return
    setSaved(null); setDraft(null); setCompare(false); setError(''); setStage(nextStage)
    setCreation({ id: crypto.randomUUID(), stage: nextStage, lease: amendment?.lease_id ?? '', baseline: amendment?.baseline_id ?? '', date: amendment?.inspected_on ?? today(), inspector: amendment?.inspector ?? completedBy, amendment, reason: '' })
  }
  async function create() {
    if (!creation) return
    await run(async () => {
      const baseline = records.find(row => row.id === creation.baseline && row.lease_id === creation.lease && row.property_id === propertyId && row.stage === 'move_in' && row.status === 'finalized')
      const rooms = creation.amendment ? creation.amendment.rooms.map(room => ({ ...room })) : baseline ? baseline.rooms.map(room => ({ ...room, condition: 'not_checked' as const, notes: '' })) : defaultRooms()
      const result = await createInspection(client, { id: creation.id, owner_id: ownerId, property_id: propertyId, lease_id: creation.lease || null, stage: creation.stage, inspected_on: creation.date, inspector: creation.inspector.trim(), baseline_id: creation.stage === 'move_out' ? baseline?.id ?? null : null, amendment_of: creation.amendment?.id ?? null, amendment_note: creation.reason.trim(), template_version: 1, checklist: makeChecklist(creation.stage), rooms })
      accept(result); setNotice('Walkthrough started. Add your photos below.')
    })
  }
  async function refreshMedia() { const data = await loadConditionRecords(client, propertyId, ownerId); if (mounted.current) { setMedia(data.media); setRecords(data.records) } }
  function picked(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (!draft || dirty || busy || working.current || !roomId || !files.length) { event.target.value = ''; return }
    const invalid = files.map(validateConditionFile).find(result => result.error)
    if (invalid?.error || files.length > 10 || files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024) { setError(invalid?.error ?? 'Choose at most ten files and 100 MB per batch.'); event.target.value = ''; return }
    // Begin reading picker-backed bytes before resetting the iPhone file input.
    const pending = files.map(file => ({ file, bytes: beginReadingFileBytes(file), id: crypto.randomUUID() }))
    event.target.value = ''
    const inspection = draft, selectedRoom = roomId, captured = capturedOn || null
    void run(async () => {
      try {
        for (const item of pending) {
          const { mime } = validateConditionFile(item.file)
          const capture = await toDurableUploadableFile(item.file, mime, item.bytes)
          if (!capture.byteLength || capture.byteLength !== item.file.size) throw new Error('The selected file could not be read completely. Select it again before uploading.')
          const durable = capture.file
          const reservation = await reserveConditionMedia(client, { id: item.id, inspection_id: inspection.id, property_id: propertyId, owner_id: ownerId, room_id: selectedRoom, storage_path: `${ownerId}/${propertyId}/${inspection.id}/${item.id}`, original_name: item.file.name, mime_type: mime, size_bytes: durable.size, captured_on: captured })
          await uploadConditionMedia(client, reservation, durable)
        }
        setNotice('Files saved. Open each photo or video to check the recorded condition.')
      } finally { await refreshMedia() }
    })
  }
  async function download(file: Media) { await run(async () => { const result = await client.storage.from(CONDITIONS_BUCKET).download(file.storage_path); if (result.error || !result.data) throw result.error ?? new Error('Download unavailable'); downloadBlob(result.data, file.original_name.replace(/[\\/]/g, '_')) }) }
  async function exportReport() {
    if (!saved || dirty) return
    await run(async () => {
      const baseline = comparisonBaseline(saved, records)
      const files = [...recordMedia(saved, records, media), ...(baseline ? recordMedia(baseline, records, media) : [])].filter(file => file.status === 'ready')
      const previews: Record<string, string> = {}
      for (const file of files.filter(file => file.mime_type.startsWith('image/')).slice(0, 40)) {
        try {
          const result = await client.storage.from(CONDITIONS_BUCKET).download(file.storage_path)
          if (result.error || !result.data) continue
          const objectUrl = URL.createObjectURL(result.data)
          try { const image = new Image(); image.src = objectUrl; await image.decode(); const canvas = document.createElement('canvas'); const scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight)); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale)); const context = canvas.getContext('2d'); if (!context) continue; context.drawImage(image, 0, 0, canvas.width, canvas.height); previews[file.id] = canvas.toDataURL('image/jpeg', 0.8) } finally { URL.revokeObjectURL(objectUrl) }
        } catch { /* Every original remains listed, even when its preview cannot be embedded. */ }
      }
      const lease = leases.find(row => row.id === saved.lease_id)
      const html = conditionReport(saved, records, media, address, lease ? `${lease.tenant_name} (${lease.start_date} to ${lease.end_date})` : 'Unassigned draft', previews)
      downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `proproster-${saved.stage}-${saved.inspected_on}-${saved.id.slice(0, 8)}.html`)
      setNotice('Report downloaded. Open it in a browser to print or save as PDF. All media references are listed; up to 40 photo previews are embedded when supported. Download original videos separately.')
    })
  }
  if (loading) return <p role="status">Loading condition records…</p>
  if (missing) return <section className="conditionWorkspace"><h2>Move-in &amp; move-out</h2><p>Private condition records need an administrator to finish setup. Your existing property and rent records are unchanged.</p><button type="button" className="secondary" onClick={() => void reload()}>Check setup again</button></section>
  const editable = draft?.status === 'draft', ownMedia = draft ? media.filter(file => file.inspection_id === draft.id) : [], resolved = draft ? recordMedia(draft, records, media) : []
  const progress = draft ? checklistProgress(draft.checklist) : null
  const baseline = draft ? comparisonBaseline(draft, records) : null
  const problems = draft ? finalizationProblems(draft, records, media) : []
  function mediaCards(files: Media[], canEdit: boolean) { return files.map(file => <MediaCard key={file.id} file={file} url={urls[file.storage_path]} inherited={file.inspection_id !== draft?.id} editable={canEdit} busy={busy} onDownload={() => void download(file)} onCheck={() => void run(async () => { await confirmConditionMedia(client, file); await refreshMedia() })} onRemove={() => { if (window.confirm('Remove this draft photo or video? Finalized originals cannot be removed.')) void run(async () => { await removeConditionMedia(client, file); await refreshMedia() }) }} />) }
  return <section className="conditionWorkspace" data-condition-workspace>
    <div className="conditionTopline"><div><h2>Move-in &amp; move-out</h2><p>Photos, notes and checklists for each tenancy.</p></div><button type="button" className="conditionTextButton" disabled={busy} onClick={() => void reload()}>Refresh</button></div>
    {error && <p className="errorBox" role="alert">{error}</p>}{notice && <p className="conditionNotice" role="status">{notice}</p>}
    <div className="conditionToolbar"><div className="conditionStageFilter" aria-label="Walkthrough stage">{(['move_in', 'move_out'] as const).map(value => <button type="button" key={value} aria-pressed={stage === value} disabled={busy} onClick={() => { if (mayDiscard()) { setStage(value); setSaved(null); setDraft(null); setCreation(null) } }}>{value === 'move_in' ? 'Move-in' : 'Move-out'}</button>)}</div><button type="button" className="secondary" disabled={busy} onClick={() => startCreation(stage)}>+ New walkthrough</button></div>
    <div className="conditionRecordList">{records.filter(row => row.stage === stage).map(row => <button type="button" key={row.id} aria-pressed={draft?.id === row.id} disabled={busy} onClick={() => { if (mayDiscard()) { setSaved(row); setDraft(row); setCreation(null); setRoomId(row.rooms[0]?.id ?? ''); setCompare(false); setError('') } }}><strong>{row.inspected_on} · {row.lease_snapshot?.tenant_name ?? leases.find(lease => lease.id === row.lease_id)?.tenant_name ?? 'Unassigned draft'}</strong><small>{row.status === 'finalized' ? 'Finalized' : 'Draft'}{row.amendment_of ? ' · Amendment' : ''}</small></button>)}</div>
    {!records.some(row => row.stage === stage) && !creation && <p>No {stage === 'move_in' ? 'move-in' : 'move-out'} records yet. Start a new walkthrough to add photos and a checklist.</p>}
    {creation && <fieldset className="conditionForm" disabled={busy}><legend>New {creation.stage === 'move_in' ? 'move-in' : 'move-out'} {creation.amendment ? 'amendment' : 'record'}</legend>
      <label>Tenant / lease<select value={creation.lease} disabled={!!creation.amendment} onChange={event => setCreation({ ...creation, lease: event.target.value, baseline: '' })}><option value="">Unassigned draft</option>{leases.map(lease => <option key={lease.id} value={lease.id}>{lease.tenant_name} · {lease.start_date} to {lease.end_date}</option>)}</select></label>
      <label>Walkthrough date<input type="date" required value={creation.date} onChange={event => setCreation({ ...creation, date: event.target.value })} /></label><label>Completed by<input aria-describedby="conditionCompletedByHelp" placeholder="Your name" value={creation.inspector} maxLength={200} onChange={event => setCreation({ ...creation, inspector: event.target.value })} /></label>
      <p id="conditionCompletedByHelp" className="conditionHint">The person doing the walkthrough, usually you or your property manager.</p>
      {creation.stage === 'move_out' && <label>Move-in baseline<select value={creation.baseline} onChange={event => setCreation({ ...creation, baseline: event.target.value })}><option value="">No baseline linked</option>{records.filter(row => row.stage === 'move_in' && row.status === 'finalized' && row.lease_id === creation.lease && !!creation.lease).map(row => <option key={row.id} value={row.id}>{row.inspected_on}{row.amendment_of ? ' · amendment' : ''}</option>)}</select></label>}
      {creation.amendment && <label>Reason for amendment<textarea required maxLength={4000} value={creation.reason} onChange={event => setCreation({ ...creation, reason: event.target.value })} /></label>}
      <div className="conditionActions"><button type="button" className="primary" disabled={!creation.date || (!!creation.amendment && !creation.reason.trim())} onClick={() => void create()}>Start walkthrough</button><button type="button" className="secondary" onClick={() => setCreation(null)}>Cancel</button></div>
      <p className="conditionHint">Next: upload photos or videos, then complete the checklist.</p>
    </fieldset>}
    {draft && <>
      <div className="conditionEditorHead"><div><h3>{draft.stage === 'move_in' ? 'Move-in' : 'Move-out'} walkthrough</h3><small>{draft.status === 'finalized' ? 'Finalized' : dirty ? 'Unsaved changes' : 'Draft saved'}</small></div><div className="conditionActions">{editable ? <button type="button" className="primary" disabled={busy || !dirty || !draft.inspected_on} onClick={() => void run(() => persist(draft))}>Save draft</button> : <button type="button" className="secondary" disabled={busy} onClick={() => startCreation(draft.stage, draft)}>Create amendment</button>}<button type="button" className="secondary" disabled={busy || dirty} onClick={() => void exportReport()}>Export report</button></div></div>
      {draft.amendment_of && <p className="conditionHint">This amends report {draft.amendment_of}. The earlier finalized record and originals remain unchanged.</p>}
      {editable && <section className="conditionPhotoPanel" aria-label="Walkthrough photos and videos"><div className="conditionPhotoHeading"><h3>Photos &amp; videos</h3><small>{resolved.filter(file => file.status === 'ready').length} saved</small></div>
        <p>Choose a room, then upload from your phone or use the camera.</p>
        <fieldset className="conditionForm conditionUploadForm" disabled={busy || dirty}><legend className="visuallyHidden">Add photos and videos</legend>
          <label>Room / area<select value={roomId} onChange={event => setRoomId(event.target.value)}>{draft.rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
          <div className="conditionActions"><label className="primary conditionFilePicker">+ Add photos / videos<input aria-label="Upload photos or videos" type="file" accept={MEDIA_ACCEPT} multiple disabled={busy || dirty || !roomId} onChange={picked} /></label><label className="secondary conditionFilePicker">Camera<input aria-label="Take a photo" type="file" accept="image/*" capture="environment" disabled={busy || dirty || !roomId} onChange={picked} /></label></div>
          <details className="conditionUploadOptions"><summary>Video &amp; upload options</summary><label className="secondary conditionFilePicker">Record video<input aria-label="Record a video" type="file" accept="video/*" capture="environment" disabled={busy || dirty || !roomId} onChange={picked} /></label><label>Photo / video date (optional)<input type="date" value={capturedOn} onChange={event => setCapturedOn(event.target.value)} /></label><small>Photos up to 20 MB. Videos up to 50 MB. Up to ten files / 100 MB per selection. Some HEIC or MOV previews need the original download.</small></details>
        </fieldset>
        {dirty && <p className="conditionHint">Save your changes to add photos.</p>}
        {busy && <p role="status">Saving, please keep this page open…</p>}
        <div className="conditionMediaGrid">{mediaCards(resolved.filter(file => file.room_id === roomId), true)}</div>
        {!resolved.some(file => file.room_id === roomId) && <p className="conditionPhotoEmpty">No photos for this room yet.</p>}
      </section>}
      <details className="conditionDetails"><summary>Walkthrough details <small>{draft.inspected_on}</small></summary>
      <fieldset className="conditionForm" disabled={busy || !editable}><legend>Inspection details</legend>
        <label>Tenant / lease<select value={draft.lease_id ?? ''} disabled={!!draft.amendment_of || (!!saved?.lease_id && ownMedia.length > 0)} onChange={event => setDraft({ ...draft, lease_id: event.target.value || null, baseline_id: null })}><option value="">Unassigned draft</option>{leases.map(lease => <option key={lease.id} value={lease.id}>{lease.tenant_name} · {lease.start_date} to {lease.end_date}</option>)}</select></label>
        <label>Walkthrough date<input type="date" value={draft.inspected_on} onChange={event => setDraft({ ...draft, inspected_on: event.target.value })} /></label><label>Completed by<input maxLength={200} value={draft.inspector} onChange={event => setDraft({ ...draft, inspector: event.target.value })} /></label>
        {draft.stage === 'move_out' && <label>Move-in baseline<select value={draft.baseline_id ?? ''} onChange={event => setDraft({ ...draft, baseline_id: event.target.value || null })}><option value="">No baseline linked</option>{records.filter(row => row.stage === 'move_in' && row.status === 'finalized' && row.lease_id === draft.lease_id && !!draft.lease_id).map(row => <option key={row.id} value={row.id}>{row.inspected_on}{row.amendment_of ? ' · amendment' : ''}</option>)}</select></label>}
        {draft.amendment_of && <label>Amendment reason<textarea maxLength={4000} value={draft.amendment_note} onChange={event => setDraft({ ...draft, amendment_note: event.target.value })} /></label>}
      </fieldset></details>
      <details className="conditionChecklist conditionDetails"><summary>Checklist <small>{progress!.completed} / {progress!.total}</small></summary><p>{progress!.total ? `${progress!.completed} of ${progress!.total} completed` : 'No applicable tasks'}{dirty ? ' · Save edited notes before leaving.' : ' · Checkboxes save immediately.'}</p>
        {progress!.percent !== null && <progress max={100} value={progress!.percent} aria-label="Checklist completion" />}
        {['Before', 'Walkthrough', 'After', 'Custom'].map(group => <div key={group}>{draft.checklist.some(task => task.section === group) && <h4>{group}</h4>}{draft.checklist.filter(task => task.section === group).map(task => <div className={`conditionTask ${task.status === 'done' ? 'completed' : ''}`} key={task.id}>
          <div className="conditionTaskTop"><label><input type="checkbox" checked={task.status === 'done'} disabled={busy || !editable || task.status === 'na'} onChange={event => taskChange(task.id, { status: event.target.checked ? 'done' : 'todo' })} /><span>{task.label}</span></label><button type="button" className="conditionNa" aria-pressed={task.status === 'na'} disabled={busy || !editable} onClick={() => taskChange(task.id, { status: task.status === 'na' ? 'todo' : 'na' })}>{task.status === 'na' ? 'Not applicable' : 'Mark N/A'}</button></div>
          {task.completed_at && <small>Completed {new Date(task.completed_at).toLocaleString()}</small>}
          <details><summary>Notes and target date</summary><fieldset className="conditionForm" disabled={busy || !editable}><label>Notes<textarea maxLength={8000} value={task.notes} onChange={event => setDraft({ ...draft, checklist: draft.checklist.map(row => row.id === task.id ? { ...row, notes: event.target.value } : row) })} /></label><label>Optional target date<input type="date" value={task.due_on} onChange={event => setDraft({ ...draft, checklist: draft.checklist.map(row => row.id === task.id ? { ...row, due_on: event.target.value } : row) })} /></label></fieldset></details>
        </div>)}</div>)}
        {editable && <div className="conditionInlineAdd"><input aria-label="Custom checklist task" maxLength={300} value={newTask} disabled={busy} onChange={event => setNewTask(event.target.value)} placeholder="Add a custom task" /><button type="button" className="secondary" disabled={busy || !newTask.trim() || draft.checklist.length >= 200} onClick={() => { const next = { ...draft, checklist: [...draft.checklist, { id: crypto.randomUUID(), label: newTask.trim(), section: 'Custom', status: 'todo' as const, notes: '', due_on: '' }] }; setDraft(next); setNewTask(''); void run(() => persist(next)) }}>Add task</button></div>}
      </details>
      <details className="conditionRooms conditionDetails"><summary>Rooms &amp; condition <small>{draft.rooms.length} areas</small></summary><p>Include walls, floors, doors, windows, blinds, fixtures and appliances. Mark areas that do not apply as N/A.</p>
        {baseline && <button type="button" className="secondary" aria-pressed={compare} onClick={() => setCompare(current => !current)}>{compare ? 'Hide comparison' : 'Compare with move-in'}</button>}
        {draft.stage === 'move_out' && !baseline && <p>No finalized move-in baseline linked for this lease.</p>}
        {draft.rooms.map(room => <article className="conditionRoom" key={room.id}><h4>{room.name}</h4><fieldset className="conditionForm" disabled={busy || !editable}><label>Condition<select value={room.condition} onChange={event => updateRoom(room.id, { condition: event.target.value as Room['condition'] })}><option value="not_checked">Not checked</option><option value="good">Good</option><option value="worn">Existing wear</option><option value="damaged">Damage observed</option><option value="not_applicable">Not applicable</option></select></label><label>Condition notes<textarea maxLength={8000} value={room.notes} onChange={event => updateRoom(room.id, { notes: event.target.value })} placeholder="For example: bedroom blinds intact; small mark beside the door." /></label></fieldset>
          {compare && baseline ? <div className="conditionComparison"><section><h5>Move-in · {baseline.inspected_on}</h5><p>{baseline.rooms.find(item => item.id === room.id)?.notes || 'No baseline notes for this room.'}</p><div className="conditionMediaGrid">{mediaCards(recordMedia(baseline, records, media).filter(file => file.room_id === room.id), false)}</div></section><section><h5>Move-out · {draft.inspected_on}</h5><div className="conditionMediaGrid">{mediaCards(resolved.filter(file => file.room_id === room.id), !!editable)}</div></section></div> : <div className="conditionMediaGrid">{mediaCards(resolved.filter(file => file.room_id === room.id), !!editable)}</div>}
        </article>)}
        {editable && <div className="conditionInlineAdd"><input aria-label="New room or area name" maxLength={200} value={newRoom} disabled={busy} onChange={event => setNewRoom(event.target.value)} placeholder="Bedroom 2, garage, hallway…" /><button type="button" className="secondary" disabled={busy || !newRoom.trim() || draft.rooms.length >= 100} onClick={() => { const next = { ...draft, rooms: [...draft.rooms, { id: crypto.randomUUID(), name: newRoom.trim(), condition: 'not_checked' as const, notes: '' }] }; setDraft(next); setNewRoom(''); void run(() => persist(next)) }}>Add area</button></div>}
      </details>

      <div className="conditionActions"><button type="button" className="secondary" disabled={busy} onClick={() => setUrlVersion(current => current + 1)}>Refresh private previews</button>{editable && <button type="button" className="primary" disabled={busy || dirty || problems.length > 0} onClick={() => { if (window.confirm('Finalize this condition report? It will be read-only. Later corrections require a new amendment.')) void run(async () => { const result = await saveInspection(client, saved!, { ...patch(draft), status: 'finalized' }); accept(result); setNotice('Report finalized. Original records and media are retained.') }) }}>Finalize report</button>}</div>
      {editable && problems.length > 0 && <details className="conditionFinalization"><summary>Before finalizing ({problems.length})</summary><ul>{problems.map(problem => <li key={problem}>{problem}</li>)}</ul></details>}
      <p className="conditionHint">Observed changes and photos support your review. PropRoster does not determine responsibility or automatically deduct a security deposit.</p>
    </>}
  </section>
}
