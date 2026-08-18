'use client'

// PropRoster — Milestone 14: Smart Import V1.
//
// Smart Upload = adding one new thing right now. Smart Import = onboarding
// an existing property/portfolio with many historical documents at once.
// This page is a batch REVIEW QUEUE on top of the exact same pipeline
// Smart Upload already uses (property_documents, document_analyses, the
// SAME /api/document-intelligence/analyze endpoint called once per file,
// smart_upload_items) — see lib/smart-upload/engine.ts, which both this
// page and components/SmartUpload/SmartUploadModal.tsx call for every
// mutation, so there is exactly one implementation of "upload, analyze,
// confirm property, save," never two. The only new column is
// smart_upload_items.source (supabase/milestone-14-smart-import.sql),
// which just tells the two surfaces' own "what's still unfinished"
// queries apart.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'
import { useSubscription } from '../../lib/useSubscription'
import { entitlementsFor } from '../../lib/billing/entitlements'
import { AuthHeader } from '../../components/AuthHeader'
import { UpgradePrompt } from '../../components/UpgradePrompt'
import type { ApplyFields, DocumentAnalysisOutput } from '../../lib/document-intelligence/schemas'
import type { DocumentType } from '../../lib/document-intelligence/types'
import type { SmartUploadContact, SmartUploadProperty, SmartUploadSystem } from '../../lib/smart-upload/types'
import { isSupportedForSmartUpload, SMART_UPLOAD_ACCEPT } from '../../lib/smart-upload/supported-file-types'
import { matchProperty } from '../../lib/smart-upload/match-property'
import { extractReceiptFields } from '../../lib/smart-upload/receipt-fields'
import { reviewKindFor } from '../../lib/smart-upload/review-kind'
import { detectDuplicate, type DuplicateWarning } from '../../lib/smart-upload/duplicate-detection'
import { deriveImportStatus, summarizeImportProgress, type ImportDisplayStatus } from '../../lib/smart-upload/import-queue'
import {
  addContactToPropCrew, analyzeDocument, bulkConfirmProperty, confirmItemProperty,
  saveReceiptRecord, savePrepareOnlyRecord, uploadDocumentForReview,
} from '../../lib/smart-upload/engine'
import { ReceiptReview, type ReceiptSaveInput } from '../../components/SmartUpload/ReceiptReview'
import { PrepareOnlyReview } from '../../components/SmartUpload/PrepareOnlyReview'

type ImportRawStatus = 'Uploading' | 'Analyzing' | 'Ready' | 'Failed' | 'Unsupported'

type ImportItem = {
  id: string
  documentId: string
  fileName: string
  fileSize: number
  status: ImportRawStatus
  error?: string
  documentType?: DocumentType
  analysis?: DocumentAnalysisOutput
  confirmedPropertyId: string | null
  completedAt: string | null
  createdFinancialTransactionId: string | null
  createdMaintenanceRecordId: string | null
  createdContactId: string | null
  saving: boolean
  duplicate: DuplicateWarning | null
  duplicateDismissed: boolean
}

type ResumableBatch = { batchId: string; count: number; oldestCreatedAt: string }

const STATUS_TONE: Record<ImportDisplayStatus, string> = {
  Uploading: 'pillNeutral', Analyzing: 'pillWarn', 'Needs attention': 'pillBad',
  'Needs property': 'pillWarn', 'Ready to review': 'pillGood', Completed: 'pillGood', Failed: 'pillBad',
}

export default function SmartImportPage() {
  const { user, ready } = useAuthUser()
  const { plan, loading: planLoading } = useSubscription(user)

  if (!ready || (user && planLoading)) return <main className="authShell"><div className="loadingState">Loading Smart Import…</div></main>

  if (!user) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Sign in required</h1>
          <p className="authIntro">Sign in to import existing property records.</p>
          <Link className="primary authSubmit" href="/">Go to sign in</Link>
        </section>
      </main>
    )
  }

  // Launch Pricing: Smart Import shares the exact same AI pipeline as
  // Smart Upload/Retry Analysis (see this file's own top comment) — a
  // page-level gate here is the "meaningful entry point" half of
  // enforcement; the analyze route's server-side check is what actually
  // stops the AI cost regardless of what this page does.
  if (!entitlementsFor(plan).canUseSmartImport && supabase) {
    return (
      <main className="shell">
        <AuthHeader />
        <UpgradePrompt
          supabase={supabase}
          currentPlan={plan}
          onClose={() => {}}
          headline="Smart Import is included with Manage."
          targetPlanId="manage"
          description="Manage includes Smart Upload, Smart Import, AI Document Intelligence, Rent Ledger and PropWatch."
        />
      </main>
    )
  }

  return <SmartImportWorkspace ownerId={user.id} />
}

function SmartImportWorkspace({ ownerId }: { ownerId: string }) {
  const [loaded, setLoaded] = useState(false)
  const [properties, setProperties] = useState<SmartUploadProperty[]>([])
  const [contacts, setContacts] = useState<SmartUploadContact[]>([])
  const [systems, setSystems] = useState<SmartUploadSystem[]>([])
  const [existingDocs, setExistingDocs] = useState<{ id: string; name: string; size_bytes: number }[]>([])
  const [existingTx, setExistingTx] = useState<{ id: string; vendor: string | null; transaction_date: string; amount: number }[]>([])
  const [resumable, setResumable] = useState<ResumableBatch[]>([])

  const [batchId, setBatchId] = useState<string | null>(null)
  const [items, setItems] = useState<ImportItem[]>([])
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'All' | 'Needs attention' | 'Completed'>('All')
  const [groupMode, setGroupMode] = useState<'None' | 'Property' | 'Type'>('None')
  const [bulkPropertyId, setBulkPropertyId] = useState('')
  const [globalError, setGlobalError] = useState('')

  useEffect(() => {
    if (!supabase || loaded) return
    let cancelled = false
    ;(async () => {
      const [{ data: propRows }, { data: contactRows }, { data: systemRows }, { data: docRows }, { data: txRows }, { data: batchRows }] = await Promise.all([
        supabase!.from('properties').select('id,address,city').order('created_at', { ascending: true }),
        supabase!.from('property_contacts').select('id,name,business_name'),
        supabase!.from('property_systems').select('id,property_id,system_type,name'),
        supabase!.from('property_documents').select('id,name,size_bytes'),
        supabase!.from('financial_transactions').select('id,vendor,transaction_date,amount'),
        // Milestone 14: "leave and resume where reasonably possible" —
        // every unfinished Smart-Import-created item, grouped by batch,
        // read straight back from the durable smart_upload_items table
        // (never transient React state).
        supabase!.from('smart_upload_items').select('batch_id,created_at').eq('source', 'SmartImport').is('completed_at', null).order('created_at', { ascending: true }),
      ])
      if (cancelled) return
      setProperties((propRows || []) as SmartUploadProperty[])
      setContacts((contactRows || []) as SmartUploadContact[])
      setSystems((systemRows || []) as SmartUploadSystem[])
      setExistingDocs((docRows || []) as { id: string; name: string; size_bytes: number }[])
      setExistingTx((txRows || []) as { id: string; vendor: string | null; transaction_date: string; amount: number }[])
      const groups = new Map<string, { count: number; oldest: string }>()
      ;(batchRows || []).forEach((row: { batch_id: string; created_at: string }) => {
        const existing = groups.get(row.batch_id)
        if (existing) { existing.count += 1; if (row.created_at < existing.oldest) existing.oldest = row.created_at }
        else groups.set(row.batch_id, { count: 1, oldest: row.created_at })
      })
      setResumable(Array.from(groups.entries()).map(([id, v]) => ({ batchId: id, count: v.count, oldestCreatedAt: v.oldest })))
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [loaded])

  function patchItem(id: string, patch: Partial<ImportItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

  function duplicateCheckFor(fileName: string, fileSize: number, analysis: DocumentAnalysisOutput | undefined, siblingsSoFar: ImportItem[]) {
    const siblingDocs = siblingsSoFar.map((it) => ({ id: it.documentId, name: it.fileName, size_bytes: it.fileSize }))
    const receipt = analysis ? extractReceiptFields(analysis.applyFields) : { vendor: null, date: null, amount: null }
    return detectDuplicate(
      { name: fileName, size: fileSize },
      { vendor: receipt.vendor, date: receipt.date, amount: receipt.amount ? Number(receipt.amount) : null },
      [...existingDocs, ...siblingDocs],
      existingTx,
    )
  }

  async function processFile(file: File, forBatchId: string) {
    if (!supabase) return
    const localId = crypto.randomUUID()

    if (!isSupportedForSmartUpload(file)) {
      setItems((prev) => [...prev, {
        id: localId, documentId: '', fileName: file.name, fileSize: file.size, status: 'Unsupported',
        error: 'This file type isn’t supported (PDF, JPEG, PNG, and WEBP only).',
        confirmedPropertyId: null, completedAt: null, createdFinancialTransactionId: null, createdMaintenanceRecordId: null, createdContactId: null,
        saving: false, duplicate: null, duplicateDismissed: false,
      }])
      return
    }

    setItems((prev) => [...prev, {
      id: localId, documentId: '', fileName: file.name, fileSize: file.size, status: 'Uploading',
      confirmedPropertyId: null, completedAt: null, createdFinancialTransactionId: null, createdMaintenanceRecordId: null, createdContactId: null,
      saving: false, duplicate: null, duplicateDismissed: false,
    }])

    const uploadResult = await uploadDocumentForReview(supabase, ownerId, file, forBatchId, 'SmartImport')
    if (!uploadResult.ok) {
      patchItem(localId, { status: 'Failed', error: uploadResult.error })
      return
    }
    setItems((prev) => prev.map((it) => (it.id === localId ? { ...it, id: uploadResult.itemId, documentId: uploadResult.documentId, status: 'Analyzing' } : it)))

    const analyzeResult = await analyzeDocument(supabase, uploadResult.documentId)
    if (!analyzeResult.ok) {
      patchItem(uploadResult.itemId, { status: 'Failed', error: analyzeResult.error })
      return
    }
    setItems((prev) => {
      const duplicate = duplicateCheckFor(file.name, file.size, analyzeResult.analysis, prev.filter((it) => it.id !== uploadResult.itemId))
      return prev.map((it) => (it.id === uploadResult.itemId
        ? { ...it, status: 'Ready', documentType: analyzeResult.documentType, analysis: analyzeResult.analysis, duplicate }
        : it))
    })
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList || !fileList.length || !supabase) return
    const newBatchId = batchId || crypto.randomUUID()
    setBatchId(newBatchId)
    setGlobalError('')
    Array.from(fileList).forEach((file) => { void processFile(file, newBatchId) })
  }

  async function retryItem(item: ImportItem) {
    if (!supabase || !item.documentId) return
    patchItem(item.id, { status: 'Analyzing', error: undefined })
    const analyzeResult = await analyzeDocument(supabase, item.documentId)
    if (!analyzeResult.ok) {
      patchItem(item.id, { status: 'Failed', error: analyzeResult.error })
      return
    }
    setItems((prev) => {
      const duplicate = duplicateCheckFor(item.fileName, item.fileSize, analyzeResult.analysis, prev.filter((it) => it.id !== item.id))
      return prev.map((it) => (it.id === item.id ? { ...it, status: 'Ready', documentType: analyzeResult.documentType, analysis: analyzeResult.analysis, duplicate } : it))
    })
  }

  // "Skip" on a possible-duplicate warning removes the file the user JUST
  // imported a moment ago (their own new upload) — never the pre-existing
  // document/transaction it matched against, which this never touches.
  async function skipItem(item: ImportItem) {
    if (!supabase) return
    if (item.documentId) {
      const { data: doc } = await supabase.from('property_documents').select('storage_path').eq('id', item.documentId).single()
      if (doc?.storage_path) await supabase.storage.from('property-documents').remove([doc.storage_path])
      await supabase.from('property_documents').delete().eq('id', item.documentId)
    }
    setItems((prev) => prev.filter((it) => it.id !== item.id))
    setSelected((prev) => { const next = new Set(prev); next.delete(item.id); return next })
  }

  function keepDuplicate(item: ImportItem) {
    patchItem(item.id, { duplicateDismissed: true })
  }

  async function resumeBatch(id: string) {
    if (!supabase) return
    setBatchId(id)
    const { data: rows } = await supabase
      .from('smart_upload_items')
      .select('id,document_id,confirmed_property_id,created_financial_transaction_id,created_maintenance_record_id,created_contact_id,completed_at')
      .eq('source', 'SmartImport').eq('batch_id', id)
    if (!rows || !rows.length) return
    const docIds = rows.map((r) => r.document_id)
    const [{ data: docs }, { data: analyses }] = await Promise.all([
      supabase.from('property_documents').select('id,name,size_bytes,document_type').in('id', docIds),
      supabase.from('document_analyses').select('document_id,structured_data').in('document_id', docIds).order('analysis_version', { ascending: false }),
    ])
    const docById = new Map((docs || []).map((d) => [d.id, d]))
    const analysisByDoc = new Map<string, DocumentAnalysisOutput>()
    ;(analyses || []).forEach((a) => { if (!analysisByDoc.has(a.document_id)) analysisByDoc.set(a.document_id, a.structured_data as DocumentAnalysisOutput) })

    const rehydrated: ImportItem[] = rows.map((row) => {
      const doc = docById.get(row.document_id)
      const analysis = analysisByDoc.get(row.document_id)
      return {
        id: row.id, documentId: row.document_id, fileName: doc?.name || 'Document', fileSize: doc?.size_bytes || 0,
        status: analysis ? 'Ready' : 'Failed', error: analysis ? undefined : 'This item needs attention — its analysis could not be found.',
        documentType: (doc?.document_type as DocumentType) || undefined, analysis,
        confirmedPropertyId: row.confirmed_property_id, completedAt: row.completed_at,
        createdFinancialTransactionId: row.created_financial_transaction_id, createdMaintenanceRecordId: row.created_maintenance_record_id, createdContactId: row.created_contact_id,
        saving: false, duplicate: null, duplicateDismissed: true,
      }
    })
    setItems(rehydrated)
  }

  async function selectProperty(item: ImportItem, propertyId: string) {
    if (!supabase) return
    patchItem(item.id, { confirmedPropertyId: propertyId })
    await confirmItemProperty(supabase, item.documentId, item.id, propertyId)
  }

  async function bulkAssign() {
    if (!supabase || !bulkPropertyId || !selected.size) return
    const targets = items.filter((it) => selected.has(it.id) && it.status === 'Ready').map((it) => ({ documentId: it.documentId, itemId: it.id }))
    setItems((prev) => prev.map((it) => (selected.has(it.id) && it.status === 'Ready' ? { ...it, confirmedPropertyId: bulkPropertyId } : it)))
    await bulkConfirmProperty(supabase, targets, bulkPropertyId)
    setSelected(new Set())
  }

  async function confirmSuggestedMatches() {
    if (!supabase) return
    const targets = items.filter((it) => {
      if (it.status !== 'Ready' || it.confirmedPropertyId) return false
      const suggestion = matchProperty(it.analysis?.applyFields.propertyAddress, properties)
      return suggestion.confidence === 'High' && Boolean(suggestion.property)
    })
    for (const it of targets) {
      const suggestion = matchProperty(it.analysis?.applyFields.propertyAddress, properties)
      if (suggestion.property) await selectProperty(it, suggestion.property.id)
    }
  }

  async function addToPropCrew(item: ImportItem, prefill: { name: string; businessName: string | null; phone: string | null; email: string | null; role: string }) {
    if (!supabase) return { id: null, error: 'You must be signed in to add a PropCrew provider.' }
    const result = await addContactToPropCrew(supabase, ownerId, item.confirmedPropertyId, contacts, prefill)
    if (result.id) setContacts((prev) => [...prev, { id: result.id as string, name: prefill.name, business_name: prefill.businessName }])
    return result
  }

  async function saveReceipt(item: ImportItem, input: ReceiptSaveInput) {
    if (!supabase || !item.confirmedPropertyId) return
    patchItem(item.id, { saving: true })
    const result = await saveReceiptRecord(supabase, ownerId, {
      itemId: item.id, documentId: item.documentId, confirmedPropertyId: item.confirmedPropertyId,
      createdFinancialTransactionId: item.createdFinancialTransactionId, createdMaintenanceRecordId: item.createdMaintenanceRecordId,
      vendor: input.vendor, date: input.date, amount: input.amount, description: input.description,
      financialCategory: input.financialCategory, createMaintenanceRecord: input.createMaintenanceRecord,
      maintenanceCategory: input.maintenanceCategory, systemId: input.systemId, contactId: input.contactId || item.createdContactId,
    })
    if (!result.ok) { patchItem(item.id, { saving: false, error: result.error }); return }
    patchItem(item.id, {
      saving: false, error: undefined, completedAt: new Date().toISOString(),
      createdFinancialTransactionId: result.financialTransactionId, createdMaintenanceRecordId: result.maintenanceRecordId, createdContactId: result.contactId,
    })
  }

  async function savePrepareOnly(item: ImportItem) {
    if (!supabase || !item.confirmedPropertyId) return
    patchItem(item.id, { saving: true })
    await savePrepareOnlyRecord(supabase, item.id, item.documentId, item.documentType)
    patchItem(item.id, { saving: false, completedAt: new Date().toISOString() })
  }

  const displayStatuses = useMemo(() => items.map((it) => deriveImportStatus({
    status: it.status, confirmedPropertyId: it.confirmedPropertyId, completedAt: it.completedAt,
    hasPossibleDuplicate: Boolean(it.duplicate), possibleDuplicateDismissed: it.duplicateDismissed,
  })), [items])
  const progress = useMemo(() => summarizeImportProgress(displayStatuses), [displayStatuses])

  const statusById = useMemo(() => new Map(items.map((it, i) => [it.id, displayStatuses[i]])), [items, displayStatuses])

  const visibleItems = useMemo(() => items.filter((it) => {
    const status = statusById.get(it.id)
    if (filter === 'Needs attention') return status === 'Needs attention' || status === 'Needs property' || status === 'Failed'
    if (filter === 'Completed') return status === 'Completed'
    return true
  }), [items, statusById, filter])

  const propertyById = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties])
  const activeItem = items.find((it) => it.id === activeItemId) || null

  if (!loaded) return <main className="shell"><AuthHeader /><div className="loadingState">Loading Smart Import…</div></main>

  return (
    <main className="shell">
      <AuthHeader />

      <section className="intro">
        <p className="eyebrow">SMART IMPORT</p>
        <h1>Bring an existing portfolio into PropRoster.</h1>
        <p>Select many documents at once — PropRoster analyzes each one, suggests a property, and lines them up for you to review and save. Nothing is applied until you confirm it.</p>
      </section>

      {globalError && <div className="globalError">{globalError}<button onClick={() => setGlobalError('')}>×</button></div>}

      {resumable.length > 0 && !batchId && (
        <div className="importResumeBanner">
          {resumable.map((b) => (
            <div key={b.batchId} className="importResumeRow">
              <span>{b.count} document{b.count === 1 ? '' : 's'} from an unfinished import, started {new Date(b.oldestCreatedAt).toLocaleDateString()}.</span>
              <button className="primary" onClick={() => void resumeBatch(b.batchId)}>Continue Smart Import</button>
            </div>
          ))}
        </div>
      )}

      {activeItem ? (
        <div className="smartImportReviewPanel">
          <button className="breadcrumbBack" onClick={() => setActiveItemId(null)}>← Back to import queue</button>
          {activeItem.status === 'Analyzing' && <div className="docIntelProcessing"><span className="spinnerDot" /> Analyzing {activeItem.fileName} — this can take a minute.</div>}
          {(activeItem.status === 'Failed' || activeItem.status === 'Unsupported') && (
            <div className="docIntelPrompt docIntelFailed">
              <p>{activeItem.error || 'Something went wrong.'}</p>
              {activeItem.documentId && <button className="secondary" onClick={() => void retryItem(activeItem)}>Retry analysis</button>}
            </div>
          )}
          {activeItem.status === 'Ready' && activeItem.duplicate && !activeItem.duplicateDismissed && (
            <div className="docIntelPrompt docIntelFailed importDuplicateWarning">
              <p><strong>Possible duplicate.</strong> {activeItem.duplicate.reason}</p>
              <div className="smartUploadContactActions">
                <button className="secondary" onClick={() => keepDuplicate(activeItem)}>Keep — this is a different document</button>
                <button className="dangerLink" onClick={() => void skipItem(activeItem)}>Skip / remove this import</button>
              </div>
            </div>
          )}
          {activeItem.status === 'Ready' && activeItem.documentType && activeItem.analysis && (!activeItem.duplicate || activeItem.duplicateDismissed) && (
            reviewKindFor(activeItem.documentType) === 'Receipt' ? (
              <ReceiptReview
                applyFields={activeItem.analysis.applyFields as ApplyFields}
                properties={properties} contacts={contacts} systems={systems}
                confirmedPropertyId={activeItem.confirmedPropertyId} busy={activeItem.saving} saved={Boolean(activeItem.completedAt)}
                onSelectProperty={(propertyId) => void selectProperty(activeItem, propertyId)}
                onAddToPropCrew={(prefill) => addToPropCrew(activeItem, prefill)}
                onSave={(input) => void saveReceipt(activeItem, input)}
              />
            ) : (
              <PrepareOnlyReview
                documentType={activeItem.documentType} analysis={activeItem.analysis}
                properties={properties} confirmedPropertyId={activeItem.confirmedPropertyId} busy={activeItem.saving} saved={Boolean(activeItem.completedAt)}
                onSelectProperty={(propertyId) => void selectProperty(activeItem, propertyId)}
                onSave={() => void savePrepareOnly(activeItem)}
              />
            )
          )}
        </div>
      ) : (
        <>
          <div className="smartImportPicker">
            <label className="secondary smartImportPickerButton">
              {items.length ? 'Add more files' : 'Select files to import'}
              <input type="file" accept={SMART_UPLOAD_ACCEPT} multiple onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }} />
            </label>
            <small className="muted">PDF, JPEG, PNG, WEBP. HEIC/HEIF isn&apos;t supported yet.</small>
          </div>

          {items.length > 0 && (
            <>
              <div className="importProgressLine">
                <span>{progress.analyzed} of {progress.total} analyzed</span>
                <span>{progress.readyToReview} ready to review</span>
                <span>{progress.needsProperty} need a property</span>
                {progress.needsAttention > 0 && <span className="importProgressAttention">{progress.needsAttention} need attention</span>}
                {progress.failed > 0 && <span className="importProgressAttention">{progress.failed} failed</span>}
                {progress.completed > 0 && <span>{progress.completed} completed</span>}
              </div>

              <div className="importControls">
                <div className="subTabs" role="tablist" aria-label="Filter import queue">
                  {(['All', 'Needs attention', 'Completed'] as const).map((f) => (
                    <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>{f}</button>
                  ))}
                </div>
                <label className="importGroupSelect">Group by<select value={groupMode} onChange={(e) => setGroupMode(e.target.value as typeof groupMode)}><option value="None">None</option><option value="Property">Property</option><option value="Type">Document type</option></select></label>
              </div>

              {selected.size > 0 && (
                <div className="importBulkBar">
                  <span>{selected.size} selected</span>
                  <select value={bulkPropertyId} onChange={(e) => setBulkPropertyId(e.target.value)}>
                    <option value="">Choose a property…</option>
                    {properties.map((p) => <option key={p.id} value={p.id}>{p.address}</option>)}
                  </select>
                  <button className="primary" disabled={!bulkPropertyId} onClick={() => void bulkAssign()}>Assign selected</button>
                  <button className="secondary" onClick={() => void confirmSuggestedMatches()}>Confirm suggested matches</button>
                  <button className="secondary" onClick={() => setSelected(new Set())}>Clear selection</button>
                </div>
              )}
              {selected.size === 0 && visibleItems.some((it) => it.status === 'Ready' && !it.confirmedPropertyId) && (
                <div className="importBulkBar">
                  <button className="secondary" onClick={() => void confirmSuggestedMatches()}>Confirm all suggested property matches</button>
                </div>
              )}

              <ImportQueueList
                items={visibleItems}
                displayStatuses={statusById}
                properties={propertyById}
                selected={selected}
                groupMode={groupMode}
                onToggleSelect={(id) => setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })}
                onOpen={(id) => setActiveItemId(id)}
                onRetry={(item) => void retryItem(item)}
              />
            </>
          )}
        </>
      )}
    </main>
  )
}

function ImportQueueList({
  items, displayStatuses, properties, selected, groupMode, onToggleSelect, onOpen, onRetry,
}: {
  items: ImportItem[]
  displayStatuses: Map<string, ImportDisplayStatus>
  properties: Map<string, SmartUploadProperty>
  selected: Set<string>
  groupMode: 'None' | 'Property' | 'Type'
  onToggleSelect: (id: string) => void
  onOpen: (id: string) => void
  onRetry: (item: ImportItem) => void
}) {
  function summaryFor(item: ImportItem): string {
    if (!item.analysis || !item.documentType) return ''
    if (reviewKindFor(item.documentType) === 'Receipt') {
      const fields = extractReceiptFields(item.analysis.applyFields)
      return [fields.vendor, fields.amount ? `$${fields.amount}` : null].filter(Boolean).join(' · ')
    }
    return item.analysis.overview.slice(0, 80)
  }

  function row(item: ImportItem) {
    const status = displayStatuses.get(item.id) || 'Uploading'
    const property = item.confirmedPropertyId ? properties.get(item.confirmedPropertyId) : null
    const suggestion = !item.confirmedPropertyId && item.analysis ? matchProperty(item.analysis.applyFields.propertyAddress, Array.from(properties.values())) : null
    return (
      <div className="importQueueRow" key={item.id}>
        {item.status === 'Ready' && <input type="checkbox" checked={selected.has(item.id)} onChange={() => onToggleSelect(item.id)} aria-label={`Select ${item.fileName}`} />}
        <button className="importQueueRowMain" onClick={() => onOpen(item.id)}>
          <strong>{item.fileName}</strong>
          <span className="muted">{item.documentType || 'Analyzing…'}{summaryFor(item) ? ` · ${summaryFor(item)}` : ''}</span>
          <span className="muted">
            {property ? property.address : suggestion?.property ? `Suggested: ${suggestion.property.address}` : 'No property yet'}
          </span>
        </button>
        <span className={`statusPill ${STATUS_TONE[status]}`}>{status}</span>
        {item.status === 'Failed' && item.documentId && <button className="secondary" onClick={() => onRetry(item)}>Retry</button>}
      </div>
    )
  }

  if (groupMode === 'None') return <div className="importQueueList">{items.map(row)}</div>

  const groups = new Map<string, ImportItem[]>()
  items.forEach((item) => {
    const key = groupMode === 'Property'
      ? (item.confirmedPropertyId ? properties.get(item.confirmedPropertyId)?.address || 'Unknown property' : 'Unassigned')
      : (item.documentType || 'Unclassified')
    groups.set(key, [...(groups.get(key) || []), item])
  })

  return (
    <div className="importQueueList">
      {Array.from(groups.entries()).map(([key, groupItems]) => (
        <div className="importQueueGroup" key={key}>
          <h4>{key}</h4>
          {groupItems.map(row)}
        </div>
      ))}
    </div>
  )
}
