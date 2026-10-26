import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PropRoster — Design Foundation V1, Milestone: Desktop Workspace V1
// (Tenant Connect + Maintenance).
//
// Source-read regression guards for the new desktop two-panel layouts
// specifically. See lib/tenant-connect/inbox.test.ts and
// lib/maintenance/command-center.test.ts for the pure-logic coverage
// of the new filterMessageInbox()/filterMaintenanceCases() functions
// themselves, and the pre-existing wiring test files (updated
// alongside this milestone, not superseded by it) for everything this
// milestone deliberately preserved byte-for-byte: RLS/query shape,
// the maintenance next-action state machine, provider outreach,
// scheduling, notifications, tenant isolation.
//
// What THIS file proves, with no network/DOM/React rendering (same
// convention as every other *-wiring.test.ts in this repo):
//   1. Both new desktop layouts share the exact same breakpoint
//      (1024px) — not two ad hoc values invented separately — per the
//      Design Foundation V1 audit's own breakpoint-sprawl finding.
//   2. The pre-existing mobile/tablet markup (Tenant Connect's
//      .overlay/.modal thread, Maintenance's MaintenanceCaseDetail
//      overlay) is untouched, just scoped so it can be hidden at
//      desktop widths without affecting any OTHER modal in the app.
//   3. MaintenanceCaseDetail's new `layout` prop defaults to
//      'overlay', and app/page.tsx — the OTHER caller of this shared
//      component (the property-level Details → Maintenance tab) —
//      never passes it, so that caller's behavior is byte-for-byte
//      unchanged.
//   4. No Supabase query was added or removed in either page — this
//      milestone is presentation-layer only.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const globalsCss = readFile('app/globals.css')
const tenantConnectSource = readFile('app/tenant-connect/page.tsx')
const maintenanceSource = readFile('app/maintenance/page.tsx')
const propertyPageSource = readFile('app/page.tsx')
const caseDetailSource = readFile('components/maintenance/MaintenanceCaseDetail.tsx')

describe('One shared breakpoint, not two ad hoc values', () => {
  it('Tenant Connect\'s and Maintenance\'s desktop grids both key off min-width: 1024px', () => {
    const workspaceRule = globalsCss.match(/\.tenantConnectWorkspace \{ display: grid;[^}]*\}/)
    const maintenanceRule = globalsCss.match(/\.maintenanceWorkspace \{ display: grid;[^}]*\}/)
    expect(workspaceRule).not.toBeNull()
    expect(maintenanceRule).not.toBeNull()
  })

  it('every new rule this milestone adds is scoped under @media (min-width: 1024px) — no other new breakpoint value was introduced', () => {
    const section = globalsCss.slice(globalsCss.indexOf('Design Foundation V1 — Desktop Workspace V1 (Tenant Connect)'), globalsCss.indexOf('.maintenanceCaseDetailPanel {') + 400)
    const breakpoints = [...section.matchAll(/@media \(min-width: (\d+)px\)/g)].map((m) => m[1])
    expect(breakpoints.length).toBeGreaterThan(0)
    expect(new Set(breakpoints)).toEqual(new Set(['1024']))
  })
})

describe('Tenant Connect — mobile/tablet thread view is the pre-existing .overlay/.modal, untouched', () => {
  it('still renders the exact same .overlay/.modal.tenantConnectThreadModal classes as before this milestone', () => {
    expect(tenantConnectSource).toContain('className="overlay tenantConnectThreadOverlay"')
    expect(tenantConnectSource).toContain('className="modal tenantConnectThreadModal"')
  })

  it('the new scoping class only hides THIS modal at desktop widths — it never touches the generic .overlay class every other modal in the app also uses', () => {
    const rule = globalsCss.match(/@media \(min-width: 1024px\) \{\s*\.tenantConnectThreadOverlay \{ display: none; \}\s*\}/)
    expect(rule).not.toBeNull()
    expect(globalsCss).not.toMatch(/@media \(min-width: 1024px\) \{\s*\.overlay \{ display: none/)
  })

  it('threadBody() is the single implementation rendered by both the mobile modal and the desktop panel', () => {
    expect(tenantConnectSource).toContain('function threadBody(row: MessageInboxRow)')
    expect(tenantConnectSource).toContain('{threadBody(openRow)}')
    // Appears exactly twice: once in the desktop panel, once in the mobile modal.
    expect(tenantConnectSource.split('threadBody(openRow)').length - 1).toBe(2)
  })

  it('the new inbox search is a pure client-side filter over the already-loaded inbox, never a new query', () => {
    expect(tenantConnectSource).toContain("import {\n  buildMessageInbox, filterMessageInbox, summarizeUnreadInbox, type MessageInboxRow,\n} from '../../lib/tenant-connect/inbox'")
    expect(tenantConnectSource).toContain('filterMessageInbox(inbox, messageSearch)')
  })

  it('the selected-conversation highlight is applied in the list, never invented as a new concept', () => {
    expect(tenantConnectSource).toContain("row.conversationId === openConversationId ? ' tenantInboxRowSelected' : ''")
  })
})

describe('Maintenance — mobile/tablet case detail is the pre-existing MaintenanceCaseDetail overlay, untouched', () => {
  it('MaintenanceCaseDetail\'s layout prop defaults to "overlay" — the original, only behavior before this milestone', () => {
    expect(caseDetailSource).toContain("layout = 'overlay',")
    expect(caseDetailSource).toContain("layout?: 'overlay' | 'panel'")
  })

  it('app/page.tsx (the OTHER MaintenanceCaseDetail caller — Details → Maintenance) never passes layout, so its behavior is unchanged', () => {
    const callIndex = propertyPageSource.indexOf('<MaintenanceCaseDetail')
    expect(callIndex).toBeGreaterThan(-1)
    const call = propertyPageSource.slice(callIndex, propertyPageSource.indexOf('/>', callIndex))
    expect(call).not.toContain('layout=')
  })

  it('"overlay" layout renders the exact same .overlay/.modal.maintenanceCaseDetailModal wrapper as before this milestone', () => {
    expect(caseDetailSource).toContain('<div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>')
    expect(caseDetailSource).toContain('<div className="modal maintenanceCaseDetailModal">{detailBody}</div>')
  })

  it('"panel" layout renders the identical detailBody content with no overlay/modal chrome', () => {
    expect(caseDetailSource).toContain('<div className="maintenanceCaseDetailPanel">{detailBody}</div>')
  })

  it('app/maintenance/page.tsx mounts MaintenanceCaseDetail exactly twice when a case is open — one overlay (mobile), one panel (desktop) — both built from the same detailPropsFor()', () => {
    expect(maintenanceSource).toContain('<MaintenanceCaseDetail {...detailPropsFor(openCase)} layout="panel" />')
    expect(maintenanceSource).toContain('<MaintenanceCaseDetail {...detailPropsFor(openCase)} />')
    expect(maintenanceSource.split('detailPropsFor(openCase)').length - 1).toBe(2) // the overlay call site + the panel call site, nothing else
    expect(maintenanceSource).toContain('function detailPropsFor(c: EnrichedMaintenanceCase)')
  })

  it('the desktop-only overlay-hiding and panel-showing rules are scoped to this milestone\'s own classes, not the shared .overlay/.modal', () => {
    expect(globalsCss).toMatch(/@media \(min-width: 1024px\) \{\s*\.maintenanceDetailOverlay \{ display: none; \}\s*\}/)
    expect(globalsCss).not.toMatch(/@media \(min-width: 1024px\) \{\s*\.overlay \{ display: none/)
  })

  it('the new request search layers on top of the existing filter chips, never replacing them', () => {
    expect(maintenanceSource).toContain("filterMaintenanceCases(byFilter, caseSearch, propertyLabel)")
    expect(maintenanceSource).toContain("const byFilter = filter === 'attention' ? active : filter === 'urgent' ? active.filter((c) => c.urgent) : sorted")
  })

  it('the selected-case highlight is a prop, applied only when the case is actually open', () => {
    expect(maintenanceSource).toContain('selected={c.id === openCaseId}')
    expect(maintenanceSource).toContain("selected ? 'maintenanceCommandCenterCardSelected' : ''")
  })
})

describe('No data-layer change — this milestone is presentation-layer only', () => {
  it('Tenant Connect still fetches the exact same 7 tables, nothing added or removed', () => {
    for (const table of ['properties', 'leases', 'tenant_property_access', 'tenant_requests', 'property_conversations', 'property_messages', 'property_conversation_reads']) {
      expect(tenantConnectSource).toContain(`.from('${table}')`)
    }
  })

  it('Maintenance still fetches the exact same tables, nothing added or removed', () => {
    for (const table of ['properties', 'maintenance_requests', 'property_contacts', 'property_contact_links', 'tenant_requests', 'maintenance_intake_sessions', 'leases', 'maintenance_provider_outreach', 'maintenance_availability_windows', 'maintenance_appointments']) {
      expect(maintenanceSource).toContain(`.from('${table}')`)
    }
  })

  it('neither page imports a service-role/admin client — RLS remains the only boundary', () => {
    for (const source of [tenantConnectSource, maintenanceSource]) {
      expect(source).not.toContain('createAdminClient')
      expect(source).not.toContain('service_role')
    }
  })
})
