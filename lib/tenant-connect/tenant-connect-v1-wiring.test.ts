import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Tenant Connect V1 (Milestone 24) — source-read regression guards for
// the landlord-side wiring and the tenant portal's isolation from the
// landlord application. Same technique as
// lib/dashboard/property-first-navigation.test.ts (no jsdom/React
// Testing Library in this repo).

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

describe('Tenant Connect V1 lives inside Property > Rent > Tenant, not a new destination', () => {
  const source = readFile('app/page.tsx')

  it('renders the new status card and requests panel inside the Rent > Tenant sub-tab', () => {
    const tenantTabIndex = source.indexOf("rentSubTab === 'Tenant'")
    expect(tenantTabIndex).toBeGreaterThan(-1)
    const nearby = source.slice(tenantTabIndex, tenantTabIndex + 3000)
    expect(nearby).toContain('<TenantConnectStatusCard')
    expect(nearby).toContain('<TenantRequestsPanel')
  })

  it('the pre-existing owner-manual-log (maintenance_requests / "+ Log request") path is untouched', () => {
    expect(source).toContain('+ Log request')
    expect(source).toContain("setShowRequestForm(true)")
    expect(source).toContain("client.from('maintenance_requests').select('*')")
  })

  it('loads tenant_requests portfolio-wide for PropWatch, without blocking the whole page load if the migration is not yet applied', () => {
    expect(source).toContain("client.from('tenant_requests').select('*')")
    // No destructured error variable for this query at all, and nothing
    // named after it appears in the firstError guard — a failing/missing
    // tenant_requests table (before the migration is applied) must never
    // block every other property-workspace feature from loading.
    expect(source).not.toContain('tenantRequestError')
    const firstErrorLine = source.match(/const firstError = [^\n]+/)?.[0] || ''
    expect(firstErrorLine).not.toMatch(/tenantRequest/i)
  })

  it('wires tenant requests into the SAME Needs Attention list PropWatch already builds (no second notification center)', () => {
    expect(source).toContain('buildTenantRequestDateItems(tenantRequests, propertyLabelById)')
  })

  it('does not add a new top-level Tab value for Tenant Connect', () => {
    expect(source).toContain("type Tab = 'Overview' | 'Rent' | 'Details' | 'PropCrew' | 'Documents' | 'Tax'")
  })
})

describe('Tenant Connect V1 — old general-conversation panel preserved but no longer mounted here', () => {
  it('components/TenantConnectPanel.tsx (M10) is untouched, still a complete, working component', () => {
    const source = readFile('components/TenantConnectPanel.tsx')
    expect(source).toContain('export function TenantConnectPanel(')
    expect(source).toContain(".from('property_conversations')")
  })

  it('app/page.tsx no longer imports the old TenantConnectPanel (replaced at this call site by the new purpose-built components)', () => {
    const source = readFile('app/page.tsx')
    expect(source).not.toContain("from '../components/TenantConnectPanel'")
  })
})

describe('Tenant Portal (app/tenant/page.tsx) is isolated from the landlord application', () => {
  const source = readFile('app/tenant/page.tsx')

  it('never imports the landlord header components (no Dashboard/Documents/Tax Center/PropCrew/Investment Tools/Profile/Pricing surface here)', () => {
    expect(source).not.toMatch(/from ['"].*components\/Auth(Header|NavMenu)['"]/)
  })

  it('has its own minimal header instead', () => {
    expect(source).toContain('tenantPortalHeader')
    expect(source).toContain('Tenant Portal')
  })

  it('never queries any landlord-only table (mortgages, insurance_policies, financial_transactions, property_tax_records, property_documents, property_contacts, investment_analyses)', () => {
    for (const table of ['mortgages', 'insurance_policies', 'financial_transactions', 'property_tax_records', 'property_documents', 'property_contacts', 'investment_analyses']) {
      expect(source).not.toContain(`from('${table}')`)
    }
  })

  it('only ever queries the tenant-scoped tables (tenant_property_access, properties, leases, tenant_requests, property_messages, property_message_attachments)', () => {
    expect(source).toContain("from('tenant_property_access')")
    expect(source).toContain("from('properties')")
    expect(source).toContain("from('leases')")
    expect(source).toContain("from('tenant_requests')")
    expect(source).toContain("from('property_messages')")
  })

  it('accepts an invite via the SECURITY DEFINER RPC, never a direct client UPDATE of tenant_property_access', () => {
    expect(source).toContain("supabase.rpc('accept_tenant_invite'")
    expect(source).not.toMatch(/tenant_property_access['"]\)\s*\.update\(/)
  })

  it('has a sign-in gate consistent with every other standalone route', () => {
    expect(source).toContain('Sign in required')
  })
})

describe('Tenant Connect V1 notify route re-derives data via the caller\'s own RLS-scoped client, never trusts the request body for content', () => {
  const source = readFile('app/api/tenant-connect/notify/route.ts')

  it('uses createRequestClient(token) — the caller\'s own identity — not the admin client, to look up what to email', () => {
    expect(source).toContain('createRequestClient(token)')
  })

  it('re-fetches the row from the database rather than trusting a client-supplied subject/body', () => {
    expect(source).toContain(".from('tenant_property_access').select('property_id, tenant_email')")
    expect(source).toContain(".from('tenant_requests').select('property_id, owner_id, category, title')")
  })

  it('uses the admin client only to resolve an email address (auth.users), never to bypass the RLS-scoped read above', () => {
    expect(source).toContain('admin.auth.admin.getUserById(')
  })
})
