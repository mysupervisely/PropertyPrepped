import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Milestone 28 — M3: Landlord Maintenance Command Center V1.
// Source-read regression guards, same no-jsdom convention as the rest
// of this repo — components/tenant-connect/MaintenanceCommandCenter.tsx
// and its wiring into app/page.tsx.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const ccSource = readFile('components/tenant-connect/MaintenanceCommandCenter.tsx')

describe('MaintenanceCommandCenter is mounted in the new top-level Maintenance tab', () => {
  it('imports and renders MaintenanceCommandCenter with the property-scoped data already loaded by loadPortfolio()', () => {
    expect(pageSource).toContain("import { MaintenanceCommandCenter } from '../components/tenant-connect/MaintenanceCommandCenter'")
    const idx = pageSource.indexOf("activeTab === 'Maintenance'")
    expect(idx).toBeGreaterThan(-1)
    const nearby = pageSource.slice(idx, idx + 1200)
    expect(nearby).toContain('<MaintenanceCommandCenter')
    expect(nearby).toContain('requests={selectedRequests}')
    expect(nearby).toContain('tenantRequests={selectedTenantRequests}')
    expect(nearby).toContain('contacts={selectedContacts}')
  })

  it('the old per-row status <select>/delete-button pair (updateRequestStatus/removeRequest) was retired, not left dangling', () => {
    expect(pageSource).not.toContain('async function updateRequestStatus(')
    expect(pageSource).not.toContain('async function removeRequest(')
  })

  it('the "+ Log request" manual-entry path is preserved and reachable from the new tab', () => {
    expect(pageSource).toContain('onLogRequest={() => setShowRequestForm(true)}')
    expect(pageSource).toContain('async function saveRequest()')
  })
})

describe('Naming conflict found during the M3 audit, resolved: Details > Maintenance (service history) vs. the new top-level Maintenance tab', () => {
  it('the Details sub-tab KEY stays "Maintenance" (no ripple to ActivityType/SearchResultType/nav targets) but its DISPLAYED label is now "Service History"', () => {
    expect(pageSource).toContain("const propertySubTabs: PropertySubTab[] = ['Mortgage', 'Insurance', 'Maintenance', 'Systems', 'Ownership']")
    const idx = pageSource.indexOf('aria-label="Details sections"')
    expect(idx).toBeGreaterThan(-1)
    expect(pageSource.slice(idx, idx + 400)).toContain("sub === 'Maintenance' ? 'Service History' : sub")
  })

  it('the Quick Actions button pointing at the same sub-tab is relabeled too, for consistency', () => {
    expect(pageSource).toContain("setActiveTab('Details'); setPropertySubTab('Maintenance') }}>Service History")
  })
})

describe('Status sync (M1.1 open question, closed by M3): changing a case status also updates the linked tenant_requests row', () => {
  it('changeStatus() writes maintenance_requests.status first, then syncs tenant_requests.status via syncedTenantRequestStatus(), only when a link exists', () => {
    const fnStart = ccSource.indexOf('async function changeStatus(')
    const fnEnd = ccSource.indexOf('\n  }', fnStart)
    const fnBody = ccSource.slice(fnStart, fnEnd)
    expect(fnBody).toContain("supabase.from('maintenance_requests').update({ status })")
    expect(fnBody).toContain('tenantRequestByCaseId.get(item.id)')
    expect(fnBody).toContain("supabase.from('tenant_requests').update({ status: syncedTenantRequestStatus(status) })")
    // The canonical write's own error short-circuits before any sync attempt.
    expect(fnBody).toMatch(/if \(caseErr\) \{[\s\S]*?return/)
  })

  it('a synced status change notifies Tenant Connect the same way the pre-existing TenantRequestsPanel status change already does', () => {
    expect(ccSource).toContain("notifyTenantConnect(supabase, 'landlord_update', { requestId: linked.id })")
  })

  it('imports the presentation/sync helpers from the shared, pure, unit-tested module rather than re-deriving the mapping inline', () => {
    expect(ccSource).toContain("from '../../lib/maintenance/status'")
    expect(ccSource).toContain('presentMaintenanceStatus')
    expect(ccSource).toContain('syncedTenantRequestStatus')
    expect(ccSource).toContain('REOPENED_STATUS')
  })
})

describe('PropCrew assignment (Section 8): internal organization only', () => {
  it('assignContact() writes only maintenance_requests.assigned_contact_id — no notification, no outreach, no other table', () => {
    const fnStart = ccSource.indexOf('async function assignContact(')
    const fnEnd = ccSource.indexOf('\n  }', fnStart)
    const fnBody = ccSource.slice(fnStart, fnEnd)
    expect(fnBody).toContain("supabase.from('maintenance_requests').update({ assigned_contact_id: contactId || null })")
    expect(fnBody).not.toContain('notifyTenantConnect')
    expect(fnBody).not.toMatch(/fetch\(|sms|email/i)
  })

  it('the assignment UI tells the landlord this is internal-only, not outreach', () => {
    expect(ccSource).toContain('Internal organization only — nothing is sent to this contact.')
  })
})

describe('Attachments: reuses the existing tenant-connect-attachments bucket/RLS, signed URLs only', () => {
  it('never introduces a public URL or a new bucket', () => {
    expect(ccSource).toContain("supabase.storage.from('tenant-connect-attachments').createSignedUrl(")
    expect(ccSource).not.toMatch(/getPublicUrl|storage\.from\(['"](?!tenant-connect-attachments)/)
  })
})

describe('Safety section: shows the real intake outcome, never a reinterpreted/AI-generated explanation', () => {
  it('reads maintenance_intake_sessions.outcome directly and maps it through a fixed, literal copy table (no AI call, no free-text generation)', () => {
    expect(ccSource).toContain("from('maintenance_intake_sessions')")
    expect(ccSource).toContain(".select('outcome')")
    expect(ccSource).toContain('OUTCOME_COPY')
    expect(ccSource).not.toMatch(/openai|anthropic|generateText|chat\.completions/i)
  })
})

describe('No destructive delete action was carried forward for maintenance cases', () => {
  it('MaintenanceCommandCenter never calls .delete() on maintenance_requests', () => {
    expect(ccSource).not.toMatch(/maintenance_requests['"]\)\.delete\(/)
  })
})

describe('Security boundary: every write is scoped through the existing owner-id/property-id RLS, no service-role key', () => {
  it('no service-role key or admin client appears in the new component', () => {
    expect(ccSource).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE/)
  })

  it('every mutation goes through the caller-supplied, already-RLS-scoped supabase client — no direct fetch to a REST/API endpoint', () => {
    expect(ccSource).not.toMatch(/fetch\(['"]\/api\//)
  })
})
