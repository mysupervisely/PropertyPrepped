import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Tenant Connect V2.2 — source-read regression guards for the new
// unified-messaging Messages tab on app/tenant-connect/page.tsx. Same
// no-jsdom, source-read wiring-test convention as every other app/*.tsx
// test in this repo.
//
// This milestone is additive: a Messages tab (default) alongside V2.1's
// existing Tenants tab, one new pure module (lib/tenant-connect/inbox.ts),
// and new CSS. No database migration — property_conversations/
// property_messages/property_message_attachments/
// property_conversation_reads and their RLS already existed and already
// supported everything this milestone needed.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

describe('No database migration was added for this milestone', () => {
  it('no new supabase/milestone-*.sql file mentions Tenant Connect V2.2', () => {
    const page = readFile('app/tenant-connect/page.tsx')
    expect(page).not.toMatch(/create table|alter table|create policy/i)
  })
})

describe('app/tenant-connect/page.tsx: Messages tab reuses existing tables/RLS/notify, never a service-role client', () => {
  const source = readFile('app/tenant-connect/page.tsx')

  it('defaults to the Messages tab', () => {
    expect(source).toContain("useState<TenantConnectTab>('messages')")
  })

  it('reads property_conversations/property_messages/property_conversation_reads — the same tables TenantRequestsPanel already uses', () => {
    expect(source).toContain("supabase.from('property_conversations').select('id,property_id,tenant_access_id,maintenance_request_id,status')")
    expect(source).toContain("supabase.from('property_messages').select('conversation_id,message,created_at')")
    expect(source).toContain("supabase.from('property_conversation_reads').select('conversation_id,last_read_at').eq('user_id', user.id)")
  })

  it('marks a conversation read via the exact same upsert shape TenantRequestsPanel already uses', () => {
    expect(source).toContain("supabase.from('property_conversation_reads').upsert({ conversation_id: conversationId, user_id: user.id, last_read_at: new Date().toISOString() }, { onConflict: 'conversation_id,user_id' })")
  })

  it('sends a reply with the derive-sender-role trigger doing the work — client never claims a sender_role beyond Owner, which the trigger re-verifies', () => {
    expect(source).toContain("sender_user_id: user.id, sender_role: 'Owner'")
  })

  it('reuses the exact same attachment upload path (storage bucket + property_message_attachments insert) as TenantRequestsPanel', () => {
    expect(source).toContain("supabase.storage.from('tenant-connect-attachments').upload(path, attachFile)")
    expect(source).toContain("supabase.from('property_message_attachments').insert({ message_id: msg.id, storage_path: path, mime_type: attachFile.type, size_bytes: attachFile.size })")
  })

  it('notifies via the existing landlord_update kind, keyed by the matching tenant_requests row — never a new notify kind or API route', () => {
    expect(source).toContain("notifyTenantConnect(supabase, 'landlord_update', { requestId: matchingRequest.id })")
    expect(source).not.toMatch(/'kind':\s*'[^']+'/)
    expect(source).not.toContain("'/api/tenant-connect/messages")
  })

  it('never imports or calls createAdminClient — RLS is the only boundary', () => {
    expect(source).not.toContain('createAdminClient')
    expect(source).not.toContain('service_role')
  })

  it('links a maintenance-linked conversation out to the existing portfolio Maintenance page, never re-deriving case data', () => {
    // Design Foundation V1, Desktop Workspace V1: the conversation
    // header/thread/composer markup (including this link) was extracted
    // into a threadBody() function so BOTH the mobile .overlay modal and
    // the new desktop thread panel render the identical content instead
    // of two hand-kept-in-sync copies — see that function's own source
    // comment. The modal (tenantConnectThreadModal) now just calls
    // {threadBody(openRow)}, so the real content to check is inside
    // threadBody() itself, not textually adjacent to the modal div.
    const bodyIndex = source.indexOf('function threadBody(')
    expect(bodyIndex).toBeGreaterThan(-1)
    const nearby = source.slice(bodyIndex, bodyIndex + 900)
    expect(nearby).toContain('href="/maintenance"')
    // And confirm the modal actually renders threadBody(), not a second,
    // divergent copy of this markup.
    const modalIndex = source.indexOf('tenantConnectThreadModal')
    expect(modalIndex).toBeGreaterThan(-1)
    expect(source.slice(modalIndex, modalIndex + 100)).toContain('{threadBody(openRow)}')
  })

  it('the thread view reuses the exact same CSS classes as TenantRequestsPanel\'s thread modal — no new thread markup/classes invented', () => {
    for (const cls of ['tenantConnectThread', 'tenantConnectBubble', 'tenantConnectBubbleMeta', 'tenantConnectBubbleAttachments', 'tenantConnectCompose', 'tenantConnectComposeRow', 'tenantConnectAttachLabel']) {
      expect(source).toContain(cls)
    }
  })
})

describe('lib/tenant-connect/inbox.ts is pure — no Supabase, no React', () => {
  const source = readFile('lib/tenant-connect/inbox.ts')

  it('has no React or Supabase imports', () => {
    expect(source).not.toMatch(/from ['"]react['"]/)
    expect(source).not.toMatch(/from ['"]@supabase/)
  })

  it('reuses isConversationUnread for the unread rule — never a second derivation', () => {
    expect(source).toContain("import { isConversationUnread, messagePreview } from './helpers'")
    expect(source).toContain('isConversationUnread(latestForConversation?.created_at ?? null, lastReadByConversation.get(c.id) ?? null)')
  })

  it('reuses messagePreview for the truncated preview text — never a second truncation implementation', () => {
    expect(source).toContain('messagePreview(latestForConversation.message)')
  })
})

describe('Existing property-level Tenant Connect messaging UI is completely untouched', () => {
  it('components/tenant-connect/TenantRequestsPanel.tsx was not modified by this milestone', () => {
    expect(readFile('components/tenant-connect/TenantRequestsPanel.tsx')).not.toMatch(/Tenant Connect V2\.2/)
  })

  it('app/api/tenant-connect/notify/route.ts was not modified — no new notify kind added', () => {
    const source = readFile('app/api/tenant-connect/notify/route.ts')
    expect(source).not.toMatch(/Tenant Connect V2\.2/)
    expect(source).toContain("body.kind === 'landlord_update'")
    expect(source).not.toMatch(/body\.kind === 'message'/)
  })

  it('app/page.tsx\'s Rent > Tenant mount of TenantConnectStatusCard/TenantRequestsPanel is unchanged', () => {
    const source = readFile('app/page.tsx')
    expect(source).toContain('<TenantConnectStatusCard supabase={supabase} propertyId={selected.id} ownerId={user.id} currentLease={currentLease} tenantConnectEnabled={entitlements.tenantConnect} onChanged={() => void loadPortfolio()} />')
    expect(source).toContain('<TenantRequestsPanel supabase={supabase} propertyId={selected.id} ownerId={user.id} tenantConnectEnabled={entitlements.tenantConnect}')
  })
})

describe('CSS: the inbox row reuses existing card/pill conventions, no duplicate base rules', () => {
  const css = readFile('app/globals.css')

  it('defines the new inbox row classes the page renders', () => {
    expect(css).toContain('.tenantInboxRow {')
    expect(css).toContain('.tenantInboxUnreadDot {')
    expect(css).toContain('.tenantInboxPreview {')
  })

  it('the Messages/Tenants tab switcher reuses .maintenanceFilterRow/.maintenanceFilterChip verbatim — no new tab-switcher CSS', () => {
    const page = readFile('app/tenant-connect/page.tsx')
    expect(page).toContain('className="maintenanceFilterRow"')
    expect(page).toContain("className={`maintenanceFilterChip${tab === 'messages' ? ' active' : ''}`}")
  })
})

describe('Free-plan eligibility and RLS isolation are preserved', () => {
  it('the Messages tab is gated by the same entitlementsFor(plan).tenantConnect check as the Tenants tab, not a separate/new gate', () => {
    const source = readFile('app/tenant-connect/page.tsx')
    const occurrences = (source.match(/tenantConnectEnabled/g) || []).length
    expect(occurrences).toBeGreaterThan(2)
    expect(source).not.toMatch(/plan === 'free'/)
  })
})
