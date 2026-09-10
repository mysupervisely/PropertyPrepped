import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PropRoster — Tenant Portal lease-file access (PR #60 polish). Source-read
// regression guards, matching this repo's established no-jsdom convention
// (see lib/tenant-connect/tenant-connect-v1-wiring.test.ts's own coverage
// of app/api/tenant-connect/document-url/route.ts, the direct precedent
// this route reuses). No schema change: leases.document_id and
// property_documents.storage_path are pre-existing columns.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const routeSource = readFile('app/api/tenant-connect/lease-document-url/route.ts')
const tenantPageSource = readFile('app/tenant/page.tsx')

describe('lease-document-url route — authorization', () => {
  it('re-verifies the caller\'s own ACTIVE tenant_property_access row for this exact lease id via the caller\'s own RLS-scoped client, before touching anything else', () => {
    expect(routeSource).toContain('createRequestClient(token)')
    const idx = routeSource.indexOf('const { data: access }')
    expect(idx).toBeGreaterThan(-1)
    const block = routeSource.slice(idx, idx + 300)
    expect(block).toContain(".from('tenant_property_access')")
    expect(block).toContain(".eq('lease_id', body.leaseId)")
    expect(block).toContain(".eq('status', 'Active')")
  })

  it('never trusts a client-supplied property id, document id, or storage path — leaseId is the only client input, and it must match the caller\'s own authorized tenancy before any admin-client read', () => {
    expect(routeSource).toContain('leaseId?: string')
    expect(routeSource).not.toMatch(/body\.documentId|body\.storagePath|body\.storage_path|body\.propertyId/)
  })

  it('only reaches leases/property_documents via the admin client AFTER the RLS-scoped authorization check, and cross-checks the lease\'s own property_id against the authorized tenancy\'s property_id — defense in depth against a lease id that somehow belongs to a different property', () => {
    const adminIdx = routeSource.indexOf('createAdminClient()')
    const accessIdx = routeSource.indexOf('const { data: access }')
    expect(adminIdx).toBeGreaterThan(accessIdx)
    expect(routeSource).toContain('lease.property_id !== access.property_id')
  })

  it('reuses the EXISTING leases.document_id / property_documents.storage_path columns — no new table, no new view, no schema change', () => {
    expect(routeSource).toContain(".from('leases').select('document_id, property_id')")
    expect(routeSource).toContain(".from('property_documents').select('storage_path')")
  })

  it('signs via the admin client only, same bucket as the existing document-url route, never a client-side createSignedUrl call', () => {
    expect(routeSource).toContain("admin.storage.from('property-documents').createSignedUrl(doc.storage_path, 3600)")
  })

  it('a lease with no document_id is a safe, explicit empty result (200, url: null) — never a broken link, never an error', () => {
    expect(routeSource).toContain('if (!lease.document_id) return NextResponse.json({ url: null }, { status: 200 })')
  })

  it('an unrecognized/not-owned lease id (RLS returns nothing) is a 404 — never leaks whether the lease exists at all', () => {
    expect(routeSource).toContain('if (!access) return NextResponse.json({ url: null }, { status: 404 })')
  })
})

describe('Tenant Lease tab — "View signed lease" action', () => {
  const componentBody = tenantPageSource.slice(
    tenantPageSource.indexOf('function TenantLeaseView'),
    tenantPageSource.indexOf('// "Rent" (Section:'),
  )

  it('calls the lease-document-url route with the lease id, authenticated via a fresh bearer token — same pattern TenantDocumentsView already uses for its own document-url call', () => {
    expect(componentBody).toContain("fetch('/api/tenant-connect/lease-document-url'")
    expect(componentBody).toContain('body: JSON.stringify({ leaseId: lease.id })')
    expect(componentBody).toContain('Authorization: `Bearer ${token}`')
  })

  it('never fetches an arbitrary landlord document — the ONLY id sent is this tenancy\'s own lease id, never a documentId', () => {
    expect(stripComments(componentBody)).not.toMatch(/documentId|tenant_documents_view/)
  })

  it('shows the action only once the route has actually confirmed a file exists — never a button that opens a known-broken link', () => {
    expect(componentBody).toContain('leaseFileChecked && (')
    expect(componentBody).toContain('leaseFileUrl')
    expect(componentBody).toContain("? <button className=\"secondary tenantPortalLeaseFileButton\"")
  })

  it('renders a safe empty state (not a broken link) when no lease file exists', () => {
    expect(componentBody).toContain('tenantPortalLeaseFileEmpty')
    expect(componentBody).toContain('hasn&rsquo;t shared a signed lease file yet')
  })

  it('does not touch tenant_property_access/leases directly and does not weaken the existing tenant_lease_view read', () => {
    expect(stripComments(componentBody)).not.toMatch(/\.from\('leases'\)|\.from\('tenant_property_access'\)/)
  })
})
