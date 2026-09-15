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

  it('each feed row shows description, amount, property, category, date, source, and receipt status (Section 5)', () => {
    const rowStart = pageSource.indexOf('taxCenterFeedRow')
    const rowEnd = pageSource.indexOf('</div>\n                ))', rowStart)
    const rowSlice = pageSource.slice(rowStart, rowEnd)
    expect(rowSlice).toContain('{item.description}')
    expect(rowSlice).toContain('{item.propertyLabel}')
    expect(rowSlice).toContain('{item.category')
    expect(rowSlice).toContain('SOURCE_LABELS[item.source]')
    expect(rowSlice).toContain('Receipt attached')
    expect(rowSlice).toContain('No receipt')
    expect(rowSlice).toContain('{money(item.amount)}')
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

describe('Tax Center page — untouched V3 sections still present', () => {
  it('the existing Rental properties, Portfolio summary, and category tables are all still rendered, unchanged', () => {
    expect(pageSource).toContain('Rental properties — {year}')
    expect(pageSource).toContain('Portfolio summary — {year}')
    expect(pageSource).toContain('taxPrintSummary')
  })

  it('filterTransactionsForYear stays the single shared year-filter function — the new feed reuses it rather than reimplementing year filtering', () => {
    expect(pageSource).toContain('filterTransactionsForYear(feedTransactions, year)')
    expect(pageSource).toContain('filterTransactionsForYear(transactions, year)')
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
  it('the summary strip and filters collapse to fewer columns at the 760px and 430px breakpoints, never introducing horizontal scroll', () => {
    expect(cssSource).toContain('.taxCenterSummarySection')
    expect(cssSource).toMatch(/@media \(max-width: 760px\) \{[\s\S]*?\.taxCenterSummaryStrip \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
    expect(cssSource).toMatch(/@media \(max-width: 430px\) \{[\s\S]*?\.taxCenterFilters \{ grid-template-columns: 1fr; \}/)
  })

  it('the Add Expense button becomes full-width on mobile — a comfortable tap target, not a small inline link', () => {
    expect(cssSource).toMatch(/@media \(max-width: 760px\) \{[\s\S]*?\.taxCenterAddExpense \{ width: 100%/)
  })

  it('the file-picking input stays hidden behind its label button, matching the existing .editPropertyPhotoButton/.csvButton pattern', () => {
    expect(cssSource).toContain('.taxCenterReceiptButton input[type="file"] { display: none; }')
  })
})
