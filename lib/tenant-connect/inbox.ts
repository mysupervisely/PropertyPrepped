// PropRoster — Tenant Connect V2.2: portfolio-wide message inbox.
//
// Pure data-shaping only — no Supabase, no React, same convention as
// lib/tenant-connect/directory.ts. Builds one row per OPEN
// property_conversations row the caller owns, joined to:
//   - its own latest property_messages row (preview text + timestamp)
//   - its own property_conversation_reads row for THIS user (unread —
//     reuses isConversationUnread() verbatim, the same function
//     components/TenantConnectPanel.tsx already relies on; never a
//     second unread derivation)
//   - the tenant's display name, via the conversation's own
//     tenant_access_id -> its lease_id -> that lease's tenant_name,
//     falling back to the access row's own tenant_email (always
//     present) when no lease match exists
//   - a related maintenance case id, preferring the matching
//     tenant_requests row's maintenance_request_id (the canonical,
//     always-set link for every tenant-submitted case — see
//     tenant_requests_create_maintenance_case() in supabase/schema.sql)
//     over property_conversations' own optional, owner-set
//     maintenance_request_id column
//
// Never invents a status, a preview, or an unread flag that isn't a
// direct read of existing data.

import { directoryPropertyLabel, type DirectoryProperty } from './directory'
import { isConversationUnread, messagePreview } from './helpers'
import type { PropertyConversation, PropertyMessage, TenantPropertyAccess, TenantRequest } from './types'

export type InboxConversation = Pick<PropertyConversation, 'id' | 'property_id' | 'tenant_access_id' | 'maintenance_request_id' | 'status'>
export type InboxMessage = Pick<PropertyMessage, 'conversation_id' | 'message' | 'created_at'>
export type InboxAccess = Pick<TenantPropertyAccess, 'id' | 'lease_id' | 'tenant_email'>
export type InboxLease = { id: string; tenant_name: string }
export type InboxRead = { conversation_id: string; last_read_at: string }
export type InboxTenantRequest = Pick<TenantRequest, 'conversation_id' | 'maintenance_request_id'>

export type MessageInboxRow = {
  conversationId: string
  propertyId: string
  propertyLabel: string
  tenantName: string
  maintenanceRequestId: string | null
  latestMessagePreview: string | null
  latestMessageAt: string | null
  unread: boolean
}

/** The single most recent message per conversation_id. */
export function latestMessageByConversation(messages: InboxMessage[]): Map<string, { message: string; created_at: string }> {
  const map = new Map<string, { message: string; created_at: string }>()
  for (const m of [...messages].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (!map.has(m.conversation_id)) map.set(m.conversation_id, { message: m.message, created_at: m.created_at })
  }
  return map
}

export function buildMessageInbox(
  conversations: InboxConversation[],
  messages: InboxMessage[],
  access: InboxAccess[],
  leases: InboxLease[],
  properties: DirectoryProperty[],
  reads: InboxRead[],
  tenantRequests: InboxTenantRequest[],
): MessageInboxRow[] {
  const accessById = new Map(access.map((a) => [a.id, a]))
  const leaseById = new Map(leases.map((l) => [l.id, l]))
  const propertyById = new Map(properties.map((p) => [p.id, p]))
  const lastReadByConversation = new Map(reads.map((r) => [r.conversation_id, r.last_read_at]))
  const latest = latestMessageByConversation(messages)
  const requestByConversation = new Map(tenantRequests.map((r) => [r.conversation_id, r.maintenance_request_id]))

  return conversations
    .filter((c) => c.status === 'Open')
    .map((c) => {
      const acc = accessById.get(c.tenant_access_id)
      const lease = acc?.lease_id ? leaseById.get(acc.lease_id) : undefined
      const property = propertyById.get(c.property_id)
      const latestForConversation = latest.get(c.id)
      return {
        conversationId: c.id,
        propertyId: c.property_id,
        propertyLabel: property ? directoryPropertyLabel(property) : 'Property',
        tenantName: lease?.tenant_name || acc?.tenant_email || 'Tenant',
        maintenanceRequestId: requestByConversation.get(c.id) || c.maintenance_request_id,
        latestMessagePreview: latestForConversation ? messagePreview(latestForConversation.message) : null,
        latestMessageAt: latestForConversation?.created_at ?? null,
        unread: isConversationUnread(latestForConversation?.created_at ?? null, lastReadByConversation.get(c.id) ?? null),
      }
    })
    .sort((a, b) => (b.latestMessageAt || '').localeCompare(a.latestMessageAt || ''))
}

export function summarizeUnreadInbox(rows: MessageInboxRow[]): number {
  return rows.filter((r) => r.unread).length
}
