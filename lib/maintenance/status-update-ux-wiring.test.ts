import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Tenant Connect M3.1 follow-up — two real-device (iPhone) UX bugs found
// before merging PR #56:
//
//   Bug 1: changing a maintenance request's status gave no visible
//   confirmation and did not appear to update until the page was
//   manually reloaded. Root cause: updateRequestStatus() (app/page.tsx)
//   and changeStatus() (app/maintenance/page.tsx) persisted the write
//   correctly, then AWAITED a full, heavy portfolio refetch
//   (loadPortfolio()/load()) before the function — and the only visible
//   state, the <select>'s own value — could reflect anything new, with
//   zero interim feedback.
//
//   Bug 2: the same case showed two adjacent "Urgent" badges. Root
//   cause: a dedicated urgent badge and the separate priority pill both
//   render the literal word "Urgent" whenever priority === 'Urgent'.
//   See command-center.test.ts's own describe block for the pure-logic
//   proof of the showsDedicatedUrgentBadge() fix — this file only
//   confirms the two render sites actually call it.
//
// Same source-read convention as the rest of this milestone's tests
// (see lib/maintenance/command-center-wiring.test.ts, the direct
// precedent).

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const commandCenterPageSource = readFile('app/maintenance/page.tsx')
const caseDetailSource = readFile('components/maintenance/MaintenanceCaseDetail.tsx')

describe('Bug 1 — status change updates the UI immediately, without a manual reload', () => {
  it('app/page.tsx: updateRequestStatus() patches the one canonical maintenanceRequests array right after a successful write, rather than only after loadPortfolio() resolves', () => {
    const start = pageSource.indexOf('async function updateRequestStatus(')
    expect(start).toBeGreaterThan(-1)
    const body = pageSource.slice(start, pageSource.indexOf('\n  }', start))
    expect(body).toContain("supabase.from('maintenance_requests').update({ status }).eq('id', id)")
    expect(body).toContain("setMaintenanceRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)))")
  })

  it('app/page.tsx: the follow-up full-portfolio refetch is fired in the BACKGROUND (void, not awaited) so it never gates the visible update', () => {
    const start = pageSource.indexOf('async function updateRequestStatus(')
    const body = pageSource.slice(start, pageSource.indexOf('\n  }', start))
    expect(body).toContain('void loadPortfolio()')
    expect(body).not.toContain('await loadPortfolio()')
  })

  it('app/maintenance/page.tsx: changeStatus() applies the same optimistic-patch-then-background-reload fix to its own canonical `cases` array', () => {
    const start = commandCenterPageSource.indexOf('async function changeStatus(')
    expect(start).toBeGreaterThan(-1)
    const body = commandCenterPageSource.slice(start, commandCenterPageSource.indexOf('\n  }', start))
    expect(body).toContain("supabase.from('maintenance_requests').update({ status }).eq('id', caseId)")
    expect(body).toContain('setCases((prev) => prev.map((c) => (c.id === caseId ? { ...c, status } : c)))')
    expect(body).toContain('void load()')
    expect(body).not.toContain('await load()')
  })

  it('the property-level inline status <select> is disabled while a mutation is in flight, guarding against a double-submit during the (now much shorter) busy window', () => {
    expect(pageSource).toContain('<select aria-label={`Status for ${req.title}`} value={req.status} disabled={busy}')
  })

  it('the shared MaintenanceCaseDetail status <select> was already disabled while busy — untouched by this fix', () => {
    expect(caseDetailSource).toContain('<select aria-label="Case status" value={caseRow.status} disabled={busy}')
  })
})

describe('Bug 1 — a brief, visible "Status updated." confirmation, auto-dismissing, never blocking further interaction', () => {
  for (const [label, source, stateVar] of [
    ['app/page.tsx', pageSource, 'statusUpdateMessage'],
    ['app/maintenance/page.tsx', commandCenterPageSource, 'statusUpdateMessage'],
  ] as const) {
    it(`${label} declares a ${stateVar} state and a flashStatusUpdateMessage() helper that sets it and clears it on a timer (never accumulates timers)`, () => {
      expect(source).toContain(`const [${stateVar}, set${stateVar[0].toUpperCase()}${stateVar.slice(1)}] = useState('')`)
      expect(source).toContain('function flashStatusUpdateMessage(text: string)')
      expect(source).toMatch(/if \(statusUpdateMessageTimer\.current\) window\.clearTimeout\(statusUpdateMessageTimer\.current\)/)
    })

    it(`${label}: the status-change handler actually calls flashStatusUpdateMessage('Status updated.') only on a successful write`, () => {
      const fnName = label.includes('maintenance/page') ? 'changeStatus' : 'updateRequestStatus'
      const start = source.indexOf(`async function ${fnName}(`)
      const body = source.slice(start, source.indexOf('\n  }', start))
      expect(body).toContain("flashStatusUpdateMessage('Status updated.')")
    })
  }

  it('app/page.tsx renders the confirmation next to the property-level Active Requests list', () => {
    expect(pageSource).toContain("{statusUpdateMessage && <div className=\"globalNotice\">{statusUpdateMessage}</div>}")
  })

  it('MaintenanceCaseDetail (shared by both Command Center and property-level "Manage") accepts an optional statusUpdateMessage prop and renders it near the status field — still a "dumb" component, the caller owns the value', () => {
    expect(caseDetailSource).toContain('statusUpdateMessage?: string')
    expect(caseDetailSource).toContain('{statusUpdateMessage && <p className="maintenanceStatusUpdateNotice" role="status">{statusUpdateMessage}</p>}')
    expect(caseDetailSource).not.toMatch(/supabase\.from\(|createClient\(/)
  })

  it('both call sites actually pass their own statusUpdateMessage state into the shared modal', () => {
    expect(pageSource).toContain('statusUpdateMessage={statusUpdateMessage}')
    expect(commandCenterPageSource).toContain('statusUpdateMessage={statusUpdateMessage}')
  })
})

describe('Bug 2 — exactly one "Urgent" badge per card, dedup is display-only, isUrgentCase() untouched', () => {
  it('the portfolio Command Center card (app/maintenance/page.tsx) gates the dedicated badge on showsDedicatedUrgentBadge(), not caseRow.urgent alone', () => {
    expect(commandCenterPageSource).toContain('{showsDedicatedUrgentBadge(caseRow, caseRow.urgent) && <span className="statusPill pillBad maintenanceUrgentBadge">Urgent</span>}')
    expect(commandCenterPageSource).not.toContain('{caseRow.urgent && <span className="statusPill pillBad maintenanceUrgentBadge">Urgent</span>}')
  })

  it('the property-level Active Requests row (app/page.tsx) gates the dedicated badge the same way', () => {
    expect(pageSource).toContain('{showsDedicatedUrgentBadge(req, req.urgent) && <span className="statusPill pillBad maintenanceUrgentBadge">Urgent</span>}')
    expect(pageSource).not.toContain('{req.urgent && <span className="statusPill pillBad maintenanceUrgentBadge">Urgent</span>}')
  })

  it('the priority pill next to it is completely unchanged — the fix removes a redundant badge, not the priority pill', () => {
    expect(commandCenterPageSource).toContain('<span className={`statusPill priority${caseRow.priority}`}>{caseRow.priority}</span>')
    expect(pageSource).toContain('<span className={`statusPill priority${req.priority}`}>{req.priority}</span>')
  })

  it('isUrgentCase() itself — the deterministic safety classification — is byte-for-byte unmodified by this patch', () => {
    const source = readFile('lib/maintenance/command-center.ts')
    expect(source).toContain("export function isUrgentCase(row: Pick<MaintenanceCaseRow, 'priority'>, linkedSessionOutcomes: (string | null)[]): boolean {\n  if (row.priority === 'Urgent') return true\n  return linkedSessionOutcomes.some((o) => o === 'escalated_urgent')\n}")
  })

  it('the urgent safety banner inside MaintenanceCaseDetail (a separate concern from the list-card badge, out of this bug\'s scope) still reads "Urgent: safety concern reported." — Phase C.1 changed only the punctuation (em dash to colon, the new site-wide no-em-dash copy rule) and the visual weight, never the meaning', () => {
    expect(caseDetailSource).toContain('<strong>Urgent: safety concern reported.</strong>')
  })
})

describe('No regression: PropCrew assignment is untouched by this patch', () => {
  it('assignMaintenanceContact (app/page.tsx) and assignContact (app/maintenance/page.tsx) keep their original await-then-reload shape — this bugfix is scoped to status only', () => {
    const pageStart = pageSource.indexOf('async function assignMaintenanceContact(')
    const pageBody = pageSource.slice(pageStart, pageSource.indexOf('\n  }', pageStart))
    expect(pageBody).toContain("if (e) setError(e.message); else await loadPortfolio()")

    const ccStart = commandCenterPageSource.indexOf('async function assignContact(')
    const ccBody = commandCenterPageSource.slice(ccStart, commandCenterPageSource.indexOf('\n  }', ccStart))
    expect(ccBody).toMatch(/await load\(\)/)
  })
})

describe('No regression: Active vs Completed separation is untouched by this patch', () => {
  it('the property hub\'s open/completed filters are unchanged', () => {
    expect(pageSource).toContain("const openRequests = selectedRequests.filter((row) => row.status !== 'Completed')")
    expect(pageSource).toContain("const completedRequests = selectedRequests.filter((row) => row.status === 'Completed')")
  })

  it('the Command Center\'s active/history split (sortCasesForCommandCenter) is unchanged', () => {
    expect(commandCenterPageSource).toContain('sorted.filter((c) => c.active)')
    expect(commandCenterPageSource).toContain('sorted.filter((c) => !c.active)')
  })
})
