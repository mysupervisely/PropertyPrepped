import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Mobile V3 — Notifications & Activity Center — source-read regression
// guards. Same no-jsdom, source-read wiring-test convention as every
// other app/*.tsx test in this repo.
//
// This milestone is additive: one new migration (table + 5 SECURITY
// DEFINER triggers, no changes to any existing table's columns or
// RLS), one new page (app/notifications/page.tsx), two new pure/hook
// modules (lib/notifications/events.ts, lib/notifications/useUnreadCount.ts),
// a bell added to components/AuthHeader.tsx, a small ?tab= read added to
// app/tenant-connect/page.tsx, and new CSS. No existing messaging,
// maintenance, or PropCrew interface was touched or duplicated.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

describe('Migration: additive only, one new table, SECURITY DEFINER triggers, no client INSERT policy', () => {
  const migration = readFile('supabase/milestone-35-mobile-v3-notification-center.sql')

  it('creates exactly one new table and touches no other table\'s own columns', () => {
    expect(migration).toContain('create table if not exists public.notification_events')
    expect(migration).not.toMatch(/alter table public\.(?!notification_events)\w+ add column/)
    expect(migration).not.toMatch(/drop table|drop column/i)
  })

  it('has no INSERT policy for authenticated — every row comes from a trigger, never a client', () => {
    expect(migration).not.toMatch(/for insert to authenticated/)
    expect(migration).toContain('notification_events_select_own')
    expect(migration).toContain('notification_events_update_own')
  })

  it('every trigger function is SECURITY DEFINER with a locked search_path, same precedent as tenant_requests_create_maintenance_case()', () => {
    const triggerFns = [
      'notify_on_tenant_message', 'notify_on_tenant_request', 'notify_on_maintenance_status_change',
      'notify_on_outreach_response', 'notify_on_tenant_invite_accepted',
    ]
    for (const fn of triggerFns) {
      const idx = migration.indexOf(`create or replace function public.${fn}()`)
      expect(idx, `expected to find function ${fn}`).toBeGreaterThan(-1)
      const body = migration.slice(idx, idx + 400)
      expect(body).toContain('security definer')
      expect(body).toContain('set search_path = public')
    }
  })

  it('idempotency is structural: every UPDATE-based trigger guards on an actual value change, never fires on a no-op write', () => {
    expect(migration).toContain('if old.status is not distinct from new.status then')
    expect(migration).toContain("if new.status = 'sent' or old.status is not distinct from new.status then")
    expect(migration).toContain('if old.accepted_at is not null or new.accepted_at is null then')
  })

  it('a tenant message only notifies on the TENANT side, never the owner\'s own reply', () => {
    expect(migration).toContain("if new.sender_role <> 'Tenant' then")
  })
})

describe('app/notifications/page.tsx reuses existing RLS, never a service-role client, never re-implements another page\'s interface', () => {
  const source = readFile('app/notifications/page.tsx')

  it('reads notification_events scoped to the caller, plus only existing lookup tables — no new table introduced client-side', () => {
    expect(source).toContain("supabase.from('notification_events').select('*').eq('owner_id', user.id)")
  })

  it('never imports or calls createAdminClient', () => {
    expect(source).not.toContain('createAdminClient')
    expect(source).not.toContain('service_role')
  })

  it('mark-as-read and mark-all-as-read both scope the UPDATE to the signed-in user, never a bare id-only update', () => {
    expect(source).toContain("supabase.from('notification_events').update({ read_at: new Date().toISOString() }).eq('id', id)")
    expect(source).toContain("supabase.from('notification_events').update({ read_at: now }).eq('owner_id', user.id).is('read_at', null)")
  })

  it('never renders a message thread, a maintenance case detail, or a PropCrew contact card itself — every row links out via navHrefForEvent', () => {
    expect(source).not.toContain('tenantConnectThread')
    expect(source).not.toContain('maintenanceCommandCenterCard')
    expect(source).toContain('buildNotificationFeed')
    expect(source).toContain('item.navHref')
  })
})

describe('Header bell (components/AuthHeader.tsx)', () => {
  const source = readFile('components/AuthHeader.tsx')

  it('is a plain link to the dedicated Activity Center, not a dropdown panel — same pattern as the existing Search button right next to it', () => {
    expect(source).toContain('<Link href="/notifications"')
    expect(source).toContain('headerSearchButton headerBellButton')
  })

  it('the badge count comes from the shared useUnreadNotificationCount hook, never a locally invented number', () => {
    expect(source).toContain('useUnreadNotificationCount(user)')
    expect(source).toContain("import { useUnreadNotificationCount } from '../lib/notifications/useUnreadCount'")
  })
})

describe('lib/notifications/useUnreadCount.ts reads only the caller\'s own rows', () => {
  const source = readFile('lib/notifications/useUnreadCount.ts')

  it('filters to the caller\'s own owner_id and unread rows, mirroring lib/useSubscription.ts\'s own defense-in-depth .eq convention', () => {
    expect(source).toContain(".eq('owner_id', user.id)")
    expect(source).toContain(".is('read_at', null)")
    expect(source).not.toContain('createAdminClient')
  })
})

describe('app/tenant-connect/page.tsx: the new ?tab= read is additive, V2.1/V2.2 behavior is unchanged', () => {
  const source = readFile('app/tenant-connect/page.tsx')

  it('reads ?tab=tenants once on mount, same one-shot-flag pattern as the existing ?add=property/?openProperty= params', () => {
    expect(source).toContain("new URLSearchParams(window.location.search).get('tab') === 'tenants'")
  })

  it('still defaults to the Messages tab when no ?tab= param is present', () => {
    expect(source).toContain("useState<TenantConnectTab>('messages')")
  })

  it('the V2.1 directory and V2.2 inbox fetch/render logic are untouched', () => {
    expect(source).toContain('buildTenantDirectory(properties, leases, access, tenantRequests)')
    expect(source).toContain('buildMessageInbox(conversations, messagePreviews, access, leases, properties, reads, tenantRequests)')
  })
})

describe('Existing messaging/maintenance/PropCrew interfaces are completely untouched', () => {
  it('components/tenant-connect/TenantRequestsPanel.tsx was not modified', () => {
    expect(readFile('components/tenant-connect/TenantRequestsPanel.tsx')).not.toMatch(/Mobile V3|notification_events/)
  })

  it('components/tenant-connect/TenantConnectStatusCard.tsx was not modified', () => {
    expect(readFile('components/tenant-connect/TenantConnectStatusCard.tsx')).not.toMatch(/Mobile V3|notification_events/)
  })

  it('app/maintenance/page.tsx was not modified', () => {
    expect(readFile('app/maintenance/page.tsx')).not.toMatch(/Mobile V3|notification_events/)
  })

  it('components/AuthNavMenu.tsx was not modified — the bell is header-only, same as Search, never added to the hamburger list', () => {
    const source = readFile('components/AuthNavMenu.tsx')
    expect(source).not.toMatch(/Mobile V3|notification_events|\/notifications/)
  })

  it('no new API route was introduced for notifications — every write is a client call through RLS-scoped tables, or a DB trigger', () => {
    expect(() => readFile('app/api/notifications/route.ts')).toThrow()
  })
})
