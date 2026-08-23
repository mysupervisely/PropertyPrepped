import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Tenant Connect Onboarding V2 — regression guards for the first-time
// tenant journey (invite -> email -> click -> sign in/create account ->
// invitation recognized -> tenant connected -> tenant portal). Same
// source-read technique as tenant-connect-v1-wiring.test.ts (no jsdom/
// React Testing Library in this repo) — the email-content assertions
// live in lib/tenant-connect/notify.test.ts; this file covers the
// app/tenant/page.tsx side of the journey.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const tenantPageSource = readFile('app/tenant/page.tsx')
const statusCardSource = readFile('components/tenant-connect/TenantConnectStatusCard.tsx')
const helpersSource = readFile('lib/tenant-connect/helpers.ts')

describe('Unauthenticated path lands on a tenant-scoped sign-in gate, never the landlord LandingPage', () => {
  it('TenantPortalPage renders <TenantAuthGate> instead of a link out to "/"', () => {
    expect(tenantPageSource).toContain('if (!user) return <TenantAuthGate hasInvite={Boolean(inviteId)} />')
    expect(tenantPageSource).not.toMatch(/href="\/"\s*>\s*Go to sign in/)
  })

  it('TenantAuthGate performs real Supabase auth (signInWithPassword/signUp) — no new auth provider/logic', () => {
    const idx = tenantPageSource.indexOf('function TenantAuthGate')
    const slice = tenantPageSource.slice(idx, tenantPageSource.indexOf('function TenantPortal('))
    expect(slice).toContain('supabase.auth.signInWithPassword({ email: email.trim(), password })')
    expect(slice).toContain('supabase.auth.signUp({ email: email.trim(), password })')
  })

  it('never imports or renders the landlord LandingPage/marketing content', () => {
    expect(tenantPageSource).not.toMatch(/from ['"].*LandingPage['"]/)
    expect(tenantPageSource).not.toMatch(/<LandingPage/)
    expect(tenantPageSource).not.toContain('landingHero')
    expect(tenantPageSource).not.toContain('VALUE_PROPS')
  })

  it('makes clear the tenant must use the invited email, without being a multi-step wizard', () => {
    const idx = tenantPageSource.indexOf('function TenantAuthGate')
    const slice = tenantPageSource.slice(idx, tenantPageSource.indexOf('function TenantPortal('))
    expect(slice).toContain('the email address that received your invitation')
    // Exactly one form (email + password), not a multi-screen sequence.
    expect((slice.match(/<label>/g) || []).length).toBe(2)
  })

  it('never exposes landlord-only navigation (AuthHeader/AuthNavMenu) on the sign-in gate', () => {
    expect(tenantPageSource).not.toMatch(/from ['"].*components\/Auth(Header|NavMenu)['"]/)
  })
})

describe('Invitation id is read from the URL the same way every other page in this app reads query params', () => {
  it('uses window.location.search + URLSearchParams (no useSearchParams hook, no Suspense boundary needed)', () => {
    expect(tenantPageSource).toContain("new URLSearchParams(window.location.search).get('invite')")
    expect(tenantPageSource).not.toMatch(/\buseSearchParams\(/)
    expect(tenantPageSource).not.toMatch(/from ['"]next\/navigation['"]/)
  })

  it('guards against server-side execution the same way app/page.tsx\'s own query-param reads do', () => {
    const idx = tenantPageSource.indexOf("get('invite')")
    const nearby = tenantPageSource.slice(Math.max(0, idx - 300), idx)
    expect(nearby).toContain("typeof window === 'undefined'")
  })
})

describe('Correct authenticated account: the invitation id is recognized via existing RLS-scoped state, no new query', () => {
  it('TenantPortal receives inviteId as a prop and never issues an id-specific query for it', () => {
    expect(tenantPageSource).toContain('function TenantPortal({ userId, inviteId }: { userId: string; inviteId: string | null })')
    // The only query .eq('id', ...) related to access rows is unrelated to inviteId
    // — matching happens against the already-loaded `access` array (RLS-scoped),
    // never a new .eq('id', inviteId) round-trip.
    expect(tenantPageSource).not.toMatch(/tenant_property_access['"]\)[^;]*\.eq\('id',\s*inviteId\)/)
  })

  it('still loads access the exact same way as before (no new table, no new column)', () => {
    expect(tenantPageSource).toContain("supabase.from('tenant_property_access').select('*').order('created_at', { ascending: false })")
  })
})

describe('Wrong authenticated account cannot gain access and sees a clear, safe denial state', () => {
  const wrongInviteIdx = tenantPageSource.indexOf('const wrongInvite =')
  const wrongInviteSlice = tenantPageSource.slice(wrongInviteIdx, tenantPageSource.indexOf('// Section 6/7'))

  it('wrongInvite is computed purely from already-RLS-scoped client state — never a new/bypassing query', () => {
    expect(wrongInviteSlice).toContain('Boolean(inviteId) && !access.some((a) => a.id === inviteId)')
  })

  it('renders a clear message and offers Sign out (a safe way to switch account) — never a blank/confusing page', () => {
    expect(wrongInviteSlice).toContain("isn&rsquo;t available for this account")
    expect(wrongInviteSlice).toContain('supabase?.auth.signOut()')
    expect(wrongInviteSlice).toContain('Sign out')
  })

  it('the denial message is deliberately generic — it does not disclose whether the invitation exists, was revoked, or belongs to someone else (matches accept_tenant_invite()\'s own zero-disclosure design)', () => {
    // No branching logic that would require distinguishing "wrong email"
    // vs "revoked" vs "already accepted by someone else" vs "never
    // existed" — all four collapse to the same wrongInvite condition and
    // the same rendered message.
    expect(wrongInviteSlice).not.toMatch(/revoked|expired|already accepted/i)
  })

  it('cannot itself grant access — the CTA never calls accept_tenant_invite or writes to tenant_property_access', () => {
    expect(wrongInviteSlice).not.toContain('accept_tenant_invite')
    expect(wrongInviteSlice).not.toMatch(/tenant_property_access['"]\)\s*\.(update|insert)\(/)
  })
})

describe('Already-connected (Active) state and the one-time "you\'re connected" welcome', () => {
  it('an Active row never appears in pendingRows — the accept-invitation banner only ever shows Invited rows, so an already-connected tenant is never asked to accept again', () => {
    expect(tenantPageSource).toContain("const pendingRows = access.filter((a) => a.status === 'Invited')")
  })

  it('acceptInvite() explicitly selects the newly accepted property, then shows a one-time welcome — not a wizard', () => {
    const idx = tenantPageSource.indexOf('async function acceptInvite')
    const slice = tenantPageSource.slice(idx, tenantPageSource.indexOf('if (loading)'))
    expect(slice).toContain('setSelectedAccessId(accessId)')
    expect(slice).toContain('setJustAcceptedId(accessId)')
  })

  it('the welcome card shows the property address and a single "View Tenant Portal" continue action, reusing already-fetched state (no extra query)', () => {
    const idx = tenantPageSource.indexOf('tenantPortalWelcome')
    const slice = tenantPageSource.slice(idx, idx + 600)
    expect(slice).toContain("YOU&rsquo;RE CONNECTED")
    expect(slice).toContain('{property?.address')
    expect(slice).toContain('View Tenant Portal')
    expect(slice).toContain('setJustAcceptedId(null)')
  })
})

describe('Tenant lands on /tenant, never a landlord dashboard, and sees the required at-a-glance context', () => {
  it('the connected portal shows property address, lease dates, monthly rent, rent due day, and Requests', () => {
    expect(tenantPageSource).toContain('<h1>{property?.address')
    expect(tenantPageSource).toContain('Lease start')
    expect(tenantPageSource).toContain('Lease end')
    expect(tenantPageSource).toContain('Monthly rent')
    expect(tenantPageSource).toContain('Rent due day')
    expect(tenantPageSource).toContain("(['Requests', 'Lease'] as const)")
  })

  it('never queries any landlord-only table (unchanged from Milestone 24)', () => {
    for (const table of ['mortgages', 'insurance_policies', 'financial_transactions', 'property_tax_records', 'property_documents', 'property_contacts', 'investment_analyses']) {
      expect(tenantPageSource).not.toContain(`from('${table}')`)
    }
  })

  it('still reads property/lease exclusively through the restricted tenant views (Milestone 24 Round 6 fix, untouched)', () => {
    expect(tenantPageSource).toContain("from('tenant_property_view')")
    expect(tenantPageSource).toContain("from('tenant_lease_view')")
    expect(tenantPageSource).not.toMatch(/\.from\(['"]properties['"]\)/)
    expect(tenantPageSource).not.toMatch(/\.from\(['"]leases['"]\)/)
  })

  it('still accepts an invite exclusively via the SECURITY DEFINER RPC, never a direct client UPDATE', () => {
    expect(tenantPageSource).toContain("supabase.rpc('accept_tenant_invite'")
    expect(tenantPageSource).not.toMatch(/tenant_property_access['"]\)\s*\.update\(/)
  })
})

describe('Landlord-side status reflects acceptance correctly, without a duplicate status field', () => {
  it('TenantConnectStatusCard derives status live from tenant_property_access.status via the existing shared helper — no new/parallel status column or field', () => {
    expect(statusCardSource).toContain("from('tenant_property_access').select('*').eq('property_id', propertyId)")
    expect(statusCardSource).toContain('tenantConnectStatusLabel(')
    expect(helpersSource).toContain('Invited')
    expect(helpersSource).toContain('Active')
    expect(helpersSource).toContain('Revoked')
  })

  it('the landlord invite/resend/revoke actions are unchanged by this milestone', () => {
    expect(statusCardSource).toContain(".insert({ property_id: propertyId, owner_id: ownerId, tenant_email: currentLease.tenant_email.trim().toLowerCase(), lease_id: currentLease.id })")
    expect(statusCardSource).toContain("status: 'Revoked'")
  })
})

describe('No sensitive data appears in the invitation URL/link (security regression)', () => {
  it('app/tenant/page.tsx never reads a bearer/session token or service-role key from the URL', () => {
    expect(tenantPageSource).not.toMatch(/get\(['"](token|access_token|service_role|key)['"]\)/)
  })
})
