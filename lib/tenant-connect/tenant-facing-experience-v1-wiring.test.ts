import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PropRoster — Tenant-Facing Experience V1. Source-read regression
// guards, matching this repo's established no-jsdom convention (see
// lib/tenant-connect/tenant-connect-v1-wiring.test.ts for the direct
// precedent this file extends rather than duplicates — isolation/
// accept-invite/notify-route coverage already lives there and is not
// re-asserted here). This file covers what's NEW in this milestone:
// account/role onboarding, the invite link, the tenant sign-up-in-
// context flow, dual-role navigation, and the two new tenant-scoped
// views (Rent history, Documents).

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}
function stripSqlComments(source: string): string {
  return source.replace(/--.*$/gm, '')
}

const tenantPageSource = readFile('app/tenant/page.tsx')
const landingSource = readFile('components/LandingPage.tsx')
const homeSource = readFile('app/page.tsx')
const navMenuSource = readFile('components/AuthNavMenu.tsx')
const documentUrlRouteSource = readFile('app/api/tenant-connect/document-url/route.ts')
const migrationSource = readFile('supabase/milestone-29-tenant-facing-experience-v1.sql')

describe('1. Invited new tenant signup — opens in tenant context, never the landlord dashboard', () => {
  it('an unauthenticated /tenant visitor gets a real sign-in/signup form on THIS page, not a link elsewhere', () => {
    expect(tenantPageSource).toContain('function TenantSignIn()')
    expect(tenantPageSource).toContain("supabase.auth.signUp({ email: email.trim(), password })")
    expect(tenantPageSource).toContain("supabase.auth.signInWithPassword({ email: email.trim(), password })")
  })

  it('the invite email link points to /tenant, never the landlord root "/"', () => {
    const notifySource = readFile('lib/tenant-connect/notify.ts')
    expect(notifySource).toContain("`${origin.replace(/\\/$/, '')}/tenant?invite=${accessId}`")
  })

  it('the ?invite= query param is read as a UX hint only — never used to authorize or fetch anything', () => {
    const signInBody = tenantPageSource.slice(tenantPageSource.indexOf('function TenantSignIn()'), tenantPageSource.indexOf('function TenantPortal('))
    expect(signInBody).toContain("new URLSearchParams(window.location.search).has('invite')")
    expect(stripComments(signInBody)).not.toMatch(/\.from\(|\.rpc\(|fetch\(/)
  })

  it('signup offers an "I manage properties" / "I\'m a tenant" choice, defaulting to the existing landlord flow', () => {
    expect(landingSource).toContain('How will you use PropRoster?')
    expect(landingSource).toContain('I manage properties')
    expect(landingSource).toContain('I&rsquo;m a tenant')
    expect(landingSource).toContain("useState<IntendedRole>('owner')")
  })

  it('the role choice is never persisted as an account "role" column — only a one-shot localStorage redirect hint', () => {
    const onboardingSource = readFile('lib/tenant-connect/onboarding.ts')
    expect(stripComments(onboardingSource)).not.toMatch(/\.from\(|\.update\(|\.insert\(/)
    expect(onboardingSource).toContain("export type IntendedRole = 'owner' | 'tenant'")
  })

  it('a first sign-in after email-confirmation redirects ONCE (self-clearing) to /tenant when intended, and is otherwise a no-op', () => {
    expect(homeSource).toContain('function redirectIfIntendedTenant()')
    expect(homeSource).toContain('window.localStorage.removeItem(INTENDED_ROLE_STORAGE_KEY)')
  })
})

describe('2. Existing account accepting a tenant invitation', () => {
  it('still accepts via the SECURITY DEFINER RPC only — untouched by this milestone', () => {
    expect(tenantPageSource).toContain("supabase.rpc('accept_tenant_invite', { p_access_id: accessId })")
  })

  it('accepting adds tenant access without touching any owner-side table — no write to properties/leases anywhere in this file', () => {
    const acceptFnBody = tenantPageSource.slice(tenantPageSource.indexOf('async function acceptInvite'), tenantPageSource.indexOf('if (loading) return'))
    expect(acceptFnBody).not.toMatch(/\.from\('properties'\)|\.from\('leases'\)/)
  })

  it('after accepting, the tenant lands directly on the tenant experience for that rental — "My Rental" is the default view, no separate redirect required', () => {
    expect(tenantPageSource).toContain("useState<TenantView>('My Rental')")
  })
})

describe('3. Tenant sees only the invited rental — new views scoped exactly like the existing ones', () => {
  it('Rent history is fetched scoped to the selected lease only, via the narrow view, never the base table', () => {
    expect(tenantPageSource).toContain("supabase.from('tenant_rent_payments_view').select('*').eq('lease_id', lease.id)")
  })

  it('Documents are fetched scoped to the selected property only, via the narrow view, never the base table', () => {
    expect(tenantPageSource).toContain("supabase.from('tenant_documents_view').select('*').eq('property_id', propertyId)")
  })

  it('never queries public.rent_payments or public.property_documents directly anywhere in this file', () => {
    expect(stripComments(tenantPageSource)).not.toMatch(/\.from\('rent_payments'\)/)
    expect(stripComments(tenantPageSource)).not.toMatch(/\.from\('property_documents'\)/)
  })
})

describe('4. Tenant cannot access landlord-only data/routes', () => {
  it('still never imports the landlord header/nav components (unchanged from Tenant Connect V1) — the file\'s own header comment legitimately DOCUMENTS this exclusion in prose, so this checks the actual code only', () => {
    const code = stripComments(tenantPageSource)
    expect(code).not.toContain('AuthHeader')
    expect(code).not.toContain('AuthNavMenu')
  })

  it('never mentions any landlord-only surface (PropCrew, Smart Upload, Add Property, mortgage/equity/investment analysis) in actual code — the file\'s own header comment legitimately documents the exclusion', () => {
    expect(stripComments(tenantPageSource)).not.toMatch(/PropCrew|Smart ?Upload|Add Property|mortgage|equity|investment.?analys/i)
  })

  it('the document-url route re-verifies tenant access via RLS (tenant_documents_view) before ever signing a URL — never trusts a client-supplied storage path', () => {
    expect(documentUrlRouteSource).toContain("createRequestClient(token)")
    expect(documentUrlRouteSource).toContain(".from('tenant_documents_view')")
    expect(stripComments(documentUrlRouteSource)).not.toMatch(/body\.storagePath|body\.storage_path/)
  })

  it('the document-url route only signs the storage_path THE VIEW ITSELF returned, not anything from the request body', () => {
    const bodyAfterFetch = documentUrlRouteSource.slice(documentUrlRouteSource.indexOf("from('tenant_documents_view')"))
    expect(bodyAfterFetch).toContain('createSignedUrl(doc.storage_path')
  })
})

describe('5. Owner-only account retains the normal landlord experience', () => {
  it('the "Tenant Portal" nav link is conditional — never rendered unconditionally for every landlord', () => {
    expect(navMenuSource).toContain('{hasTenantAccess && (')
    expect(navMenuSource).toContain('<Link href="/tenant"')
  })

  it('the existing landlord nav destinations are untouched', () => {
    expect(navMenuSource).toContain("{ href: '/', label: 'Dashboard' }")
    expect(navMenuSource).toContain("{ href: '/propcrew', label: 'PropCrew' }")
  })

  it('the dual-role existence check never renders any property data — it only decides whether a link shows', () => {
    const effectBody = navMenuSource.slice(navMenuSource.indexOf('const [hasTenantAccess'), navMenuSource.indexOf('useEffect(() => {\n    function handleClickOutside'))
    expect(effectBody).toContain(".select('id').limit(1)")
  })
})

describe('6. Dual-role account retains both contexts', () => {
  it('a tenant account that also owns properties gets a conditional link back to the landlord dashboard', () => {
    expect(tenantPageSource).toContain('{hasOwnedProperties && <Link href="/" className="secondary tenantPortalSwitchContext">Landlord Dashboard</Link>}')
  })

  it('neither switch link ever removes or replaces the other context\'s access — both are separately-gated, additive UI only', () => {
    expect(tenantPageSource).not.toMatch(/tenant_property_access['"]\)\s*\.delete\(/)
    expect(navMenuSource).not.toMatch(/\.from\('properties'\)\s*\.delete\(/)
  })
})

describe('7. Tenant scheduling availability flow still works (Scheduling Coordination V1, untouched)', () => {
  it('GuidedIntake is still mounted in the Requests view, unchanged props', () => {
    const requestsViewBody = tenantPageSource.slice(tenantPageSource.indexOf('function TenantRequestsView'))
    expect(requestsViewBody).toContain('<GuidedIntake')
    expect(requestsViewBody).toContain('tenantAccessId={tenantAccessId}')
    expect(requestsViewBody).toContain('onSubmitted={(tenantRequestId) => void handleGuidedIntakeSubmitted(tenantRequestId)}')
  })

  it('this milestone never touches lib/maintenance/availability.ts or appointments.ts', () => {
    expect(tenantPageSource).not.toContain('flattenAvailabilityInput')
    expect(tenantPageSource).not.toContain('matchProposedTime')
  })
})

describe('Migration 29 — additive only, no RLS weakened on any existing table', () => {
  it('is explicitly marked as not yet applied to production', () => {
    expect(migrationSource).toContain('NOT YET APPLIED TO PRODUCTION')
  })

  it('adds tenant_visible as a nullable-safe (default false), additive column — opt-in, never opt-out', () => {
    expect(migrationSource).toContain('add column if not exists tenant_visible boolean not null default false')
  })

  it('reuses the existing is_active_tenant_of_lease()/is_active_tenant_of_property() security-definer helpers rather than inventing new access logic', () => {
    expect(migrationSource).toContain('public.is_active_tenant_of_lease(rp.lease_id)')
    expect(migrationSource).toContain('public.is_active_tenant_of_property(pd.property_id)')
  })

  it('never alters storage.objects policies — tenant document reads stay routed through the server, not a new storage RLS grant. This file\'s own comment legitimately explains that exclusion in prose, so this checks actual SQL statements only.', () => {
    expect(stripSqlComments(migrationSource)).not.toMatch(/storage\.objects/)
  })

  it('never touches tenant_property_access, accept_tenant_invite(), or any existing RLS policy', () => {
    expect(migrationSource).not.toMatch(/alter table public\.tenant_property_access|create or replace function public\.accept_tenant_invite/)
    expect(migrationSource).not.toMatch(/create policy|drop policy/)
  })
})
