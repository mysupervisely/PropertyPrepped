import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Property Profile / PropCrew UX Improvement, Part 1 — regression guards
// for removing the redundant "View full Investment Analysis ->" CTA from
// the Financial Details card, while keeping the main Investment Analysis
// link in the property hero and every remaining Financial Details row/
// calculation intact. Same source-read technique as
// property-profile-mobile-polish-v3.test.ts (no jsdom/React Testing
// Library in this repo).
//
// UPDATED for Property Intelligence V1, Phase C.1 (Unified Property
// Snapshot): the card was renamed "Expenses & tax" and slimmed —
// Estimated cash flow was retired from presentation, Purchase Price/
// Appreciation moved into the unified Property Snapshot, and the hero's
// Investment Analysis button became a quiet text link (.heroInvestmentLink,
// same destination/functionality). See
// property-intelligence-v1-phase-c1-unified-snapshot.test.ts for the
// full set of current assertions on that phase; this file keeps the
// still-true "no redundant CTA" invariants updated in place.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const cardIndex = pageSource.indexOf('financialDetailsCard')
const cardSlice = pageSource.slice(cardIndex, pageSource.indexOf('<h3 className="overviewInfoGroupLabel">Property facts'))

describe('The redundant bottom CTA is removed from the "Expenses & tax" card (formerly Financial Details)', () => {
  it('the card no longer contains "View full Investment Analysis" text or a link to the evaluator', () => {
    expect(cardSlice).not.toContain('View full Investment Analysis')
    expect(cardSlice).not.toContain('/investment-tools/property-evaluator?propertyId=')
  })

  it('the now-unused .financialDetailsLink class was removed from the JSX and its CSS rule no longer exists', () => {
    expect(cardSlice).not.toContain('financialDetailsLink')
    const cssSource = readFile('app/globals.css')
    // The class name may still appear in an explanatory comment (it does,
    // documenting the removal) — what must be gone is the actual rule.
    expect(cssSource).not.toMatch(/\.financialDetailsLink\s*\{/)
  })

  it('there is exactly one Link to the property evaluator on the whole page (the hero link) — not two', () => {
    const matches = pageSource.match(/href={`\/investment-tools\/property-evaluator\?propertyId=\$\{selected\.id\}`}/g) || []
    expect(matches.length).toBe(1)
  })
})

describe('The Investment Analysis entry point near the top of the property profile is untouched (Phase C.1: presentation-only de-emphasis)', () => {
  it('the hero still has its Edit + Investment Analysis actions, now with Investment Analysis as a quiet text link rather than a bordered button', () => {
    const heroActionsIdx = pageSource.indexOf('heroInfoActions')
    const slice = pageSource.slice(heroActionsIdx, heroActionsIdx + 400)
    expect(slice).toContain('>Edit</button>')
    expect(slice).toContain('>Investment Analysis</Link>')
    expect(slice).toContain('className="heroInvestmentLink"')
    expect(slice).toContain('/investment-tools/property-evaluator?propertyId=')
  })
})

describe('"Expenses & tax" rows and calculations are preserved for everything still shown there', () => {
  it('Monthly property expenses and Annual property tax remain, using the existing data/calculations', () => {
    expect(cardSlice).toContain('<span>Monthly property expenses</span><strong>{money(selected.monthly_expenses)}</strong>')
    expect(cardSlice).toContain('<span>Annual property tax</span>')
    expect(cardSlice).toContain("selected.property_tax_annual != null ? money(selected.property_tax_annual) : 'Not entered'")
  })

  it('Estimated cash flow was deliberately retired from presentation (Phase C.1) — it is no longer on this card or anywhere else, but the underlying rent/expenses data and edit capability are untouched', () => {
    expect(cardSlice).not.toContain('Estimated cash flow')
    expect(pageSource).not.toMatch(/const monthlyCashFlow =/)
    expect(pageSource).toContain('selected.monthly_expenses')
    expect(pageSource).toContain('selected.monthly_rent')
  })

  it('Purchase Price and Appreciation moved into the unified Property Snapshot (not deleted) — same appreciationFor() calculation, computed once (Phase C.3: now one compact inline line, .propertySnapshotContextLine, instead of two boxed rows)', () => {
    expect(cardSlice).not.toContain('Purchase price')
    expect(cardSlice).not.toContain('Appreciation')
    const snapshotIdx = pageSource.indexOf('propertySnapshotContextLine')
    const snapshotSlice = pageSource.slice(snapshotIdx, snapshotIdx + 500)
    expect(snapshotSlice).toContain('Purchase <strong>{compactMoney(selected.purchase_price)}</strong>')
    expect(snapshotSlice).toContain('appreciation.amount')
    expect(pageSource.match(/const appreciation = appreciationFor\(/g)?.length).toBe(1)
  })
})
