import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Documents + Navigation + Realtor Connect Polish, Sections 11/12/13 —
// customer-facing copy regression guard.
//
// There is no jsdom/React Testing Library in this repo (every existing
// test is a pure-function/testable-core test), so this can't be a
// rendered-DOM assertion. Same technique already used in
// lib/document-intelligence/schemas.test.ts and
// lib/investment-tools/evaluator-layout-order.test.ts: read the page/
// component source directly and assert the approved copy is present
// (Sections 12/13) and every retired REALTOR/specialist/advisor phrase
// is gone (Section 11) — cheaply catching a copy regression without new
// test infrastructure.
//
// Deliberately does NOT ban the bare word "Realtor" from these files —
// "RealtorConnectCTA"/"RealtorConnectModal"/"showRealtorConnect"/
// "Realtor Connect V1" are the feature's own internal component/variable/
// milestone names (Section 14: internal identifiers stay stable), not
// customer-facing copy. Only the specific retired customer-facing
// phrases are checked for.

const ROOT = join(__dirname, '..', '..')

function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

describe('Realtor Connect customer-facing copy — Home Purchase Calculator (Section 12)', () => {
  const source = readFile('app/investment-tools/home-purchase/page.tsx')

  it('CTA eyebrow/intro is unchanged ("Interested in This Property?")', () => {
    expect(source).toContain('headline="Interested in This Property?"')
  })

  it('CTA heading uses the approved wording, with "local" lowercase (not title-cased)', () => {
    expect(source).toContain('subheadline="Connect with a local real estate agent"')
  })

  it('CTA body uses the approved copy', () => {
    expect(source).toContain("Send your property and purchase scenario to PropRoster and we'll help connect you with a local real estate agent who can help you take the next step.")
  })

  it('CTA button uses the approved label', () => {
    expect(source).toContain('buttonLabel="Connect with a Real Estate Agent"')
  })

  it('the modal title matches the approved heading', () => {
    expect(source).toContain('headline="Connect with a local real estate agent"')
  })
})

describe('Realtor Connect customer-facing copy — Rental Property Analyzer (Section 13)', () => {
  const source = readFile('app/investment-tools/rental-analyzer/page.tsx')

  it('CTA eyebrow/intro is unchanged ("Need Help With This Investment?")', () => {
    expect(source).toContain('headline="Need Help With This Investment?"')
  })

  it('CTA heading makes clear this is a real estate agent who specializes in investment properties', () => {
    expect(source).toContain('subheadline="Connect with a real estate agent who specializes in investment properties"')
  })

  it('CTA body uses the approved copy', () => {
    expect(source).toContain("Send your property and investment analysis to PropRoster and we'll connect you with a real estate agent who understands investment properties and can help you evaluate the opportunity and take the next step.")
  })

  it('CTA button uses the approved label', () => {
    expect(source).toContain('buttonLabel="Connect with an Investment Real Estate Agent"')
  })

  it('the modal title matches the approved heading', () => {
    expect(source).toContain('headline="Connect with a real estate agent who specializes in investment properties"')
  })
})

describe('Realtor Connect — no customer-facing REALTOR/Realtor/specialist/advisor terminology remains (Section 11)', () => {
  const RETIRED_PHRASES = [
    'Local Realtor',
    'Connect with a Realtor',
    'REALTOR CONNECT',
    'REALTOR®',
    'Real Estate Investment Specialist',
    'Investment Specialist',
    'investment specialist',
    'financial specialist',
  ]

  it.each([
    ['Home Purchase Calculator', 'app/investment-tools/home-purchase/page.tsx'],
    ['Rental Property Analyzer', 'app/investment-tools/rental-analyzer/page.tsx'],
    ['Realtor Connect lead modal/form', 'components/RealtorConnect/RealtorConnectModal.tsx'],
    ['Realtor Connect CTA card', 'components/RealtorConnect/RealtorConnectCTA.tsx'],
  ])('%s contains none of the retired phrases', (_name, path) => {
    const source = readFile(path)
    for (const phrase of RETIRED_PHRASES) {
      expect(source).not.toContain(phrase)
    }
  })

  it('the Rental Property Analyzer copy never uses "advisor" on its own for the agent', () => {
    const source = readFile('app/investment-tools/rental-analyzer/page.tsx')
    expect(source.toLowerCase()).not.toContain('advisor')
  })
})
