import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Needs Attention V2: replaces the always-expanded inline "Needs Your
// Attention" section (its own Hide/Show/View all presentation states —
// see git history for lib/dashboard/needs-attention-hide-show-wiring
// .test.ts, deleted alongside this redesign) with one compact,
// interactive tile inside the existing Portfolio Snapshot grid, plus a
// modal (opened on tap) showing the full, already-computed attentionRows
// list. Source-read regression guards, matching this repo's established
// no-jsdom convention (no React Testing Library in this project).

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const globalsCss = readFile('app/globals.css')

describe('The compact tile lives inside the existing Portfolio Snapshot grid', () => {
  it('is a real <button>, styled with the same .portfolioSnapshotMetric base as the other four tiles, plus its own modifier class', () => {
    expect(pageSource).toContain('className="portfolioSnapshotMetric needsAttentionSnapshotTile"')
  })

  it('tapping it opens the sheet — a plain boolean, no persisted preference (there is nothing left to remember once "hidden" is no longer a state)', () => {
    expect(pageSource).toContain('const [attentionSheetOpen, setAttentionSheetOpen] = useState(false)')
    expect(pageSource).toContain('onClick={() => setAttentionSheetOpen(true)}')
    expect(pageSource).not.toContain('needsAttentionVisible')
    expect(pageSource).not.toContain('proproster:needsAttentionVisible')
  })

  it('spans the full grid row (1 / -1) — the one interactive/actionable tile, deliberately not a quarter-width tile competing with the four informational metrics', () => {
    const rule = globalsCss.match(/\.needsAttentionSnapshotTile \{[^}]*\}/)?.[0] || ''
    expect(rule).toContain('grid-column: 1 / -1')
  })

  it('shows the raw attentionRows.length count, or a calm zero-state when nothing needs attention', () => {
    const tileIdx = pageSource.indexOf('className="portfolioSnapshotMetric needsAttentionSnapshotTile"')
    const tileSlice = pageSource.slice(tileIdx, tileIdx + 700)
    expect(tileSlice).toContain('attentionRows.length === 0')
    expect(tileSlice).toContain('needsAttentionSnapshotCountZero')
    expect(tileSlice).toContain('{attentionRows.length}')
  })
})

describe('The modal shows the full list — there is no partial "preview" subset left to expand', () => {
  it('renders only when attentionSheetOpen is true, using the same .overlay/.modal pattern every other PropRoster modal already uses', () => {
    expect(pageSource).toContain('{attentionSheetOpen && (')
    const modalIdx = pageSource.indexOf('{attentionSheetOpen && (')
    const modalSlice = pageSource.slice(modalIdx, modalIdx + 900)
    expect(modalSlice).toContain('className="overlay"')
    expect(modalSlice).toContain('className="modal needsAttentionModal"')
  })

  it('closes on backdrop click and on the explicit close button, the same convention as every other overlay in this file', () => {
    const modalIdx = pageSource.indexOf('{attentionSheetOpen && (')
    const modalSlice = pageSource.slice(modalIdx, modalIdx + 900)
    expect(modalSlice).toContain("onMouseDown={(e) => e.target === e.currentTarget && setAttentionSheetOpen(false)}")
    expect(modalSlice).toContain('aria-label="Close" onClick={() => setAttentionSheetOpen(false)}')
  })

  it('renders attentionRows in full — no slice/limit applied', () => {
    const modalIdx = pageSource.indexOf('{attentionSheetOpen && (')
    const modalSlice = pageSource.slice(modalIdx, modalIdx + 900)
    expect(modalSlice).toContain('<div className="dashboardItemList">{attentionRows}</div>')
    expect(pageSource).not.toContain('visibleAttentionRows')
  })

  it('the calm empty state ("You\'re all caught up.") is preserved verbatim inside the modal', () => {
    const modalIdx = pageSource.indexOf('{attentionSheetOpen && (')
    const modalSlice = pageSource.slice(modalIdx, modalIdx + 900)
    expect(modalSlice).toContain('<p className="muted needsAttentionEmpty">You&apos;re all caught up.</p>')
  })
})

describe('Every item still routes through the exact same goToNav/openProperty mechanism, now also closing the sheet first', () => {
  it('attentionRows itself (attentionItems/vacancyItems/openMaintenanceItems) is unchanged — this is a presentation-only redesign', () => {
    expect(pageSource).toContain('const attentionRows = [')
    expect(pageSource).toContain('...attentionItems.map(')
    expect(pageSource).toContain('...vacancyItems.map(')
    expect(pageSource).toContain('...openMaintenanceItems.map(')
  })

  it('each of the three item groups closes the sheet before calling goToNav — a tap both routes to the real workflow and dismisses the modal', () => {
    const idx = pageSource.indexOf('const attentionRows = [')
    const body = pageSource.slice(idx, pageSource.indexOf('\n  return (', idx))
    const occurrences = body.split('onOpen={() => { setAttentionSheetOpen(false); goToNav(item.propertyId, item.nav) }}').length - 1
    expect(occurrences).toBe(3)
  })

  it('dismissal (Clear) is untouched — still wired to the same clearAttentionItem/buildAttentionDismissalKey the old section used', () => {
    const idx = pageSource.indexOf('const attentionRows = [')
    const body = pageSource.slice(idx, pageSource.indexOf('\n  return (', idx))
    expect(body).toContain('void clearAttentionItem(')
    expect(body).toContain('buildAttentionDismissalKey(item)')
  })
})

describe('The old always-expanded section and its presentation states are gone, not left as dead code', () => {
  for (const removed of [
    'commandCenterSection needsAttentionSection',
    'showAllAttention',
    'attentionVisible',
    'toggleAttentionVisible',
    'NEEDS_ATTENTION_PREVIEW_LIMIT',
    'needsAttentionHideToggle',
    'needsAttentionViewAll',
    'needsAttentionMetaRow',
  ]) {
    it(`no remaining reference to ${removed}`, () => {
      expect(pageSource).not.toContain(removed)
    })
  }

  for (const removedCss of ['.needsAttentionHideToggle', '.needsAttentionViewAll', '.needsAttentionMetaRow', '.needsAttentionActions', '.needsAttentionCount ']) {
    it(`no remaining CSS rule for ${removedCss}`, () => {
      expect(globalsCss).not.toContain(`${removedCss} {`)
    })
  }
})
