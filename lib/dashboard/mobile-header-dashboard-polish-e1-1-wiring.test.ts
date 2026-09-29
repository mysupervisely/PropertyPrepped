import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Simplification + Maintenance Workspace V2, Phase E1.1: final mobile
// header + dashboard polish pass. Source-read regression guards,
// matching this repo's established no-jsdom convention (see lib/
// uploads/upload-reliability-wiring.test.ts for the direct precedent).
// Complements (does not replace) lib/dashboard/mobile-nav-e1-wiring.
// test.ts and lib/user-profile/profile-entry-point-wiring.test.ts,
// which this phase also updated for the header/avatar changes — this
// file protects the pieces those don't: the "View all" quiet styling,
// the Needs Your Attention density pass, and the search control.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const globalsCss = readFile('app/globals.css')

// Needs Attention V2 replaced the "View all" quiet-text toggle (and the
// showAllAttention preview/expand state it drove) with a compact
// snapshot tile that opens a modal showing the full list directly — see
// lib/dashboard/needs-attention-compact-card-wiring.test.ts for that
// redesign's own dedicated coverage. The row-density pass below still
// applies, just rescoped from the old always-expanded section to the
// new modal.

describe('Needs Your Attention row density pass (Section 6) — scoped to this section only', () => {
  it('reduces .dashboardItemRow padding only inside .needsAttentionModal, leaving the shared class (and Recent Activity, which reuses it) untouched', () => {
    expect(globalsCss).toContain('.needsAttentionModal .dashboardItemRow { padding: 10px 14px; }')
    // The shared base rule keeps its original, more generous padding —
    // Recent Activity and any other list using .dashboardItemRow is
    // unaffected by this scoped override.
    expect(globalsCss).toContain('.dashboardItemRow { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 12px; width: 100%; text-align: left; border: 1px solid var(--line); border-radius: 12px; padding: 13px 14px;')
  })

  it('no information was removed from the row — title/pill/property/date all still render from the same attentionRows JSX', () => {
    const idx = pageSource.indexOf('const attentionRows = [')
    const body = pageSource.slice(idx, pageSource.indexOf('\n  return (', idx))
    expect(body).toContain('statusPill')
    expect(body).toContain('dashboardItemBody')
    expect(body).toContain('item.propertyLabel')
    expect(body).toContain('dateOnly(item.date)')
  })

  it('no new color/visual treatment was introduced — same statusPill/pillWarn/pillBad/pillNeutral classes as before', () => {
    const idx = pageSource.indexOf('const attentionRows = [')
    const body = pageSource.slice(idx, pageSource.indexOf('\n  return (', idx))
    expect(body).toMatch(/pillWarn|pillBad|pillNeutral/)
  })
})

describe('Search stays a compact circular icon control (Section 4) — unchanged functionality', () => {
  const headerSource = readFile('components/AuthHeader.tsx')
  it('same /search route/link, same icon, no enlargement beyond the existing compact-circle treatment', () => {
    expect(headerSource).toContain('<Link href="/search" className="headerSearchButton" aria-label="Search">')
    const rule = globalsCss.match(/\.headerSearchButton \{[^}]*\}/)?.[0] || ''
    expect(rule).toContain('border-radius: 999px')
  })

  it('the mobile-shrink treatment keeps it a real, accessible tap target (34px, not shrunk below the established 32px floor)', () => {
    expect(globalsCss).toContain('.headerSearchButton { width: 34px; height: 34px; font-size: 13.5px; }')
  })
})

describe('Maintenance/PropCrew/Tax Center/Documents functionality untouched (Section 7 scope protection)', () => {
  it('the four-item bottom nav is unchanged by this phase', () => {
    const navSource = readFile('components/MobileBottomNav.tsx')
    const labels = [...navSource.matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1])
    expect(labels).toEqual(['Dashboard', 'Maintenance', 'PropCrew', 'Tax Center'])
  })

  it('MaintenanceCaseDetail and the maintenance filter row were not touched by this commit', () => {
    const caseDetailSource = readFile('components/maintenance/MaintenanceCaseDetail.tsx')
    expect(caseDetailSource).toContain("const STATUSES: MaintenanceCaseStatus[] = ['Submitted', 'Scheduled', 'In Progress', 'Completed']")
    const maintenancePageSource = readFile('app/maintenance/page.tsx')
    expect(maintenancePageSource).toContain("Needs attention ({summary.activeCount})")
  })
})
