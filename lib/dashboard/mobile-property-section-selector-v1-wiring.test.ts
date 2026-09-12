import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Mobile Property Section Selector V1.
//
// Part A replaces the horizontally-scrolling mobile .tabs strip (below
// 761px) with one compact "current section ▾" control
// (.mobilePropertyNav) that opens a small anchored menu listing the
// SAME `tabs` array — never a second/duplicated section list. Desktop
// keeps the existing .tabs row, completely untouched above that
// breakpoint. The Rent tab's own secondary sub-tabs (Lease & Rent /
// Ledger / Tenant) are a separate, lower-level control and are not
// touched or collapsed into this new selector.
//
// Part B replaces the literal word "Unknown" with the truthful "Due
// date unavailable" everywhere a rent-status pill renders it — RentStatus
// itself, deriveRentStatus, and every other status word are unchanged.
//
// Same no-jsdom, source-read wiring-test convention as every other
// app/page.tsx test in this repo.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const cssSource = readFile('app/globals.css')
const rentLedgerPageSource = readFile('app/rent-ledger/page.tsx')
const statusSource = readFile('lib/rent-ledger/status.ts')

describe('Part A — desktop primary Property navigation is untouched', () => {
  it('the desktop .tabs row still renders every entry in the same canonical `tabs` array, unfiltered', () => {
    expect(pageSource).toContain("const tabs: Tab[] = ['Overview', 'Rent', 'Maintenance', 'Details', 'PropCrew', 'Documents', 'Tax']")
    const navIdx = pageSource.indexOf('<nav className="tabs" role="tablist"')
    const navEnd = pageSource.indexOf('</nav>', navIdx) + '</nav>'.length
    const navSlice = pageSource.slice(navIdx, navEnd)
    expect(navSlice).toContain('{tabs.map(')
    expect(navSlice).not.toMatch(/tabs\.slice|tabs\.filter/)
    expect(navSlice).toContain('role="tab"')
    expect(navSlice).toContain('aria-selected={activeTab === tab}')
  })

  it('.tabs is still a non-scrolling desktop grid — no breakpoint below 901px changes it except being hidden entirely at 760px', () => {
    const rule = cssSource.match(/\.tabs\s*\{[^}]*\}/)?.[0] || ''
    expect(rule).toContain('display: grid')
    expect(rule).toContain('repeat(7, minmax(0, 1fr))')
  })
})

describe('Part A — mobile uses the new compact primary section selector, not a horizontal scroller', () => {
  it('.tabs is hidden below 761px', () => {
    expect(cssSource).toMatch(/@media \(max-width: 760px\) \{\s*\n[\s\S]*?\.tabs \{ display: none; \}/)
  })

  it('no horizontal-scroll CSS remains for .tabs at any breakpoint', () => {
    expect(cssSource).not.toMatch(/\.tabs\s*\{[^}]*overflow-x: auto/)
  })

  it('.mobilePropertyNav is hidden at desktop/default width and shown immediately alongside .tabs { display: none; } in the same mobile block', () => {
    expect(cssSource).toMatch(/\.mobilePropertyNav \{ display: none; \}/)
    const tabsHideIdx = cssSource.indexOf('.tabs { display: none; }')
    expect(tabsHideIdx).toBeGreaterThan(-1)
    const navShowIdx = cssSource.indexOf('.mobilePropertyNav { display: block;', tabsHideIdx)
    expect(navShowIdx).toBeGreaterThan(tabsHideIdx)
    // Same @media block — the two rules sit right next to each other,
    // not scattered across the file's many other 760px blocks.
    expect(navShowIdx - tabsHideIdx).toBeLessThan(200)
  })

  it('the mobile selector reads the SAME `tabs` array and activeTab/setActiveTab — no duplicated section list', () => {
    const navIdx = pageSource.indexOf('<div className="mobilePropertyNav"')
    const navEnd = pageSource.indexOf("{activeTab === 'Overview'", navIdx)
    const navSlice = pageSource.slice(navIdx, navEnd)
    expect(navSlice).toContain('{tabs.map((tab) =>')
    expect(navSlice).toContain('activeTab === tab')
    expect(navSlice).toContain('setActiveTab(tab)')
    expect(navSlice).not.toMatch(/\[.*'Overview'.*'Rent'.*'Maintenance'.*\]/) // no second hardcoded array
  })

  it('selecting a section updates the trigger label and closes the menu', () => {
    expect(pageSource).toContain('<span>{activeTab}</span>')
    expect(pageSource).toContain('onClick={() => { setActiveTab(tab); setMobileTabMenuOpen(false) }}')
  })

  it('the selected section has a programmatically-understandable state (aria-selected + a visible checkmark/highlight)', () => {
    expect(pageSource).toContain('<li key={tab} role="option" aria-selected={activeTab === tab}>')
    expect(pageSource).toContain("{activeTab === tab ? '✓' : ''}")
    expect(cssSource).toMatch(/\.mobilePropertyNavMenu button\.active \{ background: var\(--brand-soft\); color: var\(--brand\); font-weight: 700; \}/)
  })

  it('every primary section remains reachable from the mobile menu — same seven tabs, not a subset', () => {
    const menuIdx = pageSource.indexOf('<ul className="mobilePropertyNavMenu"')
    const menuEnd = pageSource.indexOf('</ul>', menuIdx) + '</ul>'.length
    const menuSlice = pageSource.slice(menuIdx, menuEnd)
    expect(menuSlice).toContain('{tabs.map((tab) =>')
  })
})

describe('Part A — accessibility', () => {
  it('proper button/listbox semantics: aria-haspopup, aria-expanded, an accessible label, role="listbox"/"option"', () => {
    expect(pageSource).toContain('aria-haspopup="listbox"')
    expect(pageSource).toContain('aria-expanded={mobileTabMenuOpen}')
    expect(pageSource).toMatch(/aria-label=\{`Property section: \$\{activeTab\}\. Change section`\}/)
    expect(pageSource).toContain('<ul className="mobilePropertyNavMenu" role="listbox" aria-label="Property sections">')
    expect(pageSource).toContain('role="option" aria-selected={activeTab === tab}')
  })

  it('Escape closes the menu and an outside click closes it — not a second, competing implementation of AuthNavMenu\'s own pattern', () => {
    expect(pageSource).toMatch(/function handleKeyDown\(e: KeyboardEvent\) \{\s*if \(e\.key === 'Escape'\) setMobileTabMenuOpen\(false\)/)
    expect(pageSource).toMatch(/function handleClickOutside\(e: MouseEvent\) \{\s*if \(mobileTabMenuRef\.current && !mobileTabMenuRef\.current\.contains\(e\.target as Node\)\) setMobileTabMenuOpen\(false\)/)
    expect(pageSource).toContain("document.addEventListener('keydown', handleKeyDown)")
  })

  it('every menu row and the trigger are real <button> elements — inherits the app-wide :focus-visible ring, no custom tabindex hack', () => {
    const navIdx = pageSource.indexOf('<div className="mobilePropertyNav"')
    const navEnd = pageSource.indexOf("{activeTab === 'Overview'", navIdx)
    const navSlice = pageSource.slice(navIdx, navEnd)
    expect(navSlice).toContain('<button\n')
    expect(navSlice).toContain('<button type="button" className={activeTab === tab ? \'active\' : \'\'}')
    expect(navSlice).not.toContain('tabIndex')
    expect(cssSource).toContain('a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, [tabindex]:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }')
  })

  it('does not regress desktop keyboard navigation — the desktop .tabs buttons are unchanged (role="tab", no new handlers)', () => {
    expect(pageSource).toContain('<nav className="tabs" role="tablist" aria-label="Property sections">{tabs.map((tab) => <button key={tab} role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? \'active\' : \'\'} onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav>')
  })
})

describe('Part A — no full-screen sheet, no grid of boxes, no scroll trapping, mobile bottom nav preserved', () => {
  it('the menu is a small anchored popover (position: absolute under the trigger), not a fixed full-screen overlay', () => {
    const rule = cssSource.match(/\.mobilePropertyNavMenu \{[^}]*\}/)?.[0] || ''
    expect(rule).toContain('position: absolute')
    expect(rule).not.toContain('position: fixed')
    expect(rule).not.toMatch(/100vh|100vw/)
  })

  it('no grid-of-square-cards treatment was introduced for the mobile selector', () => {
    const mobileBlock = cssSource.match(/@media \(max-width: 760px\) \{([\s\S]*?)\n\}/)?.[1] || ''
    expect(mobileBlock).not.toMatch(/\.mobilePropertyNav[^{]*\{[^}]*display: grid/)
  })

  it('the mobile bottom navigation bar is untouched', () => {
    expect(cssSource).toContain('.mobileBottomNav { display: none; }')
    expect(cssSource).toContain('.mobileBottomNavItem.active { color: var(--brand); }')
  })
})

describe('Secondary Rent navigation (Lease & Rent / Ledger / Tenant) remains separate and untouched', () => {
  it('the Rent sub-tabs are still their own distinct control, not folded into .mobilePropertyNav', () => {
    expect(pageSource).toContain("const rentSubTabs: RentSubTab[] = ['Lease', 'Ledger', 'Tenant']")
    expect(pageSource).toContain('<div className="subTabs" role="tablist" aria-label="Rent sections">{rentSubTabs.map((sub) =>')
  })
})

describe('Part B — Rent status label clarity', () => {
  it('the canonical source (lib/rent-ledger/status.ts) confirms RentStatus.Unknown means the due date could not be derived — never a payment-recording concept', () => {
    expect(statusSource).toContain("if (obligation.dueDate === null) return 'Unknown'")
    expect(statusSource).toContain('missing_rent_due_day')
    expect(statusSource).toContain('invalid_lease_dates')
  })

  it('deriveRentStatus / RentStatus / the payment-matching and due-date algorithms were not modified', () => {
    expect(statusSource).toContain('export function deriveRentStatus(obligation: RentObligation, totalPaid: number, now: Date = new Date()): RentStatus | null {')
    expect(statusSource).toContain("export type RentStatus = 'Upcoming' | 'Due' | 'Paid' | 'Partial' | 'Overdue' | 'Unknown'")
    expect(statusSource).not.toMatch(/Due day not set|Due date unavailable/)
  })

  it('a single, presentation-only rentStatusLabel() maps Unknown -> "Due date unavailable" and passes every other status through unchanged', () => {
    expect(pageSource).toContain('function rentStatusLabel(status: RentStatus): string {')
    expect(pageSource).toContain("return status === 'Unknown' ? 'Due date unavailable' : status")
    expect((pageSource.match(/function rentStatusLabel\(/g) || []).length).toBe(1)
  })

  it('every user-facing rent-status pill in app/page.tsx renders through rentStatusLabel(), not the raw enum value', () => {
    expect(pageSource).not.toMatch(/statusPill \$\{rentStatusPillClass\([^)]+\)\}`\}>\{(?!rentStatusLabel)[a-zA-Z.]+\.status\}/)
    expect((pageSource.match(/rentStatusLabel\((currentRentRow|row|propertyRentRow)\.status\)/g) || []).length).toBe(4)
  })

  it('the legacy Rent Ledger compatibility route (app/rent-ledger/page.tsx) gets the same truthful label, not left showing the old word', () => {
    expect(rentLedgerPageSource).toContain('function rentStatusLabel(status: RentStatus): string {')
    expect(rentLedgerPageSource).toContain("return status === 'Unknown' ? 'Due date unavailable' : status")
    expect(rentLedgerPageSource).toContain('{rentStatusLabel(row.status)}')
  })

  it('known monthly rent never implies Paid/Due/Late — the pre-existing rentAmountKnown suppression guard is unchanged, only the rendered word changed', () => {
    expect(pageSource).toContain("!(currentRentRow.status === 'Unknown' && rentAmountKnown)")
    expect((pageSource.match(/!\(currentRentRow\.status === 'Unknown' && rentAmountKnown\)/g) || []).length).toBe(2)
  })

  it('a valid due-date status (Paid/Due/Overdue/Partial/Upcoming) still renders its own existing label, unchanged', () => {
    expect(pageSource).toMatch(/function rentStatusLabel\(status: RentStatus\): string \{\s*return status === 'Unknown' \? 'Due date unavailable' : status\s*\}/)
  })
})

describe('Guardrails: no billing/Stripe/entitlements, database schema, or already-shipped desktop Property cleanup touched', () => {
  it('no Stripe/billing/entitlements file was touched', () => {
    for (const file of ['lib/billing/stripe.ts', 'lib/billing/entitlements.ts', 'lib/billing/plans.ts', 'lib/billing/client.ts']) {
      const source = readFile(file)
      expect(source).not.toMatch(/Mobile Property Section Selector/)
    }
  })

  it('no schema/migration statement appears in any file this milestone touched', () => {
    expect(pageSource).not.toMatch(/create table|alter table|create policy/i)
    expect(cssSource).not.toMatch(/create table|alter table|create policy/i)
  })

  it('PR #69\'s desktop Property Snapshot / Expenses & tax / Property facts / Tenancy band / Notes / Timeline / Quick Actions are all still present, unrestyled', () => {
    expect((pageSource.match(/className="overviewPanel propertySnapshotCard"/g) || []).length).toBe(1)
    expect(pageSource).toContain('className="detailRows tenancyGrid"')
    expect(pageSource).toContain('className="overviewInfoSection quickActions"')
    expect(cssSource).toMatch(/\.tenancyGrid \{ display: grid;/)
    expect(cssSource).toMatch(/\.overviewInfoGrid > \.overviewInfoGroup:not\(:first-child\) \{\s*border-left: 1px solid var\(--line\);/)
  })

  it('Property Intelligence calculations, Tenant Connect, and Maintenance workflow logic were not touched', () => {
    const portfolioSource = readFile('lib/property-intelligence/portfolio.ts')
    expect(portfolioSource).not.toMatch(/Mobile Property Section Selector/)
  })
})
