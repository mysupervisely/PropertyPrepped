import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Documents + Navigation + Realtor Connect Polish, Section 8 — Dashboard
// Navigation Bug regression guard.
//
// Root cause: the property workspace (app/page.tsx) is a single-page app
// living entirely at "/" — a normal <Link href="/"> click while ALREADY
// on "/" is a same-route no-op in Next.js, so the hamburger menu's
// "Dashboard" link never cleared the page's own selectedId state. The
// user had to use "All Properties" instead (which calls
// setSelectedId(null) directly) to actually leave the property detail
// view. Fix: AuthHeader already threads onBrandClick to the wordmark for
// this exact reason (see its own top comment) — now it also threads it
// into AuthNavMenu as onDashboardNavigate, and AuthNavMenu's "Dashboard"
// link calls that instead of navigating when it's present.
//
// There is no jsdom/React Testing Library in this repo (every existing
// test is a pure-function/testable-core test, and no components/ dir
// has ever had a test file) — same source-read technique already used in
// lib/investment-tools/evaluator-layout-order.test.ts and
// lib/realtor-leads/customer-copy.test.ts.

const ROOT = join(__dirname, '..', '..')

function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

describe('Dashboard Navigation Bug fix — AuthNavMenu', () => {
  const source = readFile('components/AuthNavMenu.tsx')

  it('accepts an onDashboardNavigate callback', () => {
    expect(source).toContain('onDashboardNavigate')
  })

  it('the Dashboard link (href="/") calls onDashboardNavigate instead of navigating when one is provided', () => {
    expect(source).toContain("if (link.href === '/' && onDashboardNavigate)")
    expect(source).toContain('e.preventDefault()')
    expect(source).toContain('onDashboardNavigate()')
  })

  it('the Dashboard entry is still a real Link to "/" for every page with no callback (Search, Profile, Pricing, …)', () => {
    expect(source).toContain("{ href: '/', label: 'Dashboard' }")
  })
})

describe('Dashboard Navigation Bug fix — AuthHeader threads the same reset it already uses for the wordmark', () => {
  const source = readFile('components/AuthHeader.tsx')

  it('passes onBrandClick to AuthNavMenu as onDashboardNavigate', () => {
    expect(source).toContain('<AuthNavMenu onDashboardNavigate={onBrandClick} />')
  })
})

describe('Dashboard Navigation Bug fix — the property workspace still wires its own reset, and All Properties is untouched', () => {
  const source = readFile('app/page.tsx')

  it('the property detail view passes onBrandClick={() => setSelectedId(null)} to AuthHeader (the same reset Dashboard now reuses)', () => {
    expect(source).toContain('<AuthHeader onBrandClick={() => setSelectedId(null)}')
  })

  it('"All Properties" still calls setSelectedId(null) directly — a separate, unchanged action from Dashboard', () => {
    const breadcrumbIndex = source.indexOf('breadcrumbBack')
    expect(breadcrumbIndex).toBeGreaterThan(-1)
    const nearby = source.slice(breadcrumbIndex, breadcrumbIndex + 120)
    expect(nearby).toContain('setSelectedId(null)')
    expect(nearby).toContain('All Properties')
  })
})
