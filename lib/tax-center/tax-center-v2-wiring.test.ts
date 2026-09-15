import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Tax Center — usability/workflow-completion pass.
//
// Same no-jsdom, source-read wiring-test convention as
// lib/dashboard/desktop-homepage-v4-wiring.test.ts: this repo has no
// browser-based test harness, so the behavioral logic (source labeling,
// feed building, filtering, receipt upload) is proven by real unit
// tests (feed.test.ts, upload-receipt.test.ts) while this file locks in
// that the page/panel actually wire those functions in — not a
// duplicate of the JSX rendering itself.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/tax-center/page.tsx')
const panelSource = readFile('components/property-profile/PropertyTaxPanel.tsx')
const cssSource = readFile('app/globals.css')

describe('Tax Center page — Section 1/2: simplified summary + Add Expense', () => {
  it('renders the Income/Expenses/Net/Receipts summary strip from the new feed-based yearSummary, not a second calculation', () => {
    expect(pageSource).toContain('taxCenterSummaryStrip')
    expect(pageSource).toContain('{money(yearSummary.income)}')
    expect(pageSource).toContain('{money(yearSummary.expenses)}')
    expect(pageSource).toContain('{money(yearSummary.net)}')
    expect(pageSource).toContain('{yearSummary.receiptCount}')
  })

  it('has a prominent, primary + Add Expense action', () => {
    expect(pageSource).toMatch(/className="primary taxCenterAddExpense" onClick=\{openAddExpense\}>\+ Add Expense</)
  })

  it('Add Expense excludes income categories — it can never become a second way to log rental income', () => {
    expect(pageSource).toContain("ADD_EXPENSE_CATEGORIES = FINANCIAL_CATEGORIES.filter((c) => c !== 'Rent' && c !== 'Other Income')")
  })

  it('Property is a required field in the Add Expense form (Section 2)', () => {
    expect(pageSource).toContain("if (!expenseDraft.propertyId) { setExpenseError('Select which property this expense is for.'); return }")
  })

  it('saveExpense always writes transaction_type: Expense, never Income, from this flow', () => {
    const saveExpenseStart = pageSource.indexOf('async function saveExpense()')
    const saveExpenseEnd = pageSource.indexOf('\n  }\n', saveExpenseStart)
    const body = pageSource.slice(saveExpenseStart, saveExpenseEnd)
    expect(body).toContain("transaction_type: 'Expense'")
  })
})

describe('Tax Center page — Section 3/6: receipt capture is part of Add Expense', () => {
  it('uploads the receipt via the shared uploadReceiptDocument helper before inserting the transaction — never after', () => {
    const saveExpenseStart = pageSource.indexOf('async function saveExpense()')
    const uploadCallIndex = pageSource.indexOf('uploadReceiptDocument(', saveExpenseStart)
    const insertCallIndex = pageSource.indexOf(".from('financial_transactions').insert(", saveExpenseStart)
    expect(uploadCallIndex).toBeGreaterThan(saveExpenseStart)
    expect(insertCallIndex).toBeGreaterThan(uploadCallIndex)
  })

  it('a failed receipt upload stops the save — it never silently saves an expense that lost its receipt', () => {
    expect(pageSource).toContain('if (!uploadResult.ok) {')
    expect(pageSource).toMatch(/setExpenseError\(`Expense not saved — the receipt could not be uploaded/)
  })

  it('uses the durable-file read-before-reset pattern for the receipt input, same as every other picker in this app', () => {
    const fieldStart = pageSource.indexOf('taxCenterReceiptField')
    const fieldEnd = pageSource.indexOf('</label>\n                  </label>', fieldStart)
    const fieldSlice = pageSource.slice(fieldStart, fieldEnd)
    expect(fieldSlice).toContain('beginReadingFileBytes(file)')
    expect(fieldSlice).toContain("e.target.value = ''")
  })
})

describe('Tax Center page — Section 4/5: preserved automatic sources, quiet labels, clean feed', () => {
  it('resolves source labels only from the real, existing rent_payments/maintenance_records link columns (via buildTaxCenterFeed) — never a third, invented source', () => {
    expect(pageSource).toContain("supabase.from('rent_payments').select('id,financial_transaction_id')")
    expect(pageSource).toContain('buildTaxCenterFeed(yearFeedTransactions, propertyLabelById, rentPayments, yearMaintenance)')
  })

  function renderFeedRowBody(): string {
    const start = pageSource.indexOf('function renderFeedRow(item: TaxCenterFeedItem)')
    const end = pageSource.indexOf('\n  }\n', start)
    return pageSource.slice(start, end)
  }

  it('each feed row shows description, amount, property, date, source, and receipt status (Section 5/6)', () => {
    const rowSlice = renderFeedRowBody()
    expect(rowSlice).toContain('{item.description}')
    expect(rowSlice).toContain('{item.propertyLabel}')
    expect(rowSlice).toContain('SOURCE_LABELS[item.source]')
    expect(rowSlice).toContain('Receipt attached')
    expect(rowSlice).toContain('No receipt')
    expect(rowSlice).toContain('{money(item.amount)}')
  })

  it('category was dropped from the compact row per the approved mobile-refinement reference — still available via the Category filter', () => {
    const rowSlice = renderFeedRowBody()
    expect(rowSlice).not.toContain('{item.category')
    expect(pageSource).toContain('feedCategories.map((c) => <option key={c} value={c}>{c}</option>)')
  })

  it('Section 7 — source/receipt status render as quiet secondary text, not stacked statusPill badges', () => {
    const rowSlice = renderFeedRowBody()
    expect(rowSlice).not.toContain('statusPill')
    expect(rowSlice).not.toContain('pillGood')
    expect(rowSlice).not.toContain('pillMuted')
    expect(rowSlice).toContain('taxCenterFeedSourceLine')
  })

  it('Section 10 — amount sits on the same line as the description, right-aligned within it (a compact timeline row, not a separate full-height amount column)', () => {
    const rowSlice = renderFeedRowBody()
    const titleLineStart = rowSlice.indexOf('taxCenterFeedTitleLine')
    const titleLineEnd = rowSlice.indexOf('</span>\n          <span className="muted taxCenterFeedSub"', titleLineStart)
    const titleLineSlice = rowSlice.slice(titleLineStart, titleLineEnd)
    expect(titleLineSlice).toContain('{item.description}')
    expect(titleLineSlice).toContain('taxCenterFeedAmount')
  })

  it('Section 9 — a quiet source icon (reusing the existing hand-authored icon set, not a new library) leads every row', () => {
    expect(pageSource).toContain("import { HomeIcon, WrenchIcon, ReceiptIcon } from '../../components/icons/NavIcons'")
    expect(pageSource).toContain('function TaxCenterSourceIcon(')
    expect(pageSource).toContain("if (source === 'maintenance') return <WrenchIcon />")
    expect(pageSource).toContain("if (source === 'rent-ledger') return <HomeIcon />")
  })

  it('Section 5 — the feed is grouped by month via the shared, tested groupFeedByMonth, applied to the already-filtered feed', () => {
    expect(pageSource).toContain('groupFeedByMonth(filteredFeed)')
    expect(pageSource).toContain('feedMonthGroups.map((group)')
    expect(pageSource).toContain('{group.label}')
  })
})

describe('Tax Center page — Section 8/11: quiet receipt attachment and row navigation, source ownership preserved', () => {
  it('a chevron/navigable destination exists ONLY for Rent Ledger/Maintenance-sourced rows, reusing the existing ?openProperty deep-link mechanism — never a new navigation system', () => {
    const fnStart = pageSource.indexOf('function taxCenterFeedRowHref(item: TaxCenterFeedItem)')
    const fnEnd = pageSource.indexOf('\n}\n', fnStart)
    const body = pageSource.slice(fnStart, fnEnd)
    expect(body).toContain("if (item.source === 'rent-ledger') return `/?openProperty=${item.propertyId}&openTab=Rent&openRentSubTab=Ledger`")
    expect(body).toContain("if (item.source === 'maintenance') return `/?openProperty=${item.propertyId}&openTab=Maintenance`")
    expect(body).toContain('return null')
  })

  it('a manual row never gets a canonical-record editor invented for it — no Tax Center-owned mutation of Rent Ledger/Maintenance rows', () => {
    expect(pageSource).not.toContain("from('rent_payments').update")
    expect(pageSource).not.toContain("from('maintenance_records').update")
  })

  it('"Attach receipt" only ever appears for source === manual rows without a receipt — never for an automatically-sourced row', () => {
    const fnStart = pageSource.indexOf('function renderFeedRow(item: TaxCenterFeedItem)')
    const fnEnd = pageSource.indexOf('\n  }\n', fnStart)
    const body = pageSource.slice(fnStart, fnEnd)
    expect(body).toMatch(/item\.source === 'manual' \? \(\s*<label className="taxCenterAttachReceiptLabel">/)
  })

  it('attachReceiptToTransaction only UPDATEs financial_transactions.document_id — the same table/column every other receipt attachment in this app already writes through, never a new relationship', () => {
    const fnStart = pageSource.indexOf('async function attachReceiptToTransaction(')
    const fnEnd = pageSource.indexOf('\n  }\n', fnStart)
    const body = pageSource.slice(fnStart, fnEnd)
    expect(body).toContain("supabase.from('financial_transactions').update({ document_id: uploadResult.documentId }).eq('id', item.id)")
    expect(body).toContain('uploadReceiptDocument(user.id, item.propertyId, durable.file')
  })
})

describe('Tax Center page — Section 7: progressive filters', () => {
  it('filters are collapsed behind a toggle, not permanently occupying screen space', () => {
    expect(pageSource).toContain('const [filtersOpen, setFiltersOpen] = useState(false)')
    expect(pageSource).toContain('{filtersOpen && (')
  })

  it('offers Property, Income/Expense, Category, and Receipt attached/missing filters', () => {
    const filtersStart = pageSource.indexOf('{filtersOpen && (')
    const filtersEnd = pageSource.indexOf(')}\n\n            {filteredFeed', filtersStart)
    const filtersSlice = pageSource.slice(filtersStart, filtersEnd)
    expect(filtersSlice).toContain('propertyId: e.target.value || undefined')
    expect(filtersSlice).toContain("type: (e.target.value || undefined) as 'Income' | 'Expense' | undefined")
    expect(filtersSlice).toContain('category: e.target.value || undefined')
    expect(filtersSlice).toContain("receiptStatus: (e.target.value || undefined) as 'attached' | 'missing' | undefined")
  })
})

describe('Tax Center page — underlying V3 computations and Print/PDF export are untouched', () => {
  it('propertySummaries/portfolio still come straight from computePropertyTaxSummary/computePortfolioTaxSummary — no second calculation', () => {
    expect(pageSource).toContain('properties.map((p) => computePropertyTaxSummary(p, yearTransactions, yearMaintenance, yearTaxRecordByProperty.get(p.id) || null, yearCustomItems))')
    expect(pageSource).toContain('computePortfolioTaxSummary(year, propertySummaries)')
  })

  it('the hidden, print-only summary (taxPrintSummary, shown only via @media print) is still rendered, unaffected by the main-page consolidation', () => {
    expect(pageSource).toContain('taxPrintSummary')
  })

  it('filterTransactionsForYear stays the single shared year-filter function — the new feed reuses it rather than reimplementing year filtering', () => {
    expect(pageSource).toContain('filterTransactionsForYear(feedTransactions, year)')
    expect(pageSource).toContain('filterTransactionsForYear(transactions, year)')
  })
})

describe('Tax Center page — Information-Architecture Simplification: progressive disclosure below Activity', () => {
  it('the old always-visible Rental properties / Portfolio summary / category-table headings no longer render permanently on the main page', () => {
    expect(pageSource).not.toContain('Rental properties — {year}')
    expect(pageSource).not.toContain('Portfolio summary — {year}')
  })

  it('"Your Tax Records" offers By Property, By Category, and Missing Receipts as compact rows, not full sections', () => {
    const start = pageSource.indexOf('<h2>Your Tax Records</h2>')
    const end = pageSource.indexOf('</section>', start)
    const slice = pageSource.slice(start, end)
    expect(slice).toContain("onClick={() => setOpenRecordsView('property')}")
    expect(slice).toContain("onClick={() => setOpenRecordsView('category')}")
    expect(slice).toContain("onClick={() => setOpenRecordsView('missing-receipts')}")
  })

  it('the Missing Receipts count badge is computed from real data (missingReceiptItems.length), never hard-coded, and only renders when nonzero', () => {
    expect(pageSource).toContain('{missingReceiptItems.length > 0 && <span className="taxCenterRecordsCount">{missingReceiptItems.length}</span>}')
  })

  it('missingReceiptItems is Expense-only and reads the full unfiltered year feed, independent of Activity\'s own feedFilters', () => {
    expect(pageSource).toContain("const missingReceiptItems = useMemo(() => feed.filter((f) => f.type === 'Expense' && !f.hasReceipt), [feed])")
  })

  it('"Year-End" offers Tax Readiness and Export for CPA as rows, plus Print as a quiet secondary link (not a full row/major button)', () => {
    const start = pageSource.indexOf('<h2>Year-End</h2>')
    const end = pageSource.indexOf('{openRecordsView === \'property\'', start)
    const slice = pageSource.slice(start, end)
    expect(slice).toContain("onClick={() => setOpenRecordsView('readiness')}")
    expect(slice).toContain('onClick={exportCsv}')
    expect(slice).toContain('className="taxCenterPrintLink" onClick={() => window.print()}')
  })

  it('the top year bar now contains only the year selector — Export CSV/Print moved into Year-End, not duplicated', () => {
    const barStart = pageSource.indexOf('<div className="taxYearBar noPrint">')
    const barEnd = pageSource.indexOf('</div>\n\n      {!loaded', barStart)
    const barSlice = pageSource.slice(barStart, barEnd)
    expect(barSlice).not.toContain('onClick={exportCsv}')
    expect(barSlice).not.toContain('window.print()')
  })

  it('By Property reuses the exact same propertySummaries/category-breakdown data the old Property detail section used — no second calculation, only relocated presentation', () => {
    const start = pageSource.indexOf("openRecordsView === 'property'")
    const end = pageSource.indexOf("{openRecordsView === 'category'", start)
    const slice = pageSource.slice(start, end)
    expect(slice).toContain('propertySummaries.map((p) => {')
    expect(slice).toContain('EXPENSE_CATEGORIES.filter((c) => p.categoryBreakdown[c.key].effective > 0)')
    expect(slice).toContain('p.customItems.length > 0')
    expect(slice).toContain('p.readiness.items.length > 0')
  })

  it('By Category adds a Mortgage & Financing breakdown using the SAME per-category categoryBreakdown reduction pattern Capital already used — no new aggregation', () => {
    const start = pageSource.indexOf("openRecordsView === 'category'")
    const end = pageSource.indexOf("{openRecordsView === 'missing-receipts'", start)
    const slice = pageSource.slice(start, end)
    expect(slice).toContain('FINANCING_CATEGORIES.map((category) => (')
    expect(slice).toContain('propertySummaries.reduce((sum, p) => sum + p.categoryBreakdown[category.key].effective, 0)')
  })

  it('Missing Receipts reuses renderFeedRow() (the exact Activity row renderer) rather than a second row-rendering implementation', () => {
    const start = pageSource.indexOf("openRecordsView === 'missing-receipts'")
    const end = pageSource.indexOf("{openRecordsView === 'readiness'", start)
    const slice = pageSource.slice(start, end)
    expect(slice).toContain('missingReceiptItems.map((item) => renderFeedRow(item))')
  })

  it('Tax Readiness never invents a tax score — it only shows the existing per-property readiness status/items, plus the existing (previously unrendered) missing-receipt and unassigned-tax-document counts', () => {
    const start = pageSource.indexOf("openRecordsView === 'readiness'")
    const end = pageSource.indexOf('\n          )}\n', start)
    const slice = pageSource.slice(start, end)
    expect(slice).toContain('propertySummaries.map((p) => (')
    expect(slice).toContain('readinessPillClass(p.readiness.status)')
    expect(slice).toContain('taxDocumentCount > 0 &&')
    expect(slice).not.toMatch(/tax score|IRS ready|deduction approved/i)
  })

  it('closing a drill-in sheet also resets which property is expanded, so reopening By Property always starts collapsed', () => {
    expect(pageSource).toContain('function closeRecordsView() {\n    setOpenRecordsView(null)\n    setExpandedPropertyId(null)\n  }')
  })
})

describe('PropertyTaxPanel — Section 3: custom items can now attach a NEW receipt, not just select an existing document', () => {
  it('the existing "select an existing document" dropdown is preserved', () => {
    expect(panelSource).toContain('Existing document (optional)')
    expect(panelSource).toContain('documentOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)')
  })

  it('a new inline upload control exists, reusing the shared uploadReceiptDocument helper — no second receipt system', () => {
    expect(panelSource).toContain("import { uploadReceiptDocument } from '../../lib/documents/upload-receipt'")
    expect(panelSource).toContain('Or upload a new receipt')
    expect(panelSource).toContain('uploadReceiptDocument(ownerId, propertyId, durable.file')
  })

  it('the existing-document dropdown and the new-upload control are mutually exclusive, never combined', () => {
    expect(panelSource).toContain('disabled={!!customItemReceiptFile}')
  })

  it('a newly uploaded receipt is what actually gets saved as document_id — not silently dropped in favor of the dropdown', () => {
    const saveStart = panelSource.indexOf('async function saveCustomItem()')
    const saveEnd = panelSource.indexOf('\n  }\n', saveStart)
    const body = panelSource.slice(saveStart, saveEnd)
    expect(body).toContain('let documentId = customItemDraft.documentId || null')
    expect(body).toContain('documentId = uploadResult.documentId')
    expect(body).toContain('document_id: documentId,')
  })

  it('a failed upload stops the save rather than saving the item without its receipt', () => {
    const saveStart = panelSource.indexOf('async function saveCustomItem()')
    const saveEnd = panelSource.indexOf('\n  }\n', saveStart)
    const body = panelSource.slice(saveStart, saveEnd)
    expect(body).toContain('if (!uploadResult.ok) {')
    expect(body).toContain('return')
  })
})

describe('Tax Center CSS — mobile-first, no horizontal scroll, comfortable tap targets (Section 9)', () => {
  it('the summary strip stays a single row of 4 (a compact surface, not stacked oversized cards) and tightens further at 430px', () => {
    expect(cssSource).toContain('.taxCenterSummaryStrip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr))')
    expect(cssSource).toMatch(/@media \(max-width: 430px\) \{[\s\S]*?\.taxCenterSummaryStrip \{ padding: 12px 10px/)
  })

  it('filters collapse to fewer columns at the 760px and 430px breakpoints, never introducing horizontal scroll', () => {
    expect(cssSource).toMatch(/@media \(max-width: 760px\) \{[\s\S]*?\.taxCenterFilters \{ grid-template-columns: 1fr 1fr; \}/)
    expect(cssSource).toMatch(/@media \(max-width: 430px\) \{[\s\S]*?\.taxCenterFilters \{ grid-template-columns: 1fr; \}/)
  })

  it('the Add Expense button becomes full-width on mobile — a comfortable tap target, not a small inline link', () => {
    expect(cssSource).toMatch(/@media \(max-width: 760px\) \{[\s\S]*?\.taxCenterAddExpense \{ width: 100%/)
  })

  it('the file-picking inputs stay hidden behind their label buttons, matching the existing .editPropertyPhotoButton/.csvButton pattern', () => {
    expect(cssSource).toContain('.taxCenterReceiptButton input[type="file"] { display: none; }')
    expect(cssSource).toContain('.taxCenterAttachReceiptLabel input[type="file"] { display: none; }')
  })

  it('feed rows share hairline dividers within a bordered month group, not individually-boxed cards — the "compact timeline, not a stack of cards" requirement', () => {
    expect(cssSource).toMatch(/\.taxCenterFeedRows \{[^}]*border-radius: 12px;[^}]*overflow: hidden;\s*\}/)
    expect(cssSource).toContain('.taxCenterFeedMonthHeading')
  })
})

describe('Tax Center CSS — Section 13: the Date field fix is scoped only to the Add Expense modal', () => {
  it('min-width: 0 is applied to the date field and its grid item, fixing the iOS grid-blowout root cause, without a custom appearance override that could break the native picker', () => {
    expect(cssSource).toContain('.taxCenterAddExpenseModal .formGrid > label { min-width: 0; }')
    expect(cssSource).toContain('.taxCenterAddExpenseModal .formGrid input[type="date"] { min-width: 0; width: 100%; box-sizing: border-box; }')
  })

  it('every OTHER .formGrid date field in the app (Lease, Mortgage, Insurance, Maintenance, property edit — all explicitly out of scope) is untouched by this rule, since it is scoped under .taxCenterAddExpenseModal', () => {
    expect(cssSource).not.toMatch(/(?<!taxCenterAddExpenseModal )\.formGrid input\[type="date"\] \{/)
  })
})
