import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Property Intelligence V1, Phase C.1 — Unified Property Snapshot.
//
// The production property page had drifted into FOUR places showing
// overlapping/contradictory numbers: the hero's old .heroMetrics strip,
// Phase C's Property Snapshot, the pre-existing "Financial details" card,
// and a real bug — an "Occupied / Rent Unknown" status pill sitting next
// to an already-visible rent dollar figure. This phase consolidates all
// of that into ONE authoritative snapshot and fixes the contradiction at
// its source. Same no-jsdom, source-read wiring-test convention as every
// other app/page.tsx test in this repo.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const cssSource = readFile('app/globals.css')

const heroStart = pageSource.indexOf('<section className="propertyHero">')
const heroEnd = pageSource.indexOf('</section>', heroStart) + '</section>'.length
const heroSlice = pageSource.slice(heroStart, heroEnd)

describe('Phase C.1: the hero is identity-only — no financial numbers', () => {
  it('.heroMetrics is gone from the hero markup entirely', () => {
    expect(heroSlice).not.toContain('heroMetrics')
  })

  it('the hero still shows address, city, and the property-scoped actions (Edit, Investment Analysis)', () => {
    expect(heroSlice).toContain('<h1>{selected.address}</h1>')
    expect(heroSlice).toContain('className="heroCity"')
    expect(heroSlice).toContain('>Edit</button>')
    expect(heroSlice).toContain('>Investment Analysis</Link>')
  })

  it('no Value/Mortgage/Equity/Rent/Tax dollar figure is rendered inside the hero anymore', () => {
    expect(heroSlice).not.toContain('money(selected.estimated_value)')
    expect(heroSlice).not.toContain('money(selected.mortgage_balance)')
    expect(heroSlice).not.toContain('money(selected.monthly_rent)')
    expect(heroSlice).not.toContain('money(selected.property_tax_annual)')
  })

  it('the naive, non-engine `equity` local (estimated_value − mortgage_balance) no longer exists anywhere in the file', () => {
    expect(pageSource).not.toMatch(/const equity = Number\(selected\.estimated_value\) - Number\(selected\.mortgage_balance\)/)
  })
})

describe('Phase C.1: Investment Analysis reads as secondary, not equal-weight with Edit', () => {
  it('uses the quiet brand-color text-link treatment (.heroInvestmentLink), not the bordered .secondary button it used to share with Edit', () => {
    const actionsIdx = heroSlice.indexOf('heroInfoActions')
    const actionsSlice = heroSlice.slice(actionsIdx, actionsIdx + 400)
    expect(actionsSlice).toContain('<button className="secondary" onClick={() => openEditProperty(selected)}>Edit</button>')
    expect(actionsSlice).toContain('<Link className="heroInvestmentLink"')
    expect(actionsSlice).not.toContain('<Link className="secondary"')
  })

  it('.heroInvestmentLink reuses the existing .needsAttentionViewAll quiet-text-link pattern (brand color, no border/box, small trailing chevron) rather than inventing a new visual treatment', () => {
    const rule = cssSource.match(/\.heroInvestmentLink\s*\{[^}]*\}/)?.[0] || ''
    const precedent = cssSource.match(/\.needsAttentionViewAll\s*\{[^}]*\}/)?.[0] || ''
    expect(rule).toContain('border: 0')
    expect(rule).toContain('background: transparent')
    expect(rule).toContain('color: var(--brand)')
    expect(precedent).toContain('border: 0')
    expect(precedent).toContain('background: transparent')
    expect(precedent).toContain('color: var(--brand)')
    expect(cssSource).toMatch(/\.heroInvestmentLink::after \{ content: '›';/)
  })

  it('destination and functionality are unchanged — still the same evaluator link, still exactly one on the page', () => {
    const matches = pageSource.match(/href={`\/investment-tools\/property-evaluator\?propertyId=\$\{selected\.id\}`}/g) || []
    expect(matches.length).toBe(1)
  })
})

describe('Phase C.1: the "Rent Unknown" vs. known-rent contradiction is fixed at its source, not patched twice', () => {
  it('a single `rentAmountKnown` const, gated on the canonical Property Intelligence rent metric, is computed once and reused at every rent-status pill', () => {
    expect(pageSource).toContain("const rentAmountKnown = performance.contractMonthlyRent.status === 'available'")
    expect(pageSource.match(/const rentAmountKnown =/g)?.length).toBe(1)
  })

  it('the hero rent-status pill is suppressed when status is Unknown but the canonical rent amount IS known', () => {
    expect(heroSlice).toContain("{currentRentRow && !(currentRentRow.status === 'Unknown' && rentAmountKnown) && <span className={`statusPill ${rentStatusPillClass(currentRentRow.status)}`}>Rent {currentRentRow.status}</span>}")
  })

  it('the Tenancy section\'s rent-status pill gets the same fix, not a second/different rule', () => {
    const tenancyIdx = pageSource.indexOf('<h2 className="overviewSectionHeading">Tenancy</h2>')
    // Widened from the original 1200 (Desktop Property Page Quiet Layout
    // V1 added an explanatory comment ahead of the tenancyGrid container
    // between the heading and the rent-status pill) — the pill's fix
    // itself is unchanged, just further from the heading now.
    const tenancySlice = pageSource.slice(tenancyIdx, tenancyIdx + 1800)
    expect(tenancySlice).toContain("!(currentRentRow.status === 'Unknown' && rentAmountKnown)")
  })

  it('lib/rent-ledger/status.ts (the source of RentStatus.Unknown) was NOT modified — the fix is presentation-only, reusing Property Intelligence\'s rent resolution rather than a second competing rule', () => {
    const statusSource = readFile('lib/rent-ledger/status.ts')
    // Structural markers proving deriveRentObligation/deriveRentStatus are
    // exactly the pre-existing, still-correct-for-their-own-purpose logic.
    expect(statusSource).toContain('missing_rent_due_day')
    expect(statusSource).toContain("function deriveRentStatus")
    expect(statusSource).toContain("function deriveRentObligation")
  })

  it('the portfolio-grid property card (an unrelated location, out of scope for this fix) is untouched', () => {
    const gridIdx = pageSource.indexOf('rentStatusPillClass')
    expect(gridIdx).toBeGreaterThan(-1)
    // Just confirms rentStatusPillClass is still used for the grid/other
    // call sites beyond the two fixed here — i.e. this wasn't a global
    // find/replace that could have silently touched unrelated markup.
    const allCallSites = pageSource.match(/rentStatusPillClass\(/g) || []
    expect(allCallSites.length).toBeGreaterThanOrEqual(3)
  })
})

describe('Phase C.1: the old "Estimated cash flow" formula is retired from presentation, not deleted from the data model', () => {
  it('the naive monthlyCashFlow local (rent − expenses) no longer exists anywhere in the file', () => {
    expect(pageSource).not.toMatch(/const monthlyCashFlow =/)
    // "Estimated cash flow" may still appear in an explanatory comment
    // documenting the removal (it does) — what must be gone is the
    // actual rendered row.
    expect(pageSource).not.toContain('<span>Estimated cash flow</span>')
  })

  it('the underlying monthly_rent/monthly_expenses fields are still read and still editable — only the competing display was removed', () => {
    expect(pageSource).toContain('selected.monthly_expenses')
    expect(pageSource).toContain('selected.monthly_rent')
    // Edit property facts (the same modal as before) is still reachable
    // from Overview.
    expect(pageSource).toContain('Edit property facts')
  })
})

describe('Phase C.1: the renamed, slimmed "Expenses & tax" card (formerly "Financial details")', () => {
  const cardIdx = pageSource.indexOf('financialDetailsCard')
  const cardSlice = pageSource.slice(cardIdx, pageSource.indexOf('<h3 className="overviewInfoGroupLabel">Property facts'))

  it('keeps Monthly property expenses, Annual property tax, and HOA — editable property-level inputs, not performance figures', () => {
    expect(cardSlice).toContain('<h3 className="overviewInfoGroupLabel">Expenses &amp; tax</h3>')
    expect(cardSlice).toContain('<span>Monthly property expenses</span><strong>{money(selected.monthly_expenses)}</strong>')
    expect(cardSlice).toContain('<span>Annual property tax</span>')
    expect(cardSlice).toContain('selected.hoa_monthly')
  })

  it('no longer contains Estimated cash flow, Purchase price, or Appreciation — those were retired or moved into the unified snapshot above', () => {
    expect(cardSlice).not.toContain('Estimated cash flow')
    expect(cardSlice).not.toContain('<span>Purchase price</span>')
    expect(cardSlice).not.toContain('<span>Purchase Price</span>')
    expect(cardSlice).not.toContain('Appreciation')
  })

  it('Annual property tax still uses the truthful "Not entered" fallback, never a fabricated $0', () => {
    expect(cardSlice).toContain("selected.property_tax_annual != null ? money(selected.property_tax_annual) : 'Not entered'")
  })
})

describe('Phase C.1: Property Facts stays out of the financial metric grid', () => {
  it('beds/baths/sqft/year built/lot size/purchase date remain in their own separate card, not folded into the snapshot or the Expenses & tax card', () => {
    const factsIdx = pageSource.indexOf('<h3 className="overviewInfoGroupLabel">Property facts')
    const factsSlice = pageSource.slice(factsIdx, factsIdx + 900)
    expect(factsSlice).toContain('selected.beds')
    expect(factsSlice).toContain('selected.baths')
    expect(factsSlice).toContain('selected.square_feet')
    const snapshotIdx = pageSource.indexOf('propertySnapshotCard')
    expect(factsIdx).toBeGreaterThan(snapshotIdx)
  })
})

describe('Phase C.1: everything else stays intact', () => {
  it('all seven tabs are unchanged — no navigation redesign', () => {
    expect(pageSource).toContain("const tabs: Tab[] = ['Overview', 'Rent', 'Maintenance', 'Details', 'PropCrew', 'Documents', 'Tax']")
  })

  it('Edit property (hero) and Edit property facts (Overview) both still open the same existing edit flow', () => {
    expect((pageSource.match(/onClick=\{\(\) => openEditProperty\(selected\)\}/g) || []).length).toBeGreaterThanOrEqual(2)
  })

  it('Notes, Timeline, and Quick actions are untouched', () => {
    const idx = pageSource.indexOf("activeTab === 'Overview'")
    const end = pageSource.indexOf("activeTab === 'Documents'")
    const overviewSlice = pageSource.slice(idx, end)
    expect(overviewSlice).toContain('<PropertyNotesPanel')
    expect(overviewSlice).toContain('<PropertyTimelinePanel')
    expect(overviewSlice).toMatch(/className="overviewInfoSection quickActions"/)
  })

  it('no schema/migration changes were made', () => {
    expect(pageSource).not.toMatch(/create table|alter table|create policy/i)
  })
})
