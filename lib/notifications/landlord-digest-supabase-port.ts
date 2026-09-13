// PropRoster — Landlord Digest V1: the real Supabase-backed
// implementation of LandlordDigestDataPort (lib/notifications/
// landlord-digest-run.ts).
//
// OWNER ISOLATION CONTRACT: this file is the ONLY place in the digest
// feature that talks to Supabase. It is given the service-role admin
// client (lib/supabase-server.ts's createAdminClient() — the same
// "no user session exists by construction" exception the Stripe
// webhook already uses, and the ONLY other place in this codebase that
// touches the service-role key), which bypasses RLS entirely. Because
// nothing here can rely on RLS to keep one landlord's data away from
// another, EVERY query below is explicitly filtered with
// `.eq('owner_id', ownerId)` — every table this reads (properties,
// leases, mortgages, insurance_policies, maintenance_records,
// property_systems, rent_payments, tenant_requests, user_subscriptions,
// notification_preferences) already carries its own owner_id column
// (see supabase/schema.sql), so this is a direct, single-condition
// filter on every call, never a join that could be gotten subtly
// wrong. landlord-digest-supabase-port.test.ts asserts the exact
// `.eq('owner_id', ...)` call on every method.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { LandlordDigestDataPort, OwnerPreferenceRow, OwnerPortfolioRows } from './landlord-digest-run'

export function createLandlordDigestSupabasePort(admin: SupabaseClient): LandlordDigestDataPort {
  return {
    async listOwnerPreferences(): Promise<OwnerPreferenceRow[]> {
      // The one query with no owner_id filter by design — this table
      // IS the list of owners, not owner-scoped data about one of them.
      const { data } = await admin
        .from('notification_preferences')
        .select('owner_id, weekly_digest_enabled, last_weekly_digest_sent_at')
      return (data || []).map((row) => ({
        ownerId: row.owner_id as string,
        weeklyDigestEnabled: Boolean(row.weekly_digest_enabled),
        lastWeeklyDigestSentAt: (row.last_weekly_digest_sent_at as string | null) ?? null,
      }))
    },

    async getSubscriptionRow(ownerId) {
      const { data } = await admin
        .from('user_subscriptions')
        .select('plan, status')
        .eq('owner_id', ownerId)
        .maybeSingle()
      return data ? { plan: data.plan as string | null, status: data.status as string | null } : null
    },

    async getOwnerEmail(ownerId) {
      // The canonical Supabase Auth email source (Section "Email
      // Address Source": "do not create a duplicate email field") —
      // auth.users isn't exposed through the regular PostgREST schema,
      // so the Admin API is the correct, documented way to read it
      // server-side. A missing/errored lookup returns null rather than
      // throwing — the caller (landlord-digest-run.ts) treats that as
      // "skip this owner safely," never a run-aborting failure.
      const { data, error } = await admin.auth.admin.getUserById(ownerId)
      if (error || !data?.user?.email) return null
      return data.user.email
    },

    async getPortfolioRows(ownerId): Promise<OwnerPortfolioRows> {
      const [
        { data: properties }, { data: leases }, { data: insurancePolicies }, { data: mortgages },
        { data: maintenanceRecords }, { data: rentPayments }, { data: propertySystems }, { data: tenantRequests },
      ] = await Promise.all([
        admin.from('properties').select('id, address, property_type').eq('owner_id', ownerId),
        admin.from('leases').select('id, property_id, tenant_name, monthly_rent, rent_due_day, start_date, end_date').eq('owner_id', ownerId),
        admin.from('insurance_policies').select('id, property_id, carrier, expiration_date').eq('owner_id', ownerId),
        admin.from('mortgages').select('id, property_id, lender, maturity_date').eq('owner_id', ownerId),
        admin.from('maintenance_records').select('id, property_id, description, category, vendor, status, service_date').eq('owner_id', ownerId),
        admin.from('rent_payments').select('lease_id, rent_period, amount').eq('owner_id', ownerId),
        admin.from('property_systems').select('id, property_id, system_type, name, warranty_expiration').eq('owner_id', ownerId),
        admin.from('tenant_requests').select('id, property_id, title, status, created_at').eq('owner_id', ownerId),
      ])

      return {
        properties: (properties || []) as OwnerPortfolioRows['properties'],
        leases: (leases || []) as OwnerPortfolioRows['leases'],
        insurancePolicies: (insurancePolicies || []) as OwnerPortfolioRows['insurancePolicies'],
        mortgages: (mortgages || []) as OwnerPortfolioRows['mortgages'],
        maintenanceRecords: (maintenanceRecords || []) as OwnerPortfolioRows['maintenanceRecords'],
        rentPayments: (rentPayments || []) as OwnerPortfolioRows['rentPayments'],
        propertySystems: (propertySystems || []) as OwnerPortfolioRows['propertySystems'],
        tenantRequests: (tenantRequests || []) as OwnerPortfolioRows['tenantRequests'],
      }
    },

    async markDigestSent(ownerId, sentAtIso) {
      const { error } = await admin
        .from('notification_preferences')
        .update({ last_weekly_digest_sent_at: sentAtIso, updated_at: sentAtIso })
        .eq('owner_id', ownerId)
      return !error
    },
  }
}
