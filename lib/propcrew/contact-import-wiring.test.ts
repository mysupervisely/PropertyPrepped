import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Property Profile / PropCrew UX Improvement — regression guards for the
// "Add from Contacts" wiring in components/PropCrewPanel.tsx. Same
// source-read technique as lib/propcrew/multi-property-assignment.test.ts
// (no jsdom/React Testing Library in this repo). The pure normalization/
// feature-detection logic itself is covered directly in
// lib/propcrew/contact-picker.test.ts; this file locks in how the
// component wires that logic into the existing add/edit/save workflow.

const ROOT = join(__dirname, '..', '..')
const PANEL_SOURCE = readFileSync(join(ROOT, 'components/PropCrewPanel.tsx'), 'utf8')

describe('Manual entry is fully preserved', () => {
  it('the existing manual Add/Edit form, its fields, and save() are unchanged', () => {
    expect(PANEL_SOURCE).toContain("<h2>{editingId ? 'Edit PropCrew provider' : 'Add to PropCrew'}</h2>")
    for (const field of ['Name<input', 'Business name<input', 'Category<select', 'Phone<input', 'Email<input', 'Website<input', 'Associated properties', 'Notes<input', 'Would you use them again?']) {
      expect(PANEL_SOURCE).toContain(field)
    }
    expect(PANEL_SOURCE).toContain('{PROPCREW_PRIVATE_NOTE_LABEL}<small>{PROPCREW_PRIVACY_DISCLOSURE}</small>')
    expect(PANEL_SOURCE).toContain('async function save()')
    expect(PANEL_SOURCE).toContain("supabase.from('property_contacts').insert(payload)")
    expect(PANEL_SOURCE).toContain("supabase.from('property_contacts').update(payload).eq('id', editingId)")
  })

  it('"Enter Manually" calls the SAME openAdd() the always-worked manual flow already used — no parallel form/state', () => {
    const idx = PANEL_SOURCE.indexOf('<h3>Enter Manually</h3>')
    expect(idx).toBeGreaterThan(-1)
    const slice = PANEL_SOURCE.slice(idx, idx + 300)
    expect(slice).toContain('onClick={openAdd}')
  })

  it('openAddChooser() skips the chooser entirely and behaves exactly like the old direct openAdd() when the picker is unsupported', () => {
    const idx = PANEL_SOURCE.indexOf('function openAddChooser')
    const slice = PANEL_SOURCE.slice(idx, idx + 300)
    expect(slice).toContain('if (pickerSupported) setShowAddChooser(true)')
    expect(slice).toContain('else openAdd()')
  })
})

describe('Contact-picker support is feature-detected, not assumed', () => {
  it('imports and uses the real isContactPickerSupported() check, computed client-only (no SSR crash)', () => {
    expect(PANEL_SOURCE).toContain("import { isContactPickerSupported, normalizeContactPickerResult, type ContactPickerResult, type PropCrewImportCandidate } from '../lib/propcrew/contact-picker'")
    expect(PANEL_SOURCE).toContain('setPickerSupported(isContactPickerSupported(')
    expect(PANEL_SOURCE).toContain("typeof navigator === 'undefined'")
    expect(PANEL_SOURCE).toContain("typeof window === 'undefined'")
  })

  it('the chooser modal (Add from Contacts vs Enter Manually) only renders when showAddChooser is true, and showAddChooser is only ever set when the picker is supported', () => {
    expect(PANEL_SOURCE).toContain('{showAddChooser && (')
    // The only setter call that flips it to true is gated by pickerSupported.
    const setTrueCalls = [...PANEL_SOURCE.matchAll(/setShowAddChooser\(true\)/g)]
    expect(setTrueCalls.length).toBe(1)
  })
})

describe('Selecting a contact pre-fills the existing form, never auto-saves', () => {
  it('applyImportCandidate() sets draft/showForm — the SAME state the manual flow uses — and never calls save()', () => {
    const idx = PANEL_SOURCE.indexOf('function applyImportCandidate')
    const slice = PANEL_SOURCE.slice(idx, PANEL_SOURCE.indexOf('async function pickFromContacts'))
    expect(slice).toContain('setDraft({ ...emptyDraft, name: candidate.name, phone, email,')
    expect(slice).toContain('setShowForm(true)')
    expect(slice).not.toContain('void save()')
    expect(slice).not.toMatch(/\bsave\(\)/)
  })

  it('pickFromContacts() requests only name/tel/email, never `multiple: true` (one contact at a time)', () => {
    const idx = PANEL_SOURCE.indexOf('async function pickFromContacts')
    const slice = PANEL_SOURCE.slice(idx, idx + 1500)
    expect(slice).toContain("nav.contacts.select(['name', 'tel', 'email'], { multiple: false })")
  })

  it('a cancelled/denied native picker (AbortError) is treated as a silent no-op, not an error, and manual entry remains available', () => {
    const idx = PANEL_SOURCE.indexOf('async function pickFromContacts')
    const slice = PANEL_SOURCE.slice(idx, idx + 1800)
    expect(slice).toContain("(err as { name?: string })?.name === 'AbortError'")
  })

  it('every imported value lands in the same editable draft/form fields as manual entry — no read-only prefill', () => {
    // draft.name/phone/email are the exact fields the JSX <input>s below already bind to.
    expect(PANEL_SOURCE).toContain('value={draft.phone}')
    expect(PANEL_SOURCE).toContain('value={draft.email}')
    expect(PANEL_SOURCE).toContain('value={draft.name}')
  })
})

describe('Multiple phone numbers/emails are handled safely, never silently guessed', () => {
  it('pickFromContacts() routes to the multi-value picker whenever more than one phone OR more than one email exists', () => {
    const idx = PANEL_SOURCE.indexOf('async function pickFromContacts')
    const slice = PANEL_SOURCE.slice(idx, idx + 1800)
    expect(slice).toContain('candidate.phones.length > 1 || candidate.emails.length > 1')
    expect(slice).toContain('setMultiValueCandidate(candidate)')
  })

  it('the multi-value modal only renders the phone/email choice groups when there actually is more than one value for that field', () => {
    expect(PANEL_SOURCE).toContain('{multiValueCandidate.phones.length > 1 && (')
    expect(PANEL_SOURCE).toContain('{multiValueCandidate.emails.length > 1 && (')
  })

  it('a single phone and single email skip the multi-value step entirely and go straight into the form', () => {
    const idx = PANEL_SOURCE.indexOf('async function pickFromContacts')
    const slice = PANEL_SOURCE.slice(idx, idx + 1800)
    expect(slice).toContain("applyImportCandidate(candidate, candidate.phones[0] || '', candidate.emails[0] || '')")
  })

  it('the multi-value modal requires an explicit Continue tap before applying the choice — never auto-applies on selection', () => {
    const idx = PANEL_SOURCE.indexOf('{multiValueCandidate && (')
    const slice = PANEL_SOURCE.slice(idx, idx + 2200)
    expect(slice).toContain('onClick={() => applyImportCandidate(multiValueCandidate, multiValueChoice.phone, multiValueChoice.email)}')
    expect(slice).toContain('>Continue<')
  })
})

describe('Privacy: only the one selected contact\'s fields are ever read or stored', () => {
  it('no bulk/whole-address-book API or third-party contact-sync provider is referenced anywhere', () => {
    expect(PANEL_SOURCE).not.toContain('.getAll(')
    expect(PANEL_SOURCE).not.toMatch(/carddav|google\.com\/contacts|contacts-sync|oauth/i)
  })

  it('no new table/storage bucket was introduced for imported contacts — the SAME property_contacts insert/update path is used', () => {
    expect(PANEL_SOURCE).not.toMatch(/from\(['"]propcrew_contacts_import['"]\)|from\(['"]address_book['"]\)/)
    expect(PANEL_SOURCE.match(/from\('property_contacts'\)\.insert/g)?.length).toBe(1)
  })

  it('imported contact fields are never written directly to Supabase — they only ever land in local draft state, and only save() (unchanged, existing) writes to the database', () => {
    const idx = PANEL_SOURCE.indexOf('async function pickFromContacts')
    const slice = PANEL_SOURCE.slice(idx, PANEL_SOURCE.indexOf('function openEdit'))
    expect(slice).not.toContain('supabase.from')
  })
})

describe('Existing PropCrew functionality remains intact', () => {
  it('edit, remove, and the existing property_contact_links multi-property assignment are untouched', () => {
    expect(PANEL_SOURCE).toContain('function openEdit(contact: PropCrewContact)')
    expect(PANEL_SOURCE).toContain('async function remove(id: string)')
    expect(PANEL_SOURCE).toContain("supabase.from('property_contact_links')")
  })

  it('the prefill/onPrefillConsumed prop (Document Intelligence "Add this business to PropCrew") is untouched', () => {
    expect(PANEL_SOURCE).toContain('prefill?: PropCrewPrefill | null')
    expect(PANEL_SOURCE).toContain('onPrefillConsumed?.()')
  })

  it('would_use_again/experience_note are never auto-set by contact import — only the manual form\'s own controls set them', () => {
    const idx = PANEL_SOURCE.indexOf('function applyImportCandidate')
    const slice = PANEL_SOURCE.slice(idx, PANEL_SOURCE.indexOf('async function pickFromContacts'))
    expect(slice).not.toContain('wouldUseAgain')
    expect(slice).not.toContain('experienceNote')
  })
})
