import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// M2.1 review pass (Part 6) — attachment rendering security review.
// Source-read regression guards, matching this repo's established
// no-jsdom convention. The actual access-control guarantees are
// enforced by RLS (property_message_attachments_select /
// tenant_connect_attachments_select, both re-verified unchanged
// against supabase/schema.sql — no migration was needed for M2 or this
// review pass) — these tests confirm the CLIENT code never works
// around that, in either the landlord or tenant thread view.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

describe.each([
  ['landlord', 'components/tenant-connect/TenantRequestsPanel.tsx'],
  ['tenant', 'app/tenant/page.tsx'],
])('Attachment rendering security (%s thread view)', (_who, path) => {
  const source = readFile(path)

  it('never fetches a public URL for attachments — always a short-lived signed URL', () => {
    expect(source).toContain("createSignedUrl(row.storage_path, 3600)")
    expect(source).not.toContain('getPublicUrl')
  })

  it('never marks the tenant-connect-attachments bucket public', () => {
    expect(source).not.toMatch(/tenant-connect-attachments['"][^)]*public:\s*true/)
  })

  it('fetches attachment rows scoped to the messages of the currently-open conversation only, relying on RLS to re-verify — never a bare unscoped select', () => {
    expect(source).toMatch(/property_message_attachments'\)\.select\('message_id, storage_path'\)\.in\('message_id',\s*messages\.map/)
  })

  it('guards against a stale, out-of-order attachment fetch overwriting the currently-open request\'s attachments (rapid open-A-then-B race)', () => {
    expect(source).toContain('openIdRef')
    expect(source).toMatch(/if \(openIdRef\.current === forRequestId\)/)
  })
})
