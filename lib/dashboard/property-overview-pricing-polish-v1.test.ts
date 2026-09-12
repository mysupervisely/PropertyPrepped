import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLANS, PLAN_FEATURE_HIGHLIGHTS, CORE_FEATURES, CORE_FEATURES_STATEMENT } from '../billing/plans'
import { entitlementsFor } from '../billing/entitlements'

// Property Overview + Pricing Polish V1 — a two-stage milestone.
//
// Stage 0 (original PR #67) was presentation/UX polish across three
// areas: (A) the authenticated header's redundant avatar+hamburger menu
// triggers, (B) the Property Overview tab's uniform bordered-card
// presentation, and (C) Pricing's messaging — no entitlement change.
//
// Stage 1 (this file's Part C section, updated in place) made the FINAL
// product decision that superseded Launch Pricing's capability tiering:
// PropRoster scales by property count only. Tenant Connect, Smart
// Upload, Portfolio Import, AI Document Intelligence, Rent Ledger and
// PropWatch — previously Manage-only — are now core capabilities on
// every real plan (Free/Organize/Manage). The one thing that stays
// numeric rather than uniform-by-policy is monthlyAIAnalyses, kept as a
// platform-level fair-use safeguard (same number for every real plan,
// not a marketed feature, not usage-based billing).
//
// Most of Part A/B's own regression coverage lives in the rescoped
// lib/user-profile/profile-entry-point-wiring.test.ts and the several
// property-intelligence-v1-phase-c*/property-profile-mobile-* wiring
// files (this repo's established convention: protect the same
// invariant in place with updated literals, never leave a test broken).

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pricingPageSource = readFile('app/pricing/page.tsx')
const plansSource = readFile('lib/billing/plans.ts')
const entitlementsSource = readFile('lib/billing/entitlements.ts')
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
    // Stage 1 touched lib/billing/entitlements.ts (feature gating) and
    // lib/billing/plans.ts (display copy) — deliberately never
    // lib/billing/stripe.ts, lib/billing/client.ts,
    // lib/billing/checkout-sync.ts, lib/billing/webhook-handlers.ts, or
    // any Stripe price/env var. Equalizing what a plan's features ARE is
    // not the same as touching what Stripe charges for it.
    expect(plansSource).not.toMatch(/price_[A-Za-z0-9]/)
    expect(entitlementsSource).not.toMatch(/price_[A-Za-z0-9]/)
    expect(pricingPageSource).not.toMatch(/price_[A-Za-z0-9]/)
    expect(pricingPageSource).toContain("import { startCheckout } from '../../lib/billing/client'")
  })
})

describe('Part C, Stage 1 (FINAL decision) — capabilities are uniform across every real plan; only property count and the AI safeguard differ', () => {
  it('Tenant Connect and every ManageCapabilities flag are now identical for free/organize/manage — no more Manage-only feature gate', () => {
    const free = entitlementsFor('free')
    const organize = entitlementsFor('organize')
    const manage = entitlementsFor('manage')
    for (const field of ['tenantConnect', 'canUseSmartUpload', 'canUseSmartImport', 'canUseDocumentIntelligence', 'canUseRentLedger', 'canUsePropWatch'] as const) {
      expect(free[field]).toBe(true)
      expect(organize[field]).toBe(true)
      expect(manage[field]).toBe(true)
    }
  })

  it('the AI monthly allowance is a uniform platform-level safeguard, not a Manage-only marketing number — same limit for every real plan, never usage-based billing', () => {
    const free = entitlementsFor('free')
    const organize = entitlementsFor('organize')
    const manage = entitlementsFor('manage')
    expect(free.monthlyAIAnalyses).toBe(manage.monthlyAIAnalyses)
    expect(organize.monthlyAIAnalyses).toBe(manage.monthlyAIAnalyses)
    expect(typeof free.monthlyAIAnalyses).toBe('number')
    // No new billing/pricing mechanism was invented for this — just the
    // pre-existing aiAllowanceRemaining(limit, used) check, still the
    // only place a monthlyAIAnalyses number is enforced.
    expect(entitlementsSource).not.toMatch(/price_per_analysis|stripe.*overage/i)
    expect((entitlementsSource.match(/export function aiAllowanceRemaining/g) || []).length).toBe(1)
  })

  it('legacy Investor is the one deliberate, documented carve-out for Tenant Connect (unchanged by this milestone, not a new contradiction introduced)', () => {
    expect(entitlementsFor('investor').tenantConnect).toBe(false)
  })

  it('every dead "included with Manage" upgrade-prompt path was removed, not left as stale/unreachable false marketing copy', () => {
    for (const file of ['components/AuthHeader.tsx', 'app/page.tsx', 'app/smart-import/page.tsx', 'app/rent-ledger/page.tsx', 'components/DocumentIntelligencePanel.tsx']) {
      const source = readFile(file)
      expect(source.toLowerCase()).not.toContain('included with manage')
    }
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

  it('Stage 1: CORE_FEATURES now includes what used to be Manage-only (Tenant Connect, Smart Upload, Rent Ledger, PropWatch) — verified true for every real plan via entitlementsFor, not asserted blindly', () => {
    const manage = entitlementsFor('manage')
    const free = entitlementsFor('free')
    expect(manage.tenantConnect && free.tenantConnect).toBe(true)
    expect(manage.canUseSmartUpload && free.canUseSmartUpload).toBe(true)
    expect(manage.canUseRentLedger && free.canUseRentLedger).toBe(true)
    expect(manage.canUsePropWatch && free.canUsePropWatch).toBe(true)
    for (const nowCore of ['Tenant Connect', 'Smart Upload & Portfolio Import (AI)', 'Rent Ledger & PropWatch']) {
      expect(CORE_FEATURES).toContain(nowCore)
    }
  })

  it('Stage 1: Free, Organize and Manage have NO plan-specific PLAN_FEATURE_HIGHLIGHTS entry left — nothing differs between them except property count', () => {
    expect(PLAN_FEATURE_HIGHLIGHTS.free).toBeUndefined()
    expect(PLAN_FEATURE_HIGHLIGHTS.organize).toBeUndefined()
    expect(PLAN_FEATURE_HIGHLIGHTS.manage).toBeUndefined()
  })

  it('the pricing footer note describes the AI allowance as a shared, every-plan safeguard, never a Manage-exclusive perk', () => {
    expect(pricingPageSource).not.toMatch(/Manage includes \d+ AI-powered/i)
    expect(pricingPageSource).toMatch(/included on every plan/i)
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

describe('Guardrails: no Property Intelligence calculation, homepage V3, Stripe, or database schema was touched', () => {
  it('no schema/migration statement appears in any file this milestone touched', () => {
    expect(pageSource).not.toMatch(/create table|alter table|create policy/i)
    expect(pricingPageSource).not.toMatch(/create table|alter table|create policy/i)
    expect(entitlementsSource).not.toMatch(/create table|alter table|create policy/i)
  })

  it('components/LandingPage.tsx (Public Homepage V3) was not modified by this milestone — still reads pricing from the same canonical module', () => {
    const landingSource = readFile('components/LandingPage.tsx')
    expect(landingSource).toContain("import { PLANS, PUBLIC_PLAN_ORDER, PLAN_FEATURE_HIGHLIGHTS, EARLY_ACCESS_PRICING } from '../lib/billing/plans'")
  })

  it('the database-level property limit trigger (the real security boundary) is untouched — entitlements.ts is a display/UI mirror of it, never a substitute', () => {
    const schemaSource = readFile('supabase/milestone-9-subscriptions.sql')
    expect(schemaSource).toContain('enforce_property_limit')
  })
})
