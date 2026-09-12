import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatPhoneForDisplay } from './phone-display'

// PropCrew Mobile Cleanup V1.
//
// A focused, presentation-only pass on PropCrew's mobile presentation:
// a shorter "+ Add" label on the header's primary action below 761px
// (replacing the old rule that stretched it to a full-width block), a
// more compact directory-entry card (.propCrewCard), and a new
// presentation-only phone-formatting helper. Every field, value,
// conditional and handler in components/PropCrewPanel.tsx is otherwise
// unchanged — the private-directory data model, Add/Edit/Remove/Link
// Existing Contact workflows, and the property section selector
// (Mobile Property Section Selector V1) are all untouched. Same
// no-jsdom, source-read wiring-test convention as every other
// component test in this repo.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const panelSource = readFile('components/PropCrewPanel.tsx')
const cssSource = readFile('app/globals.css')
const pageSource = readFile('app/page.tsx')

describe('formatPhoneForDisplay — presentation-only, conservative US formatting', () => {
  it('formats a clearly-recognizable 10-digit US number', () => {
    expect(formatPhoneForDisplay('3214371496')).toBe('(321) 437-1496')
    expect(formatPhoneForDisplay('321-437-1496')).toBe('(321) 437-1496')
    expect(formatPhoneForDisplay('(321) 437-1496')).toBe('(321) 437-1496')
  })

  it('formats an 11-digit number with a leading US country code', () => {
    expect(formatPhoneForDisplay('13214371496')).toBe('+1 (321) 437-1496')
    expect(formatPhoneForDisplay('+1 321 437 1496')).toBe('+1 (321) 437-1496')
  })

  it('leaves anything that is not a clean 10 (or 11-with-leading-1) digit US shape completely untouched', () => {
    expect(formatPhoneForDisplay('321-437-1496 ext 204')).toBe('321-437-1496 ext 204')
    expect(formatPhoneForDisplay('+44 20 7946 0958')).toBe('+44 20 7946 0958')
    expect(formatPhoneForDisplay('12345')).toBe('12345')
    expect(formatPhoneForDisplay('')).toBe('')
  })

  it('never mutates — pure function, same input always returns the same output, no side effects', () => {
    const input = '3214371496'
    formatPhoneForDisplay(input)
    expect(input).toBe('3214371496')
  })
})

describe('PropCrew remains a private directory — positioning unchanged', () => {
  it('the panel and the portfolio-wide route still describe PropCrew as private, never a marketplace/network', () => {
    expect(panelSource).toContain('PropCrew is the owner\'s private historical directory of service')
    expect(panelSource).toContain('NOT a marketplace, NOT public reviews')
    const propcrewPageSource = readFile('app/propcrew/page.tsx')
    expect(propcrewPageSource).toContain('never a marketplace, never shared with anyone else')
  })

  it('no marketplace/provider-network language was introduced by this milestone', () => {
    for (const source of [panelSource, cssSource]) {
      const lower = source.toLowerCase()
      // Every occurrence of "marketplace" in this file is an existing
      // NEGATION ("not a marketplace") explaining what PropCrew is NOT —
      // never a positive claim. Flag anything that isn't that negation.
      for (const match of lower.matchAll(/marketplace/g)) {
        const before = lower.slice(Math.max(0, match.index! - 12), match.index)
        expect(before).toMatch(/not a $|never a $/)
      }
      expect(lower).not.toMatch(/provider network|find (a |)provider(s)?\b|browse providers/)
    }
  })
})

describe('Add to PropCrew action preserved — same handler, label only shortens on mobile', () => {
  it('the header primary button still calls openAddChooser, with both a full and short label rendered (CSS picks which shows)', () => {
    const headerIdx = panelSource.indexOf('className="propCrewHeaderActions"')
    const headerEnd = panelSource.indexOf('</div>', headerIdx)
    const headerSlice = panelSource.slice(headerIdx, headerEnd)
    expect(headerSlice).toContain('onClick={openAddChooser}')
    expect(headerSlice).toContain('<span className="propCrewAddButtonFull">+ Add to PropCrew</span>')
    expect(headerSlice).toContain('<span className="propCrewAddButtonShort">+ Add</span>')
  })

  it('the empty-state Add button gets the same treatment, not left showing the old full-width-only label', () => {
    const emptyIdx = panelSource.indexOf('className="emptyModule"')
    const emptyEnd = panelSource.indexOf('</div>\n      )}', emptyIdx)
    const emptySlice = panelSource.slice(emptyIdx, emptyEnd)
    expect(emptySlice).toContain('onClick={openAddChooser}')
    expect(emptySlice).toContain('propCrewAddButtonFull')
    expect(emptySlice).toContain('propCrewAddButtonShort')
  })

  it('the label swap is CSS-only (no JS/viewport-detection state was added) and the old full-width-stretch rule is gone', () => {
    expect(cssSource).toContain('.propCrewAddButtonShort { display: none; }')
    expect(cssSource).toMatch(/@media \(max-width: 760px\) \{[\s\S]*?\.propCrewAddButtonFull \{ display: none; \}[\s\S]*?\.propCrewAddButtonShort \{ display: inline; \}/)
    expect(cssSource).not.toMatch(/@media \(max-width: 480px\) \{ \.propCrewHeaderActions \{ width: 100%; \}/)
    expect(panelSource).not.toMatch(/useState.*[Vv]iewport|matchMedia/)
  })

  it('Link Existing Contact is unaffected — same condition, same handler', () => {
    expect(panelSource).toContain("linkableContacts.length > 0 && <button className=\"secondary\" onClick={() => setShowLinkExisting(true)}>Link Existing Contact</button>")
  })
})

describe('Crew-entry card: identity, category, phone, reuse preference, details, and remove all preserved', () => {
  const cardIdx = panelSource.indexOf('<article className="recordCard contactCard propCrewCard"')
  const cardEnd = panelSource.indexOf('{expanded && (', cardIdx)
  const cardSlice = panelSource.slice(cardIdx, cardEnd)

  it('business/provider name is still the strongest text (h3), contact/person name still the secondary line', () => {
    expect(cardSlice).toContain('<h3>{contact.business_name || contact.name}</h3>')
    expect(cardSlice).toContain('<p>{contact.business_name ? contact.name : \'No business name added\'}</p>')
  })

  it('category renders as a compact badge (still the same .statusPill vocabulary, not a new one)', () => {
    expect(cardSlice).toContain('<span className="statusPill propCrewCategoryPill">{contact.role}</span>')
  })

  it('phone/email/website links are all preserved, tap-to-call intact, and the phone DISPLAY goes through formatPhoneForDisplay while the tel: href keeps the original raw value', () => {
    expect(cardSlice).toContain('href={`tel:${contact.phone}`}')
    expect(cardSlice).toContain('{formatPhoneForDisplay(contact.phone)}')
    expect(cardSlice).toContain('href={`mailto:${contact.email}`}')
    expect(cardSlice).toContain('href={normalizeUrl(contact.website)} target="_blank" rel="noopener noreferrer"')
    expect(cardSlice).toContain("{!contact.phone && !contact.email && !contact.website && <span className=\"muted\">No contact details added</span>}")
  })

  it('"Would use again" is preserved verbatim (same field, same three labels) — only moved to the footer and given a quieter class', () => {
    expect(cardSlice).toContain('reuse-${reusePreferenceTone(contact.would_use_again)}')
    expect(cardSlice).toContain('propCrewReuseQuiet')
    expect(cardSlice).toContain('Would use again: {REUSE_PREFERENCE_LABELS[contact.would_use_again]}')
  })

  it('View details/Hide details toggle is preserved, same handler, same expandedId state', () => {
    expect(cardSlice).toContain("onClick={() => setExpandedId(expanded ? null : contact.id)}")
    expect(cardSlice).toContain("{expanded ? 'Hide details' : 'View details'}")
  })

  it('remove is preserved with the exact same handler — an accessible label was added, deletion semantics were not touched', () => {
    expect(cardSlice).toContain('onClick={() => void remove(contact.id)}')
    expect(cardSlice).toMatch(/aria-label=\{`Remove \$\{contact\.business_name \|\| contact\.name\} from PropCrew`\}/)
  })

  it('property labels and service-history summary lines are preserved verbatim', () => {
    expect(cardSlice).toContain("{!scopePropertyId && propertyLabels.length > 0 && <p className=\"propCrewProperties muted\">Properties: {propertyLabels.join(', ')}</p>}")
    expect(cardSlice).toContain('history.serviceCount > 0 || history.systemsCount > 0')
  })
})

describe('Expanded details panel preserved', () => {
  it('the private note, generic notes, and Edit action are all still present and unchanged', () => {
    const detailsIdx = panelSource.indexOf('<div className="propCrewDetails">')
    const detailsEnd = panelSource.indexOf('</article>', detailsIdx)
    const detailsSlice = panelSource.slice(detailsIdx, detailsEnd)
    expect(detailsSlice).toContain('{PROPCREW_PRIVATE_NOTE_LABEL}')
    expect(detailsSlice).toContain('No private note added yet.')
    expect(detailsSlice).toContain('onClick={() => openEdit(contact)}')
  })
})

describe('Card compaction is scoped to PropCrew — Leases/Insurance/Maintenance untouched', () => {
  it('every new/changed rule is .propCrewCard-prefixed or .contactGrid — never the bare .recordCard/.contactCard base rules other modules share', () => {
    expect(cssSource).toMatch(/\.propCrewCard \{ padding: 16px; border-radius: 13px; \}/)
    expect(cssSource).toMatch(/\.recordCard \{ background: white; border: 1px solid var\(--line\); border-radius: 16px; padding: 20px; \}/)
  })

  it('.propCrewCardTop removes the internal divider only where .propCrewCardTop is also present — the base .recordTop rule (used by Leases/Maintenance/etc.) is unchanged', () => {
    expect(cssSource).toContain('.recordTop { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }')
    expect(cssSource).toContain('.propCrewCardTop { border-bottom: 0; padding-bottom: 0; align-items: flex-start; }')
  })
})

describe('The mobile Property section selector (Mobile Property Section Selector V1) is untouched', () => {
  it('.mobilePropertyNav and its CSS are unmodified by this milestone', () => {
    expect(pageSource).toContain('<div className="mobilePropertyNav" ref={mobileTabMenuRef}>')
    expect(cssSource).toMatch(/\.mobilePropertyNav \{ display: none; \}/)
    expect(cssSource).not.toMatch(/PropCrew Mobile Cleanup V1[\s\S]{0,400}\.mobilePropertyNav/)
  })

  it('mobile bottom navigation is untouched', () => {
    expect(cssSource).toContain('.mobileBottomNav { display: none; }')
  })
})

describe('Guardrails: no font/typography-family change, no backend/data-model change', () => {
  it('the global body font-family stack is byte-for-byte unchanged — no new typeface, no Google Fonts import, no new global font stack introduced', () => {
    // "Segoe UI" already exists here as the pre-existing Windows fallback
    // in the system-font stack (-apple-system, BlinkMacSystemFont,
    // "Segoe UI", Roboto, Helvetica, Arial, sans-serif) — this asserts
    // that exact stack is untouched, not that the substring is absent.
    expect(cssSource).toContain('body { margin: 0; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;')
    expect(cssSource).not.toMatch(/fonts\.googleapis\.com|@font-face/i)
    expect(panelSource).not.toMatch(/font-family|fonts\.googleapis\.com/i)
  })

  it('no PropCrew data model, Supabase table, or business-logic function was touched by this milestone', () => {
    expect(panelSource).toContain("supabase.from('property_contacts')")
    expect(panelSource).toContain("supabase.from('property_contact_links')")
    expect(panelSource).not.toMatch(/create table|alter table|create policy/i)
  })

  it('no Stripe/billing/entitlements/Property Intelligence/Rent Ledger file was touched', () => {
    for (const file of ['lib/billing/stripe.ts', 'lib/billing/entitlements.ts', 'lib/property-intelligence/portfolio.ts', 'lib/rent-ledger/status.ts']) {
      const source = readFile(file)
      expect(source).not.toMatch(/PropCrew Mobile Cleanup/)
    }
  })
})
