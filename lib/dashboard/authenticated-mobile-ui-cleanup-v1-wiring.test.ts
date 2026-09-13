import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Authenticated Mobile UI Cleanup V1.
//
// Follows PropCrew Mobile Cleanup V1's own precedent: the same
// "every action gets stretched to equal-width, full-bleed treatment
// below 560/480px" pattern PropCrew's header actions had also existed
// in two other frequently-used Rent-tab surfaces — the "Rent this
// month" card's action row (Lease & Rent) and the Ledger tab's header
// actions. Both are fixed the same minimal way: the offending mobile
// @media rule is REMOVED (not replaced with a new one), letting each
// row's own pre-existing flex-wrap restore natural, content-sized
// buttons — the same primary/secondary hierarchy desktop already has.
// No JSX, handler, calculation, or other screen was touched. Same
// no-jsdom, source-read wiring-test convention as every other
// app/page.tsx test in this repo.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const cssSource = readFile('app/globals.css')

describe('"Rent this month" card actions (Rent > Lease & Rent) are no longer stretched to equal width on mobile', () => {
  it('the old mobile flex:1 stretch rule for .rentThisMonthActions is gone', () => {
    expect(cssSource).not.toMatch(/\.rentThisMonthActions \.primary, \.rentThisMonthActions \.secondary \{ flex: 1;/)
  })

  it('the row itself still wraps naturally (flex-wrap) — buttons keep their own content-sized width instead of being forced to 100%/50-50', () => {
    const rule = cssSource.match(/\.rentThisMonthActions \{[^}]*\}/)?.[0] || ''
    expect(rule).toContain('flex-wrap: wrap')
    expect(rule).not.toMatch(/width:\s*100%/)
  })

  it('both actions and their exact destinations/handlers are preserved — "+ Record Payment" (primary) and "View Full Rent Ledger" (secondary), same hrefs', () => {
    expect(pageSource).toContain('<Link href={`/rent-ledger?lease=${row.leaseId}`} className="primary">+ Record Payment</Link>')
    expect(pageSource).toContain('<Link href="/rent-ledger" className="secondary">View Full Rent Ledger</Link>')
  })
})

describe('Ledger tab header actions (Rent > Ledger) are no longer stretched to equal width on mobile', () => {
  it('the old mobile width:100%/flex:1 stretch rule for .financialActions is gone', () => {
    expect(cssSource).not.toMatch(/\.financialActions \{ width: 100%; \}/)
    expect(cssSource).not.toMatch(/\.financialActions \.primary, \.financialActions \.secondary, \.financialActions \.csvButton \{ flex: 1 1 auto;/)
  })

  it('.financialActions already wraps at the base rule — every breakpoint shares the same natural-sizing behavior, no separate mobile-only sizing needed', () => {
    const rule = cssSource.match(/\.financialActions \{[^}]*\}/)?.[0] || ''
    expect(rule).toContain('flex-wrap: wrap')
  })

  it('Import CSV, Export CSV, the year selector, and + Add transaction are all preserved with their exact handlers', () => {
    const ledgerIdx = pageSource.indexOf("rentSubTab === 'Ledger'")
    const ledgerEnd = pageSource.indexOf('</div>\n              <div className="financialStats"', ledgerIdx)
    const ledgerSlice = pageSource.slice(ledgerIdx, ledgerEnd)
    expect(ledgerSlice).toContain('onChange={(e) => setFinancialYear(e.target.value)}')
    expect(ledgerSlice).toContain('onChange={(e) => { const file = e.target.files?.[0]; if (file) void importTransactionsCsv(file); e.target.value = \'\' }}')
    expect(ledgerSlice).toContain('onClick={exportTransactionsCsv}')
    expect(ledgerSlice).toContain("onClick={() => setShowTransaction(true)}")
  })
})

describe('No calculation, handler, or unrelated screen was touched', () => {
  it('Rent Ledger math (income/expenses/NOI/cash flow) is unchanged', () => {
    expect(pageSource).toContain("const income = selectedYearTransactions.filter((t) => t.transaction_type === 'Income').reduce((sum, t) => sum + Number(t.amount), 0)")
    expect(pageSource).toContain('const noi = income - noiExpenses')
    expect(pageSource).toContain('const cashFlow = income - expenses')
  })

  it('rent-status derivation and the "Due date unavailable" label are unchanged', () => {
    const statusSource = readFile('lib/rent-ledger/status.ts')
    expect(statusSource).toContain("if (obligation.dueDate === null) return 'Unknown'")
    expect(pageSource).toContain("return status === 'Unknown' ? 'Due date unavailable' : status")
  })

  it('PropCrew (just cleaned up in PR #71) is untouched by this milestone', () => {
    const panelSource = readFile('components/PropCrewPanel.tsx')
    expect(panelSource).not.toMatch(/Authenticated Mobile UI Cleanup/)
    expect(cssSource).toMatch(/\.propCrewCard \{ padding: 16px; border-radius: 13px; \}/)
  })

  it('the mobile Property section selector is untouched', () => {
    expect(pageSource).toContain('<div className="mobilePropertyNav" ref={mobileTabMenuRef}>')
    expect(cssSource).toMatch(/\.mobilePropertyNav \{ display: none; \}/)
  })

  it('desktop Property Overview (PR #69/#70) is untouched', () => {
    expect((pageSource.match(/className="overviewPanel propertySnapshotCard"/g) || []).length).toBe(1)
    expect(pageSource).toContain('className="detailRows tenancyGrid"')
  })
})

describe('Guardrails: no font/typography change, no billing/entitlement/schema change', () => {
  it('the global body font-family stack is byte-for-byte unchanged', () => {
    expect(cssSource).toContain('body { margin: 0; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;')
    expect(cssSource).not.toMatch(/fonts\.googleapis\.com|@font-face/i)
  })

  it('no Stripe/billing/entitlements/schema file was touched', () => {
    for (const file of ['lib/billing/stripe.ts', 'lib/billing/entitlements.ts', 'lib/billing/plans.ts']) {
      const source = readFile(file)
      expect(source).not.toMatch(/Authenticated Mobile UI Cleanup/)
    }
    expect(cssSource).not.toMatch(/create table|alter table|create policy/i)
    expect(pageSource).not.toMatch(/create table|alter table|create policy/i)
  })

  it('mobile bottom navigation is untouched', () => {
    expect(cssSource).toContain('.mobileBottomNav { display: none; }')
  })
})
