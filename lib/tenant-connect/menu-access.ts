import type { SupabaseClient } from '@supabase/supabase-js'

// Owners can read invitations they sent under RLS. Those rows do not
// mean the owner is a tenant, so match the current identity explicitly.
export async function hasPersonalTenantAccess(client: SupabaseClient, user: { id: string; email?: string }): Promise<boolean> {
  const active = client.from('tenant_property_access').select('id').eq('tenant_user_id', user.id).eq('status', 'Active').limit(1)
  const email = user.email?.trim().toLowerCase()
  const invited = email ? client.from('tenant_property_access').select('id').eq('tenant_email', email).eq('status', 'Invited').limit(1) : Promise.resolve({ data: null })
  const results = await Promise.all([active, invited])
  return results.some(({ data }) => Boolean(data?.length))
}
