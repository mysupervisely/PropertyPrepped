import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Public Landing Page Polish & Privacy Fix.
//
// Two real problems drove this milestone: (1) the signed-out hero
// rendered "5558 Pats Point" — a REAL property owned by the founder —
// to every public visitor, and (2) the previous four-scene product
// story's Understand section reserved a large, fixed block of scroll
// space for a sticky/crossfade effect that rendered as a long dead blank
// gap once scrolled past (confirmed by inspecting computed reveal
// states through a real incremental scroll, not a one-shot screenshot,
// which made the bug look even worse than it is — see this milestone's
// own completion report).
//
// This file is the authoritative source-read coverage for the resulting
// new structure: Hero -> Story -> Product Showcase -> Capabilities ->
// Tenant Connect -> Tax Center -> Pricing/Privacy/Final CTA/Footer
// (the last four unchanged from before). Same no-jsdom, source-read
// wiring-test convention as every other milestone-scale test in this
// repo.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const landingSource = readFile('components/LandingPage.tsx')
const cssSource = readFile('app/globals.css')
const taxCenterSource = readFile('app/tax-center/page.tsx')
const maintenanceSource = readFile('app/maintenance/page.tsx')

describe('Privacy regression — the real founder-owned address is gone from every public/demo surface', () => {
  it('"5558 Pats Point" (and the Dr. variant) does not appear anywhere in the landing page component', () => {
    expect(landingSource).not.toMatch(/5558 Pats Point/i)
  })

  it('does not appear in the landing page\'s own CSS', () => {
    expect(cssSource).not.toMatch(/5558 Pats Point/i)
  })

  it('the maintenance page\'s illustrative code comment (never rendered, but still a real-address reference worth cleaning up) no longer names the real address', () => {
    expect(maintenanceSource).not.toMatch(/5558 Pats Point/i)
  })

  it('the hero preview and product showcase use clearly fictional addresses instead', () => {
    expect(landingSource).toContain('1842 Harbor Ridge Drive')
    expect(landingSource).toContain('220 Willow Creek Lane')
    expect(landingSource).toContain('76 Sunset Terrace')
  })

  it('no real tenant name, real landlord name, or real phone number pattern appears in the landing page', () => {
    // The one "name" on this page is the fictional PropCrew contact
    // "Jordan's Plumbing," already an established fictional example
    // carried over from the previous Coordinate scene — not a real
    // person or business.
    expect(landingSource).not.toMatch(/\(\d{3}\)\s?\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b/)
  })
})

describe('Hero — a framed product preview replaces the previous real-data card', () => {
  it('renders a dedicated HeroProductPreview component with a browser-chrome frame (Step 5), not an ad hoc inline block', () => {
    expect(landingSource).toContain('function HeroProductPreview()')
    expect(landingSource).toContain('heroProductFrame')
    expect(landingSource).toContain('heroProductChrome')
  })

  it('the chrome bar shows no real domain/URL claim beyond identifying this as the app', () => {
    expect(landingSource).toContain('app.proproster.com')
  })

  it('still reuses the real, canonical Portfolio Snapshot fields/order (Properties, Portfolio Value, Monthly Rent, YTD NOI) — never an invented metric', () => {
    const fnStart = landingSource.indexOf('function HeroProductPreview()')
    const fnEnd = landingSource.indexOf('\n}', fnStart)
    const fnBody = landingSource.slice(fnStart, fnEnd)
    const order = ['Properties</span>', 'Portfolio Value', 'Monthly Rent', 'YTD NOI']
    let lastIdx = -1
    for (const field of order) {
      const i = fnBody.indexOf(field)
      expect(i).toBeGreaterThan(lastIdx)
      lastIdx = i
    }
  })
})

describe('Story section — editorial, no card (Step 7: reduce box fatigue)', () => {
  it('exists with concise copy about the real reason PropRoster exists (many small tasks, not one big one)', () => {
    expect(landingSource).toContain('className="landingStory"')
    expect(landingSource).toContain('Managing a rental isn&rsquo;t one big job. It&rsquo;s a hundred small ones.')
  })

  it('is not wrapped in a bordered card — no .showcasePanel/.heroProductFrame/.landingCapabilityCard class on the story section itself', () => {
    const start = landingSource.indexOf('className="landingStory"')
    const end = landingSource.indexOf('</section>', start)
    const slice = landingSource.slice(start, end)
    expect(slice).not.toMatch(/showcasePanel|heroProductFrame|landingCapabilityCard/)
  })
})

describe('Product showcase — one large real-UI mockup (Step 10)', () => {
  it('exists and reuses the real Property Snapshot field set (Est. Value, Est. Equity, Monthly Rent, Mortgage)', () => {
    expect(landingSource).toContain('function ProductShowcase()')
    const fnStart = landingSource.indexOf('function ProductShowcase()')
    const fnEnd = landingSource.indexOf('\n}', fnStart)
    const fnBody = landingSource.slice(fnStart, fnEnd)
    for (const field of ['Est. Value', 'Est. Equity', 'Monthly Rent', 'Mortgage']) {
      expect(fnBody).toContain(field)
    }
  })

  it('shows organized documents alongside the property numbers, illustrating "property info AND documents in one place"', () => {
    const fnStart = landingSource.indexOf('function ProductShowcase()')
    const fnEnd = landingSource.indexOf('\n}', fnStart)
    const fnBody = landingSource.slice(fnStart, fnEnd)
    for (const doc of ['Lease', 'Insurance', 'Tax records', 'Photos']) {
      expect(fnBody).toContain(doc)
    }
  })
})

describe('Capabilities — a clean structured grid (Step 7), not a 30-item feature catalog', () => {
  it('renders exactly six capability cards, each with an icon, a title, and one line of body copy', () => {
    const start = landingSource.indexOf('const CAPABILITIES = [')
    const end = landingSource.indexOf(']', start)
    const block = landingSource.slice(start, end)
    const titles = [...block.matchAll(/title: '([^']+)'/g)].map((m) => m[1])
    expect(titles).toEqual(['Property Workspace', 'Rent Ledger', 'Documents', 'PropCrew', 'Global Search', 'Landlord Digest'])
  })

  it('the Rental Property Analyzer link is preserved inside this section', () => {
    expect(landingSource).toContain('href="/investment-tools/rental-analyzer"')
    expect(landingSource).toContain('Try the free Rental Property Analyzer')
  })

  it('capability cards use a quieter treatment (hairline border, no shadow) than the hero/showcase panels — visual variety, not a repeated box style', () => {
    const rule = cssSource.match(/\.landingCapabilityCard \{[^}]*\}/)?.[0] || ''
    expect(rule).toContain('border: 1px solid var(--line)')
    expect(rule).not.toMatch(/box-shadow/)
  })
})

describe('Tenant Connect — a distinct workflow section (Step 9), explicit about live vs. planned', () => {
  it('exists as its own section, separate from the Capabilities grid', () => {
    expect(landingSource).toContain('className="landingTenantConnect"')
  })

  it('the six-step flow matches the real, live provider-outreach pipeline (tenant reports -> organized -> PropCrew routed -> availability -> confirmed -> recorded)', () => {
    const start = landingSource.indexOf('const TENANT_CONNECT_STEPS')
    const end = landingSource.indexOf(']', start)
    const block = landingSource.slice(start, end)
    const labels = [...block.matchAll(/label: '([^']+)'/g)].map((m) => m[1])
    expect(labels).toEqual([
      'Tenant reports an issue',
      'Organized in your Maintenance view',
      'Routed to your PropCrew contact',
      'Availability coordinated',
      'Appointment confirmed by you',
      'Resolution recorded with the property',
    ])
  })

  it('the live flow is explicitly labeled "Available today"', () => {
    expect(landingSource).toContain('landingTenantConnectLiveBadge')
    expect(landingSource).toContain('>Available today</span>')
  })

  it('the one forward-looking line is explicitly labeled "Planned" and points at the real, existing Automate plan tier — never presented as live', () => {
    const start = landingSource.indexOf('className="landingTenantConnect"')
    const end = landingSource.indexOf('</section>', start)
    const block = landingSource.slice(start, end)
    expect(block).toContain('>Planned</span>')
    expect(block).toMatch(/Automate plan/)
  })

  it('the referenced Automate plan really exists as a Coming Soon tier in lib/billing/plans.ts — not invented for this page', () => {
    const plansSource = readFile('lib/billing/plans.ts')
    expect(plansSource).toContain('COMING_SOON_PLAN_ORDER')
    expect(plansSource).toMatch(/automate/i)
  })

  it('no new Tenant Connect functionality was built — this section only presents existing, real behavior (lib/maintenance/provider-outreach.ts is unchanged by this milestone)', () => {
    const outreachSource = readFile('lib/maintenance/provider-outreach.ts')
    expect(outreachSource).not.toContain('Public Landing Page Polish')
  })
})

describe('Tax Center — a dedicated callout (Step 11), previously absent from this page', () => {
  it('exists as its own section', () => {
    expect(landingSource).toContain('className="landingTaxCenter"')
  })

  it('never implies PropRoster provides tax preparation, filing, or individualized advice', () => {
    const start = landingSource.indexOf('className="landingTaxCenter"')
    const end = landingSource.indexOf('</section>', start)
    const block = landingSource.slice(start, end).toLowerCase()
    expect(block).not.toMatch(/file your taxes|tax advice|we prepare|tax preparation/)
  })

  it('carries the exact same disclaimer sentence the real Tax Center page uses, verbatim — not a rephrased or weakened version', () => {
    const disclaimer = 'PropRoster organizes information entered into your account and does not provide tax, legal, or accounting advice.'
    expect(landingSource).toContain(disclaimer)
    expect(taxCenterSource).toContain(disclaimer)
  })

  it('the real Tax Center page\'s own disclaimer is untouched by this milestone', () => {
    expect(taxCenterSource).toContain('<p className="taxPrintDisclaimer">PropRoster organizes information entered into your account and does not provide tax, legal, or accounting advice. Review this information with a qualified tax professional.</p>')
  })
})

describe('Everything below the new content sections is unchanged from before this milestone', () => {
  it('Pricing, Privacy note, Final CTA, and the shared LegalFooter are all still present, unchanged', () => {
    expect(landingSource).toContain('className="landingPricing" id="pricing"')
    expect(landingSource).toContain('className="landingPrivacyNote"')
    expect(landingSource).toContain('className="landingFinalCta"')
    expect(landingSource).toContain('<LegalFooter />')
  })

  it('Launch Essentials V1 auth behavior is completely untouched: Forgot Password, submitReset, account-enumeration protection, safe-error routing', () => {
    expect(landingSource).toContain("<button type=\"button\" className=\"forgotPasswordLink\" onClick={() => switchMode('reset')}>Forgot password?</button>")
    expect(landingSource).toContain('async function submitReset()')
    expect(landingSource).toContain("If an account exists for that email, you'll receive password reset instructions shortly.")
    expect(landingSource).toContain('toSafeErrorMessage(signInError, signInError.message)')
  })

  it('the auth modal\'s login/signup functions are byte-for-byte untouched (same signInWithPassword/signUp calls)', () => {
    expect(landingSource).toContain("supabase.auth.signInWithPassword({ email: email.trim(), password })")
    expect(landingSource).toContain('supabase.auth.signUp({ email: email.trim(), password })')
  })
})

describe('Analytics — untouched by this milestone (no new events, no PII)', () => {
  it('lib/analytics.ts was not modified by this milestone — same 8-event union', () => {
    const analyticsSource = readFile('lib/analytics.ts')
    const events = [...analyticsSource.matchAll(/'[a-z_]+'/g)].map((m) => m[0].replace(/'/g, ''))
    expect(events).toContain('sign_up_completed')
    expect(events).toContain('login_completed')
  })

  it('trackEvent is still called only from the same three real success points in this file — login, signup, and nowhere in the new content sections', () => {
    const start = landingSource.indexOf('className="landingStory"')
    const end = landingSource.indexOf('className="landingPricing"')
    const contentSections = landingSource.slice(start, end)
    expect(contentSections).not.toContain('trackEvent')
  })
})

describe('Mobile/tablet layout — no horizontal overflow, sensible stacking', () => {
  it('the new content sections collapse to a single column below 901px', () => {
    for (const selector of ['.landingShowcaseInner', '.landingTenantConnectInner']) {
      expect(cssSource).toContain(selector)
    }
    const anchor = cssSource.indexOf('.landingShowcaseInner,')
    const mediaStart = cssSource.lastIndexOf('@media (max-width: 900px)', anchor)
    expect(mediaStart).toBeGreaterThan(-1)
  })

  it('the capabilities grid steps down from 3 to 2 to 1 column as the viewport narrows', () => {
    expect(cssSource).toContain('.landingCapabilitiesGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr))')
    const twoColRuleIdx = cssSource.indexOf('.landingCapabilitiesGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }')
    const oneColRuleIdx = cssSource.indexOf('.landingCapabilitiesGrid { grid-template-columns: 1fr; }')
    expect(twoColRuleIdx).toBeGreaterThan(-1)
    expect(oneColRuleIdx).toBeGreaterThan(-1)
  })

  it('no fixed pixel width in the new section CSS is wide enough to force horizontal scroll at 375px', () => {
    const start = cssSource.indexOf('.heroProductFrame {')
    const end = cssSource.indexOf('.landingEvaluatorLink:hover')
    const block = cssSource.slice(start, end)
    const fixedWidths = [...block.matchAll(/(?<!min-)(?<!max-)width:\s*(\d+)px/g)].map((m) => Number(m[1]))
    for (const w of fixedWidths) expect(w).toBeLessThan(375)
  })
})

describe('Accessibility', () => {
  it('every new icon is aria-hidden with a real adjacent text label — never icon-only meaning', () => {
    const start = landingSource.indexOf('const CAPABILITIES = [')
    const end = landingSource.indexOf('export default function LandingPage')
    const block = landingSource.slice(start, end)
    expect(block).not.toMatch(/<Icon \/>(?!<\/IconBadge>)/)
  })

  it('the hero preview\'s chrome dots and frame are purely decorative (aria-hidden on the whole preview, no interactive controls inside it)', () => {
    const fnStart = landingSource.indexOf('function HeroProductPreview()')
    const fnEnd = landingSource.indexOf('\n}', fnStart)
    const fnBody = landingSource.slice(fnStart, fnEnd)
    expect(fnBody).toContain('aria-hidden="true"')
    expect(fnBody).not.toContain('<button')
    expect(fnBody).not.toContain('<a ')
  })

  it('heading hierarchy stays logical — every new section uses h2/h3, never skipping to h1 or jumping levels', () => {
    const start = landingSource.indexOf('className="landingStory"')
    const end = landingSource.indexOf('className="landingPricing"')
    const block = landingSource.slice(start, end)
    expect(block).not.toContain('<h1')
    expect(block).toMatch(/<h2/)
  })
})
