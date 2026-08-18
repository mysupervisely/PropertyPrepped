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
import { supabase } from '../../lib/supabase'
import type { ApplyFields, DocumentAnalysisOutput } from '../../lib/document-intelligence/schemas'
import type { DocumentType } from '../../lib/document-intelligence/types'
import type { SmartUploadContact, SmartUploadProperty, SmartUploadSystem } from '../../lib/smart-upload/types'
import { isSupportedForSmartUpload, SMART_UPLOAD_ACCEPT } from '../../lib/smart-upload/supported-file-types'
import { shouldCreateFinancialTransaction, shouldCreateMaintenanceRecord } from '../../lib/smart-upload/idempotency'
import { findMatchingContact } from '../../lib/smart-upload/match-contact'
import { reviewKindFor } from '../../lib/smart-upload/review-kind'
import { ReceiptReview, type ReceiptSaveInput } from './ReceiptReview'
import { PrepareOnlyReview } from './PrepareOnlyReview'

const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_')

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
  // edit, a re-render, or Save never re-triggers this.
  //
  // Always requests the 'Other' schema — Document Intelligence's ONE
  // deliberately type-agnostic field set (vendor/businessName/phone/
  // email/website/description/amount/date/propertyAddress; see
  // schemas.ts's DOCUMENT_TYPE_APPLY_FIELDS.Other and prompts.ts's
  // FIELD_GUIDANCE.Other), since Smart Upload doesn't know the real
  // document type yet, for either a PDF or a photo. The model still
  // self-classifies honestly regardless of which schema it was given —
  // that self-reported classification (not this request type) is what
  // routes to the Receipt vs. PrepareOnly review screen below, and is
  // what property_documents.document_type gets set to once this call
  // returns. This is one Anthropic request, never a classify-then-
  // extract pair.
  async function runAnalyze(documentId: string, itemId: string) {
    if (!supabase) return
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) {
      patchItem(itemId, { status: 'Failed', error: 'Your session expired — please sign in again.' })
      return
    }
    try {
      const resp = await fetch('/api/document-intelligence/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ documentId, documentType: 'Other' as DocumentType }),
      })
      const body = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        patchItem(itemId, { status: 'Failed', error: body?.error || 'Analysis failed.' })
        return
      }
    } catch {
      patchItem(itemId, { status: 'Failed', error: 'Analysis failed. Please try again.' })
      return
    }
    const [{ data: docRow }, { data: analysisRows }] = await Promise.all([
      supabase.from('property_documents').select('document_type').eq('id', documentId).single(),
      supabase.from('document_analyses').select('structured_data').eq('document_id', documentId).order('analysis_version', { ascending: false }).limit(1),
    ])
    const latest = analysisRows?.[0]?.structured_data as DocumentAnalysisOutput | undefined
    if (!latest) {
      patchItem(itemId, { status: 'Failed', error: 'Analysis completed but the result could not be loaded.' })
      return
    }
    patchItem(itemId, { status: 'Ready', documentType: (docRow?.document_type as DocumentType) || 'Other', analysis: latest })
  }

  async function processFile(file: File, batchId: string) {
    if (!supabase || !ownerId) return
    const localId = crypto.randomUUID()

    if (!isSupportedForSmartUpload(file)) {
      setItems((prev) => [...prev, {
        id: localId, documentId: '', fileName: file.name, status: 'Unsupported',
        error: 'This file type isn’t supported for Smart Upload (PDF, JPEG, PNG, and WEBP only).',
        confirmedPropertyId: null, completedAt: null, createdFinancialTransactionId: null, createdMaintenanceRecordId: null, createdContactId: null, saving: false,
      }])
      return
    }

    setItems((prev) => [...prev, {
      id: localId, documentId: '', fileName: file.name, status: 'Uploading',
      confirmedPropertyId: null, completedAt: null, createdFinancialTransactionId: null, createdMaintenanceRecordId: null, createdContactId: null, saving: false,
    }])

    const path = `${ownerId}/smart-upload/${batchId}/${crypto.randomUUID()}-${safeName(file.name)}`
    const { error: uploadError } = await supabase.storage.from('property-documents').upload(path, file, { contentType: file.type || undefined, upsert: false })
    if (uploadError) {
      patchItem(localId, { status: 'Failed', error: uploadError.message })
      return
    }

    // property_id is deliberately null here — Smart Upload analyzes
    // BEFORE the user has chosen which property this belongs to
    // (supabase/milestone-12-smart-upload.sql). category is a neutral
    // placeholder; it's refined once the property/type are confirmed
    // (Save below sets it to a real DOCUMENT_CATEGORIES value).
    const { data: docRow, error: docError } = await supabase
      .from('property_documents')
      .insert({ owner_id: ownerId, property_id: null, name: file.name, category: 'Other', storage_path: path, size_bytes: file.size, mime_type: file.type || null })
      .select('id')
      .single()
    if (docError || !docRow) {
      await supabase.storage.from('property-documents').remove([path])
      patchItem(localId, { status: 'Failed', error: docError?.message || 'Could not save this file.' })
      return
    }

    const { data: itemRow, error: itemError } = await supabase
      .from('smart_upload_items')
      .insert({ owner_id: ownerId, document_id: docRow.id, batch_id: batchId })
      .select('id')
      .single()
    if (itemError || !itemRow) {
      patchItem(localId, { status: 'Failed', error: itemError?.message || 'Could not start this upload.' })
      return
    }

    // Re-key the item to the REAL smart_upload_items.id now that it
    // exists, so every later write (property confirmation, Save) targets
    // the real row.
    setItems((prev) => prev.map((it) => (it.id === localId ? { ...it, id: itemRow.id, documentId: docRow.id, status: 'Analyzing' } : it)))

    await runAnalyze(docRow.id, itemRow.id)
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList || !fileList.length) return
    const batchId = crypto.randomUUID()
    setGlobalError('')
    Array.from(fileList).forEach((file) => { void processFile(file, batchId) })
  }

  async function selectProperty(item: QueueItem, propertyId: string) {
    if (!supabase) return
    patchItem(item.id, { confirmedPropertyId: propertyId })
    // Persisted immediately (not only at final Save) — Part 21's
    // leave-and-return foundation: closing and reopening Smart Upload
    // mid-review keeps this confirmed choice. Both property_documents
    // AND document_analyses are updated together so the "analysis's
    // property_id must match its document's property_id" invariant
    // (supabase/milestone-12-smart-upload.sql) stays true.
    await Promise.all([
      supabase.from('property_documents').update({ property_id: propertyId }).eq('id', item.documentId),
      supabase.from('document_analyses').update({ property_id: propertyId }).eq('document_id', item.documentId),
      supabase.from('smart_upload_items').update({ confirmed_property_id: propertyId }).eq('id', item.id),
    ])
  }

  async function addToPropCrew(item: QueueItem, prefill: { name: string; businessName: string | null; phone: string | null; email: string | null; role: string }): Promise<{ id: string | null; error?: string }> {
    if (!supabase || !ownerId) return { id: null, error: 'You must be signed in to add a PropCrew provider.' }
    if (!item.confirmedPropertyId) return { id: null, error: 'Confirm which property this belongs to first, then add the provider to PropCrew.' }

    // Core Experience Bundle, item 2: "if a matching PropCrew contact
    // already exists, link it rather than creating another" — same exact-
    // match rule ReceiptReview already uses to auto-detect a match before
    // this form ever opens, re-checked here against whatever the user
    // confirmed/edited in the form (a corrected typo can turn a
    // near-miss into a real match), so a repeat tap or an edited name
    // that now matches an existing row links instead of duplicating.
    const existing = findMatchingContact(prefill.name, contacts) || findMatchingContact(prefill.businessName, contacts)
    if (existing) return { id: existing.id }

    // Part 14: only reliable, actually-present information — never
    // fabricated. "Would you use them again?" stays unset (Part 14: "can
    // remain unset until the user has formed an opinion").
    const { data, error } = await supabase
      .from('property_contacts')
      .insert({ owner_id: ownerId, property_id: item.confirmedPropertyId, name: prefill.name, business_name: prefill.businessName, role: prefill.role, phone: prefill.phone, email: prefill.email })
      .select('id')
      .single()
    if (error || !data) return { id: null, error: error?.message || 'Could not add this provider to PropCrew. Please try again.' }
    setContacts((prev) => [...prev, { id: data.id, name: prefill.name, business_name: prefill.businessName }])
    return { id: data.id }
  }

  async function saveReceipt(item: QueueItem, input: ReceiptSaveInput) {
    if (!supabase || !ownerId || !item.confirmedPropertyId) return
    patchItem(item.id, { saving: true })

    let financialTransactionId = item.createdFinancialTransactionId
    let maintenanceRecordId = item.createdMaintenanceRecordId
    let contactId = input.contactId || item.createdContactId

    // Idempotency (Part 25): each guard checks the SAME id this item may
    // have already recorded from an earlier, interrupted/duplicate Save
    // attempt — a second click never inserts a second row.
    if (shouldCreateFinancialTransaction({ created_financial_transaction_id: item.createdFinancialTransactionId })) {
      const { data: tx, error: txError } = await supabase
        .from('financial_transactions')
        .insert({
          owner_id: ownerId, property_id: item.confirmedPropertyId, transaction_date: input.date, transaction_type: 'Expense',
          category: input.createMaintenanceRecord ? 'Maintenance' : input.financialCategory, vendor: input.vendor || null,
          description: input.description, amount: Number(input.amount), document_id: item.documentId, is_recurring: false,
        })
        .select('id')
        .single()
      if (txError || !tx) {
        patchItem(item.id, { saving: false, error: txError?.message || 'Could not save this expense.' })
        return
      }
      financialTransactionId = tx.id
    }

    if (input.createMaintenanceRecord && financialTransactionId && shouldCreateMaintenanceRecord({ created_maintenance_record_id: maintenanceRecordId })) {
      const { data: rec, error: recError } = await supabase
        .from('maintenance_records')
        .insert({
          owner_id: ownerId, property_id: item.confirmedPropertyId, service_date: input.date, status: 'Completed', category: input.maintenanceCategory,
          vendor: input.vendor || null, description: input.description, cost: Number(input.amount), document_id: item.documentId,
          financial_transaction_id: financialTransactionId, system_id: input.systemId || null, propcrew_contact_id: contactId || null,
        })
        .select('id')
        .single()
      if (recError || !rec) {
        patchItem(item.id, { saving: false, error: recError?.message || 'Could not save this maintenance record.' })
        return
      }
      maintenanceRecordId = rec.id
    }

    await supabase.from('property_documents').update({ category: 'Receipts' }).eq('id', item.documentId)

    await supabase
      .from('smart_upload_items')
      .update({
        created_financial_transaction_id: financialTransactionId,
        created_maintenance_record_id: maintenanceRecordId,
        created_contact_id: contactId,
        completed_at: new Date().toISOString(),
      })
      .eq('id', item.id)

    anyCompletedRef.current = true
    patchItem(item.id, {
      saving: false, error: undefined, completedAt: new Date().toISOString(),
      createdFinancialTransactionId: financialTransactionId, createdMaintenanceRecordId: maintenanceRecordId, createdContactId: contactId,
    })
  }

  async function savePrepareOnly(item: QueueItem) {
    if (!supabase || !item.confirmedPropertyId) return
    patchItem(item.id, { saving: true })
    const categoryByType: Partial<Record<DocumentType, string>> = {
      'Insurance Policy': 'Insurance', Lease: 'Lease', 'Mortgage / Loan Statement': 'Mortgage',
      'Closing Disclosure / Settlement Statement': 'Closing', 'Inspection Report': 'Inspection',
      'Property Tax Document': 'Tax', 'HOA Document': 'Other', Appraisal: 'Other',
    }
    await supabase.from('property_documents').update({ category: (item.documentType && categoryByType[item.documentType]) || 'Other' }).eq('id', item.documentId)
    await supabase.from('smart_upload_items').update({ completed_at: new Date().toISOString() }).eq('id', item.id)
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

function SmartUploadEntry({ onFiles, compact }: { onFiles: (files: FileList | null) => void; compact?: boolean }) {
  return (
    <div className={`smartUploadEntry ${compact ? 'smartUploadEntryCompact' : ''}`}>
      {!compact && <p className="smartUploadEntryPrompt">How would you like to add something?</p>}
      <label className="smartUploadEntryOption">
        <span className="smartUploadEntryIcon" aria-hidden="true">📷</span>
        <span><strong>Take Photo</strong><small>Use your camera</small></span>
        <input type="file" accept="image/*" capture="environment" onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
      </label>
      <label className="smartUploadEntryOption">
        <span className="smartUploadEntryIcon" aria-hidden="true">📄</span>
        <span><strong>Choose File</strong><small>PDF, image, or supported document</small></span>
        <input type="file" accept={SMART_UPLOAD_ACCEPT} onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
      </label>
      <label className="smartUploadEntryOption">
        <span className="smartUploadEntryIcon" aria-hidden="true">🗂️</span>
        <span><strong>Upload Multiple</strong><small>Select several files</small></span>
        <input type="file" accept={SMART_UPLOAD_ACCEPT} multiple onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
      </label>
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
          </li>
        ))}
      </ul>
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
