import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Property-First Simplification V2 — navigation/copy regression guards.
//
// Same source-read technique as dashboard-navigation.test.ts and
// property-first-navigation.test.ts (no jsdom/React Testing Library in
// this repo). These lock in this milestone's navigation/IA changes so a
// future edit can't silently reintroduce a removed nav destination or
// re-break the Pricing header/Profile identity-default bugs this
// milestone fixed.

const ROOT = join(__dirname, '..', '..')

function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

describe('Avatar menu simplification — AuthNavMenu', () => {
  const source = readFile('components/AuthNavMenu.tsx')

  it('the primary NAV_LINKS list is exactly Dashboard / Documents / Tax Center / PropCrew / Investment Tools', () => {
    expect(source).toContain("{ href: '/', label: 'Dashboard' }")
    expect(source).toContain("{ href: '/documents', label: 'Documents' }")
    expect(source).toContain("{ href: '/tax-center', label: 'Tax Center' }")
    expect(source).toContain("{ href: '/propcrew', label: 'PropCrew' }")
    expect(source).toContain("{ href: '/investment-tools', label: 'Investment Tools' }")
  })

  it('Rent Ledger is absent from the main navigation menu', () => {
    expect(source).not.toMatch(/label: 'Rent Ledger'/)
    expect(source).not.toContain("href: '/rent-ledger'")
  })

  it('Portfolio Import is absent from the main navigation menu', () => {
    expect(source).not.toMatch(/label: 'Portfolio Import'/)
    expect(source).not.toContain("href: '/smart-import'")
  })

  it('Profile and Pricing are a visually de-emphasized ACCOUNT_LINKS group, not equal-weight NAV_LINKS entries', () => {
    expect(source).toContain("const ACCOUNT_LINKS: { href: string; label: string }[] = [\n  { href: '/profile', label: 'Profile' },\n  { href: '/pricing', label: 'Pricing' },\n]")
    expect(source).toContain('className="authNavMenuSecondary"')
  })

  it('+ Add Property and Log out remain', () => {
    expect(source).toContain('+ Add Property')
    expect(source).toContain('Log out')
  })

  it('no additional menu destinations were added beyond the specified hierarchy', () => {
    const hrefs = [...source.matchAll(/href: '([^']+)'/g)].map((m) => m[1])
    expect(new Set(hrefs)).toEqual(new Set(['/', '/documents', '/tax-center', '/propcrew', '/investment-tools', '/profile', '/pricing']))
  })
})

describe('Rent Ledger becomes a compatibility route, not deleted', () => {
  it('/rent-ledger still exists and still uses the existing source of truth (no duplicated payment-mutation logic)', () => {
    const source = readFile('app/rent-ledger/page.tsx')
    expect(source).toContain('canUseRentLedger')
    expect(source).toContain("supabase.from('rent_payments')")
  })
})

describe('Portfolio Import relocated to a contextual Add Property action', () => {
  const source = readFile('app/page.tsx')

  it('the Add Property modal offers "Import existing portfolio" linking to /smart-import', () => {
    const addModalIndex = source.indexOf('{showAdd &&')
    expect(addModalIndex).toBeGreaterThan(-1)
    const nearby = source.slice(addModalIndex, addModalIndex + 1200)
    expect(nearby).toContain('href="/smart-import"')
    expect(nearby).toContain('Import it instead')
  })

  it('Smart Import\'s own engine/AI pipeline is untouched (still the one implementation, not duplicated)', () => {
    const importSource = readFile('app/smart-import/page.tsx')
    expect(importSource).toContain("from '../../lib/smart-upload/engine'")
  })
})

describe('Pricing page reuses the shared authenticated header', () => {
  const source = readFile('app/pricing/page.tsx')

  it('imports and conditionally renders the shared AuthHeader for signed-in visitors', () => {
    expect(source).toContain("import { AuthHeader } from '../../components/AuthHeader'")
    expect(source).toContain('{ready && user ? <AuthHeader /> : (')
  })

  it('keeps a lightweight marketing header for signed-out visitors only (Pricing is reachable while logged out)', () => {
    expect(source).toContain('<header className="topbar">')
  })
})

describe('Account & Billing already uses the shared authenticated header (no change needed)', () => {
  it('renders AuthHeader, not a separate billing-specific header', () => {
    const source = readFile('app/account/billing/page.tsx')
    expect(source).toContain("import { AuthHeader } from '../../../components/AuthHeader'")
    expect(source).toContain('<AuthHeader />')
  })
})

describe('Pricing hero simplification', () => {
  const source = readFile('app/pricing/page.tsx')

  it('uses the simplified hero copy', () => {
    expect(source).toContain('<h1>Simple pricing for your properties.</h1>')
    expect(source).toContain('Start free with one property. Upgrade when your portfolio grows.')
  })

  it('no longer leads with the old feature-explanation hero copy', () => {
    expect(source).not.toContain('Plans built around what you need PropRoster to do.')
  })
})

describe('Pricing plan-state language', () => {
  const source = readFile('app/pricing/page.tsx')

  it('"Included in your account." is gated to actual internal owner accounts only, never shown generically for a paid plan', () => {
    const idx = source.indexOf('Included in your account.')
    expect(idx).toBeGreaterThan(-1)
    const before = source.slice(Math.max(0, idx - 80), idx)
    expect(before).toContain('isOwner ?')
  })

  it('a subscribed user sees "Current Plan", not a generic inclusion message', () => {
    expect(source).toContain('isCurrent ? (\n                  <button className="secondary" disabled>Current Plan</button>')
  })

  it('an unsubscribed user sees a state-aware "Upgrade to <Plan>" action', () => {
    expect(source).toContain('Upgrade to ${def.name}')
  })
})

describe('Pricing feature copy stays truthful to real entitlements', () => {
  const source = readFile('lib/billing/plans.ts')
  const highlightsMatch = source.match(/export const PLAN_FEATURE_HIGHLIGHTS[\s\S]*?= \{([\s\S]*?)\n\}/)
  const highlightsBlock = (() => {
    expect(highlightsMatch).not.toBeNull()
    return highlightsMatch![1]
  })()

  it('Organize\'s highlighted features never claim Manage-only capabilities (Smart Upload / PropWatch / AI)', () => {
    const organizeMatch = highlightsBlock.match(/organize: \[([\s\S]*?)\],/)
    expect(organizeMatch).not.toBeNull()
    const organizeBlock = organizeMatch![1]
    expect(organizeBlock).not.toMatch(/Smart Upload/)
    expect(organizeBlock).not.toMatch(/PropWatch/)
  })

  it('"Tenant & Lease Management" is renamed to narrower "Rent & lease tracking" language in the actual bullet content', () => {
    expect(highlightsBlock).not.toContain('Tenant & Lease Management')
    expect(highlightsBlock).toContain('Rent & lease tracking')
  })

  it('Global Search is no longer a headline pricing bullet on any plan', () => {
    expect(highlightsBlock).not.toMatch(/Global Search/)
  })
})

describe('Profile page cleanup', () => {
  const source = readFile('app/profile/page.tsx')

  it('uses a simple "Profile" heading, not the old over-explained hero copy', () => {
    expect(source).toContain('<h1>Profile</h1>')
    expect(source).not.toContain('Your identity, not your settings.')
    expect(source).not.toContain('This is how PropRoster greets you and identifies you')
    expect(source).not.toContain('A real name here is what PropRoster greets you with')
  })

  it('never sets a hardcoded example/default personal identity value (Kiro/Kirollos/Attalla) anywhere a real value could be mistaken for it', () => {
    expect(source).not.toMatch(/placeholder="Kiro"/)
    expect(source).not.toMatch(/Kirollos/)
    expect(source).not.toMatch(/Attalla/)
  })

  it('the display-name field has no value/placeholder pulled from anything but the user\'s own saved profile', () => {
    const fieldIndex = source.indexOf('Preferred / display name')
    expect(fieldIndex).toBeGreaterThan(-1)
    const nearby = source.slice(fieldIndex, fieldIndex + 300)
    expect(nearby).toContain('value={draft.displayName}')
    expect(nearby).not.toContain('placeholder=')
  })

  it('draftFromProfile only ever reads from the saved profile row — never invents/derives a name', () => {
    expect(source).toContain('displayName: profile.display_name || \'\',')
    expect(source).not.toMatch(/display_name\s*\|\|\s*['"][A-Za-z]/) // no hardcoded string fallback other than ''
  })
})
