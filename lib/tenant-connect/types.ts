// PropRoster Milestone 10: Tenant Connect — shared vocabulary.
//
// Mirrors the CHECK constraints in supabase/milestone-10-tenant-connect.sql
// exactly. Nothing in this file talks to Supabase or React — it's the
// vocabulary every other Tenant Connect module (helpers, the owner-side
// panel) shares, so the status/type lists only exist once, matching the
// pattern already established in lib/document-intelligence/types.ts.

export const TENANT_ACCESS_STATUSES = ['Invited', 'Active', 'Revoked'] as const
export type TenantAccessStatus = (typeof TENANT_ACCESS_STATUSES)[number]

export const CONVERSATION_TYPES = ['General', 'Maintenance', 'Lease', 'Question', 'Other'] as const
export type ConversationType = (typeof CONVERSATION_TYPES)[number]

export const CONVERSATION_STATUSES = ['Open', 'Closed'] as const
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number]

export const SENDER_ROLES = ['Owner', 'Tenant'] as const
export type SenderRole = (typeof SENDER_ROLES)[number]

export type TenantPropertyAccess = {
  id: string
  property_id: string
  owner_id: string
  tenant_user_id: string | null
  tenant_email: string
  lease_id: string | null
  status: TenantAccessStatus
  invited_at: string
  accepted_at: string | null
  revoked_at: string | null
  created_at: string
}

export type PropertyConversation = {
  id: string
  property_id: string
  owner_id: string
  tenant_access_id: string
  maintenance_request_id: string | null
  subject: string
  conversation_type: ConversationType
  status: ConversationStatus
  created_at: string
  updated_at: string
}

export type PropertyMessage = {
  id: string
  conversation_id: string
  sender_user_id: string
  sender_role: SenderRole
  message: string
  created_at: string
}

export type PropertyMessageAttachment = {
  id: string
  message_id: string
  storage_path: string
  mime_type: string | null
  size_bytes: number
  created_at: string
}

// Tenant Connect V1 (Milestone 24) — mirrors
// supabase/milestone-24-tenant-connect-v1.sql's CHECK constraints
// exactly, same convention as everything above.
export const TENANT_REQUEST_CATEGORIES = ['Plumbing', 'Electrical', 'HVAC', 'Appliance', 'General Maintenance', 'Other'] as const
export type TenantRequestCategory = (typeof TENANT_REQUEST_CATEGORIES)[number]

export const TENANT_REQUEST_STATUSES = ['New', 'In Progress', 'Resolved'] as const
export type TenantRequestStatus = (typeof TENANT_REQUEST_STATUSES)[number]

export type TenantRequest = {
  id: string
  property_id: string
  owner_id: string
  tenant_access_id: string
  conversation_id: string
  category: TenantRequestCategory
  title: string
  description: string
  status: TenantRequestStatus
  created_at: string
  updated_at: string
}
