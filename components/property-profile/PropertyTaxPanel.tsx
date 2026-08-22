'use client'

// PropRoster — Tax Center: property-level "Tax & Financials" panel.
//
// Self-contained (owns its own Supabase reads/writes), same pattern as
// PropertySystemsPanel/PropertyNotesPanel — the parent (app/page.tsx)
// only supplies what it already has loaded (this property's
// transactions/maintenance records/documents/tax records/custom tax
// items) and an onRefresh to re-pull the parent's own data after a save.
//
// One property_tax_records row per (property, tax year) — switching the
// year here loads (or starts a blank draft for) that year's row. Every
// manual field is optional — a blank field means "no manual entry,"
// which falls back to PropRoster's tracked ledger total, never to zero
// (lib/tax-center/manual-entry.ts's computeCategoryValue is the single
// place that rule lives; this panel only ever sends what the user
// actually typed, never invents a value).
//
// Tax Center V3 ("More capability, less visible complexity"): the flat
// category list is now organized into COLLAPSIBLE groups — Income,
// Property & Operating Expenses, Professional & Administrative, Travel &
// Vehicle (+ a separate mileage QUANTITY, never a dollar figure),
// Meals, Mortgage & Financing, Capital & Depreciable Items, and Other
// Tax Items (custom, landlord-defined records via the new
// property_tax_custom_items table). Every dollar category still shows
// the same three numbers V2 established — Tracked in PropRoster, Manual
// tax entry, Tax Center amount — so the source of every figure stays
// unambiguous; for a category with no possible tracked source at all
// (every V3 category, and most of V2's), the Tracked stat is presented
// as "Not tracked — manual entry only," never a misleading $0.
//
// Each category row shows all three numbers the spec asks for: Tracked
// in PropRoster, Manual tax entry, and the resulting Tax Center amount
// — so the source of every figure is never ambiguous, and entering a
// manual value visibly REPLACES the tracked one instead of silently
// stacking on top of it.

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { filterTransactionsForYear, getAvailableTaxYears, sumByCategory } from '../../lib/tax-center/aggregate'
import {
  buildCategoryBreakdown, categoriesInGroup, emptyManualFields, emptyMileageFields,
  type ManualTaxFields, type MileageFields, type TaxCategoryGroup,
} from '../../lib/tax-center/manual-entry'
import { CUSTOM_ITEM_GROUPS, CUSTOM_ITEM_GROUP_LABELS, type CustomTaxItemGroup } from '../../lib/tax-center/custom-items'
import { isIncomeCategory, isOperatingExpenseCategory, isCapitalExpenseCategory } from '../../lib/tax-center/categories'
import type { TransactionInput, MaintenanceRecordInput as _MaintenanceRecordInput } from '../../lib/tax-center/types'

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
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0)
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
    out[key] = raw === '' ? null : Number(raw)
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
// Property-First UX Cleanup precedent + this milestone's own "more
// capability, less visible complexity": the groups a landlord uses on
// nearly every property stay open by default; the less-common ones
// start collapsed but are always one click away, and their own header
// still shows a running total even while closed.
const DEFAULT_EXPANDED_GROUPS: TaxCategoryGroup[] = ['income', 'operatingExpense', 'financing']

function emptyCustomItemDraft(): { description: string; amount: string; group: CustomTaxItemGroup; notes: string; documentId: string } {
  return { description: '', amount: '', group: 'operatingExpense', notes: '', documentId: '' }
}

export function PropertyTaxPanel({
  supabase, propertyId, ownerId, transactions, maintenanceRecords, documents, taxRecords, customItems, onRefresh,
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
}) {
  const availableYears = useMemo(() => getAvailableTaxYears(transactions), [transactions])
  const [year, setYear] = useState<string>(availableYears[0] || String(new Date().getFullYear()))
  const existingRecord = useMemo(() => taxRecords.find((r) => String(r.tax_year) === year), [taxRecords, year])
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

  function groupTotal(group: TaxCategoryGroup): number {
    return categoriesInGroup(group).reduce((sum, c) => sum + breakdown[c.key].effective, 0)
  }

  function invalidFields(): string[] {
    const problems: string[] = []
    for (const key of MANUAL_FIELD_KEYS) {
      const raw = draftFields[key].trim()
      if (raw === '') continue
      const n = Number(raw)
      if (!Number.isFinite(n)) problems.push(key)
      else if (n < 0) problems.push(key)
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

  // -- Custom Tax Items -----------------------------------------------

  function openAddCustomItem() {
    setCustomItemDraft(emptyCustomItemDraft())
    setCustomItemError('')
    setCustomItemFormOpenId('new')
  }

  function openEditCustomItem(item: CustomTaxItemRow) {
    setCustomItemDraft({
      description: item.description, amount: String(item.amount), group: item.category_group,
      notes: item.notes || '', documentId: item.document_id || '',
    })
    setCustomItemError('')
    setCustomItemFormOpenId(item.id)
  }

  function closeCustomItemForm() {
    setCustomItemFormOpenId(null)
    setCustomItemError('')
  }

  async function saveCustomItem() {
    const description = customItemDraft.description.trim()
    const amount = Number(customItemDraft.amount)
    if (!description) { setCustomItemError('Enter a description for this item.'); return }
    if (!Number.isFinite(amount) || amount < 0) { setCustomItemError('Enter a valid, non-negative amount.'); return }
    setCustomItemSaving(true)
    setCustomItemError('')
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
      document_id: customItemDraft.documentId || null,
    }
    const { error: saveError } = customItemFormOpenId === 'new'
      ? await supabase.from('property_tax_custom_items').insert(payload)
      : await supabase.from('property_tax_custom_items').update(payload).eq('id', customItemFormOpenId)
    setCustomItemSaving(false)
    if (saveError) {
      setCustomItemError(saveError.message)
      return
    }
    setCustomItemFormOpenId(null)
    onRefresh()
  }

  async function removeCustomItem(item: CustomTaxItemRow) {
    if (!window.confirm(`Remove "${item.description}" from this property's ${year} tax items?`)) return
    const { error: deleteError } = await supabase.from('property_tax_custom_items').delete().eq('id', item.id)
    if (deleteError) { setCustomItemError(deleteError.message); return }
    onRefresh()
  }

  const customItemsTotal = yearCustomItems.reduce((sum, i) => sum + Number(i.amount), 0)

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
                  <div className="taxManualRow" key={c.key}>
                    <div className="taxManualRowHead"><span>{c.label}</span></div>
                    <div className="taxManualRowBody">
                      {hasTrackedSource ? (
                        <div className="taxManualRowStat"><span>Tracked in PropRoster</span><strong>{moneyStr(value.tracked)}</strong></div>
                      ) : (
                        <div className="taxManualRowStat taxManualRowNoTrack"><span>Source</span><strong>Manual entry only</strong></div>
                      )}
                      <label className="taxManualRowInput evalField">
                        <span>Manual tax entry{hasTrackedSource ? ' (override)' : ''}</span>
                        <div className="evalInputWrap">
                          <input inputMode="decimal" value={draftFields[c.manualField as keyof ManualTaxFields]} onChange={(e) => updateField(c.manualField as keyof ManualTaxFields, e.target.value)} placeholder={hasTrackedSource ? 'Leave blank to use tracked' : '0.00'} />
                          <span className="evalSuffix">$</span>
                        </div>
                      </label>
                      <div className="taxManualRowStat taxManualRowEffective"><span>Tax Center amount</span><strong>{moneyStr(value.effective)}</strong></div>
                    </div>
                  </div>
                )
              })}
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
          <p className="muted taxPanelHint">For anything that doesn&apos;t fit a category above — each item counts once, on its own, and is never added to a standard category.</p>

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
                  <input inputMode="decimal" value={customItemDraft.amount} onChange={(e) => setCustomItemDraft((d) => ({ ...d, amount: e.target.value }))} placeholder="0.00" />
                </label>
                <label>Category / group
                  <select value={customItemDraft.group} onChange={(e) => setCustomItemDraft((d) => ({ ...d, group: e.target.value as CustomTaxItemGroup }))}>
                    {CUSTOM_ITEM_GROUPS.map((g) => <option key={g} value={g}>{CUSTOM_ITEM_GROUP_LABELS[g]}</option>)}
                  </select>
                </label>
                <label className="fullField">Notes
                  <input value={customItemDraft.notes} onChange={(e) => setCustomItemDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Optional" />
                </label>
                <label className="fullField">Supporting document (optional)
                  <select value={customItemDraft.documentId} onChange={(e) => setCustomItemDraft((d) => ({ ...d, documentId: e.target.value }))}>
                    <option value="">No attachment</option>
                    {documentOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
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
