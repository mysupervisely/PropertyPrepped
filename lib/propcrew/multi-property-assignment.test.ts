import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Property-First Simplification V2, Part 3 ("PropCrew — keep portfolio
// view + property view"): this milestone's audit found the many-to-many
// property assignment it asks for ALREADY fully built and already
// deployed — property_contacts.property_id (the "primary" property,
// unchanged, still required) plus the additive property_contact_links
// join table (supabase/schema.sql), which PropCrewPanel.tsx already
// reads/writes and already renders as an "Associated properties"
// checklist. No schema change, no new UI, was required for this part —
// these are regression guards (this repo has no jsdom/React Testing
// Library — same source-read technique as
// lib/tax-center/property-tax-panel-totals.test.ts) locking in that a
// future edit can't silently break this already-working behavior.

const ROOT = join(__dirname, '..', '..')
const PANEL_SOURCE = readFileSync(join(ROOT, 'components/PropCrewPanel.tsx'), 'utf8')

describe('PropCrew — one provider, assignable to one or many properties', () => {
  it('a provider is one property_contacts row plus any number of property_contact_links rows — never a duplicate contact per property', () => {
    // Exactly one INSERT into property_contacts per save (new contact) —
    // additional properties beyond the primary go into the links table,
    // never a second property_contacts row for the same provider.
    expect(PANEL_SOURCE.split("supabase.from('property_contacts').insert(").length - 1).toBe(1)
    expect(PANEL_SOURCE).toContain("supabase.from('property_contact_links').insert(otherPropertyIds.map(")
  })

  it('propertyIdsFor unions the primary property_id with every property_contact_links row for that contact', () => {
    expect(PANEL_SOURCE).toContain('function propertyIdsFor(contact: PropCrewContact): string[] {')
    expect(PANEL_SOURCE).toContain('const ids = new Set<string>([contact.property_id])')
    expect(PANEL_SOURCE).toContain('for (const link of links) if (link.contact_id === contact.id) ids.add(link.property_id)')
  })

  it('editing a contact re-populates the full associated-properties list (primary + links), not just the primary', () => {
    expect(PANEL_SOURCE).toContain('propertyIds: propertyIdsFor(contact),')
  })

  it('saving re-derives links from scratch (delete-then-reinsert) so removing a property from the checklist actually un-assigns it', () => {
    expect(PANEL_SOURCE).toContain("await supabase.from('property_contact_links').delete().eq('contact_id', editingId)")
  })

  it('the Add/Edit form offers a multi-select checklist over every property, not a single dropdown', () => {
    expect(PANEL_SOURCE).toContain('Associated properties')
    expect(PANEL_SOURCE).toContain('propertyIds: e.target.checked ? [...d.propertyIds, p.id] : d.propertyIds.filter((id) => id !== p.id)')
  })
})

describe('PropCrew — portfolio-wide directory vs. property-scoped view', () => {
  it('visibleContacts filters to the scoped property only when scopePropertyId is provided, via the same propertyIdsFor union', () => {
    expect(PANEL_SOURCE).toContain('const list = scopePropertyId ? contacts.filter((c) => propertyIdsFor(c).includes(scopePropertyId)) : contacts')
  })

  it('the portfolio-wide route renders PropCrewPanel unscoped (every provider, every property)', () => {
    const source = readFileSync(join(ROOT, 'app/propcrew/page.tsx'), 'utf8')
    expect(source).toContain('<PropCrewPanel ownerId={user.id} properties={properties} showHeader={false} />')
    expect(source).not.toContain('scopePropertyId')
  })

  it("the property workspace's PropCrew tab renders PropCrewPanel scoped to that one property", () => {
    const source = readFileSync(join(ROOT, 'app/page.tsx'), 'utf8')
    expect(source).toContain('scopePropertyId={selected.id}')
  })

  it('the portfolio-wide (unscoped) view surfaces which properties each provider is assigned to', () => {
    expect(PANEL_SOURCE).toContain('{!scopePropertyId && propertyLabels.length > 0 && <p className="propCrewProperties muted">Properties: {propertyLabels.join(\', \')}</p>}')
  })
})

describe('PropCrew — no schema change required', () => {
  it('property_contact_links already exists in the deployed schema with owner-scoped RLS and forged-property/provider protection', () => {
    const schema = readFileSync(join(ROOT, 'supabase/schema.sql'), 'utf8')
    expect(schema).toContain('create table if not exists public.property_contact_links (')
    expect(schema).toContain('unique (contact_id, property_id)')
    // Forged-assignment protection: insert requires the CALLER to own both the contact and the property.
    expect(schema).toContain('exists (select 1 from public.property_contacts c where c.id = contact_id and c.owner_id = (select auth.uid()))')
    expect(schema).toContain('exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))')
  })
})
