'use client'

// PropRoster — Smart Upload Foundation. The real workflow behind the
// header's Smart Upload button: upload -> ONE automatic AI analysis ->
// user confirms property -> user reviews extracted fields -> save.
//
// Deliberately self-contained: this modal is rendered globally
// (components/AuthHeader.tsx, on every authenticated page), so it fetches
// its own RLS-scoped properties/contacts/systems and makes its own
// Supabase calls rather than depending on app/page.tsx's in-memory
// state — it works identically whether opened from the dashboard, a
// property workspace, Profile, or PropCrew.
//
// Reuses, rather than duplicates: the SAME property-documents storage
// bucket and property_documents/document_analyses tables, the SAME
// /api/document-intelligence/analyze endpoint (called exactly once per
// uploaded file — see runAnalyze below), and the SAME
// financial_transactions/maintenance_records/property_contacts tables
// every other part of this app writes to. The only new table is
// smart_upload_items (supabase/milestone-12-smart-upload.sql) — a thin
// workflow-state pointer, never a second document/analysis store.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import type { ApplyFields, DocumentAnalysisOutput } from '../../lib/document-intelligence/schemas'
import type { DocumentType } from '../../lib/document-intelligence/types'
import type { SmartUploadContact, SmartUploadProperty, SmartUploadSystem } from '../../lib/smart-upload/types'
import { isSupportedForSmartUpload, SMART_UPLOAD_ACCEPT } from '../../lib/smart-upload/supported-file-types'
import { reviewKindFor } from '../../lib/smart-upload/review-kind'
import {
  addContactToPropCrew, analyzeDocument, confirmItemProperty,
  saveReceiptRecord, savePrepareOnlyRecord, uploadDocumentForReview,
} from '../../lib/smart-upload/engine'
import { ReceiptReview, type ReceiptSaveInput } from './ReceiptReview'
import { PrepareOnlyReview } from './PrepareOnlyReview'
import { initialSmartUploadDebugState, type SmartUploadDebugState } from '../../lib/uploads/diagnostics'
import { beginReadingFileBytes } from '../../lib/uploads/durable-file'

type ItemStatus = 'Uploading' | 'Analyzing' | 'Ready' | 'Failed' | 'Unsupported'

type QueueItem = {
  id: string // smart_upload_items.id — undefined until the row is inserted, but we mint the id client-side so the UI can track it immediately
  documentId: string
  fileName: string
  status: ItemStatus
  error?: string
  documentType?: DocumentType
  analysis?: DocumentAnalysisOutput
  confirmedPropertyId: string | null
  completedAt: string | null
  createdFinancialTransactionId: string | null
  createdMaintenanceRecordId: string | null
  createdContactId: string | null
  saving: boolean
  // V1.1 (real-device diagnostics) — Section 2/8: "Needs attention"
  // alone doesn't say whether upload or analysis failed. This carries
  // the same per-stage breakdown for every item, independent of the
  // others — one item's Failed status/debug never touches another's.
  debug: SmartUploadDebugState
}

export function SmartUploadModal({ open, onClose, onCompleted }: { open: boolean; onClose: () => void; onCompleted?: () => void }) {
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [properties, setProperties] = useState<SmartUploadProperty[]>([])
  const [contacts, setContacts] = useState<SmartUploadContact[]>([])
  const [systems, setSystems] = useState<SmartUploadSystem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [items, setItems] = useState<QueueItem[]>([])
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [globalError, setGlobalError] = useState('')
  const anyCompletedRef = useRef(false)

  useEffect(() => {
    if (!open || loaded || !supabase) return
    let cancelled = false
    ;(async () => {
      const { data: userData } = await supabase!.auth.getUser()
      const uid = userData.user?.id || null
      const [{ data: propRows }, { data: contactRows }, { data: systemRows }] = await Promise.all([
        supabase!.from('properties').select('id,address,city').order('created_at', { ascending: true }),
        supabase!.from('property_contacts').select('id,name,business_name'),
        supabase!.from('property_systems').select('id,property_id,system_type,name'),
      ])
      if (cancelled) return
      setOwnerId(uid)
      setProperties((propRows || []) as SmartUploadProperty[])
      setContacts((contactRows || []) as SmartUploadContact[])
      setSystems((systemRows || []) as SmartUploadSystem[])
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [open, loaded])

  // Reset all in-flight state when the modal is closed, so reopening it
  // always starts from a clean Entry step rather than showing a stale
  // queue from a previous session.
  useEffect(() => {
    if (open) return
    setItems([])
    setActiveItemId(null)
    setGlobalError('')
    if (anyCompletedRef.current) {
      anyCompletedRef.current = false
      onCompleted?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function patchItem(id: string, patch: Partial<QueueItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

  // A single-file upload (Take Photo / Choose File) jumps straight to
  // its review screen once ready, instead of making the user open a
  // one-item queue — "Upload Multiple" always shows the queue (Part 20).
  useEffect(() => {
    if (items.length === 1 && items[0].status === 'Ready' && activeItemId === null) setActiveItemId(items[0].id)
  }, [items, activeItemId])

  // Exactly ONE analyze() call per uploaded file — Part 7. Never called
  // again automatically for the same item; a property change, a category
  // edit, a re-render, or Save never re-triggers this. Delegates to
  // lib/smart-upload/engine.ts's analyzeDocument() — the same function
  // Smart Import's queue calls — so there is exactly one implementation
  // of "call Document Intelligence, then read back the result."
  // Merges into the item's OWN existing debug object via a functional
  // setItems update — never a stale `items` closure snapshot, so this
  // is safe to call from deep inside an async chain regardless of how
  // many other items have been added/patched in the meantime.
  async function runAnalyze(documentId: string, itemId: string, flow: 'smart-upload' | 'smart-upload-camera') {
    if (!supabase) return
    const result = await analyzeDocument(supabase, documentId, flow)
    if (!result.ok) {
      setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, status: 'Failed', error: result.error, debug: { ...it.debug, analysis: 'failed', analysisError: result.error } } : it)))
      return
    }
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, status: 'Ready', documentType: result.documentType, analysis: result.analysis, debug: { ...it.debug, analysis: 'success' } } : it)))
  }

  async function processFile(file: File, batchId: string, flow: 'smart-upload' | 'smart-upload-camera' = 'smart-upload', bytesPromise?: Promise<ArrayBuffer>) {
    if (!supabase || !ownerId) return
    const localId = crypto.randomUUID()
    const debug = initialSmartUploadDebugState(file, flow)

    if (!isSupportedForSmartUpload(file)) {
      setItems((prev) => [...prev, {
        id: localId, documentId: '', fileName: file.name, status: 'Unsupported',
        error: 'This file type isn’t supported for Smart Upload (PDF, JPEG, PNG, and WEBP only).',
        confirmedPropertyId: null, completedAt: null, createdFinancialTransactionId: null, createdMaintenanceRecordId: null, createdContactId: null, saving: false,
        debug: { ...debug, validation: 'rejected', validationReason: 'Unsupported file type' },
      }])
      return
    }

    setItems((prev) => [...prev, {
      id: localId, documentId: '', fileName: file.name, status: 'Uploading',
      confirmedPropertyId: null, completedAt: null, createdFinancialTransactionId: null, createdMaintenanceRecordId: null, createdContactId: null, saving: false,
      debug: { ...debug, validation: 'accepted' },
    }])

    // property_id is deliberately null here — Smart Upload analyzes
    // BEFORE the user has chosen which property this belongs to
    // (supabase/milestone-12-smart-upload.sql). category is a neutral
    // placeholder; it's refined once the property/type are confirmed
    // (Save below sets it to a real DOCUMENT_CATEGORIES value).
    const uploadResult = await uploadDocumentForReview(supabase, ownerId, file, batchId, 'SmartUpload', flow, bytesPromise)
    if (!uploadResult.ok) {
      setItems((prev) => prev.map((it) => (it.id === localId ? { ...it, status: 'Failed', error: uploadResult.error, debug: { ...it.debug, storageUpload: 'failed', storageError: uploadResult.error, databaseRecord: 'skipped', analysis: 'skipped' } } : it)))
      return
    }

    // Re-key the item to the REAL smart_upload_items.id now that it
    // exists, so every later write (property confirmation, Save) targets
    // the real row.
    setItems((prev) => prev.map((it) => (it.id === localId ? { ...it, id: uploadResult.itemId, documentId: uploadResult.documentId, status: 'Analyzing', debug: { ...it.debug, storageUpload: 'success', databaseRecord: 'success' } } : it)))

    await runAnalyze(uploadResult.documentId, uploadResult.itemId, flow)
  }

  function handleFiles(fileList: FileList | null, bytesPromises: Promise<ArrayBuffer>[], flow: 'smart-upload' | 'smart-upload-camera' = 'smart-upload') {
    if (!fileList || !fileList.length) return
    const batchId = crypto.randomUUID()
    setGlobalError('')
    Array.from(fileList).forEach((file, i) => { void processFile(file, batchId, flow, bytesPromises[i]) })
  }

  async function selectProperty(item: QueueItem, propertyId: string) {
    if (!supabase) return
    patchItem(item.id, { confirmedPropertyId: propertyId })
    // Persisted immediately (not only at final Save) — Part 21's
    // leave-and-return foundation: closing and reopening Smart Upload
    // mid-review keeps this confirmed choice.
    await confirmItemProperty(supabase, item.documentId, item.id, propertyId)
  }

  async function addToPropCrew(item: QueueItem, prefill: { name: string; businessName: string | null; phone: string | null; email: string | null; role: string }): Promise<{ id: string | null; error?: string }> {
    if (!supabase || !ownerId) return { id: null, error: 'You must be signed in to add a PropCrew provider.' }
    const result = await addContactToPropCrew(supabase, ownerId, item.confirmedPropertyId, contacts, prefill)
    if (result.id) setContacts((prev) => [...prev, { id: result.id as string, name: prefill.name, business_name: prefill.businessName }])
    return result
  }

  async function saveReceipt(item: QueueItem, input: ReceiptSaveInput) {
    if (!supabase || !ownerId || !item.confirmedPropertyId) return
    patchItem(item.id, { saving: true })
    const result = await saveReceiptRecord(supabase, ownerId, {
      itemId: item.id, documentId: item.documentId, confirmedPropertyId: item.confirmedPropertyId,
      createdFinancialTransactionId: item.createdFinancialTransactionId, createdMaintenanceRecordId: item.createdMaintenanceRecordId,
      vendor: input.vendor, date: input.date, amount: input.amount, description: input.description,
      financialCategory: input.financialCategory, createMaintenanceRecord: input.createMaintenanceRecord,
      maintenanceCategory: input.maintenanceCategory, systemId: input.systemId, contactId: input.contactId || item.createdContactId,
    })
    if (!result.ok) {
      patchItem(item.id, { saving: false, error: result.error })
      return
    }
    anyCompletedRef.current = true
    patchItem(item.id, {
      saving: false, error: undefined, completedAt: new Date().toISOString(),
      createdFinancialTransactionId: result.financialTransactionId, createdMaintenanceRecordId: result.maintenanceRecordId, createdContactId: result.contactId,
    })
  }

  async function savePrepareOnly(item: QueueItem) {
    if (!supabase || !item.confirmedPropertyId) return
    patchItem(item.id, { saving: true })
    await savePrepareOnlyRecord(supabase, item.id, item.documentId, item.documentType)
    anyCompletedRef.current = true
    patchItem(item.id, { saving: false, completedAt: new Date().toISOString() })
  }

  if (!open) return null

  const activeItem = items.find((it) => it.id === activeItemId) || null

  return (
    <div className="overlay smartUploadOverlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal smartUploadModal">
        <div className="modalTop">
          <div><p className="eyebrow">SMART UPLOAD</p><h2>{activeItem ? activeItem.fileName : 'Add something to PropRoster'}</h2></div>
          <button className="iconButton" onClick={activeItem ? () => setActiveItemId(null) : onClose}>×</button>
        </div>

        {globalError && <div className="statusMessage errorMessage">{globalError}</div>}

        {!activeItem && items.length === 0 && <SmartUploadEntry onFiles={handleFiles} />}

        {!activeItem && items.length > 0 && (
          <>
            <SmartUploadQueue items={items} onOpen={(id) => setActiveItemId(id)} />
            <SmartUploadEntry onFiles={handleFiles} compact />
          </>
        )}

        {activeItem && activeItem.status === 'Ready' && activeItem.documentType && activeItem.analysis && (
          reviewKindFor(activeItem.documentType) === 'Receipt' ? (
            <ReceiptReview
              applyFields={activeItem.analysis.applyFields as ApplyFields}
              properties={properties}
              contacts={contacts}
              systems={systems}
              confirmedPropertyId={activeItem.confirmedPropertyId}
              busy={activeItem.saving}
              saved={Boolean(activeItem.completedAt)}
              onSelectProperty={(propertyId) => void selectProperty(activeItem, propertyId)}
              onAddToPropCrew={(prefill) => addToPropCrew(activeItem, prefill)}
              onSave={(input) => void saveReceipt(activeItem, input)}
            />
          ) : (
            <PrepareOnlyReview
              documentType={activeItem.documentType}
              analysis={activeItem.analysis}
              properties={properties}
              confirmedPropertyId={activeItem.confirmedPropertyId}
              busy={activeItem.saving}
              saved={Boolean(activeItem.completedAt)}
              onSelectProperty={(propertyId) => void selectProperty(activeItem, propertyId)}
              onSave={() => void savePrepareOnly(activeItem)}
            />
          )
        )}

        {activeItem && activeItem.status === 'Analyzing' && <div className="docIntelProcessing"><span className="spinnerDot" /> Analyzing {activeItem.fileName} — this can take a minute.</div>}

        {activeItem && (activeItem.status === 'Failed' || activeItem.status === 'Unsupported') && (
          <div className="docIntelPrompt docIntelFailed">
            <p>{activeItem.error || 'Something went wrong.'}</p>
            {activeItem.status === 'Failed' && activeItem.documentId && <p className="muted">Your file is safely stored — you can still assign it to a property and keep it as a plain document.</p>}
            {activeItem.status === 'Failed' && activeItem.documentId && (
              <FailedItemFallback item={activeItem} properties={properties} onSave={async (propertyId) => {
                if (!supabase) return
                await supabase.from('property_documents').update({ property_id: propertyId, category: 'Other' }).eq('id', activeItem.documentId)
                await supabase.from('smart_upload_items').update({ confirmed_property_id: propertyId, completed_at: new Date().toISOString() }).eq('id', activeItem.id)
                anyCompletedRef.current = true
                patchItem(activeItem.id, { confirmedPropertyId: propertyId, completedAt: new Date().toISOString() })
              }} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SmartUploadEntry({ onFiles, compact }: { onFiles: (files: FileList | null, bytesPromises: Promise<ArrayBuffer>[], flow?: 'smart-upload' | 'smart-upload-camera') => void; compact?: boolean }) {
  // V1.2 (real iPhone storage payload root-cause fix — see
  // lib/uploads/durable-file.ts's header): begin reading every file's
  // bytes HERE, synchronously, in the onChange itself, before onFiles()
  // even runs and before the input's value is reset — anchoring the
  // read to the moment the picker's underlying resource is still
  // guaranteed valid, no matter how many `await`s happen afterward.
  function readSelected(fileList: FileList | null): Promise<ArrayBuffer>[] {
    return fileList ? Array.from(fileList).map(beginReadingFileBytes) : []
  }
  return (
    <div className={`smartUploadEntry ${compact ? 'smartUploadEntryCompact' : ''}`}>
      {!compact && <p className="smartUploadEntryPrompt">How would you like to add something?</p>}
      <label className="smartUploadEntryOption">
        <span className="smartUploadEntryIcon" aria-hidden="true">📷</span>
        <span><strong>Take Photo</strong><small>Use your camera</small></span>
        {/* V1.1: this is the ONE input tagged 'smart-upload-camera' —
            everything downstream (uploadDocumentForReview, analyzeDocument,
            the debug panel) is the exact same pipeline as Choose File/
            Upload Multiple below; only the diagnostic flow label differs,
            so a real-device console log can tell a camera capture apart
            from a Photo Library selection. */}
        <input type="file" accept="image/*" capture="environment" onChange={(e) => { const bytesPromises = readSelected(e.target.files); onFiles(e.target.files, bytesPromises, 'smart-upload-camera'); e.target.value = '' }} />
      </label>
      <label className="smartUploadEntryOption">
        <span className="smartUploadEntryIcon" aria-hidden="true">📄</span>
        <span><strong>Choose File</strong><small>PDF, image, or supported document</small></span>
        <input type="file" accept={SMART_UPLOAD_ACCEPT} onChange={(e) => { const bytesPromises = readSelected(e.target.files); onFiles(e.target.files, bytesPromises); e.target.value = '' }} />
      </label>
      <label className="smartUploadEntryOption">
        <span className="smartUploadEntryIcon" aria-hidden="true">🗂️</span>
        <span><strong>Upload Multiple</strong><small>Select several files</small></span>
        <input type="file" accept={SMART_UPLOAD_ACCEPT} multiple onChange={(e) => { const bytesPromises = readSelected(e.target.files); onFiles(e.target.files, bytesPromises); e.target.value = '' }} />
      </label>
      {/* Milestone 14, item 1 / Final Launch Fixes: secondary to the
          three options above — a brief explainer plus a link out to the
          full Portfolio Import review queue (still /smart-import
          internally), not a fourth option crowding this list. Only shown
          on the initial (non-compact) Entry screen. Paragraph is the
          approved customer-facing Portfolio Import subtitle, verbatim. */}
      {!compact && (
        <div className="smartUploadImportPrompt">
          <p>Upload your existing property records and let PropRoster organize them for you.</p>
          <Link href="/smart-import" className="secondary">Portfolio Import →</Link>
        </div>
      )}
    </div>
  )
}

const QUEUE_STATUS_LABEL: Record<ItemStatus, string> = {
  Uploading: 'Uploading', Analyzing: 'Analyzing', Ready: 'Ready to review', Failed: 'Needs attention', Unsupported: 'Not supported',
}
const QUEUE_STATUS_TONE: Record<ItemStatus, string> = {
  Uploading: 'pillNeutral', Analyzing: 'pillWarn', Ready: 'pillGood', Failed: 'pillBad', Unsupported: 'pillBad',
}

function SmartUploadQueue({ items, onOpen }: { items: QueueItem[]; onOpen: (id: string) => void }) {
  return (
    <div className="smartUploadQueue">
      <p className="eyebrow">{items.length} file{items.length === 1 ? '' : 's'} selected</p>
      <ul className="smartUploadQueueList">
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" className="smartUploadQueueItem" disabled={item.status === 'Uploading' || item.status === 'Analyzing'} onClick={() => onOpen(item.id)}>
              <span className="smartUploadQueueName">{item.fileName}{item.completedAt && ' — Saved'}</span>
              <span className={`statusPill ${QUEUE_STATUS_TONE[item.status]}`}>{item.completedAt ? 'Saved' : QUEUE_STATUS_LABEL[item.status]}</span>
            </button>
            {/* V1.1 (real-device diagnostics) — Section 2: "Needs
                attention" alone doesn't say whether upload or analysis
                failed. Shown directly in the list (not only after
                tapping in) so the product owner can see every file's
                real stage from an iPhone with no Web Inspector. One
                item's own debug line — never affects any other item's
                already-rendered row. */}
            {item.status === 'Failed' && !item.completedAt && <SmartUploadDebugLine debug={item.debug} />}
          </li>
        ))}
      </ul>
    </div>
  )
}

function SmartUploadDebugLine({ debug }: { debug: SmartUploadDebugState }) {
  const stageFailed = debug.storageUpload === 'failed' ? 'Upload' : debug.databaseRecord === 'failed' ? 'Database record' : debug.analysis === 'failed' ? 'Analysis' : debug.validation === 'rejected' ? 'Validation' : null
  const reason = debug.storageUpload === 'failed' ? debug.storageError : debug.databaseRecord === 'failed' ? debug.databaseError : debug.analysis === 'failed' ? debug.analysisError : debug.validationReason
  return (
    <div className="smartUploadDebugLine">
      <p className="uploadDebugTitle">Debug ({debug.flow})</p>
      <dl>
        <dt>File received</dt><dd>{debug.fileReceived ? 'Yes' : 'No'}</dd>
        <dt>Type</dt><dd>{debug.reportedMime}</dd>
        <dt>Validation</dt><dd>{debug.validation === 'accepted' ? 'Accepted' : debug.validation === 'rejected' ? 'Rejected' : 'Pending…'}</dd>
        <dt>Upload</dt><dd>{debug.storageUpload === 'pending' ? 'Pending…' : debug.storageUpload === 'success' ? 'Success' : 'Failed'}</dd>
        <dt>Database record</dt><dd>{debug.databaseRecord === 'pending' ? 'Pending…' : debug.databaseRecord === 'success' ? 'Success' : debug.databaseRecord === 'skipped' ? 'Skipped' : 'Failed'}</dd>
        <dt>Analysis</dt><dd>{debug.analysis === 'pending' ? 'Pending…' : debug.analysis === 'success' ? 'Success' : debug.analysis === 'skipped' ? 'Skipped' : 'Failed'}</dd>
        {stageFailed && <><dt>Failing stage</dt><dd>{stageFailed}</dd></>}
        {reason && <><dt>Reason</dt><dd>{reason}</dd></>}
      </dl>
    </div>
  )
}

function FailedItemFallback({ item, properties, onSave }: { item: QueueItem; properties: SmartUploadProperty[]; onSave: (propertyId: string) => void }) {
  const [propertyId, setPropertyId] = useState(item.confirmedPropertyId || '')
  if (item.completedAt) return <div className="smartUploadSavedBanner">Saved to Documents.</div>
  return (
    <div className="propertyPicker">
      <p className="propertyPickerPrompt">Which property is this for?</p>
      <div className="propertyPickerGrid">
        {properties.map((p) => (
          <button key={p.id} type="button" className={`propertyPickerOption ${propertyId === p.id ? 'selected' : ''}`} onClick={() => setPropertyId(p.id)}>
            <strong>{p.address}</strong><span>{p.city}</span>
          </button>
        ))}
      </div>
      <button className="primary smartUploadSaveButton" disabled={!propertyId} onClick={() => onSave(propertyId)}>Save to Documents</button>
    </div>
  )
}
