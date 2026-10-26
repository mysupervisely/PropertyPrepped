// PropRoster — Mobile V3: Notifications & Activity Center.
//
// Pure data-shaping only — no Supabase, no React, same convention as
// lib/tenant-connect/directory.ts and lib/tenant-connect/inbox.ts. Every
// row this module reads comes from public.notification_events, a table
// populated exclusively by SECURITY DEFINER triggers (see
// supabase/milestone-35-mobile-v3-notification-center.sql) — this module
// never invents an event, a label, or an unread flag; it only formats
// data that already exists, using the SAME category-label helper
// (lib/maintenance/categories.ts) every other maintenance surface uses.

import { maintenanceCategoryLabel } from '../maintenance/categories'
import { directoryPropertyLabel, type DirectoryProperty } from '../tenant-connect/directory'

export const NOTIFICATION_EVENT_TYPES = [
  'tenant_message',
  'tenant_maintenance_request',
  'maintenance_status_change',
  'propcrew_outreach_response',
  'tenant_invite_accepted',
] as const
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number]

export type NotificationEventRow = {
  id: string
  event_type: NotificationEventType
  property_id: string | null
  conversation_id: string | null
  maintenance_request_id: string | null
  tenant_access_id: string | null
  outreach_id: string | null
  metadata: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export type NotificationContext = {
  properties: DirectoryProperty[]
  // tenant_name is already copied onto every maintenance_requests row by
  // tenant_requests_create_maintenance_case() — the simplest, already-
  // correct source for "whose case is this," no extra join needed.
  maintenanceRequests: { id: string; tenant_name: string }[]
  conversations: { id: string; tenant_access_id: string }[]
  access: { id: string; tenant_email: string; lease_id: string | null }[]
  leases: { id: string; tenant_name: string }[]
  outreach: { id: string; contact_id: string }[]
  contacts: { id: string; name: string }[]
}

export type NotificationFeedItem = {
  id: string
  type: NotificationEventType
  title: string
  propertyLabel: string | null
  unread: boolean
  createdAt: string
  /** Where tapping this notification should go — always an existing page, never a new one this module renders itself. */
  navHref: string
}

function tenantNameForAccess(ctx: NotificationContext, accessId: string | null): string {
  if (!accessId) return 'Tenant'
  const access = ctx.access.find((a) => a.id === accessId)
  if (!access) return 'Tenant'
  const lease = access.lease_id ? ctx.leases.find((l) => l.id === access.lease_id) : undefined
  return lease?.tenant_name || access.tenant_email
}

function tenantNameForConversation(ctx: NotificationContext, conversationId: string | null): string {
  if (!conversationId) return 'Tenant'
  const conversation = ctx.conversations.find((c) => c.id === conversationId)
  return tenantNameForAccess(ctx, conversation?.tenant_access_id ?? null)
}

function propertyLabel(ctx: NotificationContext, propertyId: string | null): string | null {
  if (!propertyId) return null
  const property = ctx.properties.find((p) => p.id === propertyId)
  return property ? directoryPropertyLabel(property) : null
}

/** A short, human label for one event — the only place this app decides how to phrase a notification. */
export function titleForEvent(row: NotificationEventRow, ctx: NotificationContext): string {
  switch (row.event_type) {
    case 'tenant_message':
      return `New message from ${tenantNameForConversation(ctx, row.conversation_id)}`
    case 'tenant_maintenance_request': {
      const category = typeof row.metadata.category === 'string' ? maintenanceCategoryLabel(row.metadata.category) : 'maintenance'
      return `New ${category} request from ${tenantNameForConversation(ctx, row.conversation_id)}`
    }
    case 'maintenance_status_change': {
      const tenantCase = ctx.maintenanceRequests.find((m) => m.id === row.maintenance_request_id)
      const status = typeof row.metadata.status === 'string' ? row.metadata.status : 'updated'
      return tenantCase ? `${tenantCase.tenant_name}'s case moved to ${status}` : `A maintenance case moved to ${status}`
    }
    case 'propcrew_outreach_response': {
      const outreach = ctx.outreach.find((o) => o.id === row.outreach_id)
      const contact = outreach ? ctx.contacts.find((c) => c.id === outreach.contact_id) : undefined
      const status = typeof row.metadata.status === 'string' ? row.metadata.status : 'responded'
      return contact ? `${contact.name} ${status} your request` : `A PropCrew contact ${status} your request`
    }
    case 'tenant_invite_accepted':
      return `${tenantNameForAccess(ctx, row.tenant_access_id)} accepted your invitation`
  }
}

// Reuses the existing deep-link mechanisms verbatim — never a new route.
// Message/request events go to the portfolio Tenant Connect inbox
// (app/tenant-connect/page.tsx, V2.2) rather than re-rendering a thread
// here. Status/outreach events go to the portfolio Maintenance page
// (app/maintenance/page.tsx) rather than re-deriving case data here.
// Invite-accepted goes to Tenant Connect's own Tenants tab via the same
// ?tab= param that page now reads on mount.
export function navHrefForEvent(row: NotificationEventRow): string {
  switch (row.event_type) {
    case 'tenant_message':
    case 'tenant_maintenance_request':
      return '/tenant-connect'
    case 'maintenance_status_change':
    case 'propcrew_outreach_response':
      return '/maintenance'
    case 'tenant_invite_accepted':
      return '/tenant-connect?tab=tenants'
  }
}

export function buildNotificationFeed(rows: NotificationEventRow[], ctx: NotificationContext): NotificationFeedItem[] {
  return [...rows]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((row) => ({
      id: row.id,
      type: row.event_type,
      title: titleForEvent(row, ctx),
      propertyLabel: propertyLabel(ctx, row.property_id),
      unread: row.read_at === null,
      createdAt: row.created_at,
      navHref: navHrefForEvent(row),
    }))
}

export function unreadCount(rows: Pick<NotificationEventRow, 'read_at'>[]): number {
  return rows.filter((r) => r.read_at === null).length
}
