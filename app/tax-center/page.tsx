'use client'

// PropRoster — Tax Center (V1 portfolio view + V2 manual entry integration).
//
// An organization and reporting tool for rental-property tax
// information, NOT tax preparation software: it never calculates final
// tax liability, never files anything, and never gives individualized
// tax advice. Every number below is the EFFECTIVE Tax Center amount —
// tracked from financial_transactions (the same ledger app/page.tsx's
// Financials tab reads/writes), replaced by a landlord's manual annual
// entry (property_tax_records, new in V2 — see
// supabase/milestone-22-tax-center-v2.sql) wherever one was entered.
// lib/tax-center/manual-entry.ts's computeCategoryValue is the ONE place
// this override rule lives — manual REPLACES tracked, it is never added
// to it, so nothing here can double-count. See
// lib/tax-center/categories.ts for the (purely informational, never
// authoritative) Schedule E reference mapping.
//
// Scope: only properties with property_type === 'Rental Property' are
// included — Schedule E is specifically for rental real estate, and a
// Primary Residence/Vacation Home/Commercial/Land property raises tax
// questions (personal-use days, business-use %, etc.) this tool isn't
// built to reason about.
//
// Manual entry itself lives on each property's own "Tax & Financials"
// tab (app/page.tsx, components/property-profile/PropertyTaxPanel.tsx) —
// this page is a read-only aggregation/reporting view over whatever was
// entered there, exactly like Tax Center V1 was a read-only view over
// the Financials ledger. Links below jump straight to that tab.
//
// Auth/page-shell pattern mirrors app/documents/page.tsx exactly
// (useAuthUser + AuthHeader + the same authShell/authCard sign-in gate,
// manual window.location.search reads, own RLS-scoped data fetch).
//
// Security: every query below goes through the SAME RLS-scoped client
// every other page uses — no service-role key. property_tax_records'
// own owner-scoped RLS policies (supabase/milestone-22-tax-center-v2.sql)
// are the only thing standing between one user's manual tax entries and
// another's; this page adds no new backend surface of its own.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'
import { AuthHeader } from '../../components/AuthHeader'
import { Wordmark } from '../../components/Wordmark'
import { SCHEDULE_E_REFERENCE, SCHEDULE_E_CAPEX_NOTE, SCHEDULE_E_MORTGAGE_NOTE } from '../../lib/tax-center/categories'
import { computePortfolioTaxSummary, computePropertyTaxSummary, filterTransactionsForYear, getAvailableTaxYears } from '../../lib/tax-center/aggregate'
import { countUnassignedTaxDocuments } from '../../lib/tax-center/readiness'
import { buildTaxCenterCsv } from '../../lib/tax-center/csv-export'
import { categoriesInGroup, OPERATING_EXPENSE_LIKE_GROUPS, type CategoryValue } from '../../lib/tax-center/manual-entry'
import { CUSTOM_ITEM_GROUP_LABELS } from '../../lib/tax-center/custom-items'
import {
  buildTaxCenterFeed, computeTaxCenterYearSummary, filterTaxCenterFeed, groupFeedByMonth, SOURCE_LABELS,
  type RentPaymentLinkInput, type TaxCenterFeedFilters, type TaxCenterFeedItem, type TaxCenterFeedTransactionInput,
} from '../../lib/tax-center/feed'
import { FINANCIAL_CATEGORIES } from '../../lib/property-categories'
import { beginReadingFileBytes, toDurableUploadableFile } from '../../lib/uploads/durable-file'
import { uploadReceiptDocument } from '../../lib/documents/upload-receipt'
import { HomeIcon, WrenchIcon, ReceiptIcon } from '../../components/icons/NavIcons'
import type { CustomTaxItemInput, MaintenanceRecordInput, PropertyInput, PropertyTaxSummary, ReadinessStatus, TaxRecordInput, TransactionInput } from '../../lib/tax-center/types'

// Section 2 of this milestone's own spec: "+ Add Expense" is for
// expenses PropRoster doesn't already know about — income categories
// (Rent/Other Income) stay out of this list on purpose, so this control
// can never become a second, competing way to log rental income
// alongside Rent Ledger/the Financials tab's own Income entry.
const ADD_EXPENSE_CATEGORIES = FINANCIAL_CATEGORIES.filter((c) => c !== 'Rent' && c !== 'Other Income')

function emptyExpenseDraft(properties: PropertyInput[]) {
  return {
    amount: '', propertyId: properties[0]?.id || '', category: ADD_EXPENSE_CATEGORIES[0] as string,
    date: new Date().toISOString().slice(0, 10), vendor: '', note: '',
  }
}

// Mobile Visual Refinement pass, Section 9 — reuses the app's existing
// hand-authored icon set (components/icons/NavIcons.tsx), the same one
// MaintenanceCategoryIcon already draws from; no new icon library, no
// decorative icon for a source this feed can't actually resolve.
function TaxCenterSourceIcon({ source }: { source: TaxCenterFeedItem['source'] }) {
  if (source === 'maintenance') return <WrenchIcon />
  if (source === 'rent-ledger') return <HomeIcon />
  return <ReceiptIcon />
}

// Section 11 — "preserve source ownership": a Rent Ledger/Maintenance-
// sourced row may deep-link to that record's own real home tab, reusing
// the EXACT ?openProperty=&openTab= mechanism this page's own "Rental
// properties" table already uses two sections down (app/page.tsx's own
// deep-link handler) — never a second navigation system, and never an
// editor that could mutate a canonical Rent Ledger/Maintenance record
// from inside Tax Center. A manual expense has no such destination yet
// (Tax Center has no transaction editor of its own), so it gets none.
function taxCenterFeedRowHref(item: TaxCenterFeedItem): string | null {
  if (item.source === 'rent-ledger') return `/?openProperty=${item.propertyId}&openTab=Rent&openRentSubTab=Ledger`
  if (item.source === 'maintenance') return `/?openProperty=${item.propertyId}&openTab=Maintenance`
  return null
}

// V3: "Expense totals by category" (on-screen + print) now covers every
// operating-expense-like group — operatingExpense (unchanged from V2)
// plus the new professional/travel/meals groups — matching the exact
// same rule aggregate.ts uses to compute operatingExpenses itself.
const EXPENSE_CATEGORIES = OPERATING_EXPENSE_LIKE_GROUPS.flatMap((g) => categoriesInGroup(g))
const CAPITAL_CATEGORIES = categoriesInGroup('capital')

function money(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0)
}

function readinessPillClass(status: ReadinessStatus): string {
  if (status === 'Ready') return 'pillGood'
  if (status === 'Needs Review') return 'pillWarn'
  return 'pillBad'
}

function sourcePillClass(source: CategoryValue['source']): string {
  if (source === 'manual') return 'pillNeutral'
  if (source === 'tracked') return 'pillGood'
  return 'pillMuted'
}

function sourceLabel(source: CategoryValue['source']): string {
  if (source === 'manual') return 'Manual'
  if (source === 'tracked') return 'Tracked'
  return 'None'
}

export default function TaxCenterPage() {
  const { user, ready } = useAuthUser()

  if (!ready) return <main className="authShell"><div className="loadingState">Loading Tax Center…</div></main>

  if (!user) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Sign in required</h1>
          <p className="authIntro">Sign in to view your Tax Center.</p>
          <Link className="primary authSubmit" href="/">Go to sign in</Link>
        </section>
      </main>
    )
  }

  return <TaxCenterWorkspace />
}

function TaxCenterWorkspace() {
  const { user } = useAuthUser()
  const [properties, setProperties] = useState<PropertyInput[]>([])
  const [transactions, setTransactions] = useState<TransactionInput[]>([])
  // Usability/workflow-completion pass: the SAME financial_transactions
  // rows above, re-fetched with vendor/description too (aggregate.ts's
  // own TransactionInput never needed them — every V3 caller is
  // untouched) — used only by the new activity feed below.
  const [feedTransactions, setFeedTransactions] = useState<TaxCenterFeedTransactionInput[]>([])
  const [rentPayments, setRentPayments] = useState<RentPaymentLinkInput[]>([])
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecordInput[]>([])
  const [taxRecords, setTaxRecords] = useState<(TaxRecordInput & { property_id: string; tax_year: number })[]>([])
  const [customItems, setCustomItems] = useState<CustomTaxItemInput[]>([])
  const [taxDocumentCount, setTaxDocumentCount] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [year, setYear] = useState<string>(String(new Date().getFullYear()))
  const [expandedPropertyId, setExpandedPropertyId] = useState<string | null>(null)

  // -- Section 1/2/5/7: simplified summary, Add Expense, activity feed, filters --
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [expenseDraft, setExpenseDraft] = useState(() => emptyExpenseDraft([]))
  const [expenseReceiptFile, setExpenseReceiptFile] = useState<File | null>(null)
  const [expenseReceiptBytesPromise, setExpenseReceiptBytesPromise] = useState<Promise<ArrayBuffer> | null>(null)
  const [expenseSaving, setExpenseSaving] = useState(false)
  const [expenseError, setExpenseError] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [feedFilters, setFeedFilters] = useState<TaxCenterFeedFilters>({})

  // Section 8 — attaching a receipt directly from a "No receipt" row,
  // for MANUAL rows only (see attachReceiptToTransaction's own comment
  // for why this is safe: it never touches a Rent Ledger/Maintenance-
  // owned record). Keyed by transaction id so only the one row being
  // acted on shows "Uploading…"/an error, never every row at once.
  const [attachingReceiptId, setAttachingReceiptId] = useState<string | null>(null)
  const [attachReceiptError, setAttachReceiptError] = useState<{ id: string; message: string } | null>(null)

  async function load() {
    if (!supabase) return
    const [propsRes, txRes, maintRes, docsRes, taxRes, customItemsRes, rentRes] = await Promise.all([
      supabase.from('properties').select('id,address,city,property_type').order('address'),
      supabase.from('financial_transactions').select('id,property_id,transaction_date,transaction_type,category,amount,document_id,vendor,description'),
      supabase.from('maintenance_records').select('id,property_id,service_date,category,financial_transaction_id'),
      supabase.from('property_documents').select('id,property_id,category'),
      supabase.from('property_tax_records').select('*'),
      supabase.from('property_tax_custom_items').select('*'),
      supabase.from('rent_payments').select('id,financial_transaction_id'),
    ])
    const firstError = propsRes.error || txRes.error || maintRes.error || docsRes.error || taxRes.error || customItemsRes.error || rentRes.error
    if (firstError) setError(firstError.message)
    setProperties(((propsRes.data as PropertyInput[]) || []).filter((p) => p.property_type === 'Rental Property'))
    setTransactions((txRes.data as TransactionInput[]) || [])
    setFeedTransactions((txRes.data as TaxCenterFeedTransactionInput[]) || [])
    setRentPayments((rentRes.data as RentPaymentLinkInput[]) || [])
    setMaintenanceRecords((maintRes.data as MaintenanceRecordInput[]) || [])
    setTaxDocumentCount(countUnassignedTaxDocuments((docsRes.data as { id: string; property_id: string | null; category: string }[]) || []))
    setTaxRecords((taxRes.data as (TaxRecordInput & { property_id: string; tax_year: number })[]) || [])
    type CustomItemRow = { id: string; property_id: string; tax_year: number; description: string; amount: number; category_group: CustomTaxItemInput['group']; notes: string | null; document_id: string | null }
    setCustomItems(((customItemsRes.data as CustomItemRow[]) || []).map((r) => ({
      id: r.id, propertyId: r.property_id, taxYear: r.tax_year, description: r.description,
      amount: Number(r.amount), group: r.category_group, notes: r.notes, documentId: r.document_id,
    })))
    setLoaded(true)
  }

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    async function initialLoad() {
      await load()
      if (cancelled) return
    }
    void initialLoad()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const availableYears = useMemo(() => getAvailableTaxYears(transactions), [transactions])

  // Default intelligently to the current year, but if the current year
  // has no data at all and a prior year does, land on the most recent
  // year with real data instead of an empty screen — still a real,
  // deliberate choice the user sees and can change, never a silent one.
  useEffect(() => {
    if (!loaded) return
    const currentYear = String(new Date().getFullYear())
    const hasCurrentYearData = transactions.some((t) => t.transaction_date.startsWith(currentYear))
    if (!hasCurrentYearData && availableYears.length > 1 && availableYears.includes(currentYear)) {
      const mostRecentWithData = availableYears.find((y) => y !== currentYear)
      if (mostRecentWithData) setYear(mostRecentWithData)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  const yearTransactions = useMemo(() => filterTransactionsForYear(transactions, year), [transactions, year])
  const yearMaintenance = useMemo(() => maintenanceRecords.filter((m) => m.service_date.startsWith(year)), [maintenanceRecords, year])
  const yearTaxRecordByProperty = useMemo(() => {
    const map = new Map<string, TaxRecordInput>()
    for (const r of taxRecords) {
      if (String(r.tax_year) === year) map.set(r.property_id, r)
    }
    return map
  }, [taxRecords, year])
  const yearCustomItems = useMemo(() => customItems.filter((i) => String(i.taxYear) === year), [customItems, year])

  const propertySummaries: PropertyTaxSummary[] = useMemo(
    () => properties.map((p) => computePropertyTaxSummary(p, yearTransactions, yearMaintenance, yearTaxRecordByProperty.get(p.id) || null, yearCustomItems)),
    [properties, yearTransactions, yearMaintenance, yearTaxRecordByProperty, yearCustomItems],
  )
  const portfolio = useMemo(() => computePortfolioTaxSummary(year, propertySummaries), [year, propertySummaries])

  // -- Section 1/2/5/7: simplified summary, activity feed, filters --
  //
  // Deliberately independent of propertySummaries/portfolio above —
  // those stay exactly what V3 built (the category-by-category tax
  // aggregation Property Detail/CSV export/Print read from), untouched.
  // This is a presentation-only view over the SAME year-filtered
  // transactions, so "Income/Expenses/Net" here and the tax-specific
  // Gross Income/Operating Expenses/Net Result further down the page
  // can read slightly differently (this one is a plain income-vs-
  // expense total; that one applies manual overrides and excludes
  // Mortgage/CapEx) — intentional, and each section's own heading says
  // what it is.
  const propertyLabelById = useMemo(() => new Map(properties.map((p) => [p.id, p.address])), [properties])
  const yearFeedTransactions = useMemo(() => filterTransactionsForYear(feedTransactions, year), [feedTransactions, year])
  const feed = useMemo(
    () => buildTaxCenterFeed(yearFeedTransactions, propertyLabelById, rentPayments, yearMaintenance),
    [yearFeedTransactions, propertyLabelById, rentPayments, yearMaintenance],
  )
  const yearSummary = useMemo(() => computeTaxCenterYearSummary(feed), [feed])
  const filteredFeed = useMemo(() => filterTaxCenterFeed(feed, feedFilters), [feed, feedFilters])
  const feedCategories = useMemo(() => Array.from(new Set(feed.map((f) => f.category))).sort(), [feed])
  const activeFilterCount = Object.values(feedFilters).filter(Boolean).length
  // Section 5 — presentation-only month grouping over whatever the
  // filters left visible; never a second source of the feed itself.
  const feedMonthGroups = useMemo(() => groupFeedByMonth(filteredFeed), [filteredFeed])

  function openAddExpense() {
    setExpenseDraft(emptyExpenseDraft(properties))
    setExpenseReceiptFile(null)
    setExpenseReceiptBytesPromise(null)
    setExpenseError('')
    setShowAddExpense(true)
  }

  function closeAddExpense() {
    if (expenseSaving) return
    setShowAddExpense(false)
  }

  async function saveExpense() {
    if (!supabase || !user) return
    const amount = Number(expenseDraft.amount)
    if (!expenseDraft.propertyId) { setExpenseError('Select which property this expense is for.'); return }
    if (!Number.isFinite(amount) || amount <= 0) { setExpenseError('Enter a valid amount.'); return }
    if (!expenseDraft.date) { setExpenseError('Enter a date.'); return }
    setExpenseSaving(true)
    setExpenseError('')
    try {
      // Section 6 — "receipt capture should be part of Add Expense":
      // upload the receipt FIRST (if one was chosen), exactly like every
      // other "attach this to the record it belongs to" flow in this
      // app — a failed receipt upload stops here with a clear error
      // rather than saving an expense that silently lost its receipt.
      let documentId: string | null = null
      if (expenseReceiptFile && expenseReceiptBytesPromise) {
        const durable = await toDurableUploadableFile(expenseReceiptFile, expenseReceiptFile.type || undefined, expenseReceiptBytesPromise)
        const uploadResult = await uploadReceiptDocument(user.id, expenseDraft.propertyId, durable.file, {
          uploadFile: async (path, file, contentType) => {
            const { error: uploadError } = await supabase!.storage.from('property-documents').upload(path, file, { contentType, upsert: false })
            return { error: uploadError?.message || null }
          },
          insertDocumentRow: async (row) => {
            const { data, error: rowError } = await supabase!.from('property_documents').insert(row).select('id').single()
            return { id: (data?.id as string) || null, error: rowError?.message || null }
          },
          removeFile: async (path) => { await supabase!.storage.from('property-documents').remove([path]) },
        })
        if (!uploadResult.ok) {
          setExpenseError(`Expense not saved — the receipt could not be uploaded (${uploadResult.error}). Try again, or save without a receipt.`)
          setExpenseSaving(false)
          return
        }
        documentId = uploadResult.documentId
      }

      const vendor = expenseDraft.vendor.trim() || null
      const note = expenseDraft.note.trim() || null
      // Note is optional (Section 2), but financial_transactions.description
      // is required — fall back to the merchant/payee, then the category,
      // so nothing here ever tries to save a blank description.
      const description = note || vendor || expenseDraft.category

      const { error: insertError } = await supabase.from('financial_transactions').insert({
        owner_id: user.id,
        property_id: expenseDraft.propertyId,
        transaction_date: expenseDraft.date,
        transaction_type: 'Expense',
        category: expenseDraft.category,
        vendor,
        description,
        amount,
        document_id: documentId,
        is_recurring: false,
      })
      if (insertError) {
        setExpenseError(insertError.message)
        return
      }
      setShowAddExpense(false)
      await load()
    } catch (unexpected) {
      setExpenseError(unexpected instanceof Error ? unexpected.message : 'Something went wrong saving this expense. Please try again.')
    } finally {
      setExpenseSaving(false)
    }
  }

  // Section 8 — "if the current architecture makes it safe and
  // straightforward, allow tapping 'No receipt'... to attach a receipt."
  // Safe here because it only ever UPDATES the document_id of a
  // financial_transactions row this owner already has RLS access to
  // (the same table/column/RLS every other receipt attachment in this
  // app already writes through) — never a new relationship, never a
  // Rent Ledger/Maintenance-owned record (callers only invoke this for
  // source === 'manual' rows; see taxCenterFeedRowHref's own comment).
  async function attachReceiptToTransaction(item: TaxCenterFeedItem, file: File, bytesPromise: Promise<ArrayBuffer>) {
    if (!supabase || !user) return
    setAttachingReceiptId(item.id)
    setAttachReceiptError(null)
    try {
      const durable = await toDurableUploadableFile(file, file.type || undefined, bytesPromise)
      const uploadResult = await uploadReceiptDocument(user.id, item.propertyId, durable.file, {
        uploadFile: async (path, uploadFile, contentType) => {
          const { error: uploadError } = await supabase!.storage.from('property-documents').upload(path, uploadFile, { contentType, upsert: false })
          return { error: uploadError?.message || null }
        },
        insertDocumentRow: async (row) => {
          const { data, error: rowError } = await supabase!.from('property_documents').insert(row).select('id').single()
          return { id: (data?.id as string) || null, error: rowError?.message || null }
        },
        removeFile: async (path) => { await supabase!.storage.from('property-documents').remove([path]) },
      })
      if (!uploadResult.ok) {
        setAttachReceiptError({ id: item.id, message: uploadResult.error })
        return
      }
      const { error: updateError } = await supabase.from('financial_transactions').update({ document_id: uploadResult.documentId }).eq('id', item.id)
      if (updateError) {
        setAttachReceiptError({ id: item.id, message: updateError.message })
        return
      }
      await load()
    } catch (unexpected) {
      setAttachReceiptError({ id: item.id, message: unexpected instanceof Error ? unexpected.message : 'Something went wrong attaching this receipt. Please try again.' })
    } finally {
      setAttachingReceiptId(null)
    }
  }

  function exportCsv() {
    const csv = buildTaxCenterCsv(year, portfolio, propertySummaries)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `proproster-tax-center-${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const generatedOn = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  // Mobile Visual Refinement pass, Section 6/7/8/10/11 — a compact
  // financial-timeline row: a quiet source icon, description + amount
  // sharing one line (amount right-aligned), then two quiet secondary
  // lines (property · date, source · receipt status) instead of the
  // earlier stacked pills. A plain function (not a nested component) —
  // it closes over this render's own state/handlers without giving
  // React a new component identity every render, so a row's own pending
  // upload state never gets reset by an unrelated re-render.
  function renderFeedRow(item: TaxCenterFeedItem) {
    const shortDate = new Date(item.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const receiptNode = item.hasReceipt ? (
      <span>Receipt attached</span>
    ) : item.source === 'manual' ? (
      <label className="taxCenterAttachReceiptLabel">
        {attachingReceiptId === item.id ? 'Uploading…' : 'Attach receipt'}
        <input type="file" accept="image/*,.pdf,application/pdf" onChange={(e) => {
          const file = e.target.files?.[0]
          const bytesPromise = file ? beginReadingFileBytes(file) : null
          e.target.value = ''
          if (file && bytesPromise) void attachReceiptToTransaction(item, file, bytesPromise)
        }} />
      </label>
    ) : (
      <span>No receipt</span>
    )
    const body = (
      <>
        <span className="taxCenterFeedIcon" aria-hidden="true"><TaxCenterSourceIcon source={item.source} /></span>
        <span className="taxCenterFeedMain">
          <span className="taxCenterFeedTitleLine">
            <strong>{item.description}</strong>
            <span className={`taxCenterFeedAmount ${item.type === 'Income' ? 'taxCenterFeedAmountIncome' : 'taxCenterFeedAmountExpense'}`}>
              {item.type === 'Income' ? '+' : '-'}{money(item.amount)}
            </span>
          </span>
          <span className="muted taxCenterFeedSub">{item.propertyLabel} · {shortDate}</span>
          <span className="muted taxCenterFeedSourceLine">{SOURCE_LABELS[item.source]} · {receiptNode}</span>
          {attachReceiptError?.id === item.id && <span className="taxCenterAttachReceiptError">{attachReceiptError.message}</span>}
        </span>
      </>
    )
    const href = taxCenterFeedRowHref(item)
    if (href) {
      return (
        <Link href={href} className="taxCenterFeedRow taxCenterFeedRowLink" key={item.id}>
          {body}
          <span className="taxCenterFeedChevron" aria-hidden="true">›</span>
        </Link>
      )
    }
    return <div className="taxCenterFeedRow" key={item.id}>{body}</div>
  }

  return (
    <main className="shell taxCenterShell">
      <AuthHeader />

      <section className="intro noPrint">
        <p className="eyebrow">TAX CENTER</p>
        <h1>Organize your rental income and expenses for tax time.</h1>
        <p>A reporting and organization tool — PropRoster does not calculate your final tax liability, file returns, or give individualized tax advice. Review everything here with your tax professional.</p>
      </section>

      {error && <p className="errorMessage noPrint">{error}</p>}

      <div className="taxYearBar noPrint">
        <label>
          Tax year
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <div className="taxYearActions">
          <button type="button" className="secondary" onClick={exportCsv}>Export CSV</button>
          <button type="button" className="secondary" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
      </div>

      {!loaded ? (
        <div className="loadingState noPrint">Loading your tax information…</div>
      ) : properties.length === 0 ? (
        <div className="emptyState noPrint">
          <strong>No rental properties yet.</strong>
          <span>Tax Center covers properties marked as Rental Property in your portfolio.</span>
        </div>
      ) : (
        <>
          {/* Usability/workflow-completion pass — Section 1: this is now
              the FIRST substantive thing a landlord sees. Four numbers
              (Income/Expenses/Net/Receipts, for the selected year), a
              prominent Add Expense action, and a clean activity feed —
              no tax/accounting vocabulary, no table. The existing V3
              sections (Rental properties, Portfolio Summary, category
              tables, Property Detail) are all still below, completely
              unchanged — this doesn't replace any of them, it just puts
              the simple answer first. */}
          <section className="noPrint taxCenterSummarySection">
            <div className="taxCenterSummaryStrip">
              <div className="taxCenterSummaryTile"><span>Income</span><strong>{money(yearSummary.income)}</strong></div>
              <div className="taxCenterSummaryTile"><span>Expenses</span><strong>{money(yearSummary.expenses)}</strong></div>
              <div className="taxCenterSummaryTile taxCenterSummaryTileNet"><span>Net</span><strong>{money(yearSummary.net)}</strong></div>
              <div className="taxCenterSummaryTile"><span>Receipts</span><strong>{yearSummary.receiptCount}</strong></div>
            </div>
            <button type="button" className="primary taxCenterAddExpense" onClick={openAddExpense}>+ Add Expense</button>
          </section>

          <section className="noPrint taxCenterFeedSection">
            <div className="sectionHead taxCenterFeedHead">
              <div><h2>Activity · {year}</h2><p>Income and expenses across your properties.</p></div>
              <button type="button" className="secondary taxCenterFilterToggle" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen}>
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>
            </div>

            {filtersOpen && (
              <div className="taxCenterFilters">
                <label>Property
                  <select value={feedFilters.propertyId || ''} onChange={(e) => setFeedFilters((f) => ({ ...f, propertyId: e.target.value || undefined }))}>
                    <option value="">All properties</option>
                    {properties.map((p) => <option key={p.id} value={p.id}>{p.address}</option>)}
                  </select>
                </label>
                <label>Type
                  <select value={feedFilters.type || ''} onChange={(e) => setFeedFilters((f) => ({ ...f, type: (e.target.value || undefined) as 'Income' | 'Expense' | undefined }))}>
                    <option value="">Income &amp; Expense</option>
                    <option value="Income">Income</option>
                    <option value="Expense">Expense</option>
                  </select>
                </label>
                <label>Category
                  <select value={feedFilters.category || ''} onChange={(e) => setFeedFilters((f) => ({ ...f, category: e.target.value || undefined }))}>
                    <option value="">All categories</option>
                    {feedCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label>Receipt
                  <select value={feedFilters.receiptStatus || ''} onChange={(e) => setFeedFilters((f) => ({ ...f, receiptStatus: (e.target.value || undefined) as 'attached' | 'missing' | undefined }))}>
                    <option value="">Any</option>
                    <option value="attached">Attached</option>
                    <option value="missing">Missing</option>
                  </select>
                </label>
                {activeFilterCount > 0 && <button type="button" className="taxCenterFiltersClear" onClick={() => setFeedFilters({})}>Clear filters</button>}
              </div>
            )}

            {filteredFeed.length === 0 ? (
              <p className="muted taxCenterFeedEmpty">{feed.length === 0 ? `No income or expenses recorded for ${year} yet.` : 'No activity matches these filters.'}</p>
            ) : (
              <div className="taxCenterFeedList">
                {feedMonthGroups.map((group) => (
                  <div className="taxCenterFeedMonthGroup" key={group.key}>
                    <h3 className="taxCenterFeedMonthHeading">{group.label}</h3>
                    <div className="taxCenterFeedRows">
                      {group.items.map((item) => renderFeedRow(item))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {showAddExpense && (
            <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && closeAddExpense()}>
              <div className="modal taxCenterAddExpenseModal">
                <div className="modalTop">
                  <div><p className="eyebrow">TAX CENTER</p><h2>Add Expense</h2></div>
                  <button type="button" className="iconButton" onClick={closeAddExpense}>×</button>
                </div>
                <p className="muted">For an expense PropRoster doesn&apos;t already know about — a lease/maintenance-related cost is usually better logged from that property&apos;s own Ledger or Maintenance tab instead, so it stays linked there too.</p>
                <div className="formGrid">
                  <label>Amount
                    <input inputMode="decimal" value={expenseDraft.amount} onChange={(e) => setExpenseDraft((d) => ({ ...d, amount: e.target.value }))} placeholder="184.27" />
                  </label>
                  <label>Property
                    <select value={expenseDraft.propertyId} onChange={(e) => setExpenseDraft((d) => ({ ...d, propertyId: e.target.value }))}>
                      <option value="">Select a property</option>
                      {properties.map((p) => <option key={p.id} value={p.id}>{p.address}</option>)}
                    </select>
                  </label>
                  <label>Category
                    <select value={expenseDraft.category} onChange={(e) => setExpenseDraft((d) => ({ ...d, category: e.target.value }))}>
                      {ADD_EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label>Date
                    <input type="date" value={expenseDraft.date} onChange={(e) => setExpenseDraft((d) => ({ ...d, date: e.target.value }))} />
                  </label>
                  <label>Merchant / payee <span className="muted">(optional)</span>
                    <input value={expenseDraft.vendor} onChange={(e) => setExpenseDraft((d) => ({ ...d, vendor: e.target.value }))} placeholder="Home Depot" />
                  </label>
                  <label className="fullField">Note <span className="muted">(optional)</span>
                    <input value={expenseDraft.note} onChange={(e) => setExpenseDraft((d) => ({ ...d, note: e.target.value }))} placeholder="What was this for?" />
                  </label>
                  <label className="fullField taxCenterReceiptField">Receipt <span className="muted">(optional)</span>
                    <label className="secondary taxCenterReceiptButton">
                      {expenseReceiptFile ? expenseReceiptFile.name : 'Add photo or file'}
                      <input type="file" accept="image/*,.pdf,application/pdf" onChange={(e) => {
                        const file = e.target.files?.[0]
                        // Same durable-read pattern every other picker in
                        // this app uses — begin reading bytes now, before
                        // the input is reset, so an iOS picker resource
                        // invalidation can never lose the selection.
                        const bytesPromise = file ? beginReadingFileBytes(file) : null
                        e.target.value = ''
                        if (file && bytesPromise) { setExpenseReceiptFile(file); setExpenseReceiptBytesPromise(bytesPromise) }
                      }} />
                    </label>
                    {expenseReceiptFile && <button type="button" className="taxCenterReceiptRemove" onClick={() => { setExpenseReceiptFile(null); setExpenseReceiptBytesPromise(null) }}>Remove</button>}
                  </label>
                </div>
                {expenseError && <p className="errorMessage">{expenseError}</p>}
                <div className="modalActions">
                  <button type="button" className="secondary" onClick={closeAddExpense}>Cancel</button>
                  <button type="button" className="primary" disabled={expenseSaving} onClick={() => void saveExpense()}>{expenseSaving ? 'Saving…' : 'Save Expense'}</button>
                </div>
              </div>
            </div>
          )}

          {/* Correction (Property-First UX Cleanup, Tax Center ordering):
              Property by Property is now the first substantive section —
              the centerpiece of this page — with Portfolio Summary
              following it, per the approved required order. The standalone
              portfolio-level "Tax Readiness" section (formerly here) was
              removed as redundant/cluttered; the SAME readiness
              calculation (computePropertyTaxSummary's readiness field,
              lib/tax-center/readiness.ts — completely untouched) still
              drives each property's own Status pill below and in Property
              detail — nothing about the underlying calculation changed,
              only this one duplicate summary display. */}
          <section className="noPrint">
            <div className="sectionHead"><div><h2>Rental properties — {year}</h2><p>Every rental property at a glance. Select a property to review or edit its Tax &amp; Financials tab.</p></div></div>
            <div className="taxCategoryTableWrap">
              <table className="ledger taxPropertyTable">
                <thead><tr><th>Property</th><th>Rental income</th><th>Operating expenses</th><th>Mortgage interest</th><th>Capital improvements / items</th><th>Net result</th><th>Status</th></tr></thead>
                <tbody>
                  {propertySummaries.map((p) => (
                    <tr key={p.propertyId}>
                      <td><Link href={`/?openProperty=${p.propertyId}&openTab=Tax`}>{p.address}</Link></td>
                      <td className="moneyCell">{money(p.grossIncome)}</td>
                      <td className="moneyCell">{money(p.operatingExpenses)}</td>
                      <td className="moneyCell">{p.mortgageInterest > 0 ? money(p.mortgageInterest) : '—'}</td>
                      <td className="moneyCell">{p.capitalImprovements > 0 ? money(p.capitalImprovements) : '—'}</td>
                      <td className="moneyCell">{money(p.netOperatingResult)}</td>
                      <td><span className={`statusPill ${readinessPillClass(p.readiness.status)}`}>{p.readiness.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="noPrint">
            <div className="sectionHead"><div><h2>Portfolio summary — {year}</h2><p>Tracked from your Financials ledger, replaced by a manual entry wherever one exists on a property&apos;s Tax &amp; Financials tab — never both added together.</p></div></div>
            <div className="financialStats">
              <div className="financialStat"><span>Gross rental income</span><strong>{money(portfolio.grossIncome)}</strong></div>
              <div className="financialStat"><span>Operating expenses</span><strong>{money(portfolio.operatingExpenses)}</strong></div>
              <div className="financialStat"><span>Net rental income</span><strong>{money(portfolio.netOperatingResult)}</strong><small>Before tax-specific adjustments</small></div>
              <div className="financialStat"><span>Properties included</span><strong>{portfolio.propertiesIncluded}</strong></div>
            </div>
            <div className="taxNonOperatingNotes">
              <p><strong>Capital &amp; depreciable items:</strong> {money(portfolio.capitalImprovements)} — {SCHEDULE_E_CAPEX_NOTE}</p>
              <p><strong>Mortgage interest (manual entry only):</strong> {money(portfolio.mortgageInterest)} — entered on each property&apos;s Tax &amp; Financials tab from a lender statement or Form 1098. Never calculated by PropRoster.</p>
              <p><strong>Other financing (points, loan costs, etc.):</strong> {money(portfolio.financingOtherTotal)} — organizational only, never mortgage interest and never includes principal.</p>
              <p><strong>Mortgage payments logged:</strong> {money(portfolio.mortgagePayments)} — {SCHEDULE_E_MORTGAGE_NOTE}</p>
              {portfolio.customItemsCount > 0 && <p><strong>Custom tax items recorded:</strong> {portfolio.customItemsCount} — already included in the totals above; see Property detail below or the CSV export for each one individually.</p>}
            </div>
          </section>

          <section className="noPrint">
            <div className="sectionHead"><div><h2>Expense totals by category</h2><p>Property expenses, professional/administrative, travel, and meals — capital/depreciable items, mortgage interest, and mortgage payments are shown separately.</p></div></div>
            <div className="taxCategoryTableWrap">
              <table className="ledger taxCategoryTable">
                <thead><tr><th>Category</th><th>Amount</th><th>Schedule E reference (informational only)</th></tr></thead>
                <tbody>
                  {EXPENSE_CATEGORIES.map((category) => (
                    <tr key={category.key}>
                      <td>{category.label}</td>
                      <td className="moneyCell">{money(portfolio.expenseByCategory[category.key] || 0)}</td>
                      <td className="muted">{category.trackedCategory ? SCHEDULE_E_REFERENCE[category.trackedCategory as keyof typeof SCHEDULE_E_REFERENCE] : 'Schedule E, Line 19 (Other) — no dedicated line'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="noPrint">
            <div className="sectionHead"><div><h2>Capital &amp; depreciable items by category</h2><p>Never immediately deductible and never part of operating expenses — typically depreciated over time. Review the correct treatment with your tax professional.</p></div></div>
            <div className="taxCategoryTableWrap">
              <table className="ledger taxCategoryTable">
                <thead><tr><th>Category</th><th>Amount</th></tr></thead>
                <tbody>
                  {CAPITAL_CATEGORIES.map((category) => (
                    <tr key={category.key}>
                      <td>{category.label}</td>
                      <td className="moneyCell">{money(propertySummaries.reduce((sum, p) => sum + p.categoryBreakdown[category.key].effective, 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="noPrint">
            <div className="sectionHead"><div><h2>Property detail</h2><p>Expand a property to see its full category-by-category breakdown, or jump into Tax &amp; Financials to enter manual amounts.</p></div></div>
            <div className="taxPropertyList">
              {propertySummaries.map((p) => {
                const expanded = expandedPropertyId === p.propertyId
                return (
                  <div className="recordCard" key={p.propertyId}>
                    <button type="button" className="taxPropertyToggle" onClick={() => setExpandedPropertyId(expanded ? null : p.propertyId)}>
                      <div className="recordTop">
                        <div><p className="muted">{p.city}</p><h3>{p.address}</h3></div>
                        <span className={`statusPill ${readinessPillClass(p.readiness.status)}`}>{p.readiness.status}</span>
                      </div>
                    </button>
                    <div className="recordMetrics">
                      <div><span>Gross income</span><strong>{money(p.grossIncome)}</strong></div>
                      <div><span>Operating expenses</span><strong>{money(p.operatingExpenses)}</strong></div>
                      <div><span>Net operating result</span><strong>{money(p.netOperatingResult)}</strong></div>
                    </div>
                    {expanded && (
                      <>
                        <div className="recordRows">
                          {EXPENSE_CATEGORIES.filter((c) => p.categoryBreakdown[c.key].effective > 0).map((c) => {
                            const value = p.categoryBreakdown[c.key]
                            return (
                              <div key={c.key}>
                                <span>{c.label} <span className={`statusPill taxSourcePill ${sourcePillClass(value.source)}`}>{sourceLabel(value.source)}</span></span>
                                <strong>{money(value.effective)}</strong>
                              </div>
                            )
                          })}
                          {p.mortgageInterest > 0 && <div><span>Mortgage interest (manual entry)</span><strong>{money(p.mortgageInterest)}</strong></div>}
                          {p.financingOtherTotal > 0 && <div><span>Other financing (points, loan costs, etc. — organizational only)</span><strong>{money(p.financingOtherTotal)}</strong></div>}
                          {p.mortgagePayments > 0 && <div><span>Mortgage payments (reference only)</span><strong>{money(p.mortgagePayments)}</strong></div>}
                          {p.businessMileage !== null && <div><span>Business mileage{p.businessMileageNotes ? ` — ${p.businessMileageNotes}` : ''}</span><strong>{p.businessMileage.toLocaleString()} mi</strong></div>}
                        </div>

                        {p.capitalImprovements > 0 && (
                          <div className="taxPropertyCapitalDetail">
                            <h4>Capital &amp; depreciable items (not immediately deductible)</h4>
                            <div className="recordRows">
                              {CAPITAL_CATEGORIES.filter((c) => p.categoryBreakdown[c.key].effective > 0).map((c) => {
                                const value = p.categoryBreakdown[c.key]
                                return (
                                  <div key={c.key}>
                                    <span>{c.label} <span className={`statusPill taxSourcePill ${sourcePillClass(value.source)}`}>{sourceLabel(value.source)}</span></span>
                                    <strong>{money(value.effective)}</strong>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {p.customItems.length > 0 && (
                          <div className="taxPropertyCustomItems">
                            <h4>Other tax items</h4>
                            <div className="recordRows">
                              {p.customItems.map((item) => (
                                <div key={item.id}>
                                  <span>{item.description} <span className="statusPill taxSourcePill pillNeutral">{CUSTOM_ITEM_GROUP_LABELS[item.group]} · Manual</span></span>
                                  <strong>{money(item.amount)}</strong>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {p.notes && <p className="muted taxPropertyNotes">Note: {p.notes}</p>}
                        {p.readiness.items.length > 0 && (
                          <ul className="taxReadinessItems">
                            {p.readiness.items.map((item, i) => <li key={i}>{item}</li>)}
                          </ul>
                        )}
                        <div className="maintenanceActions">
                          <Link href={`/?openProperty=${p.propertyId}&openTab=Tax`}>{p.hasManualRecord ? 'Edit manual tax entries' : 'Add manual tax entries'}</Link>
                          <Link href={`/?openProperty=${p.propertyId}&openTab=Rent&openRentSubTab=Ledger`}>Review in Ledger</Link>
                          <Link href="/documents">Review documents</Link>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {/* Print / Save as PDF summary — hidden on screen (.taxPrintSummary
              is display:none by default), shown only under @media print
              via app/globals.css. window.print() above is the entire "PDF
              export" mechanism: no PDF library, no server-side rendering —
              every modern browser's print dialog (including iOS Safari's
              share sheet) offers Save as PDF directly from this. */}
          <div className="taxPrintSummary">
            <div className="taxPrintBrand"><span className="brand"><Wordmark /></span></div>
            <p>Tax Year {year} — Portfolio Summary</p>
            <p className="muted">Generated {generatedOn}</p>
            <table>
              <tbody>
                <tr><td>Properties included</td><td>{portfolio.propertiesIncluded}</td></tr>
                <tr><td>Gross rental income</td><td>{money(portfolio.grossIncome)}</td></tr>
                <tr><td>Operating expenses</td><td>{money(portfolio.operatingExpenses)}</td></tr>
                <tr><td>Net rental income (before tax-specific adjustments)</td><td>{money(portfolio.netOperatingResult)}</td></tr>
                <tr><td>Capital &amp; depreciable items (not immediately deductible)</td><td>{money(portfolio.capitalImprovements)}</td></tr>
                <tr><td>Mortgage interest (manual entry only, never estimated)</td><td>{money(portfolio.mortgageInterest)}</td></tr>
                <tr><td>Other financing (points, loan costs — organizational only)</td><td>{money(portfolio.financingOtherTotal)}</td></tr>
                <tr><td>Mortgage payments logged (reference only)</td><td>{money(portfolio.mortgagePayments)}</td></tr>
                {portfolio.customItemsCount > 0 && <tr><td>Custom tax items recorded (already included above)</td><td>{portfolio.customItemsCount}</td></tr>}
              </tbody>
            </table>

            <h4>Portfolio expense totals by category</h4>
            <table>
              <thead><tr><th>Category</th><th>Amount</th></tr></thead>
              <tbody>
                {EXPENSE_CATEGORIES.map((c) => (
                  <tr key={c.key}><td>{c.label}</td><td>{money(portfolio.expenseByCategory[c.key] || 0)}</td></tr>
                ))}
              </tbody>
            </table>

            <h4>Portfolio capital &amp; depreciable items by category</h4>
            <table>
              <thead><tr><th>Category</th><th>Amount</th></tr></thead>
              <tbody>
                {CAPITAL_CATEGORIES.map((c) => (
                  <tr key={c.key}><td>{c.label}</td><td>{money(propertySummaries.reduce((sum, p) => sum + p.categoryBreakdown[c.key].effective, 0))}</td></tr>
                ))}
              </tbody>
            </table>

            <h4>Property-by-property breakdown</h4>
            {propertySummaries.map((p) => (
              <div key={p.propertyId} className="taxPrintProperty">
                <h5>{p.address}, {p.city}</h5>
                <table>
                  <tbody>
                    <tr><td>Gross income</td><td>{money(p.grossIncome)}</td></tr>
                    <tr><td>Operating expenses</td><td>{money(p.operatingExpenses)}</td></tr>
                    <tr><td>Net operating result</td><td>{money(p.netOperatingResult)}</td></tr>
                    {p.mortgageInterest > 0 && <tr><td>Mortgage interest (manual entry only)</td><td>{money(p.mortgageInterest)}</td></tr>}
                    {p.financingOtherTotal > 0 && <tr><td>Other financing (organizational only)</td><td>{money(p.financingOtherTotal)}</td></tr>}
                    {p.capitalImprovements > 0 && <tr><td>Capital &amp; depreciable items (not immediately deductible)</td><td>{money(p.capitalImprovements)}</td></tr>}
                    {p.mortgagePayments > 0 && <tr><td>Mortgage payments (reference only, not deductible interest)</td><td>{money(p.mortgagePayments)}</td></tr>}
                    {p.businessMileage !== null && <tr><td>Business mileage{p.businessMileageNotes ? ` — ${p.businessMileageNotes}` : ''}</td><td>{p.businessMileage.toLocaleString()} mi</td></tr>}
                  </tbody>
                </table>
                <table>
                  <thead><tr><th>Expense category</th><th>Amount</th><th>Source</th></tr></thead>
                  <tbody>
                    {EXPENSE_CATEGORIES.filter((c) => p.categoryBreakdown[c.key].effective > 0).map((c) => {
                      const value = p.categoryBreakdown[c.key]
                      return <tr key={c.key}><td>{c.label}</td><td>{money(value.effective)}</td><td>{sourceLabel(value.source)}</td></tr>
                    })}
                  </tbody>
                </table>
                {CAPITAL_CATEGORIES.some((c) => p.categoryBreakdown[c.key].effective > 0) && (
                  <table>
                    <thead><tr><th>Capital / depreciable category</th><th>Amount</th><th>Source</th></tr></thead>
                    <tbody>
                      {CAPITAL_CATEGORIES.filter((c) => p.categoryBreakdown[c.key].effective > 0).map((c) => {
                        const value = p.categoryBreakdown[c.key]
                        return <tr key={c.key}><td>{c.label}</td><td>{money(value.effective)}</td><td>{sourceLabel(value.source)}</td></tr>
                      })}
                    </tbody>
                  </table>
                )}
                {p.customItems.length > 0 && (
                  <table>
                    <thead><tr><th>Custom tax item</th><th>Amount</th><th>Group</th><th>Source</th></tr></thead>
                    <tbody>
                      {p.customItems.map((item) => (
                        <tr key={item.id}><td>{item.description}</td><td>{money(item.amount)}</td><td>{CUSTOM_ITEM_GROUP_LABELS[item.group]}</td><td>Manual</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {p.notes && <p className="muted">Note: {p.notes}</p>}
                {p.readiness.items.length > 0 && (
                  <p className="muted">Readiness notes: {p.readiness.items.join(' ')}</p>
                )}
                {p.transactionCount === 0 && !p.hasManualRecord && <p className="muted">No records found for this property in {year}.</p>}
              </div>
            ))}

            <p className="taxPrintDisclaimer">PropRoster organizes information entered into your account and does not provide tax, legal, or accounting advice. Review this information with a qualified tax professional.</p>
          </div>
        </>
      )}
    </main>
  )
}
