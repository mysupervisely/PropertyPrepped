import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Mobile Dashboard Grid V2: at mobile widths, the Portfolio Snapshot
// grid becomes exactly four compact cards in a 2x2 grid — Portfolio
// Value | Monthly Rent on top, Properties | Needs Attention on the
// bottom. Desktop keeps its original four-tile row (Properties /
// Portfolio Value / Monthly Rent / YTD NOI) plus the existing full
// Needs Your Attention section, both completely unchanged. Source-read
// regression guards, matching this repo's established no-jsdom
// convention (see lib/dashboard/needs-attention-compact-card-wiring
// .test.ts for the direct precedent this follows).

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const cssSource = readFile('app/globals.css')

const gridIdx = pageSource.indexOf('<div className="portfolioSnapshotGrid">')
const gridEnd = pageSource.indexOf('</div>', pageSource.indexOf('needsAttentionSnapshotTile', gridIdx)) + '</div>'.length
const gridSlice = pageSource.slice(gridIdx, gridEnd)

describe('Desktop: the original four-tile Portfolio Snapshot row is unchanged', () => {
  it('still renders Properties, Portfolio Value, Monthly Rent, and YTD NOI, in that order, from the same portfolioPerformance data', () => {
    expect(gridSlice).toContain('portfolioSnapshotMetricProperties')
    expect(gridSlice).toContain('{portfolioPerformance.propertyCount}')
    expect(gridSlice).toContain('portfolioSnapshotMetricValue')
    expect(gridSlice).toContain('metricCompactMoney(portfolioPerformance.portfolioValue)')
    expect(gridSlice).toContain('portfolioSnapshotMetricRent')
    expect(gridSlice).toContain("metricMoney(portfolioPerformance.monthlyRent, '/mo')")
    expect(gridSlice).toContain('portfolioSnapshotMetricNOI')
    expect(gridSlice).toContain('metricMoney(portfolioPerformance.noiYtd)')
    const propertiesIdx = gridSlice.indexOf('portfolioSnapshotMetricProperties')
    const valueIdx = gridSlice.indexOf('portfolioSnapshotMetricValue')
    const rentIdx = gridSlice.indexOf('portfolioSnapshotMetricRent')
    const noiIdx = gridSlice.indexOf('portfolioSnapshotMetricNOI')
    expect(propertiesIdx).toBeLessThan(valueIdx)
    expect(valueIdx).toBeLessThan(rentIdx)
    expect(rentIdx).toBeLessThan(noiIdx)
  })

  it('the existing full Needs Your Attention section (desktop) still renders unchanged, with its own hide/show/view-all states intact', () => {
    expect(pageSource).toContain('<section className="commandCenterSection needsAttentionSection">')
    expect(pageSource).toContain('<h2>Needs Your Attention</h2>')
    expect(pageSource).toContain('toggleAttentionVisible')
    expect(pageSource).toContain('setShowAllAttention')
  })

  it('the Needs Attention tile and its mobile-only CSS do not alter desktop\'s layout — the tile is display:none by default, only shown inside the <=760px media query', () => {
    expect(cssSource).toMatch(/\.needsAttentionSnapshotTile\s*\{[^}]*display:\s*none/)
  })
})

describe('Mobile (<=760px): exactly four compact cards, 2x2, in the specified order', () => {
  const mobileBlock = cssSource.match(/@media \(max-width: 760px\) \{[\s\S]*?\.portfolioSnapshotGrid[\s\S]*?\n\}/)?.[0] || ''

  it('the grid becomes 2 columns', () => {
    expect(mobileBlock).toMatch(/\.portfolioSnapshotGrid\s*\{\s*grid-template-columns:\s*repeat\(2,/)
  })

  it('Portfolio Value is top-left (order 1) and Monthly Rent is top-right (order 2)', () => {
    expect(mobileBlock).toMatch(/\.portfolioSnapshotMetricValue\s*\{\s*order:\s*1/)
    expect(mobileBlock).toMatch(/\.portfolioSnapshotMetricRent\s*\{\s*order:\s*2/)
  })

  it('Properties is bottom-left (order 3) and the Needs Attention tile is bottom-right (order 4, shown)', () => {
    expect(mobileBlock).toMatch(/\.portfolioSnapshotMetricProperties\s*\{\s*order:\s*3/)
    expect(mobileBlock).toMatch(/\.needsAttentionSnapshotTile\s*\{\s*display:\s*flex;\s*order:\s*4/)
  })

  it('YTD NOI is hidden — exactly four cards, not five', () => {
    expect(mobileBlock).toMatch(/\.portfolioSnapshotMetricNOI\s*\{\s*display:\s*none/)
  })

  it('the desktop Needs Your Attention section is hidden on mobile — the compact card + sheet is the only path there', () => {
    expect(mobileBlock).toMatch(/\.needsAttentionSection\s*\{\s*display:\s*none/)
  })
})

describe('Tapping the compact Needs Attention card opens a sheet with the real, actionable list', () => {
  it('shows a live count — 0 with a checkmark when caught up, the real number otherwise — never a placeholder', () => {
    expect(gridSlice).toContain("attentionRows.length === 0")
    expect(gridSlice).toContain('needsAttentionSnapshotCountZero')
    expect(gridSlice).toContain('{attentionRows.length}')
  })

  it('tapping the card opens attentionSheetOpen, a real piece of component state', () => {
    expect(pageSource).toContain('const [attentionSheetOpen, setAttentionSheetOpen] = useState(false)')
    expect(gridSlice).toContain('onClick={() => setAttentionSheetOpen(true)}')
  })

  it('the sheet renders the exact same attentionRows list as the desktop section — same DismissibleAttentionRow components, same onOpen navigation, same onClear dismissal, not a second parallel list', () => {
    const sheetIdx = pageSource.indexOf('{attentionSheetOpen && (')
    const sheetEnd = pageSource.indexOf('needsAttentionSection', sheetIdx)
    const sheetSlice = pageSource.slice(sheetIdx, sheetEnd)
    expect(sheetSlice).toContain('<div className="dashboardItemList">{attentionRows}</div>')
    expect(sheetSlice).toContain("You&apos;re all caught up.")
    expect(sheetSlice).toContain('setAttentionSheetOpen(false)')
  })

  it('every attention row still navigates via the existing goToNav/onOpen mechanism — no new navigation path was invented', () => {
    const rowsIdx = pageSource.indexOf('const attentionRows = [')
    const rowsEnd = pageSource.indexOf('const NEEDS_ATTENTION_PREVIEW_LIMIT')
    const rowsSlice = pageSource.slice(rowsIdx, rowsEnd)
    expect(rowsSlice.match(/onOpen=\{\(\) => goToNav\(/g)?.length).toBeGreaterThanOrEqual(3)
  })
})
