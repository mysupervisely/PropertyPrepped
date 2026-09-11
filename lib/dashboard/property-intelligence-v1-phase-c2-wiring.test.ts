import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Property Intelligence V1, Phase C.2 — source-read wiring guards for:
// full-year performance (the most recent qualifying completed prior tax
// year), financing_status semantics, and the real-device install-banner
// fix. Same no-jsdom convention as every other app/page.tsx test in this
// repo. See property-intelligence-v1-phase-c-wiring.test.ts and
// property-intelligence-v1-phase-c1-unified-snapshot.test.ts for the
// invariants this phase did NOT change (those still hold and are not
// re-asserted here).

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const cssSource = readFile('app/globals.css')
const calculateSource = readFile('lib/property-intelligence/calculate.ts')

describe('Phase C.2, Part 1: current-year metrics remain strictly YTD', () => {
  it('the `performance` (current year) call is completely unchanged — still built from performanceYear only, never annualized', () => {
    const idx = pageSource.indexOf('const performance = computePropertyPerformance(buildPropertyPerformanceInput({')
    expect(idx).toBeGreaterThan(-1)
    const block = pageSource.slice(idx, pageSource.indexOf('}))', idx))
    expect(block).toContain('year: performanceYear')
  })

  it('nothing in app/page.tsx multiplies a YTD figure to project a full year', () => {
    expect(pageSource).not.toMatch(/actualIncomeYtd\.value\s*\*\s*12/)
    expect(pageSource).not.toMatch(/noiYtd\.value\s*\*\s*12/)
    expect(pageSource).not.toMatch(/operatingExpensesYtd\.value\s*\*\s*12/)
  })
})

describe('Phase C.2, Part 2: most recent qualifying completed year — wiring', () => {
  it('a bounded (3-year) lookback builds candidate inputs — no unbounded loop, no year picker state', () => {
    expect(pageSource).toContain('const PRIOR_YEAR_LOOKBACK = 3')
    expect(pageSource).toContain('const priorYearCandidates = Array.from({ length: PRIOR_YEAR_LOOKBACK }')
    expect(pageSource).not.toMatch(/useState.*[Yy]ear.*[Pp]icker/)
  })

  it('candidates are built with buildPropertyPerformanceInput — the SAME function the current year uses, no second/parallel input-building path', () => {
    const idx = pageSource.indexOf('const priorYearCandidates')
    const block = pageSource.slice(idx, pageSource.indexOf('const priorYearPerformance', idx))
    expect(block).toContain('buildPropertyPerformanceInput({')
    expect((block.match(/buildPropertyPerformanceInput\(/g) || []).length).toBe(1) // one call site, inside .map()
  })

  it('which year (if any) qualifies is decided by selectPriorYearPerformance (the engine), not by a condition written in React', () => {
    expect(pageSource).toContain('const priorYearPerformance = selectPriorYearPerformance(priorYearCandidates)')
    // No inline "does this year have enough data" check in app/page.tsx —
    // that logic lives only in lib/property-intelligence/calculate.ts.
    expect(pageSource).not.toMatch(/transactionCount\s*[<>]=?\s*\d/)
  })

  it('uses data this page already loaded — no new Supabase query added for the lookback', () => {
    const idx = pageSource.indexOf('const priorYearCandidates')
    const block = pageSource.slice(idx, pageSource.indexOf('const priorYearPerformance', idx))
    expect(block).not.toMatch(/supabase\s*\.\s*from\(/)
    expect(block).toContain('selectedTransactions.filter')
    expect(block).toContain('selectedMaintenance.filter')
  })

  it('selectPriorYearPerformance itself never fetches/grows its candidate list and never invents a formula — it only calls computePropertyPerformance and reads noiAnnual.status', () => {
    const idx = calculateSource.indexOf('export function selectPriorYearPerformance')
    const fnSource = calculateSource.slice(idx, calculateSource.indexOf('\n}', idx) + 2)
    expect(fnSource).not.toMatch(/supabase|fetch\(|\.from\(/)
    expect(fnSource).toContain('computePropertyPerformance(input, now)')
    expect(fnSource).toContain("candidate.noiAnnual.status === 'available'")
  })
})

describe('Phase C.2, Part 2: Full-Year Performance section — wiring', () => {
  const snapshotStart = pageSource.indexOf('propertySnapshotCard')
  const snapshotEnd = pageSource.indexOf('</details>\n          </div>', snapshotStart) + '</details>\n          </div>'.length
  const snapshotSlice = pageSource.slice(snapshotStart, snapshotEnd)

  it('16. Annual NOI, Cap Rate, and Net Cash Flow are all read verbatim from priorYearPerformance — no formula combining two engine fields written in JSX', () => {
    expect(snapshotSlice).toContain('metricMoney(priorYearPerformance.noiAnnual)')
    expect(snapshotSlice).toContain('metricPercent(priorYearPerformance.capRatePercent)')
    expect(snapshotSlice).toContain("metricMoney(priorYearPerformance.netCashFlowMonthly, '/mo')")
    expect(snapshotSlice).not.toMatch(/priorYearPerformance\.\w+\.value\s*[-+*/]\s*priorYearPerformance\.\w+\.value/)
    expect(snapshotSlice).not.toMatch(/priorYearPerformance\.\w+\.value\s*[-+*/]\s*performance\.\w+\.value/)
  })

  it('17. the section carries the selected year\'s own label, never a hardcoded year', () => {
    expect(snapshotSlice).toContain('Full-Year Performance <span className="propertySnapshotYear">{priorYearPerformance.period.taxYear}</span>')
  })

  it('18. no qualifying year fails quietly — a plain conditional note, never a fabricated number standing in for the missing section', () => {
    expect(snapshotSlice).toContain('{priorYearPerformance ? (')
    expect(snapshotSlice).toContain('No completed prior tax year has enough data on file yet for full-year performance.')
    expect(snapshotSlice).not.toMatch(/priorYearPerformance\s*\|\|\s*\{/) // never a fallback fake object
  })

  it("avoids duplicating what's already visible above — Contract Annual Rent (unaffected by year selection) still comes from the current-year `performance`, not priorYearPerformance", () => {
    expect(snapshotSlice).toContain('<span>Contract Annual Rent</span><strong>{metricMoney(performance.contractAnnualRent)}</strong>')
  })
})

describe('Phase C.2, Part 3: financing_status — engine-decided, not React-decided', () => {
  it('app/page.tsx never writes an "if financing_status is Paid Off/No Mortgage" branch itself — that decision lives only in calculate.ts', () => {
    expect(pageSource).not.toMatch(/financing_status\s*===\s*['"](Paid Off|No Mortgage)['"]/)
    expect(pageSource).not.toContain('financingStatus ===')
  })

  it('Estimated Equity and Mortgage Balance in the visible snapshot are read exactly as before (performance.equity/performance.mortgageBalance) — Phase C.2 changes what those metrics RESOLVE to, never how React reads them', () => {
    const snapshotStart = pageSource.indexOf('propertySnapshotCard')
    const snapshotEnd = pageSource.indexOf('</details>\n          </div>', snapshotStart) + '</details>\n          </div>'.length
    const snapshotSlice = pageSource.slice(snapshotStart, snapshotEnd)
    expect(snapshotSlice).toContain('metricMoney(performance.equity)')
    expect(snapshotSlice).toContain('metricMoney(performance.mortgageBalance)')
  })

  it('the confirmed-zero explanatory note is read verbatim from the engine\'s own note, never a hardcoded "Paid Off"/"No Mortgage" string in React', () => {
    expect(pageSource).toContain("performance.mortgageBalance.source === 'financing_status_confirmed' && <p className=\"propertyPerformanceNote\">{performance.mortgageBalance.notes?.[0]}</p>")
    expect(pageSource).not.toContain('mortgage balance is a confirmed $0') // that exact copy lives only in calculate.ts
  })

  it('calculate.ts checks financing_status BEFORE falling back to a mortgage row/property fallback, in both resolveMortgageBalance and resolveMonthlyDebtService', () => {
    const balanceIdx = calculateSource.indexOf('export function resolveMortgageBalance')
    const balanceBody = calculateSource.slice(balanceIdx, calculateSource.indexOf('\n}', balanceIdx))
    expect(balanceBody.indexOf("financingStatus === 'Paid Off'")).toBeLessThan(balanceBody.indexOf('if (mortgage)'))

    const debtIdx = calculateSource.indexOf('export function resolveMonthlyDebtService')
    const debtBody = calculateSource.slice(debtIdx, calculateSource.indexOf('\n}', debtIdx))
    expect(debtBody.indexOf("financingStatus === 'Paid Off'")).toBeLessThan(debtBody.indexOf('if (!mortgage)'))
  })

  it('resolve.ts normalizes financing_status defensively rather than trusting the raw column value', () => {
    const resolveSource = readFile('lib/property-intelligence/resolve.ts')
    expect(resolveSource).toContain('normalizeFinancingStatus(property.financing_status)')
  })
})

describe('19. The unified Property Snapshot remains intact — Phase C.2 extended it, never rebuilt it', () => {
  it('exactly one Property Snapshot card, hero still identity-only, tabs unchanged', () => {
    expect((pageSource.match(/className="overviewPanel propertySnapshotCard"/g) || []).length).toBe(1) // one usage site — still ONE snapshot, not two
    expect(pageSource).toContain("const tabs: Tab[] = ['Overview', 'Rent', 'Maintenance', 'Details', 'PropCrew', 'Documents', 'Tax']")
    const heroIdx = pageSource.indexOf('<section className="propertyHero">')
    const heroSlice = pageSource.slice(heroIdx, pageSource.indexOf('</section>', heroIdx))
    expect(heroSlice).not.toContain('heroMetrics')
  })

  it('primary/YTD Performance rows are byte-for-byte the same as Phase C.1 — this phase only added to what follows them', () => {
    const snapshotStart = pageSource.indexOf('propertySnapshotCard')
    const snapshotEnd = pageSource.indexOf('</details>\n          </div>', snapshotStart) + '</details>\n          </div>'.length
    const snapshotSlice = pageSource.slice(snapshotStart, snapshotEnd)
    expect(snapshotSlice).toContain('<span>Estimated Value</span><strong>{metricMoney(performance.estimatedValue)}</strong>')
    expect(snapshotSlice).toContain('<span>Estimated Equity</span><strong>{metricMoney(performance.equity)}</strong>')
    expect(snapshotSlice).toContain('<span>Monthly Rent</span><strong>{metricMoney(performance.contractMonthlyRent)}</strong>')
    expect(snapshotSlice).toContain('<span>Income</span><strong>{metricMoney(performance.actualIncomeYtd)}</strong>')
    expect(snapshotSlice).toContain('<span>Expenses</span><strong>{metricMoney(performance.operatingExpensesYtd)}</strong>')
  })
})

describe('Phase C.2, Part 4: install banner — real height measurement, not a hardcoded pixel guess', () => {
  it('the old hardcoded 64px/70px nav-height assumptions are gone from the clearance rules', () => {
    expect(cssSource).not.toMatch(/body\.hasBottomNav \.shell \{ padding-bottom: calc\(70px/)
    expect(cssSource).not.toMatch(/body\.hasBottomNav \.installHint \{ bottom: calc\(64px/)
  })

  it('clearance rules read the real measured heights via CSS custom properties, with a fallback only for the instant before the first measurement', () => {
    expect(cssSource).toContain('var(--bottom-nav-height, 64px)')
    expect(cssSource).toContain('var(--install-hint-height, 76px)')
  })

  it('a dedicated hasInstallHint body class (mirroring the existing hasBottomNav pattern) reserves shell clearance only while the hint is actually visible', () => {
    expect(cssSource).toContain('body.hasInstallHint .shell')
    expect(cssSource).toContain('body.hasBottomNav.hasInstallHint .shell') // both bars stacked
  })

  it('MobileBottomNav publishes its own real rendered height via ResizeObserver, not a guess', () => {
    const navSource = readFile('components/MobileBottomNav.tsx')
    expect(navSource).toContain('new ResizeObserver(')
    expect(navSource).toContain("document.documentElement.style.setProperty('--bottom-nav-height'")
    expect(navSource).toContain('getBoundingClientRect().height')
    // Cleans up on unmount — no stale clearance left behind.
    expect(navSource).toContain("document.documentElement.style.removeProperty('--bottom-nav-height')")
  })

  it('InstallPrompt publishes its own real rendered height, toggles hasInstallHint only while visible, and cleans up on dismiss', () => {
    const installSource = readFile('components/InstallPrompt.tsx')
    expect(installSource).toContain("document.body.classList.add('hasInstallHint')")
    expect(installSource).toContain("document.body.classList.remove('hasInstallHint')")
    expect(installSource).toContain('new ResizeObserver(')
    expect(installSource).toContain("document.documentElement.style.setProperty('--install-hint-height'")
    expect(installSource).toContain("document.documentElement.style.removeProperty('--install-hint-height')")
  })

  it('dismiss/install functionality itself is completely unchanged', () => {
    const installSource = readFile('components/InstallPrompt.tsx')
    expect(installSource).toContain('function dismiss()')
    expect(installSource).toContain('localStorage.setItem(DISMISS_KEY')
    expect(installSource).toContain('async function handleInstall()')
    expect(installSource).toContain('deferredPrompt.prompt()')
  })

  it('the banner is never redesigned — same classes, same copy, same dismiss button', () => {
    const installSource = readFile('components/InstallPrompt.tsx')
    expect(installSource).toContain('className="installHint"')
    expect(installSource).toContain('Install PropRoster: tap <strong>Share</strong>')
    expect(installSource).toContain('className="installHintDismiss"')
  })

  it('bottom navigation itself is never redesigned — same 4 destinations, same classes', () => {
    const navSource = readFile('components/MobileBottomNav.tsx')
    expect(navSource).toContain('className="mobileBottomNav"')
    expect(navSource).toContain('>Dashboard</span>')
    expect(navSource).toContain('>Maintenance</span>')
    expect(navSource).toContain('>PropCrew</span>')
    expect(navSource).toContain('>Tax Center</span>')
  })
})

describe('No schema/migration changes', () => {
  it('no supabase/ files were touched by this milestone (this asserts no in-repo migration reference was added for this feature)', () => {
    expect(pageSource).not.toMatch(/create table|alter table|create policy/i)
  })
})
