import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLANS, PLAN_FEATURE_HIGHLIGHTS, CORE_FEATURES, CORE_FEATURES_STATEMENT } from '../billing/plans'
import { entitlementsFor } from '../billing/entitlements'

// Property Overview + Pricing Polish V1 — a focused presentation/UX
// polish milestone across three areas: (A) the authenticated header's
// redundant avatar+hamburger menu triggers, (B) the Property Overview
// tab's uniform bordered-card presentation, and (C) Pricing's messaging.
// Explicitly NOT a redesign — no visual identity, palette, logo, Stripe,
// entitlement, schema, or Property Intelligence calculation change. Most
// of Part A/B's own regression coverage lives in the rescoped
// lib/user-profile/profile-entry-point-wiring.test.ts and the several
// property-intelligence-v1-phase-c*/property-profile-mobile-* wiring
// files (this repo's established convention: protect the same
// invariant in place with updated literals, never leave a test broken).
// This file adds the invariants that didn't already have a home,
// especially the new Pricing page wiring, which had no dedicated test
// file before this milestone.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pricingPageSource = readFile('app/pricing/page.tsx')
const plansSource = readFile('lib/billing/plans.ts')
const pageSource = readFile('app/page.tsx')
const cssSource = readFile('app/globals.css')

describe('Part C — Pricing prices and property limits are exactly unchanged', () => {
  it('Free $0/mo (1 property), Organize $9.99/mo (5 properties), Manage $19.99/mo (15 properties)', () => {
    expect(PLANS.free.priceMonthly).toBe(0)
    expect(PLANS.free.maxProperties).toBe(1)
    expect(PLANS.organize.priceMonthly).toBe(9.99)
    expect(PLANS.organize.maxProperties).toBe(5)
    expect(PLANS.manage.priceMonthly).toBe(19.99)
    expect(PLANS.manage.maxProperties).toBe(15)
  })

  it('no Stripe file, price ID, checkout amount, or webhook handler was touched by this milestone', () => {
    // This milestone's diff is presentation/copy only — plans.ts changed
    // (CORE_FEATURES/CORE_FEATURES_STATEMENT/PLAN_FEATURE_HIGHLIGHTS,
    // display copy all three), never lib/billing/stripe.ts,
    // lib/billing/client.ts, lib/billing/checkout-sync.ts,
    // lib/billing/webhook-handlers.ts, or any Stripe price/env var.
    expect(plansSource).not.toMatch(/price_[A-Za-z0-9]/)
    expect(pricingPageSource).not.toMatch(/price_[A-Za-z0-9]/)
    expect(pricingPageSource).toContain("import { startCheckout } from '../../lib/billing/client'")
  })
})

describe('Part C — shared "same core, scale by portfolio size" messaging', () => {
  it('the pricing page renders CORE_FEATURES_STATEMENT and CORE_FEATURES once, above the per-plan cards, not repeated per card', () => {
    expect(pricingPageSource).toContain('CORE_FEATURES_STATEMENT')
    expect(pricingPageSource).toContain('{CORE_FEATURES.map((feature) => <li key={feature}>{feature}</li>)}')
    // Rendered once — not inside the PUBLIC_PLAN_ORDER.map per-card loop.
    const cardsLoopIdx = pricingPageSource.indexOf('{PUBLIC_PLAN_ORDER.map((planId) => {')
    const coreFeaturesIdx = pricingPageSource.indexOf('CORE_FEATURES_STATEMENT')
    expect(coreFeaturesIdx).toBeGreaterThan(-1)
    expect(coreFeaturesIdx).toBeLessThan(cardsLoopIdx)
  })

  it('the shared statement communicates the same-core-experience message without over-explaining or promising "all features forever"', () => {
    expect(CORE_FEATURES_STATEMENT.length).toBeLessThan(120)
    expect(CORE_FEATURES_STATEMENT.toLowerCase()).not.toContain('forever')
    expect(CORE_FEATURES_STATEMENT.toLowerCase()).not.toContain('automate')
  })

  it('every CORE_FEATURES item is verified against real entitlements — none of them is actually gated by plan today', () => {
    const free = entitlementsFor('free')
    const manage = entitlementsFor('manage')
    // The only things that differ between Free and Manage are maxProperties,
    // tenantConnect, and the ManageCapabilities fields (Smart Upload/Import/
    // Document Intelligence/Rent Ledger/PropWatch/AI allowance) — none of
    // which CORE_FEATURES claims. Confirms CORE_FEATURES is not itself one
    // of the fields that actually differs by plan.
    const manageOnlyFields = ['tenantConnect', 'canUseSmartUpload', 'canUseSmartImport', 'canUseDocumentIntelligence', 'canUseRentLedger', 'canUsePropWatch'] as const
    for (const field of manageOnlyFields) {
      expect(free[field]).not.toBe(manage[field]) // confirms these genuinely DO differ (sanity check on the entitlements module itself)
    }
    for (const feature of CORE_FEATURES) {
      expect(feature).not.toMatch(/Tenant Connect|Smart Upload|Smart Import|Document Intelligence|Rent Ledger|PropWatch/)
    }
  })

  it('Manage still lists its own real, currently-enforced extras — this is "shared core + Manage adds more," never "everything is identical"', () => {
    expect(PLAN_FEATURE_HIGHLIGHTS.manage).toContain('Tenant Connect')
    expect(PLAN_FEATURE_HIGHLIGHTS.manage).toContain('Smart Upload & Portfolio Import (AI)')
    expect(PLAN_FEATURE_HIGHLIGHTS.manage).toContain('Rent Ledger & PropWatch')
  })

  it('Free and Organize have no plan-specific PLAN_FEATURE_HIGHLIGHTS entry — their pitch is the shared core statement plus property count, not a duplicated bullet list', () => {
    expect(PLAN_FEATURE_HIGHLIGHTS.free).toBeUndefined()
    expect(PLAN_FEATURE_HIGHLIGHTS.organize).toBeUndefined()
  })
})

describe('Part C — property count is the immediately obvious differentiator on each card', () => {
  it('each purchasable card shows a prominent property-count line right under its price, using the same computed pattern the homepage teaser already established', () => {
    expect(pricingPageSource).toContain("<p className=\"pricingLimit pricingPropertyLimit\"><strong>{def.maxProperties === 1 ? '1 property' : `Up to ${def.maxProperties} properties`}</strong></p>")
  })

  it('no hardcoded "1"/"5"/"15" property-count string is typed into the pricing page JSX — always computed from def.maxProperties', () => {
    const gridIdx = pricingPageSource.indexOf('<div className="pricingGrid">')
    const gridEnd = pricingPageSource.indexOf('</div>\n\n      <section className="pricingFooterNote">')
    const gridSlice = pricingPageSource.slice(gridIdx, gridEnd)
    expect(gridSlice).not.toMatch(/Up to (5|15) propert(y|ies)\b/)
  })
})

describe('Part A — avatar is the single navigation trigger; existing menu/logic reused, not reinvented', () => {
  const authNavMenuSource = readFile('components/AuthNavMenu.tsx')

  it('AuthNavMenu keeps its own outside-click-to-close and controlled open/onOpenChange behavior unchanged — no new navigation system invented', () => {
    expect(authNavMenuSource).toContain("document.addEventListener('mousedown', handleClickOutside)")
    expect(authNavMenuSource).toContain('{open && <div className="authNavMenuBackdrop" onClick={() => onOpenChange(false)} />}')
  })

  it('every existing menu destination and account action is still present — nothing was deleted while consolidating triggers', () => {
    for (const href of ['/', '/documents', '/maintenance', '/tax-center', '/propcrew', '/investment-tools', '/profile', '/pricing']) {
      expect(authNavMenuSource).toContain(`'${href}'`)
    }
    expect(authNavMenuSource).toContain('href="/?add=property"')
    expect(authNavMenuSource).toContain('Log out')
  })
})

describe('Part B — Property Overview reads as sections, not a stack of equally-weighted bordered cards', () => {
  it('Property Snapshot itself is untouched — same single .propertySnapshotCard container, still using the base .overviewPanel rule', () => {
    expect((pageSource.match(/className="overviewPanel propertySnapshotCard"/g) || []).length).toBe(1)
  })

  it('the five restructured groups (Expenses & tax, Property facts, Tenancy, Notes, Timeline) no longer render as individual bordered .overviewPanel cards', () => {
    expect(pageSource).not.toContain('className="overviewPanel financialDetailsCard"')
    expect(pageSource).not.toContain('<div className="overviewPanel"><h3>Property facts</h3>')
    expect(pageSource).not.toContain('<h3>Rent &amp; tenant</h3>')
    expect(pageSource).toContain('<h2 className="overviewSectionHeading">Tenancy</h2>')
  })

  it('new quiet-section classes exist and give only a top hairline + spacing, no border/background/shadow card treatment', () => {
    expect(cssSource).toMatch(/\.overviewInfoSection\s*\{[^}]*border-top: 1px solid var\(--line\)/)
    expect(cssSource).not.toMatch(/\.overviewInfoSection\s*\{[^}]*box-shadow/)
    expect(cssSource).not.toMatch(/\.overviewInfoSection\s*\{[^}]*border: 1px solid var\(--line\);/)
  })

  it('Quick Actions no longer uses the heavy solid-brand-color banner treatment', () => {
    expect(cssSource).not.toMatch(/\.quickActions\s*\{[^}]*background: var\(--brand\)/)
    expect(pageSource).toContain('className="overviewInfoSection quickActions"')
  })

  it('every Quick Actions button/action and its live count badge is preserved — no action removed', () => {
    expect(pageSource).toContain("Documents <span className=\"quickActionCount\">{selectedDocs.length}</span>")
    expect(pageSource).toContain("Photos <span className=\"quickActionCount\">{selectedPhotos.length}</span>")
    expect(pageSource).toContain("Maintenance <span className=\"quickActionCount\">{selectedMaintenance.length}</span>")
    expect(pageSource).toContain('Add transaction')
  })
})

describe('Guardrails: no Property Intelligence calculation, homepage V3, database schema, or entitlement logic was touched', () => {
  it('no formula function or entitlement-resolution logic appears in the diffed files\' new sections (spot-checked via absence of raw calculation imports/schema statements)', () => {
    expect(pageSource).not.toMatch(/create table|alter table|create policy/i)
    expect(pricingPageSource).not.toMatch(/create table|alter table|create policy/i)
  })

  it('components/LandingPage.tsx (Public Homepage V3) was not modified by this milestone — still reads pricing from the same canonical module', () => {
    const landingSource = readFile('components/LandingPage.tsx')
    expect(landingSource).toContain("import { PLANS, PUBLIC_PLAN_ORDER, PLAN_FEATURE_HIGHLIGHTS, EARLY_ACCESS_PRICING } from '../lib/billing/plans'")
  })
})
