import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Simplification + Maintenance Workspace V2, Phase D.2: Maintenance
// list visual polish. Source-read regression guards, matching this
// repo's established no-jsdom convention (see lib/uploads/upload-
// reliability-wiring.test.ts for the direct precedent this file
// follows). Complements (does not replace) lib/maintenance/command-
// center-wiring.test.ts and lib/maintenance/status-update-ux-wiring.
// test.ts, which already protect the underlying data wiring (canonical
// table, RLS, dedup, MaintenanceCaseDetail reuse) this phase does not
// touch — this file protects only what D.2 actually changed: the
// visual presentation.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const commandCenterPageSource = readFile('app/maintenance/page.tsx')
const pageSource = readFile('app/page.tsx')
const globalsCss = readFile('app/globals.css')

describe('Filter chips show real, already-loaded counts (no new query)', () => {
  it('each chip label includes a count derived from summary/sorted, not a hardcoded or re-fetched number', () => {
    expect(commandCenterPageSource).toContain('Needs attention ({summary.activeCount})')
    expect(commandCenterPageSource).toContain('All requests ({sorted.length})')
    expect(commandCenterPageSource).toContain('Urgent ({summary.urgentCount})')
  })

  it('the Urgent chip is still gated on there being at least one urgent case — never an empty filter option', () => {
    expect(commandCenterPageSource).toContain('{summary.urgentCount > 0 && (')
  })
})

describe('Portfolio card address is a two-line, muted presentation — not the single bold comma-joined string', () => {
  it('propertyAddressLines() reads the same stored address/city fields propertyLabel() already does — presentation only, no new/invented data', () => {
    expect(commandCenterPageSource).toContain('const propertyAddressLines = (propertyId: string): { street: string; cityState: string | null } => {')
    expect(commandCenterPageSource).toContain('return { street: p.address, cityState: p.city || null }')
  })

  it('the card renders street then, only when present, a separate quieter city/state/zip line', () => {
    expect(commandCenterPageSource).toContain('<span className="maintenanceCommandCenterCardAddress">')
    expect(commandCenterPageSource).toContain('{address.cityState && <span className="maintenanceCommandCenterCardAddressCityState">{address.cityState}</span>}')
  })

  it('the address block is muted, not the near-black title color, in CSS', () => {
    expect(globalsCss).toMatch(/\.maintenanceCommandCenterCardAddress \{[^}]*color: var\(--muted\)/)
    expect(globalsCss).toMatch(/\.maintenanceCommandCenterCardAddressCityState \{[^}]*color: var\(--muted\)/)
  })
})

describe('Issue title is dark/near-black and strongest — the "blue link" bug is fixed', () => {
  it('the card and the property-level row buttons set an explicit text color, so they can never fall back to the platform default button-text tint', () => {
    expect(globalsCss).toMatch(/\.maintenanceCommandCenterCard \{[\s\S]*?color: var\(--text\);\s*\n\}/)
    expect(globalsCss).toMatch(/\.maintenanceRequestRowMain \{[\s\S]*?color: var\(--text\);\s*\n\}/)
  })

  it('the title itself also sets an explicit dark color, independent of its button ancestor', () => {
    expect(globalsCss).toMatch(/\.maintenanceCommandCenterCardTitle \{[^}]*color: var\(--text\)/)
    expect(globalsCss).toMatch(/\.maintenanceRequestRowTitle \{[^}]*color: var\(--text\)/)
  })
})

describe('Dates show a full year (Opened Sep 9, 2026), consistent across every request row', () => {
  for (const [label, source] of [
    ['portfolio Command Center card', commandCenterPageSource],
    ['property-level Active Requests row', pageSource],
  ] as const) {
    it(`${label} formats the opened date with a year`, () => {
      expect(source).toMatch(/toLocaleDateString\(undefined, \{ month: 'short', day: 'numeric', year: 'numeric' \}\)/)
    })
  }
})

describe('Non-urgent status pills are quiet/neutral, not the shared brand-green .statusPill default', () => {
  it('the portfolio card and the property-level row both override the status pill to a muted surface', () => {
    expect(globalsCss).toMatch(/\.maintenanceCommandCenterCardStatus \{ flex-shrink: 0; background: #eef1ee; color: var\(--muted\)/)
    expect(globalsCss).toMatch(/\.maintenanceRequestRowStatus \{ flex-shrink: 0; background: #eef1ee; color: var\(--muted\)/)
  })

  it('the dedicated Urgent pill is untouched (still the shared, tested pillBad treatment)', () => {
    expect(commandCenterPageSource).toContain('<span className="statusPill pillBad maintenanceUrgentBadge">Urgent</span>')
    expect(pageSource).toContain('<span className="statusPill pillBad maintenanceUrgentBadge">Urgent</span>')
  })
})

describe('Urgent cards use a restrained cue, not a heavy colored outline', () => {
  it('the urgent card border is a faint neutral-warm tint with no background tint (card stays white)', () => {
    const rule = globalsCss.match(/\.maintenanceCommandCenterCardUrgent \{[^}]*\}/)?.[0] || ''
    expect(rule).toContain('border-color: #f0d6d1')
    expect(rule).not.toMatch(/background/)
  })
})

describe('Completed requests read calmly inside "All requests" — never hidden, never competing with active cases', () => {
  it('a completed case (caseRow.active === false) gets a dedicated calm class, active cases are unaffected', () => {
    expect(commandCenterPageSource).toContain("!caseRow.active ? 'maintenanceCommandCenterCardCompleted' : ''")
    expect(globalsCss).toContain('.maintenanceCommandCenterCardCompleted { opacity: .7; }')
  })

  it('the calm treatment is opacity only — title/address/status are still the same real elements, nothing is stripped out for completed cases', () => {
    // MaintenanceCaseCard has exactly one JSX return path — completed
    // cases render through the identical title/address/status markup
    // as active cases, just with an extra class name.
    expect(commandCenterPageSource).toContain('function MaintenanceCaseCard({ caseRow, address, onOpen }: {')
    const bodyStart = commandCenterPageSource.indexOf('function MaintenanceCaseCard(')
    const body = commandCenterPageSource.slice(bodyStart, commandCenterPageSource.indexOf('\n}\n', bodyStart))
    expect(body).toContain('maintenanceCommandCenterCardTitle')
    expect(body).toContain('maintenanceCommandCenterCardAddress')
  })
})

describe('Card/row tap behavior and canonical detail view are unchanged (D.2 is presentation-only)', () => {
  it('the portfolio card is still one whole-row button opening the same setOpenCaseId state MaintenanceCaseDetail reads', () => {
    expect(commandCenterPageSource).toContain('onOpen={() => setOpenCaseId(c.id)}')
    expect(commandCenterPageSource).toContain('<MaintenanceCaseDetail')
  })

  it('the trailing chevron is still a CSS pseudo-element, not a new interactive control', () => {
    expect(globalsCss).toContain(".maintenanceCommandCenterCard::after { content: '›';")
  })
})
