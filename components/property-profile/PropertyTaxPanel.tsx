'use client'

// Annual property totals use the existing tax records and calculation engine.
// A blank amount uses the ledger total; a manual amount replaces it, never adds
// to it. Categories start collapsed, with one amount field per category.
// TaxAmountInput preserves the browser's editing buffer during recalculations.

import { useEffect, useMemo, useState } from 'react'
import { PropertyExpenseEntry } from './PropertyExpenseEntry'
import { TaxAmountInput } from './TaxAmountInput'
import { parseTaxAmount } from '../../lib/tax-center/amount-input'
import type { SupabaseClient } from '@supabase/supabase-js'
import { filterTransactionsForYear, getAvailableTaxYears, sumByCategory } from '../../lib/tax-center/aggregate'
import {
  buildCategoryBreakdown, categoriesInGroup, emptyManualFields, emptyMileageFields,
  OPERATING_EXPENSE_LIKE_GROUPS, type ManualTaxFields, type MileageFields, type TaxCategoryGroup,
} from '../../lib/tax-center/manual-entry'
import { CUSTOM_ITEM_GROUPS, CUSTOM_ITEM_GROUP_LABELS, customItemsForPanelGroup, type CustomTaxItem, type CustomTaxItemGroup } from '../../lib/tax-center/custom-items'
import { isIncomeCategory, isOperatingExpenseCategory, isCapitalExpenseCategory } from '../../lib/tax-center/categories'
import type { TransactionInput, MaintenanceRecordInput as _MaintenanceRecordInput } from '../../lib/tax-center/types'
import { beginReadingFileBytes, toDurableUploadableFile } from '../../lib/uploads/durable-file'
import { uploadReceiptDocument } from '../../lib/documents/upload-receipt'
import { toSafeErrorMessage } from '../../lib/user-facing-errors'

export type PropertyTaxRecordRow = ManualTaxFields & MileageFields & {
  id: string
  property_id: string
  owner_id: string
  tax_year: number
  notes: string | null
  document_id: string | null
}

export type CustomTaxItemRow = {
  id: string
  property_id: string
  owner_id: string
  tax_year: number
  tax_record_id: string | null
  description: string
  amount: number
  category_group: CustomTaxItemGroup
  notes: string | null
  document_id: string | null
}

type DocumentOption = { id: string; name: string; category: string }

const MANUAL_FIELD_KEYS = Object.keys(emptyManualFields()) as (keyof ManualTaxFields)[]

function moneyStr(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0)
}

type DraftFields = { [K in keyof ManualTaxFields]: string }

function draftFromRecord(record: PropertyTaxRecordRow | undefined): { fields: DraftFields; notes: string; documentId: string; mileage: string; mileageNotes: string } {
  const fields = {} as DraftFields
  for (const key of MANUAL_FIELD_KEYS) {
    const value = record ? record[key] : null
    fields[key] = value === null || value === undefined ? '' : String(value)
  }
  return {
    fields, notes: record?.notes || '', documentId: record?.document_id || '',
    mileage: record?.business_mileage === null || record?.business_mileage === undefined ? '' : String(record.business_mileage),
    mileageNotes: record?.business_mileage_notes || '',
  }
}

function draftToManualFields(fields: DraftFields): ManualTaxFields {
  const out = {} as ManualTaxFields
  for (const key of MANUAL_FIELD_KEYS) {
    const raw = fields[key].trim()
    out[key] = parseTaxAmount(raw)
  }
  return out
}

// A group section's title/hint copy — kept in one place so the JSX below
// stays a simple map over TaxCategoryGroup rather than repeating prose.
const GROUP_META: Record<TaxCategoryGroup, { title: string; hint?: string }> = {
  income: { title: 'Income' },
  operatingExpense: { title: 'Property & Operating Expenses' },
  professional: {
    title: 'Professional & Administrative',
    hint: 'Organizational categories only — PropRoster does not guarantee deductibility of any of these. Review with your tax professional.',
  },
  travel: {
    title: 'Travel & Vehicle',
    hint: 'Business mileage is recorded as a QUANTITY (miles), not a dollar amount — PropRoster never converts it to a deduction using a mileage rate. Tax rates and rules change; review the correct treatment with your tax professional.',
  },
  meals: {
    title: 'Meals',
    hint: 'Record meals associated with rental-property business activity. Tax treatment and limitations can vary. Review with your tax professional. PropRoster never assumes any particular deductible percentage — the amount stored is always your own recorded total.',
  },
  financing: {
    title: 'Mortgage & Financing',
    hint: 'Enter the mortgage interest amount from your lender statement or Form 1098. PropRoster does not calculate this from mortgage payments, and never treats loan principal as deductible.',
  },
  capital: {
    title: 'Capital & Depreciable Items',
    hint: 'Kept separate from operating expenses — capital and depreciable items are typically depreciated over time, not deducted immediately. Review the correct treatment with your tax professional.',
  },
}

const GROUP_ORDER: TaxCategoryGroup[] = ['income', 'operatingExpense', 'professional', 'travel', 'meals', 'financing', 'capital']
// Start with a short category list; expand only the section being reviewed.
const DEFAULT_EXPANDED_GROUPS: TaxCategoryGroup[] = []

function emptyCustomItemDraft(): { description: string; amount: string; group: CustomTaxItemGroup; notes: string; documentId: string } {
  return { description: '', amount: '', group: 'operatingExpense', notes: '', documentId: '' }
}

export function PropertyTaxPanel({
  supabase, propertyId, ownerId, transactions, maintenanceRecords, documents, taxRecords, customItems, onRefresh, onScanReceipt,
}: {
  supabase: SupabaseClient
  propertyId: string
  ownerId: string
  transactions: TransactionInput[]
  maintenanceRecords: _MaintenanceRecordInput[]
  documents: DocumentOption[]
  taxRecords: PropertyTaxRecordRow[]
  customItems: CustomTaxItemRow[]
  onRefresh: () => void
  onScanReceipt?: () => void
}) {
  const availableYears = useMemo(() => getAvailableTaxYears(transactions), [transactions])
  const [year, setYear] = useState<string>(availableYears[0] || String(new Date().getFullYear()))
  const existingRecord = useMemo(() => taxRecords.find((r) => r.property_id === propertyId && String(r.tax_year) === year), [taxRecords, year, propertyId])
  const [draftFields, setDraftFields] = useState<DraftFields>(() => draftFromRecord(existingRecord).fields)
  const [notes, setNotes] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [mileage, setMileage] = useState('')
  const [mileageNotes, setMileageNotes] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<TaxCategoryGroup>>(new Set(DEFAULT_EXPANDED_GROUPS))
  const [customItemsExpanded, setCustomItemsExpanded] = useState(false)

  // Custom Tax Items — its own small add/edit form, independent of the
  // fixed-category draft/save flow above (a separate table, a separate
  // write path — see supabase/milestone-23-tax-center-v3.sql).
  const [customItemFormOpenId, setCustomItemFormOpenId] = useState<string | null>(null) // an existing item's id, or 'new'
  const [customItemDraft, setCustomItemDraft] = useState(emptyCustomItemDraft())
  const [customItemSaving, setCustomItemSaving] = useState(false)
  const [customItemError, setCustomItemError] = useState('')
  // Usability/workflow-completion pass — Section 3 ("complete the
  // receipt gap"): a custom item could previously only ATTACH an
  // already-uploaded document via the dropdown below, never capture/
  // upload a new one inline. A newly chosen file here takes priority
  // over customItemDraft.documentId at save time (see saveCustomItem) —
  // the two controls are mutually exclusive, never combined.
  const [customItemReceiptFile, setCustomItemReceiptFile] = useState<File | null>(null)
  const [customItemReceiptBytesPromise, setCustomItemReceiptBytesPromise] = useState<Promise<ArrayBuffer> | null>(null)

  // Re-populate the draft whenever the year changes (or the parent's
  // taxRecords refreshes after a save) — never while the user still has
  // unsaved edits in progress for the CURRENT year, so a background
  // refresh can't clobber what they're mid-typing.
  useEffect(() => {
    if (dirty) return
    const { fields, notes: n, documentId: d, mileage: m, mileageNotes: mn } = draftFromRecord(existingRecord)
    setDraftFields(fields)
    setNotes(n)
    setDocumentId(d)
    setMileage(m)
    setMileageNotes(mn)
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

  function toggleGroup(group: TaxCategoryGroup) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
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

  const yearCustomItems = useMemo(() => customItems.filter((i) => i.property_id === propertyId && String(i.tax_year) === year), [customItems, propertyId, year])
  // Mapped once to the same CustomTaxItem shape lib/tax-center's pure
  // functions already use (aggregate.ts/custom-items.ts) — so
  // customItemsForPanelGroup below is the EXACT SAME, already-tested
  // function computePropertyTaxSummary uses to decide what counts toward
  // operatingExpenses/capitalImprovements/financingOtherTotal, not a
  // second, panel-local reimplementation of that rule.
  const yearCustomItemsMapped: CustomTaxItem[] = useMemo(() => yearCustomItems.map((r) => ({
    id: r.id, propertyId: r.property_id, taxYear: r.tax_year, description: r.description,
    amount: Number(r.amount), group: r.category_group, notes: r.notes, documentId: r.document_id,
  })), [yearCustomItems])

  // The ONE place a group's displayed subtotal is computed — fixed
  // categories' effective amounts plus any custom item tagged into this
  // same group (via customItemsForPanelGroup, imported from
  // custom-items.ts — see its own comment for the "other" → operatingExpense
  // attribution), added exactly once each. This is presentational only
  // (it never writes anywhere); the real Tax Center total this must
  // match is computePropertyTaxSummary's own operatingExpenses/
  // capitalImprovements/financingOtherTotal, which apply the identical
  // rule via the same shared functions — never a second, competing
  // calculation.
  function groupTotal(group: TaxCategoryGroup): number {
    const fixed = categoriesInGroup(group).reduce((sum, c) => sum + breakdown[c.key].effective, 0)
    const custom = customItemsForPanelGroup(yearCustomItemsMapped, group).reduce((sum, i) => sum + i.amount, 0)
    return fixed + custom
  }

  // Property-First Simplification and Visual Cleanup: "Prioritize at
  // first glance: tax year, a concise annual property tax summary...".
  // Not a new calculation — just composing the SAME groupTotal() calls
  // the collapsible groups below already use, the same way
  // OPERATING_EXPENSE_LIKE_GROUPS already defines "operating-expense-like"
  // for lib/tax-center/manual-entry.ts's own aggregation. If this ever
  // drifts from the groups' own totals, that's a bug in groupTotal, not
  // a second source of truth.
  const summaryGrossIncome = groupTotal('income')
  const summaryOperatingExpenses = OPERATING_EXPENSE_LIKE_GROUPS.reduce((sum, g) => sum + groupTotal(g), 0)
  const summaryNetResult = summaryGrossIncome - summaryOperatingExpenses

  function invalidFields(): string[] {
    const problems: string[] = []
    for (const key of MANUAL_FIELD_KEYS) {
      const raw = draftFields[key].trim()
      if (raw === '') continue
      const n = parseTaxAmount(raw)
      if (!Number.isFinite(n)) problems.push(key)
      else if (n !== null && n < 0) problems.push(key)
    }
    const rawMileage = mileage.trim()
    if (rawMileage !== '') {
      const n = Number(rawMileage)
      if (!Number.isFinite(n) || n < 0) problems.push('business_mileage')
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
      business_mileage: mileage.trim() === '' ? null : Number(mileage.trim()),
      business_mileage_notes: mileageNotes.trim() || null,
      notes: notes.trim() || null,
      document_id: documentId || null,
    }
    try {
      const { error: saveError } = await supabase.from('property_tax_records').upsert(payload, { onConflict: 'property_id,tax_year' })
      if (saveError) { setError(toSafeErrorMessage(saveError, 'Unable to save your tax figures.')); return }
      setDirty(false)
      setSaved(true)
      onRefresh()
    } catch {
      setError('Unable to save right now. Your entries are still here. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const documentOptions = documents.filter((d) => ['Tax', 'Receipts', 'Other'].includes(d.category))

  // -- Custom Tax Items -----------------------------------------------

  function openAddCustomItem() {
    setCustomItemDraft(emptyCustomItemDraft())
    setCustomItemReceiptFile(null)
    setCustomItemReceiptBytesPromise(null)
    setCustomItemError('')
    setCustomItemFormOpenId('new')
  }

  function openEditCustomItem(item: CustomTaxItemRow) {
    setCustomItemDraft({
      description: item.description, amount: String(item.amount), group: item.category_group,
      notes: item.notes || '', documentId: item.document_id || '',
    })
    setCustomItemReceiptFile(null)
    setCustomItemReceiptBytesPromise(null)
    setCustomItemError('')
    setCustomItemFormOpenId(item.id)
  }

  function closeCustomItemForm() {
    if (customItemSaving) return
    setCustomItemFormOpenId(null)
    setCustomItemError('')
  }

  async function saveCustomItem() {
    const description = customItemDraft.description.trim()
    const amount = parseTaxAmount(customItemDraft.amount)
    if (!description) { setCustomItemError('Enter a description for this item.'); return }
    if (amount === null || !Number.isFinite(amount) || amount < 0) { setCustomItemError('Enter a valid, non-negative amount.'); return }
    setCustomItemSaving(true)
    setCustomItemError('')

    try {
      // Section 3 — a newly attached file takes priority over whatever was
      // picked in the "existing document" dropdown; uploaded FIRST, exactly
      // like the new Tax Center "+ Add Expense" flow, so a failed upload
      // never saves an item that silently lost its receipt.
      let documentId = customItemDraft.documentId || null
      if (customItemReceiptFile && customItemReceiptBytesPromise) {
        const durable = await toDurableUploadableFile(customItemReceiptFile, customItemReceiptFile.type || undefined, customItemReceiptBytesPromise)
        const uploadResult = await uploadReceiptDocument(ownerId, propertyId, durable.file, {
          uploadFile: async (path, file, contentType) => {
            const { error: uploadError } = await supabase.storage.from('property-documents').upload(path, file, { contentType, upsert: false })
            return { error: uploadError?.message || null }
          },
          insertDocumentRow: async (row) => {
            const { data, error: rowError } = await supabase.from('property_documents').insert(row).select('id').single()
            return { id: (data?.id as string) || null, error: rowError?.message || null }
          },
          removeFile: async (path) => { await supabase.storage.from('property-documents').remove([path]) },
        })
        if (!uploadResult.ok) {
          setCustomItemError(`Item not saved — the receipt could not be uploaded. ${toSafeErrorMessage(uploadResult.error, 'Try again, or save without a receipt.')}`)
          return
        }
        documentId = uploadResult.documentId
      }

      const payload = {
        property_id: propertyId,
        owner_id: ownerId,
        tax_year: Number(year),
        // Best-effort link to the parent annual record where one already
        // exists — never required (see the migration's own comment); a
        // custom item's real identity keys are property_id + tax_year.
        tax_record_id: existingRecord?.id || null,
        description,
        amount,
        category_group: customItemDraft.group,
        notes: customItemDraft.notes.trim() || null,
        document_id: documentId,
      }
      const { error: saveError } = customItemFormOpenId === 'new'
        ? await supabase.from('property_tax_custom_items').insert(payload)
        : await supabase.from('property_tax_custom_items').update(payload).eq('id', customItemFormOpenId)
      if (saveError) {
        setCustomItemError(toSafeErrorMessage(saveError, 'Unable to save this item.'))
        return
      }
      setCustomItemFormOpenId(null)
      onRefresh()
    } catch {
      setCustomItemError('Unable to save this item. Your entries are still here. Check Documents before retrying a receipt upload.')
    } finally {
      setCustomItemSaving(false)
    }
  }

  async function removeCustomItem(item: CustomTaxItemRow) {
    if (!window.confirm(`Remove "${item.description}" from this property's ${year} tax items?`)) return
    const { error: deleteError } = await supabase.from('property_tax_custom_items').delete().eq('id', item.id)
    if (deleteError) { setCustomItemError(toSafeErrorMessage(deleteError, 'Unable to delete this item.')); return }
    onRefresh()
  }

  const customItemsTotal = yearCustomItems.reduce((sum, i) => sum + Number(i.amount), 0)

  return (
    <div className="taxPanel taxPanelSimple">
      <div className="taxPanelHead">
        <div>
          <p className="eyebrow">INCOME &amp; EXPENSES</p>
          <p className="muted">Add expenses below or scan a receipt. Your saved entries build the yearly totals.</p>
        </div>
        <label className="taxPanelYear">
          Tax year
          <select value={year} onChange={(e) => changeYear(e.target.value)}>
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>

      {/* Concise annual summary — the comprehensive category list below
          stays exactly as comprehensive as V3 built it, but the FIRST
          thing a landlord sees is three numbers, not seven collapsible
          groups. */}
      <div className="taxSummaryStrip">
        <div><span>Gross income</span><strong>{moneyStr(summaryGrossIncome)}</strong></div>
        <div><span>Operating expenses</span><strong>{moneyStr(summaryOperatingExpenses)}</strong></div>
        <div className="taxSummaryNet"><span>Net result</span><strong>{moneyStr(summaryNetResult)}</strong></div>
      </div>

      {existingRecord && MANUAL_FIELD_KEYS.some(key=>existingRecord[key] !== null && existingRecord[key] !== undefined) && <p className="taxOverrideNotice">Annual adjustments are active. They replace tracked amounts for those categories; review them below if you want to use the expense log totals instead.</p>}
      <PropertyExpenseEntry key={`${propertyId}-${year}`} year={year} client={supabase} propertyId={propertyId} ownerId={ownerId} onSaved={onRefresh} onScanReceipt={onScanReceipt} />
      {yearTransactions.length > 0 && <section className="propertyExpenseHistory"><h3>Recent entries · {year}</h3>{[...yearTransactions].sort((a,b)=>b.transaction_date.localeCompare(a.transaction_date)).slice(0,8).map(entry=><div key={entry.id}><span><strong>{entry.category}</strong><small>{entry.category} · {entry.transaction_date}</small></span><strong>{entry.transaction_type === 'Income' ? '+' : ''}{moneyStr(Number(entry.amount))}</strong></div>)}</section>}
      <details className="taxAnnualAdjustments"><summary>Annual totals &amp; adjustments</summary>
        <p className="muted">Optional totals from annual statements. These replace tracked amounts in the selected category. Use Add an expense above for individual payments.</p>
      {GROUP_ORDER.map((group) => {
        const meta = GROUP_META[group]
        const expanded = expandedGroups.has(group)
        const total = groupTotal(group)
        return (
          <div className="taxPanelGroup taxPanelGroupCollapsible" key={group}>
            <button type="button" className="taxPanelGroupToggle" aria-expanded={expanded} onClick={() => toggleGroup(group)}>
              <span className="taxPanelGroupToggleTitle">
                <span className={`taxPanelChevron ${expanded ? 'open' : ''}`} aria-hidden="true">▸</span>
                <h4>{meta.title}</h4>
              </span>
              <span className="taxPanelGroupTotal">{moneyStr(total)}</span>
            </button>

            {expanded && <div className="taxPanelGroupBody">
              {meta.hint && <p className="muted taxPanelHint">{meta.hint}</p>}

              {group === 'travel' && (
                <div className="taxManualRow taxMileageRow">
                  <div className="taxManualRowHead"><span>Business mileage</span></div>
                  <div className="taxManualRowBody taxMileageRowBody">
                    <label className="evalField taxMileageInput">
                      <span>Annual business miles</span>
                      <div className="evalInputWrap">
                        <input inputMode="decimal" value={mileage} onChange={(e) => { setMileage(e.target.value); setDirty(true); setSaved(false) }} placeholder="0" />
                        <span className="evalSuffix">mi</span>
                      </div>
                    </label>
                    <label className="fullField taxMileageNotes">
                      Notes
                      <input value={mileageNotes} onChange={(e) => { setMileageNotes(e.target.value); setDirty(true); setSaved(false) }} placeholder="e.g. Trips to inspect the property, meet contractors" />
                    </label>
                  </div>
                  <p className="muted taxPanelHint">Recorded as a quantity only — PropRoster does not calculate a dollar deduction from mileage.</p>
                </div>
              )}

              {categoriesInGroup(group).map((c) => {
                const value = breakdown[c.key]
                const hasTrackedSource = c.trackedCategory !== null
                return (
                  <div className="taxAmountRow" key={c.key}>
                    <div className="taxAmountRowInfo">
                      <strong>{c.label}</strong>
                      <small>{hasTrackedSource ? `Tracked: ${moneyStr(value.tracked)}. Leave blank to use this.` : 'Enter the annual total.'}</small>
                    </div>
                    <label className="taxAmountRowField">
                      <span className="taxAmountCurrency" aria-hidden="true">$</span>
                      <TaxAmountInput key={`${propertyId}-${year}-${c.manualField}`} label={`${c.label} annual amount`} value={draftFields[c.manualField as keyof ManualTaxFields]} onChange={(text) => updateField(c.manualField as keyof ManualTaxFields, text)} placeholder={hasTrackedSource ? String(value.tracked) : '0.00'} invalid={validationProblems.includes(c.manualField as string)} />
                    </label>
                  </div>
                )
              })}

              {/* Custom items tagged into THIS group — read-only here
                  (editing/removing stays in the single "Other Tax Items"
                  section below, so there's only one place that writes
                  to property_tax_custom_items) so the landlord can see
                  exactly why this group's subtotal is what it is. Each
                  item still contributes to the total exactly once —
                  this list and groupTotal() above both read the SAME
                  customItemsForPanelGroup(yearCustomItemsMapped, group)
                  array; nothing here re-sums or duplicates it. */}
              {customItemsForPanelGroup(yearCustomItemsMapped, group).length > 0 && (
                <div className="taxCustomItemGroupList">
                  <p className="muted taxPanelHint">Custom items counted in this total (manage them in Other Tax Items below):</p>
                  {customItemsForPanelGroup(yearCustomItemsMapped, group).map((item) => (
                    <div className="taxCustomItemGroupRow" key={item.id}>
                      <span>{item.description}{item.group === 'other' ? ' · Other' : ''}</span>
                      <strong>{moneyStr(item.amount)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>}
          </div>
        )
      })}

      {/* Other Tax Items — Custom Tax Items (property_tax_custom_items).
          A landlord/property/year-specific record for anything the fixed
          categories above don't fit — its own explicit line, never
          silently altering a standard category's own value. */}
      <div className="taxPanelGroup taxPanelGroupCollapsible">
        <button type="button" className="taxPanelGroupToggle" aria-expanded={customItemsExpanded} onClick={() => setCustomItemsExpanded((v) => !v)}>
          <span className="taxPanelGroupToggleTitle">
            <span className={`taxPanelChevron ${customItemsExpanded ? 'open' : ''}`} aria-hidden="true">▸</span>
            <h4>Other Tax Items</h4>
          </span>
          <span className="taxPanelGroupTotal">{yearCustomItems.length > 0 ? `${moneyStr(customItemsTotal)} · ${yearCustomItems.length} item${yearCustomItems.length === 1 ? '' : 's'}` : 'None yet'}</span>
        </button>

        {customItemsExpanded && <div className="taxPanelGroupBody">
          <p className="muted taxPanelHint">Add a named expense when it does not fit the standard categories. It is included in its selected category once.</p>

          {yearCustomItems.length > 0 && <div className="taxCustomItemList">
            {yearCustomItems.map((item) => (
              <div className="taxCustomItemRow" key={item.id}>
                <div className="taxCustomItemMain">
                  <strong>{item.description}</strong>
                  <span className="muted">{CUSTOM_ITEM_GROUP_LABELS[item.category_group]} · Manual{item.notes ? ` · ${item.notes}` : ''}</span>
                </div>
                <div className="taxCustomItemAmount">{moneyStr(item.amount)}</div>
                <div className="rowActions">
                  <button type="button" onClick={() => openEditCustomItem(item)}>Edit</button>
                  <button type="button" onClick={() => void removeCustomItem(item)}>Remove</button>
                </div>
              </div>
            ))}
          </div>}

          {customItemFormOpenId ? (
            <div className="taxCustomItemForm">
              <div className="formGrid">
                <label className="fullField">Description
                  <input value={customItemDraft.description} onChange={(e) => setCustomItemDraft((d) => ({ ...d, description: e.target.value }))} placeholder="e.g. Storm damage tarp rental" />
                </label>
                <label>Amount
                  <TaxAmountInput label="Other tax item amount" value={customItemDraft.amount} onChange={(amount) => setCustomItemDraft((d) => ({ ...d, amount }))} />
                </label>
                <label>Category / group
                  <select value={customItemDraft.group} onChange={(e) => setCustomItemDraft((d) => ({ ...d, group: e.target.value as CustomTaxItemGroup }))}>
                    {CUSTOM_ITEM_GROUPS.map((g) => <option key={g} value={g}>{CUSTOM_ITEM_GROUP_LABELS[g]}</option>)}
                  </select>
                </label>
                <label className="fullField">Notes
                  <input value={customItemDraft.notes} onChange={(e) => setCustomItemDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Optional" />
                </label>
                <label className="fullField">Existing document (optional)
                  <select value={customItemDraft.documentId} disabled={!!customItemReceiptFile} onChange={(e) => setCustomItemDraft((d) => ({ ...d, documentId: e.target.value }))}>
                    <option value="">No attachment</option>
                    {documentOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
                <label className="fullField taxCenterReceiptField">Or upload a new receipt <span className="muted">(optional)</span>
                  <label className="secondary taxCenterReceiptButton">
                    {customItemReceiptFile ? customItemReceiptFile.name : 'Add photo or file'}
                    <input type="file" accept="image/*,.pdf,application/pdf" onChange={(e) => {
                      const file = e.target.files?.[0]
                      const bytesPromise = file ? beginReadingFileBytes(file) : null
                      e.target.value = ''
                      if (file && bytesPromise) { setCustomItemReceiptFile(file); setCustomItemReceiptBytesPromise(bytesPromise) }
                    }} />
                  </label>
                  {customItemReceiptFile && <button type="button" className="taxCenterReceiptRemove" onClick={() => { setCustomItemReceiptFile(null); setCustomItemReceiptBytesPromise(null) }}>Remove</button>}
                </label>
              </div>
              {customItemError && <p className="errorMessage">{customItemError}</p>}
              <div className="modalActions compactActions">
                <button type="button" className="secondary" onClick={closeCustomItemForm}>Cancel</button>
                <button type="button" className="primary" disabled={customItemSaving} onClick={() => void saveCustomItem()}>{customItemSaving ? 'Saving…' : 'Save item'}</button>
              </div>
            </div>
          ) : (
            <button type="button" className="secondary" onClick={openAddCustomItem}>+ Add Other Tax Item</button>
          )}
        </div>}
      </div>

      <details className="taxPanelGroup taxAdditionalInfo">
        <summary>Notes &amp; supporting document</summary>
        <label className="fullField">Notes<textarea rows={3} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); setSaved(false) }} placeholder="e.g. Property tax figure from county bill; mortgage interest from Form 1098" /></label>
        <label className="fullField">Supporting document (optional)
          <select value={documentId} onChange={(e) => { setDocumentId(e.target.value); setDirty(true); setSaved(false) }}>
            <option value="">No attachment</option>
            {documentOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      </details>

      {error && <p className="errorMessage">{error}</p>}
      <div className="taxPanelSave">
        {saved && !dirty && <span className="muted taxPanelSavedNote">Saved.</span>}
        {dirty && <span className="muted taxPanelSavedNote">Unsaved changes</span>}
        {validationProblems.length > 0 && <span className="errorMessage" role="status">Check the highlighted amounts. Use a positive number, such as 1,250.50.</span>}
        <button type="button" className="primary" disabled={saving || !dirty || validationProblems.length > 0} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save tax totals'}
        </button>
      </div>
      </details>
    </div>
  )
}
