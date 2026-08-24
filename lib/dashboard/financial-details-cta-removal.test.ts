import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Property Profile / PropCrew UX Improvement, Part 1 — regression guards
// for removing the redundant "View full Investment Analysis ->" CTA from
// the Financial Details card, while keeping the main Investment Analysis
// button in the property hero and every Financial Details row/
// calculation intact. Same source-read technique as
// property-profile-mobile-polish-v3.test.ts (no jsdom/React Testing
// Library in this repo).

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const cardIndex = pageSource.indexOf('financialDetailsCard')
const cardSlice = pageSource.slice(cardIndex, pageSource.indexOf('overviewPanel"><h3>Property facts'))

describe('The redundant bottom CTA is removed from the Financial Details card', () => {
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

  it('there is exactly one Link to the property evaluator on the whole page (the hero button) — not two', () => {
    const matches = pageSource.match(/href={`\/investment-tools\/property-evaluator\?propertyId=\$\{selected\.id\}`}/g) || []
    expect(matches.length).toBe(1)
  })
})

describe('The main Investment Analysis button near the top of the property profile is untouched', () => {
  it('the hero still has its Edit + Investment Analysis actions', () => {
    const heroActionsIdx = pageSource.indexOf('heroInfoActions')
    const slice = pageSource.slice(heroActionsIdx, heroActionsIdx + 400)
    expect(slice).toContain('>Edit</button>')
    expect(slice).toContain('>Investment Analysis</Link>')
    expect(slice).toContain('/investment-tools/property-evaluator?propertyId=')
  })
})

describe('Financial Details rows and calculations are preserved exactly as before', () => {
  it('Monthly property expenses, Estimated cash flow, Purchase price, Appreciation, and Annual property tax all remain, using the existing data/calculations', () => {
    expect(cardSlice).toContain('<span>Monthly property expenses</span><strong>{money(selected.monthly_expenses)}</strong>')
    expect(cardSlice).toContain('<span>Estimated cash flow</span><strong>{money(monthlyCashFlow)}/mo</strong>')
    expect(cardSlice).toContain('<span>Purchase price</span><strong>{money(selected.purchase_price)}</strong>')
    expect(cardSlice).toContain('appreciation.amount')
    expect(cardSlice).toContain('<span>Annual property tax</span>')
    expect(cardSlice).toContain("selected.property_tax_annual != null ? money(selected.property_tax_annual) : 'Not entered'")
  })

  it('no financial formula changed — monthlyCashFlow/equity/appreciation are still computed exactly once, the same way', () => {
    expect(pageSource.match(/const monthlyCashFlow =/g)?.length).toBe(1)
    expect(pageSource).toContain('const monthlyCashFlow = Number(selected.monthly_rent) - Number(selected.monthly_expenses)')
    expect(pageSource.match(/const equity =/g)?.length).toBe(1)
    expect(pageSource).toContain('const equity = Number(selected.estimated_value) - Number(selected.mortgage_balance)')
  })
})
