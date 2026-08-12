'use client'

// PropPrepped Milestone 8: the per-document "Document Intelligence" view.
//
// Renders Not Analyzed / Processing / Completed / Failed states, lets the
// user trigger analysis explicitly (never automatic — Section C), shows the
// structured extraction with confidence + source page per field (Sections L,
// M), and offers Apply-to-Property actions that hand off to PropPrepped's
// existing Lease/Mortgage/Insurance/Maintenance/Financials/Contacts forms so
// every apply still requires the user's own explicit Save (Section O).

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DOCUMENT_TYPES, type DocumentType } from '../lib/document-intelligence/types'
import type { DocumentAnalysisOutput, ExtractedField, FieldGroup } from '../lib/document-intelligence/schemas'

export type ApplyAction = 'Insurance' | 'Mortgage' | 'Lease' | 'Maintenance' | 'FinancialExpense' | 'Contact' | 'EstimatedValue'

type AnalyzedDocument = {
  id: string
  name: string
  document_type: string | null
  classification_confidence: string | null
  classification_source: string | null
  analysis_status: string
  analysis_error: string | null
}

type DocumentAnalysisRow = {
  id: string
  document_type: string
  summary: string
  structured_data: DocumentAnalysisOutput
  source_references: { group: string; label: string; page: number | null; snippet: string | null; confidence: string | null }[]
  model_provider: string
  model_name: string
  analysis_version: number
  created_at: string
}

function normalizeAmount(value: string | null): string {
  if (!value) return ''
  const cleaned = value.replace(/[^0-9.]/g, '')
  return cleaned
}

function pick<T extends Record<string, unknown>>(source: T, keys: (keyof T)[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of keys) {
    const v = source[key]
    if (typeof v === 'string' && v.trim()) out[key as string] = v
  }
  return out
}

const confidenceClass: Record<string, string> = { High: 'confHigh', Medium: 'confMedium', Low: 'confLow' }
const statusTone: Record<string, string> = { 'Not Analyzed': 'pillMuted', Queued: 'pillNeutral', Processing: 'pillWarn', Completed: 'pillGood', Failed: 'pillBad' }

function FieldRow({ field }: { field: ExtractedField }) {
  return (
    <div className={`docField ${field.confidence === 'Low' ? 'docFieldLow' : ''}`}>
      <div className="docFieldHead">
        <span className="docFieldLabel">{field.label}</span>
        {field.confidence && <span className={`confidenceBadge ${confidenceClass[field.confidence]}`}>{field.confidence}</span>}
      </div>
      <div className="docFieldValue">{field.value}</div>
      {(field.sourcePage || field.sourceSnippet) && (
        <div className="docFieldSource">
          {field.sourcePage && <span>Source: Page {field.sourcePage}</span>}
          {field.sourceSnippet && <span className="docFieldSnippet">&ldquo;{field.sourceSnippet}&rdquo;</span>}
        </div>
      )}
    </div>
  )
}

function GroupSection({ group }: { group: FieldGroup }) {
  if (!group.fields.length) return null
  return (
    <div className="docGroup">
      <h4>{group.title}</h4>
      <div className="docFieldGrid">{group.fields.map((f, i) => <FieldRow field={f} key={i} />)}</div>
    </div>
  )
}

export default function DocumentIntelligencePanel({
  document,
  contacts,
  currentInsurancePremium,
  currentMortgageBalance,
  currentMonthlyRent,
  currentEstimatedValue,
  onClose,
  onOpenDocument,
  onRefresh,
  onApply,
}: {
  document: AnalyzedDocument
  contacts: { name: string; business_name: string | null }[]
  currentInsurancePremium?: number | null
  currentMortgageBalance?: number | null
  currentMonthlyRent?: number | null
  currentEstimatedValue?: number | null
  onClose: () => void
  onOpenDocument: () => void
  onRefresh: () => void
  onApply: (action: ApplyAction, values: Record<string, string>) => void
}) {
  const [analyses, setAnalyses] = useState<DocumentAnalysisRow[]>([])
  const [versionIndex, setVersionIndex] = useState(0)
  const [docTypeDraft, setDocTypeDraft] = useState<DocumentType>((document.document_type as DocumentType) || 'Other')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    setDocTypeDraft((document.document_type as DocumentType) || 'Other')
  }, [document.document_type])

  useEffect(() => {
    if (!supabase) return
    setLoadingHistory(true)
    supabase
      .from('document_analyses')
      .select('*')
      .eq('document_id', document.id)
      .order('analysis_version', { ascending: false })
      .then(({ data }) => {
        setAnalyses((data || []) as DocumentAnalysisRow[])
        setVersionIndex(0)
        setLoadingHistory(false)
      })
  }, [document.id, document.analysis_status])

  const latest = analyses[versionIndex] || null

  const vendorAlreadyContact = useMemo(() => {
    const vendor = (latest?.structured_data.applyFields.vendor || latest?.structured_data.applyFields.businessName || '').trim().toLowerCase()
    if (!vendor) return true
    return contacts.some((c) => c.name.toLowerCase() === vendor || (c.business_name || '').toLowerCase() === vendor)
  }, [latest, contacts])

  async function updateDocType(next: DocumentType) {
    if (!supabase) return
    setDocTypeDraft(next)
    await supabase.from('property_documents').update({ document_type: next, classification_source: 'User' }).eq('id', document.id)
    onRefresh()
  }

  async function runAnalyze() {
    if (!supabase) return
    setBusy(true)
    setError('')
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) {
      setError('Your session expired — please sign in again.')
      setBusy(false)
      return
    }
    try {
      const resp = await fetch('/api/document-intelligence/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ documentId: document.id, documentType: docTypeDraft }),
      })
      const body = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(body?.error || 'Analysis failed. Please try again.')
      }
    } catch {
      setError('Analysis failed. Please try again.')
    }
    onRefresh()
    setBusy(false)
  }

  const status = document.analysis_status || 'Not Analyzed'
  const af = latest?.structured_data.applyFields

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal docIntelModal">
        <div className="modalTop">
          <div>
            <p className="eyebrow">DOCUMENT INTELLIGENCE</p>
            <h2>{document.name}</h2>
          </div>
          <button className="iconButton" onClick={onClose}>×</button>
        </div>

        <div className="docIntelMeta">
          <label className="docTypeSelect">
            <span>Document type</span>
            <select value={docTypeDraft} onChange={(e) => void updateDocType(e.target.value as DocumentType)}>
              {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <div className="docIntelStatusBlock">
            <span className={`statusPill ${statusTone[status] || 'pillMuted'}`}>{status === 'Completed' ? 'AI Analysis Complete' : status}</span>
            {document.classification_source && <small>Classified by {document.classification_source}{document.classification_confidence ? ` · ${document.classification_confidence} confidence` : ''}</small>}
          </div>
        </div>

        {error && <div className="statusMessage errorMessage">{error}</div>}

        {status === 'Not Analyzed' && (
          <div className="docIntelPrompt">
            <p>Upload it. PropPrepped handles the rest — extract key details, dates, amounts and coverage/terms from this document automatically.</p>
            <button className="primary" disabled={busy} onClick={() => void runAnalyze()}>{busy ? 'Starting…' : 'Analyze with PropPrepped AI'}</button>
          </div>
        )}

        {status === 'Processing' && (
          <div className="docIntelProcessing"><span className="spinnerDot" /> Analyzing this document — this can take a minute for longer files.</div>
        )}

        {status === 'Failed' && (
          <div className="docIntelPrompt docIntelFailed">
            <p>{document.analysis_error || 'The last analysis attempt failed.'}</p>
            <p className="muted">Your document and any existing PropPrepped data are unchanged.</p>
            <button className="primary" disabled={busy} onClick={() => void runAnalyze()}>{busy ? 'Retrying…' : 'Retry Analysis'}</button>
          </div>
        )}

        {status === 'Completed' && latest && (
          <div className="docIntelResults">
            {analyses.length > 1 && (
              <label className="versionPicker">
                <span>Version</span>
                <select value={versionIndex} onChange={(e) => setVersionIndex(Number(e.target.value))}>
                  {analyses.map((a, i) => <option key={a.id} value={i}>v{a.analysis_version} — {new Date(a.created_at).toLocaleString()}{i === 0 ? ' (latest)' : ''}</option>)}
                </select>
              </label>
            )}

            <section className="docIntelSection">
              <p className="eyebrow">OVERVIEW</p>
              <p className="docOverview">{latest.structured_data.overview}</p>
              <p className="docSummary">{latest.structured_data.summary}</p>
            </section>

            {latest.structured_data.groups.map((g, i) => <section className="docIntelSection" key={i}><GroupSection group={g} /></section>)}

            {latest.structured_data.itemsToReview.length > 0 && (
              <section className="docIntelSection">
                <p className="eyebrow">ITEMS TO REVIEW</p>
                <ul className="docList docListWarn">{latest.structured_data.itemsToReview.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </section>
            )}

            {latest.structured_data.missingOrUnclear.length > 0 && (
              <section className="docIntelSection">
                <p className="eyebrow">MISSING / UNCLEAR</p>
                <ul className="docList">{latest.structured_data.missingOrUnclear.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </section>
            )}

            {latest.source_references.length > 0 && (
              <section className="docIntelSection">
                <p className="eyebrow">SOURCE REFERENCES</p>
                <ul className="docList docSourceList">
                  {latest.source_references.map((r, i) => <li key={i}><strong>{r.label}</strong>{r.page ? ` — Page ${r.page}` : ''}{r.confidence ? ` · ${r.confidence} confidence` : ''}</li>)}
                </ul>
                <p className="ledgerNote">{latest.structured_data.sourceTraceabilityNote}</p>
              </section>
            )}

            <section className="docIntelSection">
              <p className="eyebrow">ORIGINAL DOCUMENT</p>
              <button className="secondary" onClick={onOpenDocument}>Open {document.name}</button>
            </section>

            {af && (latest.document_type === 'Insurance Policy' || latest.document_type === 'Mortgage / Loan Statement' || latest.document_type === 'Lease' || latest.document_type === 'Appraisal' || latest.document_type === 'Contractor Invoice / Receipt') && (
              <section className="docIntelSection">
                <p className="eyebrow">ACTIONS</p>
                <p className="muted">AI extraction never changes your records automatically — review, then confirm.</p>
                <div className="docActionRow">
                  {latest.document_type === 'Insurance Policy' && af.annualPremium && (
                    <div className="docActionCard">
                      {currentInsurancePremium != null && <p className="docCompare">Current annual premium: <strong>${currentInsurancePremium.toLocaleString()}</strong> → Extracted: <strong>${Number(normalizeAmount(af.annualPremium)).toLocaleString()}</strong></p>}
                      <button className="primary" onClick={() => onApply('Insurance', pick(af, ['carrier', 'policyNumber', 'annualPremium', 'deductible', 'effectiveDate', 'expirationDate']))}>Apply to Insurance</button>
                    </div>
                  )}
                  {latest.document_type === 'Mortgage / Loan Statement' && (af.lender || af.currentBalance) && (
                    <div className="docActionCard">
                      {currentMortgageBalance != null && af.currentBalance && <p className="docCompare">Current balance on file: <strong>${currentMortgageBalance.toLocaleString()}</strong> → Extracted: <strong>${Number(normalizeAmount(af.currentBalance)).toLocaleString()}</strong></p>}
                      <button className="primary" onClick={() => onApply('Mortgage', pick(af, ['lender', 'loanNumber', 'originalBalance', 'currentBalance', 'interestRate', 'monthlyPayment', 'escrowAmount', 'loanTermYears', 'maturityDate']))}>Apply to Mortgage</button>
                    </div>
                  )}
                  {latest.document_type === 'Lease' && af.monthlyRent && (
                    <div className="docActionCard">
                      {currentMonthlyRent != null && <p className="docCompare">Current monthly rent: <strong>${currentMonthlyRent.toLocaleString()}</strong> → Extracted: <strong>${Number(normalizeAmount(af.monthlyRent)).toLocaleString()}</strong></p>}
                      <button className="primary" onClick={() => onApply('Lease', pick(af, ['tenantName', 'tenantEmail', 'monthlyRent', 'securityDeposit', 'startDate', 'endDate']))}>Apply to Lease</button>
                    </div>
                  )}
                  {latest.document_type === 'Appraisal' && af.estimatedValue && (
                    <div className="docActionCard">
                      {currentEstimatedValue != null && <p className="docCompare">Current estimated value: <strong>${currentEstimatedValue.toLocaleString()}</strong> → Appraised: <strong>${Number(normalizeAmount(af.estimatedValue)).toLocaleString()}</strong></p>}
                      <button className="primary" onClick={() => onApply('EstimatedValue', { value: normalizeAmount(af.estimatedValue) })}>Apply appraised value to property</button>
                    </div>
                  )}
                  {latest.document_type === 'Contractor Invoice / Receipt' && (
                    <>
                      {af.amount && <div className="docActionCard"><button className="secondary" onClick={() => onApply('FinancialExpense', pick(af, ['vendor', 'description', 'amount', 'date']))}>Add Financial Expense</button></div>}
                      {af.description && <div className="docActionCard"><button className="secondary" onClick={() => onApply('Maintenance', pick(af, ['vendor', 'description', 'cost', 'category']))}>Create Maintenance Record</button></div>}
                      {(af.vendor || af.businessName) && !vendorAlreadyContact && (
                        <div className="docActionCard"><button className="secondary" onClick={() => onApply('Contact', pick(af, ['name', 'businessName', 'phone', 'email', 'website']))}>Add this business to Contacts</button></div>
                      )}
                    </>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
