'use client'

// PropRoster — Tax Center V2: property-level "Tax & Financials" panel.
//
// Self-contained (owns its own Supabase reads/writes), same pattern as
// PropertySystemsPanel/PropertyNotesPanel — the parent (app/page.tsx)
// only supplies what it already has loaded (this property's
// transactions/maintenance records/documents/tax records) and an
// onRefresh to re-pull the parent's own data after a save.
//
// One property_tax_records row per (property, tax year) — switching the
// year here loads (or starts a blank draft for) that year's row. Every
// manual field is optional (Section "Save Behavior": "Allow blank
// values. Do not force landlords to fill every category.") — a blank
// field means "no manual entry," which falls back to PropRoster's
// tracked ledger total, never to zero (lib/tax-center/manual-entry.ts's
// computeCategoryValue is the single place that rule lives; this panel
// only ever sends what the user actually typed, never invents a value).
//
// Each category row shows all three numbers the spec asks for: Tracked
// in PropRoster, Manual tax entry, and the resulting Tax Center amount
// — so the source of every figure is never ambiguous, and entering a
// manual value visibly REPLACES the tracked one instead of silently
// stacking on top of it.

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { filterTransactionsForYear, getAvailableTaxYears, sumByCategory } from '../../lib/tax-center/aggregate'
import { buildCategoryBreakdown, categoriesInGroup, emptyManualFields, type ManualTaxFields } from '../../lib/tax-center/manual-entry'
import { isIncomeCategory, isOperatingExpenseCategory, isCapitalExpenseCategory } from '../../lib/tax-center/categories'
import type { TransactionInput, MaintenanceRecordInput as _MaintenanceRecordInput } from '../../lib/tax-center/types'

export type PropertyTaxRecordRow = ManualTaxFields & {
  id: string
  property_id: string
  owner_id: string
  tax_year: number
  notes: string | null
  document_id: string | null
}

type DocumentOption = { id: string; name: string; category: string }

const MANUAL_FIELD_KEYS = Object.keys(emptyManualFields()) as (keyof ManualTaxFields)[]

function moneyStr(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0)
}

type DraftFields = { [K in keyof ManualTaxFields]: string }

function draftFromRecord(record: PropertyTaxRecordRow | undefined): { fields: DraftFields; notes: string; documentId: string } {
  const fields = {} as DraftFields
  for (const key of MANUAL_FIELD_KEYS) {
    const value = record ? record[key] : null
    fields[key] = value === null || value === undefined ? '' : String(value)
  }
  return { fields, notes: record?.notes || '', documentId: record?.document_id || '' }
}

function draftToManualFields(fields: DraftFields): ManualTaxFields {
  const out = {} as ManualTaxFields
  for (const key of MANUAL_FIELD_KEYS) {
    const raw = fields[key].trim()
    out[key] = raw === '' ? null : Number(raw)
  }
  return out
}

export function PropertyTaxPanel({
  supabase, propertyId, ownerId, transactions, maintenanceRecords, documents, taxRecords, onRefresh,
}: {
  supabase: SupabaseClient
  propertyId: string
  ownerId: string
  transactions: TransactionInput[]
  maintenanceRecords: _MaintenanceRecordInput[]
  documents: DocumentOption[]
  taxRecords: PropertyTaxRecordRow[]
  onRefresh: () => void
}) {
  const availableYears = useMemo(() => getAvailableTaxYears(transactions), [transactions])
  const [year, setYear] = useState<string>(availableYears[0] || String(new Date().getFullYear()))
  const existingRecord = useMemo(() => taxRecords.find((r) => String(r.tax_year) === year), [taxRecords, year])
  const [draftFields, setDraftFields] = useState<DraftFields>(() => draftFromRecord(existingRecord).fields)
  const [notes, setNotes] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Re-populate the draft whenever the year changes (or the parent's
  // taxRecords refreshes after a save) — never while the user still has
  // unsaved edits in progress for the CURRENT year, so a background
  // refresh can't clobber what they're mid-typing.
  useEffect(() => {
    if (dirty) return
    const { fields, notes: n, documentId: d } = draftFromRecord(existingRecord)
    setDraftFields(fields)
    setNotes(n)
    setDocumentId(d)
    setSaved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, existingRecord?.id])

  // Section "Save Behavior": prevent accidental loss of unsaved changes
  // where reasonably practical — a plain browser-level guard, no custom
  // routing interception (this is a single-page tab switch away, not a
  // full navigation in most cases, but covers a real page close/reload).
  useEffect(() => {
    if (!dirty) return
    function handleBeforeUnload(e: BeforeUnloadEvent) { e.preventDefault() }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  function updateField(key: keyof ManualTaxFields, value: string) {
    setDraftFields((f) => ({ ...f, [key]: value }))
    setDirty(true)
    setSaved(false)
  }

  function changeYear(nextYear: string) {
    if (dirty && !window.confirm('You have unsaved manual tax entries for this year. Switch years and discard them?')) return
    setYear(nextYear)
    setDirty(false)
  }

  const yearTransactions = useMemo(
    () => filterTransactionsForYear(transactions, year).filter((t) => t.property_id === propertyId),
    [transactions, year, propertyId],
  )
  const trackedByCategory = useMemo(() => {
    const incomeTx = yearTransactions.filter((t) => t.transaction_type === 'Income' && isIncomeCategory(t.category))
    const expenseTx = yearTransactions.filter((t) => t.transaction_type === 'Expense' && (isOperatingExpenseCategory(t.category) || isCapitalExpenseCategory(t.category)))
    return sumByCategory([...incomeTx, ...expenseTx])
  }, [yearTransactions])

  const draftManualFields = useMemo(() => draftToManualFields(draftFields), [draftFields])
  const breakdown = useMemo(() => buildCategoryBreakdown(trackedByCategory, draftManualFields), [trackedByCategory, draftManualFields])

  function invalidFields(): string[] {
    const problems: string[] = []
    for (const key of MANUAL_FIELD_KEYS) {
      const raw = draftFields[key].trim()
      if (raw === '') continue
      const n = Number(raw)
      if (!Number.isFinite(n)) problems.push(key)
      else if (n < 0) problems.push(key)
    }
    return problems
  }
  const validationProblems = invalidFields()

  async function save() {
    if (validationProblems.length > 0) {
      setError('Please enter valid, non-negative amounts (or leave a field blank).')
      return
    }
    setSaving(true)
    setError('')
    const payload = {
      property_id: propertyId,
      owner_id: ownerId,
      tax_year: Number(year),
      ...draftManualFields,
      notes: notes.trim() || null,
      document_id: documentId || null,
    }
    const { error: saveError } = await supabase.from('property_tax_records').upsert(payload, { onConflict: 'property_id,tax_year' })
    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    setDirty(false)
    setSaved(true)
    onRefresh()
  }

  const documentOptions = documents.filter((d) => ['Tax', 'Receipts', 'Other'].includes(d.category))

  return (
    <div className="taxPanel">
      <div className="taxPanelHead">
        <div>
          <p className="eyebrow">TAX &amp; FINANCIALS</p>
          <p className="muted">Review what PropRoster already tracks, and enter manual annual amounts where you want them to replace it for Tax Center reporting.</p>
        </div>
        <label className="taxPanelYear">
          Tax year
          <select value={year} onChange={(e) => changeYear(e.target.value)}>
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>

      {(['income', 'operatingExpense'] as const).map((group) => (
        <div className="taxPanelGroup" key={group}>
          <h4>{group === 'income' ? 'Income' : 'Expenses'}</h4>
          {categoriesInGroup(group).map((c) => {
            const value = breakdown[c.key]
            return (
              <div className="taxManualRow" key={c.key}>
                <div className="taxManualRowHead"><span>{c.label}</span></div>
                <div className="taxManualRowBody">
                  <div className="taxManualRowStat"><span>Tracked in PropRoster</span><strong>{moneyStr(value.tracked)}</strong></div>
                  <label className="taxManualRowInput evalField">
                    <span>Manual tax entry (override)</span>
                    <div className="evalInputWrap">
                      <input inputMode="decimal" value={draftFields[c.manualField as keyof ManualTaxFields]} onChange={(e) => updateField(c.manualField as keyof ManualTaxFields, e.target.value)} placeholder="Leave blank to use tracked" />
                      <span className="evalSuffix">$</span>
                    </div>
                  </label>
                  <div className="taxManualRowStat taxManualRowEffective"><span>Tax Center amount</span><strong>{moneyStr(value.effective)}</strong></div>
                </div>
              </div>
            )
          })}
        </div>
      ))}

      <div className="taxPanelGroup">
        <h4>Financing</h4>
        <p className="muted taxPanelHint">Enter the mortgage interest amount from your lender statement or Form 1098. PropRoster does not calculate this from mortgage payments, and never treats loan principal as deductible.</p>
        {categoriesInGroup('financing').map((c) => {
          const value = breakdown[c.key]
          return (
            <div className="taxManualRow" key={c.key}>
              <div className="taxManualRowHead"><span>{c.label}</span></div>
              <div className="taxManualRowBody">
                <div className="taxManualRowStat"><span>Tracked in PropRoster</span><strong>Not available — see note above</strong></div>
                <label className="taxManualRowInput evalField">
                  <span>Manual tax entry</span>
                  <div className="evalInputWrap">
                    <input inputMode="decimal" value={draftFields[c.manualField as keyof ManualTaxFields]} onChange={(e) => updateField(c.manualField as keyof ManualTaxFields, e.target.value)} placeholder="0.00" />
                    <span className="evalSuffix">$</span>
                  </div>
                </label>
                <div className="taxManualRowStat taxManualRowEffective"><span>Tax Center amount</span><strong>{moneyStr(value.effective)}</strong></div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="taxPanelGroup">
        <h4>Capital Improvements</h4>
        <p className="muted taxPanelHint">Kept separate from operating expenses — capital improvements are typically depreciated over time, not deducted immediately. Review the correct treatment with your tax professional.</p>
        {categoriesInGroup('capital').map((c) => {
          const value = breakdown[c.key]
          return (
            <div className="taxManualRow" key={c.key}>
              <div className="taxManualRowHead"><span>{c.label}</span></div>
              <div className="taxManualRowBody">
                <div className="taxManualRowStat"><span>Tracked in PropRoster</span><strong>{moneyStr(value.tracked)}</strong></div>
                <label className="taxManualRowInput evalField">
                  <span>Manual tax entry (override)</span>
                  <div className="evalInputWrap">
                    <input inputMode="decimal" value={draftFields[c.manualField as keyof ManualTaxFields]} onChange={(e) => updateField(c.manualField as keyof ManualTaxFields, e.target.value)} placeholder="Leave blank to use tracked" />
                    <span className="evalSuffix">$</span>
                  </div>
                </label>
                <div className="taxManualRowStat taxManualRowEffective"><span>Tax Center amount</span><strong>{moneyStr(value.effective)}</strong></div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="taxPanelGroup">
        <h4>Additional information</h4>
        <label className="fullField">Notes<textarea rows={3} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); setSaved(false) }} placeholder="e.g. Property tax figure from county bill; mortgage interest from Form 1098" /></label>
        <label className="fullField">Supporting document (optional)
          <select value={documentId} onChange={(e) => { setDocumentId(e.target.value); setDirty(true); setSaved(false) }}>
            <option value="">No attachment</option>
            {documentOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="errorMessage">{error}</p>}
      <div className="taxPanelSave">
        {saved && !dirty && <span className="muted taxPanelSavedNote">Saved.</span>}
        {dirty && <span className="muted taxPanelSavedNote">Unsaved changes</span>}
        <button type="button" className="primary" disabled={saving || validationProblems.length > 0} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save manual tax entries'}
        </button>
      </div>
    </div>
  )
}
