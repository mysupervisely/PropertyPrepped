import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Tenant Connect M3.1 — Property Maintenance Workflow Unification.
// Source-read regression guards, matching this repo's established
// no-jsdom convention (see lib/maintenance/command-center-wiring.test.ts,
// the direct M3 precedent this file extends without duplicating).

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const commandCenterPageSource = readFile('app/maintenance/page.tsx')
const newRequestModalSource = readFile('components/maintenance/NewMaintenanceRequestModal.tsx')
const caseDetailSource = readFile('components/maintenance/MaintenanceCaseDetail.tsx')
const attentionSource = readFile('lib/dashboard/attention.ts')

describe('Property Maintenance hub — one destination, Active Requests above Service History', () => {
  it('Details > Maintenance renders Active Requests, then Service History, both reachable from one sub-tab', () => {
    const start = pageSource.indexOf("propertySubTab === 'Maintenance' &&")
    expect(start).toBeGreaterThan(-1)
    const end = pageSource.indexOf("propertySubTab === 'Systems'")
    const hubBody = pageSource.slice(start, end)
    const activeIdx = hubBody.indexOf('Active Requests')
    const historyIdx = hubBody.indexOf('SERVICE HISTORY')
    expect(activeIdx).toBeGreaterThan(-1)
    expect(historyIdx).toBeGreaterThan(activeIdx)
  })

  it('the property-level "+ New Maintenance Request" button opens the shared modal with this property pre-selected and hidden', () => {
    expect(pageSource).toContain('<button className="primary" onClick={() => setShowNewMaintenanceRequest(true)}>+ New Maintenance Request</button>')
    expect(pageSource).toContain('<NewMaintenanceRequestModal')
    expect(pageSource).toContain('fixedPropertyId={selected.id}')
  })

  it('Service History (maintenance_records) is preserved, not deleted — still lists existing records, still opens the legacy log-service form for genuinely historical entries', () => {
    expect(pageSource).toContain("client.from('maintenance_records').select('*')")
    expect(pageSource).toContain("<button className=\"secondary\" onClick={() => setShowModuleForm('Maintenance')}>+ Log service record</button>")
    expect(pageSource).toContain("removeModuleRecord('maintenance_records', item.id, item.financial_transaction_id)")
  })

  it('the Rent > Tenant sub-tab keeps the tenant-relationship-specific pieces (invite status card, conversation thread) and no longer duplicates the Active Requests list — it points to Details > Maintenance instead', () => {
    const tenantTabStart = pageSource.indexOf("rentSubTab === 'Tenant'")
    const tenantTabEnd = pageSource.indexOf('activeTab === \'Tax\'')
    const tenantTabBody = pageSource.slice(tenantTabStart, tenantTabEnd)
    expect(tenantTabBody).toContain('<TenantConnectStatusCard')
    expect(tenantTabBody).toContain('<TenantRequestsPanel')
    expect(tenantTabBody).toContain('Details → Maintenance')
    expect(tenantTabBody).not.toContain('<NewMaintenanceRequestModal')
    expect(tenantTabBody).not.toContain('setOpenMaintenanceCaseId(req.id)')
  })
})

describe('Landlord-created canonical maintenance request — same table, no parallel work-order model', () => {
  it('property-level save writes to the SAME maintenance_requests table the portfolio Command Center and tenant-originated flow both use', () => {
    expect(pageSource).toContain("async function saveNewMaintenanceRequest(payload: NewMaintenanceRequestPayload, onDone: () => void)")
    expect(pageSource).toContain("supabase.from('maintenance_requests').insert({")
  })

  it('portfolio-level save (app/maintenance/page.tsx) also writes to the SAME table — landlord-created requests from either entry point land in the one canonical list, never a copy', () => {
    expect(commandCenterPageSource).toContain('async function saveNewRequest(payload: NewMaintenanceRequestPayload)')
    expect(commandCenterPageSource).toContain("supabase.from('maintenance_requests').insert({")
    expect(commandCenterPageSource).toContain('<NewMaintenanceRequestModal')
    expect(commandCenterPageSource).not.toContain('fixedPropertyId=') // portfolio entry asks for a property first, never pre-fixed
  })

  it('owner_id is always the CALLER\'s own auth-derived user id, never a client-suppliable value, at both entry points', () => {
    for (const source of [pageSource, commandCenterPageSource]) {
      const insertIdx = source.indexOf("supabase.from('maintenance_requests').insert({")
      const insertBody = source.slice(insertIdx, insertIdx + 200)
      expect(insertBody).toMatch(/owner_id:\s*user\.id/)
    }
  })

  it('a landlord-originated request never requires tenant information to be valid — reuses the shared, pure isNewMaintenanceRequestValid() (see lib/maintenance/new-request.test.ts for the full "AC not cooling on a vacant property" proof)', () => {
    expect(newRequestModalSource).toContain('isNewMaintenanceRequestValid(draft)')
    expect(newRequestModalSource).not.toMatch(/disabled=\{[^}]*tenantName/)
  })

  it('no fabricated tenant is ever invented — buildNewMaintenanceRequestPayload (shared, pure, tested) is the ONLY place tenant_name is decided', () => {
    expect(newRequestModalSource).toContain('buildNewMaintenanceRequestPayload(draft)')
    expect(newRequestModalSource).not.toMatch(/tenantName:\s*['"]\w/) // no hardcoded fake name literal
  })
})

describe('Tenant prefill — reuses the existing, tested canonical lease-status derivation, never a second one', () => {
  it('uses lib/leases/status.ts\'s selectCurrentLease/normalizeTenants — the SAME functions the rest of the app already uses for occupancy/"Current Lease" — not a new ad hoc lookup', () => {
    expect(newRequestModalSource).toContain("import { selectCurrentLease, normalizeTenants, type TenantLeaseFields, type LeaseWithId } from '../../lib/leases/status'")
    expect(newRequestModalSource).toContain('selectCurrentLease(leases.filter((l) => l.property_id === draft.propertyId))')
  })

  it('prefill is opt-in (a checkbox) and only offered when a current tenant actually exists — never silently attached', () => {
    expect(newRequestModalSource).toContain('draft.onBehalfOfTenant')
    expect(newRequestModalSource).toContain('This is on behalf of the current tenant')
    expect(newRequestModalSource).toContain('No current tenant on file for this property')
  })

  it('tenant phone (leases.tenant_phone) is surfaced as read-only context, never silently persisted onto maintenance_requests (which has no phone column)', () => {
    expect(newRequestModalSource).toContain('Phone on file: {currentTenant.phone}')
    expect(newRequestModalSource).not.toMatch(/tenantPhone.*payload|payload.*tenantPhone/i)
  })
})

describe('PropCrew assignment — fully preserved from M3, untouched by M3.1', () => {
  it('MaintenanceCaseDetail (the shared assign/reassign/remove UI) is unmodified in its core write contract', () => {
    expect(caseDetailSource).toContain("onAssign(e.target.value || null)")
    expect(caseDetailSource).toContain('<option value="">Unassigned</option>')
  })

  it('both the property hub and the portfolio Command Center still mount the same shared assignment UI', () => {
    expect(pageSource).toContain('onAssign={(contactId) => void assignMaintenanceContact(openMaintenanceCase.id, contactId)}')
    expect(commandCenterPageSource).toContain('onAssign={(contactId) => void assignContact(openCase.id, contactId)}')
  })
})

describe('Active vs Completed separation — preserved, and Active Requests/portfolio Command Center share one derivation', () => {
  it('the property hub still splits Open vs Completed requests via the same status check the Command Center itself uses', () => {
    expect(pageSource).toContain("const openRequests = selectedRequests.filter((row) => row.status !== 'Completed')")
    expect(pageSource).toContain("const completedRequests = selectedRequests.filter((row) => row.status === 'Completed')")
  })

  it('the portfolio Command Center\'s active/history split (sortCasesForCommandCenter, tested in command-center.test.ts) is unmodified by M3.1', () => {
    expect(commandCenterPageSource).toContain('sortCasesForCommandCenter(enriched)')
  })
})

describe('PropWatch maintenance normalization — the M3.1 core fix', () => {
  it('Open Maintenance is now sourced from canonical, active maintenance_requests cases, not the free-text maintenance_records.status field', () => {
    expect(pageSource).toContain('buildOpenMaintenanceRequestItems(enrichedRequestsForPropWatch, propertyLabelById)')
    expect(pageSource).not.toContain('buildOpenMaintenanceItems(maintenanceRecords, propertyLabelById)')
  })

  it('the property-card "open maintenance" count uses the same canonical, active-case definition', () => {
    const idx = pageSource.indexOf('const openMaintenanceCount = useMemo(')
    const body = pageSource.slice(idx, idx + 400)
    expect(body).toContain('enrichMaintenanceCases(maintenanceRequests, tenantRequests, intakeSessions)')
    expect(body).toContain('.filter((c) => c.active)')
    expect(body).not.toContain('maintenanceRecords.filter')
  })

  it('the legacy maintenance_records-based function still exists (not deleted) but is no longer the PropWatch data source — no destructive removal of working code', () => {
    expect(attentionSource).toContain('export function buildOpenMaintenanceItems(')
    expect(attentionSource).toContain('export function buildOpenMaintenanceRequestItems(')
  })

  it('a completed historical maintenance_records row can never be miscounted as active — buildOpenMaintenanceRequestItems\'s input type has no maintenance_records fields at all (service_date/vendor/cost), so one can\'t be fed into it even by accident', () => {
    const fnStart = attentionSource.indexOf('export type OpenMaintenanceRequestInput')
    const fnEnd = attentionSource.indexOf('\n\nexport function buildOpenMaintenanceRequestItems')
    const typeBody = attentionSource.slice(fnStart, fnEnd)
    expect(typeBody).not.toMatch(/service_date|vendor|cost/)
  })
})

describe('Security: no RLS weakened, no service-role client, anywhere in M3.1', () => {
  it('no new file references a service-role key or admin client', () => {
    for (const source of [newRequestModalSource, commandCenterPageSource]) {
      expect(source).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE|supabaseAdmin/)
    }
  })

  it('the shared NewMaintenanceRequestModal never queries Supabase itself — it only takes already-fetched, RLS-scoped data as props (same "dumb component" pattern as MaintenanceCaseDetail)', () => {
    expect(newRequestModalSource).not.toMatch(/supabase\.from\(|createClient\(/)
  })

  it('portfolio-level property/lease fetches trust RLS alone — no explicit, client-suppliable owner_id filter added', () => {
    expect(commandCenterPageSource).not.toMatch(/\.eq\('owner_id'/)
  })
})

describe('Mobile UX — reuses existing card/modal patterns, no new desktop table', () => {
  it('NewMaintenanceRequestModal reuses the existing .overlay/.modal/.formGrid pattern every other in-app form modal already uses', () => {
    expect(newRequestModalSource).toContain('className="overlay"')
    expect(newRequestModalSource).toContain('className="modal moduleModal"')
    expect(newRequestModalSource).toContain('className="formGrid"')
  })

  it('neither new file, nor the property Maintenance hub specifically, introduces a <table> (app/page.tsx legitimately has an unrelated <table> elsewhere — the Financials ledger — so only the Maintenance-specific slice is checked)', () => {
    for (const source of [commandCenterPageSource, newRequestModalSource]) {
      expect(source).not.toContain('<table')
    }
    const hubStart = pageSource.indexOf("propertySubTab === 'Maintenance' &&")
    const hubEnd = pageSource.indexOf("propertySubTab === 'Systems'")
    expect(pageSource.slice(hubStart, hubEnd)).not.toContain('<table')
  })
})
