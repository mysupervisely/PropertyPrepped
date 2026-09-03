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
    const nearby = source.slice(tenantTabIndex, tenantTabIndex + 4000)
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

describe('Maintenance Coordination M2.1 review pass (Part 4) — minimum landlord visibility on the existing maintenance_requests list', () => {
  const source = readFile('app/page.tsx')

  it('shows a Tenant source badge on a tenant-originated maintenance_requests row', () => {
    expect(source).toContain("req.source === 'tenant' && <span className=\"statusPill tenantSourceBadge\">Tenant</span>")
  })

  it('shows the category for a tenant-originated row, derived from the already-fetched portfolio-wide tenant_requests (maintenance_requests itself has no category column)', () => {
    expect(source).toContain('categoryByMaintenanceRequestId')
    expect(source).toContain('maintenanceCategoryLabel(categoryByMaintenanceRequestId.get(req.id)!)')
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

  it('only ever queries the tenant-scoped tables/views (tenant_property_access, tenant_property_view, tenant_lease_view, tenant_requests, property_messages, property_message_attachments)', () => {
    expect(source).toContain("from('tenant_property_access')")
    expect(source).toContain("from('tenant_property_view')")
    expect(source).toContain("from('tenant_lease_view')")
    expect(source).toContain("from('tenant_requests')")
    expect(source).toContain("from('property_messages')")
  })

  it('NEVER queries the owner-facing properties/leases base tables directly (Round 6, Concern 2 — those carry landlord-only financial/valuation/private columns with no tenant-facing RLS policy any more; the restricted views above are the only tenant read path)', () => {
    expect(source).not.toMatch(/\.from\(['"]properties['"]\)/)
    expect(source).not.toMatch(/\.from\(['"]leases['"]\)/)
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

  it('the new_request kind (triggered by the TENANT, from app/tenant/page.tsx) looks up the property through tenant_property_view, never the owner-facing properties base table the tenant has no access to', () => {
    const idx = source.indexOf("body.kind === 'new_request'")
    expect(idx).toBeGreaterThan(-1)
    const block = source.slice(idx, source.indexOf("body.kind === 'landlord_update'"))
    expect(block).toContain(".from('tenant_property_view').select('address')")
    expect(block).not.toMatch(/\.from\(['"]properties['"]\)/)
  })

  it('the invite/landlord_update kinds (both owner-triggered) still read the owner-facing properties table directly — the owner keeps full base-table access', () => {
    const idx = source.indexOf("body.kind === 'landlord_update'")
    expect(idx).toBeGreaterThan(-1)
    expect(source.slice(idx)).toContain(".from('properties').select('address')")
  })
})

describe('Tenant Connect V1 migration (supabase/milestone-24-tenant-connect-v1.sql) — Round 6 database-level fixes', () => {
  const sql = readFile('supabase/milestone-24-tenant-connect-v1.sql')

  it('locks every tenant_requests column except status/updated_at with a BEFORE UPDATE trigger, not just an application convention', () => {
    expect(sql).toContain('create or replace function public.tenant_requests_lock_immutable_fields()')
    expect(sql).toContain('before update on public.tenant_requests')
    expect(sql).toContain('execute function public.tenant_requests_lock_immutable_fields()')
    for (const col of ['property_id', 'owner_id', 'tenant_access_id', 'conversation_id', 'category', 'title', 'description', 'created_at']) {
      expect(sql).toContain(`new.${col} := old.${col};`)
    }
  })

  it('replaces base-table tenant SELECT access on properties/leases with two column-limited views', () => {
    expect(sql).toContain('create view public.tenant_property_view as')
    expect(sql).toContain('create view public.tenant_lease_view as')
    expect(sql).toContain('drop policy if exists "properties_select_active_tenant" on public.properties')
    expect(sql).toContain('drop policy if exists "leases_select_active_tenant" on public.leases')
    // The view definitions themselves must never select a landlord-only
    // financial/valuation/private column.
    const propViewIdx = sql.indexOf('create view public.tenant_property_view as')
    const propViewSql = sql.slice(propViewIdx, sql.indexOf(';', propViewIdx))
    for (const col of ['estimated_value', 'mortgage_balance', 'purchase_price', 'monthly_expenses', 'purchase_date', 'property_tax_annual', 'hoa_monthly', 'financing_status']) {
      expect(propViewSql).not.toContain(col)
    }
    const leaseViewIdx = sql.indexOf('create view public.tenant_lease_view as')
    const leaseViewSql = sql.slice(leaseViewIdx, sql.indexOf(';', leaseViewIdx))
    expect(leaseViewSql).not.toContain('notes')
  })

  it('grants the tenant views to authenticated only, never anon or public', () => {
    expect(sql).toContain('grant select on public.tenant_property_view to authenticated;')
    expect(sql).toContain('grant select on public.tenant_lease_view to authenticated;')
    expect(sql).not.toMatch(/grant select on public\.tenant_(property|lease)_view to (anon|public)/)
  })

  it('hardens tenant_access_id/conversation_id to ON DELETE RESTRICT while property_id/owner_id stay ON DELETE CASCADE (repo-wide whole-property-deletion convention)', () => {
    expect(sql).toContain('tenant_access_id uuid not null references public.tenant_property_access(id) on delete restrict')
    expect(sql).toContain('conversation_id uuid not null references public.property_conversations(id) on delete restrict')
    expect(sql).toContain('property_id uuid not null references public.properties(id) on delete cascade')
    expect(sql).toContain('owner_id uuid not null references auth.users(id) on delete cascade')
  })
})
