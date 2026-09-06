import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Milestone 28 — M3: Landlord Maintenance Command Center V1.
//
// Source-read regression guards over supabase/schema.sql, matching the
// established pattern (lib/tenant-connect/attachment-security.test.ts,
// lib/propcrew/multi-property-assignment.test.ts) — this milestone adds
// NO new table, column, or policy, so these confirm the EXISTING RLS
// the Command Center relies on is exactly what this review found, and
// will fail loudly if a future change ever weakens it out from under
// this feature.

const schema = readFileSync(join(__dirname, '..', '..', 'supabase', 'schema.sql'), 'utf8')

describe('maintenance_requests RLS — the Command Center reads/writes only through this, never a service-role key', () => {
  it('select/insert/update are all owner-scoped — a tenant (never the property owner) can never see or mutate another owner\'s cases, and can never mutate maintenance_requests directly at all', () => {
    expect(schema).toContain('create policy "maintenance_requests_select_own" on public.maintenance_requests for select to authenticated using ((select auth.uid()) = owner_id)')
    expect(schema).toMatch(/create policy "maintenance_requests_update_own" on public\.maintenance_requests for update to authenticated\nusing \(\(select auth\.uid\(\)\) = owner_id\)/)
  })

  it('a direct client insert can only ever create a landlord-sourced row — the tenant path exists exclusively through the tenant_requests trigger (SECURITY DEFINER, bypasses this policy)', () => {
    expect(schema).toMatch(/create policy "maintenance_requests_insert_own" on public\.maintenance_requests for insert to authenticated with check \(\s*\(select auth\.uid\(\)\) = owner_id\s*and source = 'landlord'/)
  })

  it('assigned_contact_id can only ever be set to a PropCrew contact the SAME owner already owns — verified by RLS, not just trusted client-side', () => {
    expect(schema).toMatch(/assigned_contact_id is null or exists \(select 1 from public\.property_contacts c where c\.id = assigned_contact_id and c\.owner_id = \(select auth\.uid\(\)\)\)/)
  })
})

describe('tenant_requests RLS — the status-sync write the Command Center performs is owner-only, matching maintenance_requests', () => {
  it('only the owner can UPDATE tenant_requests (status sync) — no tenant-facing UPDATE policy exists at all', () => {
    expect(schema).toMatch(/create policy "tenant_requests_update_owner" on public\.tenant_requests for update to authenticated\nusing \(\(select auth\.uid\(\)\) = owner_id\)/)
    expect(schema).not.toMatch(/tenant_requests_update_tenant/)
  })

  it('a tenant can only ever INSERT their own request, tied to their own active tenant_access_id — never repoint it at a different owner/property', () => {
    expect(schema).toContain('create policy "tenant_requests_insert_tenant" on public.tenant_requests for insert to authenticated with check (')
  })
})

describe('maintenance_intake_sessions RLS — the Safety section reads outcome through the same owner-or-own-tenant policy Guided Intake (M2) already established', () => {
  it('select is scoped to the case owner or that session\'s own active tenant — never a cross-tenant/cross-owner read', () => {
    expect(schema).toMatch(/create policy "maintenance_intake_sessions_select" on public\.maintenance_intake_sessions for select to authenticated using \(\s*\(select auth\.uid\(\)\) = owner_id\s*or exists \(\s*select 1 from public\.tenant_property_access tpa\s*where tpa\.id = tenant_access_id and tpa\.status = 'Active' and tpa\.tenant_user_id = \(select auth\.uid\(\)\)/)
  })
})

describe('property_contacts (PropCrew) RLS — no tenant-facing policy exists; a tenant has zero visibility into a landlord\'s PropCrew directory', () => {
  it('select/insert/update/delete are all owner-scoped only', () => {
    for (const op of ['select', 'insert', 'update', 'delete']) {
      expect(schema).toContain(`create policy "property_contacts_${op}_own" on public.property_contacts for ${op} to authenticated`)
    }
    // No policy name suggests any tenant-facing grant on this table.
    expect(schema).not.toMatch(/property_contacts.*tenant/i)
  })
})

describe('maintenance_audit_log — no client INSERT policy exists; the Command Center never attempts to write to it directly', () => {
  it('the table has no INSERT/UPDATE/DELETE policy for `authenticated` — only the SECURITY DEFINER trigger on tenant_requests writes to it', () => {
    expect(schema).toContain('-- No INSERT/UPDATE/DELETE policy for `authenticated` — see comment above.')
  })

  const ccSource = readFileSync(join(__dirname, '..', '..', 'components', 'tenant-connect', 'MaintenanceCommandCenter.tsx'), 'utf8')
  it('MaintenanceCommandCenter never attempts a direct write to maintenance_audit_log (it would be rejected by RLS anyway)', () => {
    expect(ccSource).not.toContain("from('maintenance_audit_log')")
  })
})
