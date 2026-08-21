'use client'

// PropRoster — Documents + Navigation + Realtor Connect Polish, Section 1/2.
//
// The portfolio-wide document library — every property_documents row the
// caller owns, across every property, newest first. Built specifically
// so Smart Upload's "not yet assigned to a property" documents (Section
// 1's problem statement) have somewhere to live: Assign to Property /
// Move to Another Property (Sections 3/4) only ever update the existing
// row's property_id (see lib/documents/reassign.ts) — never a
// re-upload, never a duplicate row, never a re-run of Smart Upload or AI
// analysis. The file, its storage_path, and its analysis are completely
// untouched; only the property association changes.
//
// Auth/page-shell pattern mirrors app/rent-ledger/page.tsx exactly
// (useAuthUser + AuthHeader + the same authShell/authCard sign-in gate).
// URL params are read manually via window.location.search, the same
// deliberate choice every other standalone page here already makes
// (app/page.tsx, app/search/page.tsx, app/rent-ledger/page.tsx) so this
// page never needs a Suspense boundary.
//
// Security (Section 7): every query below goes through the SAME
// RLS-scoped client every other page uses — no service-role key, no new
// policy, nothing here weakens property_documents' existing owner-scoped
// select/update policies (supabase/schema.sql). "Assign"/"Move" reuse
// lib/documents/reassign.ts, which is itself backed by the exact same
// documents_update_own policy the property workspace's existing Move /
// Refile feature already relies on — a forged property id is refused by
// the database regardless of what this page's own pre-check does.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'
import { AuthHeader } from '../../components/AuthHeader'
import { filterDocuments, sortDocumentsNewestFirst, propertyLabelFor, type DocumentFilter } from '../../lib/documents/filter'
import { findDocumentLinks } from '../../lib/documents/document-links'
import { reassignDocumentToProperty } from '../../lib/documents/reassign'

type PropertyRef = { id: string; address: string; city: string }
type DocRow = {
  id: string
  property_id: string | null
  name: string
  category: string
  storage_path: string
  created_at: string
  document_type: string | null
  analysis_status: string | null
}

const FILTERS: DocumentFilter[] = ['All', 'Unassigned', 'Assigned']

export default function DocumentsPage() {
  const { user, ready } = useAuthUser()

  if (!ready) return <main className="authShell"><div className="loadingState">Loading Documents…</div></main>

  if (!user) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Sign in required</h1>
          <p className="authIntro">Sign in to view your Documents library.</p>
          <Link className="primary authSubmit" href="/">Go to sign in</Link>
        </section>
      </main>
    )
  }

  return <DocumentsWorkspace />
}

function DocumentsWorkspace() {
  const [properties, setProperties] = useState<PropertyRef[]>([])
  const [documents, setDocuments] = useState<DocRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<DocumentFilter>('All')
  const [highlightId, setHighlightId] = useState<string | null>(null)

  const [assignDocId, setAssignDocId] = useState<string | null>(null)
  const [assignPropertyId, setAssignPropertyId] = useState('')
  const [assignError, setAssignError] = useState('')
  const [assignBusy, setAssignBusy] = useState(false)

  async function load() {
    if (!supabase) return
    const [propsRes, docsRes] = await Promise.all([
      supabase.from('properties').select('id,address,city').order('address'),
      supabase.from('property_documents').select('id,property_id,name,category,storage_path,created_at,document_type,analysis_status').order('created_at', { ascending: false }),
    ])
    if (propsRes.error) setError(propsRes.error.message)
    else if (docsRes.error) setError(docsRes.error.message)
    setProperties((propsRes.data as PropertyRef[]) || [])
    setDocuments((docsRes.data as DocRow[]) || [])
    setLoaded(true)
  }

  useEffect(() => { void load() }, [])

  // Recent Activity → Documents linkage (Section 5): an unassigned
  // document's dashboard activity row links here as
  // /documents?highlight=<documentId> — the document's own safe id,
  // already present on the activity item (lib/dashboard/activity.ts).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const id = params.get('highlight')
    if (!id) return
    window.history.replaceState(null, '', window.location.pathname)
    setHighlightId(id)
  }, [])

  useEffect(() => {
    if (!highlightId || !loaded) return
    const el = document.getElementById(`doc-${highlightId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setHighlightId(null), 4000)
    return () => clearTimeout(t)
  }, [highlightId, loaded])

  const propertyLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of properties) m.set(p.id, `${p.address}${p.city ? `, ${p.city}` : ''}`)
    return m
  }, [properties])

  const visibleDocs = useMemo(() => filterDocuments(sortDocumentsNewestFirst(documents), filter), [documents, filter])

  function openAssign(doc: DocRow) {
    setAssignDocId(doc.id)
    setAssignPropertyId(doc.property_id || '')
    setAssignError('')
  }

  async function confirmAssign() {
    if (!supabase || !assignDocId || !assignPropertyId) return
    const doc = documents.find((d) => d.id === assignDocId)
    if (!doc) return
    setAssignBusy(true)
    setAssignError('')
    const result = await reassignDocumentToProperty(
      { id: doc.id, property_id: doc.property_id },
      assignPropertyId,
      {
        isOwnedProperty: async (propertyId) => properties.some((p) => p.id === propertyId),
        findLinkedRecords: (documentId) => findDocumentLinks(supabase!, documentId),
        updateDocumentProperty: async (documentId, propertyId) => {
          const { error } = await supabase!.from('property_documents').update({ property_id: propertyId }).eq('id', documentId)
          return { error: error?.message || null }
        },
        updateAnalysisProperty: async (documentId, propertyId) => {
          await supabase!.from('document_analyses').update({ property_id: propertyId }).eq('document_id', documentId)
        },
      },
    )
    if (!result.ok) {
      setAssignError(result.error)
      setAssignBusy(false)
      return
    }
    setAssignDocId(null)
    setAssignBusy(false)
    await load()
  }

  async function openDocument(doc: DocRow) {
    if (!supabase) return
    // Deliberately omit "noopener" (same reasoning as app/page.tsx's
    // openDocument) — we need the window reference to redirect it below.
    const newTab = window.open('', '_blank', 'noreferrer')
    const { data, error: urlError } = await supabase.storage.from('property-documents').createSignedUrl(doc.storage_path, 60)
    if (urlError || !data?.signedUrl) {
      newTab?.close()
      setError(urlError?.message || 'Unable to open this document. Please try again.')
      return
    }
    if (newTab) {
      try { newTab.opener = null } catch { /* not settable in every browser — best effort */ }
      newTab.location.href = data.signedUrl
    } else {
      window.location.href = data.signedUrl
    }
  }

  return (
    <main className="shell">
      <AuthHeader />

      <section className="intro">
        <p className="eyebrow">DOCUMENTS</p>
        <h1>Your document library.</h1>
        <p>Every document across your portfolio, in one place — including anything Smart Upload saved before you told it which property it belongs to.</p>
      </section>

      {error && <p className="errorMessage">{error}</p>}

      <div className="subTabs documentsFilterTabs" role="tablist" aria-label="Document filters">
        {FILTERS.map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
            {f} ({filterDocuments(documents, f).length})
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="loadingState">Loading your documents…</div>
      ) : visibleDocs.length === 0 ? (
        <div className="emptyState">
          <strong>{filter === 'Unassigned' ? 'No unassigned documents.' : filter === 'Assigned' ? 'No assigned documents yet.' : 'No documents yet.'}</strong>
          <span>Upload a file from any property&apos;s Documents tab, or use Smart Upload from the header.</span>
        </div>
      ) : (
        <div className="documentsLibraryList">
          {visibleDocs.map((doc) => {
            const propertyLabel = propertyLabelFor(doc.property_id, propertyLabelById)
            return (
              <div id={`doc-${doc.id}`} key={doc.id} className={`documentsLibraryCard${highlightId === doc.id ? ' documentsLibraryCardHighlighted' : ''}`}>
                <div className="fileIcon">{doc.name.split('.').pop()?.toUpperCase().slice(0, 4) || 'FILE'}</div>
                <div className="documentsLibraryCardBody">
                  <strong>{doc.name}</strong>
                  <span className="muted">{doc.category}{doc.document_type ? ` · ${doc.document_type}` : ''} · {new Date(doc.created_at).toLocaleDateString()}</span>
                  <span className="documentsLibraryCardStatus">
                    {propertyLabel ? (
                      <Link href={`/?openProperty=${doc.property_id}&openTab=Documents&openDocsSubTab=Documents`} className="statusPill pillGood">{propertyLabel}</Link>
                    ) : (
                      <span className="statusPill pillWarn">Unassigned</span>
                    )}
                    {doc.analysis_status && doc.analysis_status !== 'Not Analyzed' && (
                      <span className={`aiStatusPill ${doc.analysis_status === 'Completed' ? 'pillGood' : doc.analysis_status === 'Failed' ? 'pillBad' : 'pillWarn'}`}>
                        {doc.analysis_status === 'Completed' ? 'AI Analyzed' : doc.analysis_status}
                      </span>
                    )}
                  </span>
                </div>
                <div className="rowActions documentsLibraryCardActions">
                  <button onClick={() => void openDocument(doc)}>Open</button>
                  <button className="primary" onClick={() => openAssign(doc)}>{doc.property_id ? 'Move to Another Property' : 'Assign to Property'}</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {assignDocId && (() => {
        const doc = documents.find((d) => d.id === assignDocId)
        if (!doc) return null
        const currentLabel = propertyLabelFor(doc.property_id, propertyLabelById)
        const chosen = properties.find((p) => p.id === assignPropertyId)
        return (
          <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !assignBusy && setAssignDocId(null)}>
            <div className="modal">
              <div className="modalTop">
                <div><p className="eyebrow">DOCUMENTS</p><h2>{doc.property_id ? 'Move to another property' : 'Assign to property'}</h2></div>
                <button className="iconButton" onClick={() => setAssignDocId(null)} aria-label="Close">×</button>
              </div>
              <p className="deleteWarning">
                <strong>{doc.name}</strong>{currentLabel ? <> is currently filed under {currentLabel}.</> : <> is not yet assigned to a property.</>}
              </p>
              <div className="formGrid">
                <label className="fullField">
                  Property
                  <select value={assignPropertyId} onChange={(e) => setAssignPropertyId(e.target.value)}>
                    <option value="">Choose a property…</option>
                    {properties.map((p) => <option key={p.id} value={p.id}>{p.address}{p.city ? `, ${p.city}` : ''}</option>)}
                  </select>
                </label>
              </div>
              {assignError && <p className="errorMessage">{assignError}</p>}
              <div className="modalActions">
                <button className="secondary" onClick={() => setAssignDocId(null)} disabled={assignBusy}>Cancel</button>
                <button className="primary" disabled={assignBusy || !assignPropertyId || assignPropertyId === (doc.property_id || '')} onClick={() => void confirmAssign()}>
                  {assignBusy ? 'Saving…' : chosen ? `Assign to ${chosen.address}` : 'Assign'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </main>
  )
}
