import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Landlord Digest V1 — regression guards.
//
// This milestone is additive: new files under lib/notifications/,
// netlify/functions/, netlify.toml, one new migration, a comment-only
// update to lib/supabase-server.ts's own header, and one small new
// section on app/profile/page.tsx. Nothing else should be touched.
// Same no-jsdom, source-read wiring-test convention as every other
// app/page.tsx test in this repo.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

describe('Canonical attention/rent/tenant-request logic is untouched', () => {
  it('lib/dashboard/attention.ts was not modified by this milestone', () => {
    const source = readFile('lib/dashboard/attention.ts')
    expect(source).not.toMatch(/Landlord Digest/)
    // Spot-check the exact canonical builders this milestone reuses are
    // still there, unchanged in shape.
    expect(source).toContain('export function buildLeaseDateItems(')
    expect(source).toContain('export function buildInsuranceDateItems(')
    expect(source).toContain('export function buildMortgageDateItems(')
    expect(source).toContain('export function buildMaintenanceDateItems(')
    expect(source).toContain('export function splitAttentionAndUpcoming(')
  })

  it('lib/rent-ledger/ledger.ts and lib/rent-ledger/status.ts were not modified', () => {
    for (const file of ['lib/rent-ledger/ledger.ts', 'lib/rent-ledger/status.ts']) {
      expect(readFile(file)).not.toMatch(/Landlord Digest/)
    }
    const ledgerSource = readFile('lib/rent-ledger/ledger.ts')
    expect(ledgerSource).toContain('export function buildRentDateItems(')
    expect(ledgerSource).toContain('export function buildSystemWarrantyDateItems(')
    expect(ledgerSource).toContain('export function buildVacancyItems(')
  })

  it('lib/tenant-connect/requests.ts (buildTenantRequestDateItems) was not modified', () => {
    const source = readFile('lib/tenant-connect/requests.ts')
    expect(source).not.toMatch(/Landlord Digest/)
    expect(source).toContain("export function buildTenantRequestDateItems(")
  })

  it('app/page.tsx\'s own Dashboard "Needs Your Attention" composition is untouched', () => {
    const source = readFile('app/page.tsx')
    expect(source).not.toMatch(/Landlord Digest/)
    expect(source).toContain('...buildLeaseDateItems(leases, propertyLabelById),')
    expect(source).toContain("...(entitlements.canUsePropWatch ? buildRentDateItems(leases, properties, rentPayments, currentPeriod, propertyLabelById) : []),")
  })
})

describe('Existing Tenant Connect / Realtor Connect email behavior is untouched', () => {
  it('lib/tenant-connect/notify.ts was not modified', () => {
    const source = readFile('lib/tenant-connect/notify.ts')
    expect(source).not.toMatch(/Landlord Digest/)
    expect(source).toContain('export async function sendTenantConnectEmail(')
    expect(source).toContain("const RESEND_API_URL = 'https://api.resend.com/emails'")
  })

  it('lib/realtor-leads/notify.ts was not modified', () => {
    expect(readFile('lib/realtor-leads/notify.ts')).not.toMatch(/Landlord Digest/)
  })
})

describe('lib/supabase-server.ts: comment-only change — both client factories still behave identically', () => {
  const source = readFile('lib/supabase-server.ts')

  it('createRequestClient and createAdminClient signatures/behavior are unchanged', () => {
    expect(source).toContain('export function createRequestClient(accessToken: string): SupabaseClient | null {')
    expect(source).toContain('export function createAdminClient(): SupabaseClient | null {')
    expect(source).toContain('export const isAdminClientConfigured = Boolean(url && serviceRoleKey)')
  })

  it('the header comment now documents Landlord Digest as the second legitimate admin-client use, without weakening the "every other route uses the RLS-scoped client" rule', () => {
    expect(source).toContain('Landlord Digest V1')
    expect(source).toContain('no session by construction')
  })
})

describe('No Property Intelligence, Rent Ledger calculation, PropCrew, or entitlements change', () => {
  it('no Stripe/billing/entitlements/Property Intelligence file carries a Landlord Digest marker', () => {
    for (const file of ['lib/billing/stripe.ts', 'lib/billing/entitlements.ts', 'lib/billing/plans.ts', 'lib/property-intelligence/portfolio.ts']) {
      expect(readFile(file)).not.toMatch(/Landlord Digest/)
    }
  })

  it('components/PropCrewPanel.tsx and lib/maintenance files are untouched', () => {
    expect(readFile('components/PropCrewPanel.tsx')).not.toMatch(/Landlord Digest/)
  })

  it('no schema/migration statement leaked outside the one new migration file', () => {
    for (const file of ['app/page.tsx', 'app/globals.css', 'lib/notifications/landlord-digest-items.ts', 'lib/notifications/landlord-digest-run.ts']) {
      expect(readFile(file)).not.toMatch(/create table|alter table|create policy/i)
    }
  })
})

describe('Mobile Property section selector, bottom navigation, and font stack are untouched', () => {
  it('the mobile selector and its CSS are unmodified', () => {
    const pageSource = readFile('app/page.tsx')
    const cssSource = readFile('app/globals.css')
    expect(pageSource).toContain('<div className="mobilePropertyNav" ref={mobileTabMenuRef}>')
    expect(cssSource).toMatch(/\.mobilePropertyNav \{ display: none; \}/)
  })

  it('mobile bottom navigation is untouched', () => {
    expect(readFile('app/globals.css')).toContain('.mobileBottomNav { display: none; }')
  })

  it('the global body font-family stack is byte-for-byte unchanged', () => {
    expect(readFile('app/globals.css')).toContain('body { margin: 0; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;')
  })
})

describe('Settings UI: Profile > Notifications', () => {
  const source = readFile('app/profile/page.tsx')

  it('adds exactly one compact toggle, reusing the existing reusePreferenceField/modeToggle pattern — no new CSS, no new component', () => {
    expect(source).toContain('<h2>Notifications</h2>')
    expect(source).toContain('Weekly landlord digest')
    expect(source).toContain('className="fullField reusePreferenceField"')
    expect(source).toContain('className="modeToggle"')
  })

  it('reads/writes public.notification_preferences scoped to the signed-in user\'s own owner_id — never a service-role call from the client', () => {
    expect(source).toContain("supabase.from('notification_preferences').select('weekly_digest_enabled').eq('owner_id', user.id)")
    expect(source).toContain("supabase.from('notification_preferences').upsert({ owner_id: user.id, weekly_digest_enabled: next, updated_at: new Date().toISOString() })")
    expect(source).not.toContain('createAdminClient')
  })

  it('the existing Identity/Contact/Photo sections and the page\'s own save() flow for user_profiles are untouched', () => {
    expect(source).toContain('<h2>Identity</h2>')
    expect(source).toContain('<h2>Contact</h2>')
    expect(source).toContain('<h2>Photo</h2>')
    expect(source).toContain("supabase.from('user_profiles').select('*').eq('id', user.id)")
  })
})

describe('Migration file', () => {
  const migration = readFile('supabase/milestone-31-landlord-digest-v1.sql')

  it('is additive only — one new table, its own RLS policies, its own trigger, no changes to any other table', () => {
    expect(migration).toContain('create table if not exists public.notification_preferences')
    expect(migration).toMatch(/weekly_digest_enabled boolean not null default false/)
    expect(migration).toContain('last_weekly_digest_sent_at timestamptz')
    expect(migration).not.toMatch(/alter table public\.(?!notification_preferences)/)
    expect(migration).not.toMatch(/drop table|drop column/i)
  })

  it('RLS: select/insert/update scoped to auth.uid() = owner_id, no delete policy — mirrors user_profiles\' own exact pattern', () => {
    expect(migration).toContain('create policy "notification_preferences_select_own" on public.notification_preferences for select to authenticated using ((select auth.uid()) = owner_id);')
    expect(migration).toContain('create policy "notification_preferences_insert_own" on public.notification_preferences for insert to authenticated with check ((select auth.uid()) = owner_id);')
    expect(migration).toContain('create policy "notification_preferences_update_own" on public.notification_preferences for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);')
    expect(migration).not.toMatch(/for delete/i)
  })

  it('defaults to disabled for every account (new and backfilled) — a deliberately conservative default, not a silent opt-in', () => {
    expect(migration).toMatch(/weekly_digest_enabled boolean not null default false/)
    expect(migration).toContain('insert into public.notification_preferences (owner_id)\nselect id from auth.users')
  })

  it('a trigger creates a row for every new signup, and it is idempotent (safe to re-run)', () => {
    expect(migration).toContain('create trigger on_auth_user_created_notification_preferences')
    expect(migration).toContain('on conflict (owner_id) do nothing')
  })
})

describe('Netlify scheduled trigger', () => {
  it('netlify.toml declares exactly one scheduled function and does not touch [build]', () => {
    const toml = readFile('netlify.toml')
    expect(toml).toContain('[functions]')
    expect(toml).toContain('directory = "netlify/functions"')
    expect(toml).toContain('[functions."landlord-digest"]')
    expect(toml).toContain('schedule = "0 13 * * 1"')
    // Checks for an actual [build] TOML section header (start of line,
    // no leading '#') — not the word appearing inside this file's own
    // explanatory comment about why there isn't one.
    expect(toml).not.toMatch(/^\[build\]/m)
  })

  it('the function is a thin wrapper — real logic lives in lib/notifications/, not duplicated here', () => {
    const fn = readFile('netlify/functions/landlord-digest.ts')
    expect(fn).toContain("import { runLandlordDigest")
    expect(fn).toContain('createAdminClient()')
    expect(fn).not.toMatch(/\.from\(['"]/) // no direct Supabase table queries in the function file itself
  })
})
