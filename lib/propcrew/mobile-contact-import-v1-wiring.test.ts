import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PropCrew Mobile Contact Import V1 — source-read regression guards for
// components/PropCrewPanel.tsx's new wiring, matching this repo's
// established no-jsdom convention (see lib/propcrew/
// contact-import-wiring.test.ts, the direct M-1 precedent this file
// extends without duplicating its existing coverage). The pure
// vCard-parsing and dedup logic is covered directly in
// lib/propcrew/vcard.test.ts and lib/propcrew/dedupe.test.ts; this file
// only locks in how the component wires that logic into the existing
// add/edit/save workflow.

const ROOT = join(__dirname, '..', '..')
const PANEL_SOURCE = readFileSync(join(ROOT, 'components/PropCrewPanel.tsx'), 'utf8')

describe('Section 3 — iOS/unsupported-browser fallback: honest, never a dead control', () => {
  it('the chooser is now ALWAYS shown by openAddChooser() — no browser silently skips straight past it', () => {
    const idx = PANEL_SOURCE.indexOf('function openAddChooser')
    const body = PANEL_SOURCE.slice(idx, PANEL_SOURCE.indexOf('function closeAddChooser'))
    expect(body).toContain('setShowAddChooser(true)')
    expect(body).not.toMatch(/if \(pickerSupported\)/)
  })

  it('the native-picker button is rendered ONLY when pickerSupported is true; the vCard import button is rendered ONLY when it is false — never both, never neither', () => {
    const idx = PANEL_SOURCE.indexOf('<div className="addDocumentChooser">')
    const body = PANEL_SOURCE.slice(idx, idx + 2000)
    expect(body).toContain('{pickerSupported ? (')
    expect(body).toContain('Choose from Contacts')
    expect(body).toContain('Import from iPhone Contacts')
    expect(body).toContain('Import Contact Card')
    expect(body).toContain(') : (')
  })

  it('a plain-language, honest note is shown when the picker is unsupported — never claims direct contact access exists, never promises a release date', () => {
    const idx = PANEL_SOURCE.indexOf('{!pickerSupported && (')
    expect(idx).toBeGreaterThan(-1)
    const body = PANEL_SOURCE.slice(idx, idx + 300)
    expect(body).toContain('Direct contact selection for iPhone is planned for a future PropRoster app.')
    expect(body).not.toMatch(/\d{4}|Q[1-4]\s*20\d\d|coming (soon|in)/i)
  })

  it('the visible instructional copy for the iPhone fallback is a plain-language numbered list, not a technical explanation', () => {
    const idx = PANEL_SOURCE.indexOf('propCrewImportStepsTitle')
    const body = PANEL_SOURCE.slice(idx, idx + 500)
    expect(body).toContain('Import an existing contact')
    expect(body).toContain('<li>Open Contacts and select the person.</li>')
    expect(body).toContain('<li>Tap Share Contact.</li>')
    expect(body).toContain('<li>Choose Save to Files.</li>')
    expect(body).toContain('<li>Return to PropRoster and tap Import Contact Card.</li>')
    // Plain language only — the visible <li> text itself never names the
    // underlying technology (that explanation lives in code comments
    // and docs/propcrew-mobile-contact-import-v1.md instead).
    const listItems = [...body.matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1])
    for (const item of listItems) expect(item).not.toMatch(/WebKit|Contact Picker API|vCard|browser compatibility/i)
  })

  it('Enter Manually remains present and unconditional, calling the same openAdd() as before', () => {
    const idx = PANEL_SOURCE.indexOf('<h3>Enter Manually</h3>')
    expect(idx).toBeGreaterThan(-1)
    expect(PANEL_SOURCE.slice(idx, idx + 300)).toContain('onClick={openAdd}')
  })
})

describe('UX polish pass — supported-device (native picker) copy stays extremely simple', () => {
  it('the supported-device card shows only the plain-language supporting line — no iPhone/vCard instructions or terminology anywhere in it', () => {
    const idx = PANEL_SOURCE.indexOf('{pickerSupported ? (')
    const body = PANEL_SOURCE.slice(idx, PANEL_SOURCE.indexOf(') : (', idx))
    expect(body).toContain('<h3>Choose from Contacts</h3>')
    expect(body).toContain('Select a contact from your phone and we&apos;ll prefill the details for you to review.')
    expect(body).not.toMatch(/iPhone|Contacts app|Share Contact|Save to Files|propCrewImportSteps/i)
  })

  it('the primary button reads "Choose from Contacts" (busy state: "Opening contacts…"), matching its own heading', () => {
    expect(PANEL_SOURCE).toContain("onClick={() => void pickFromContacts()}>{pickerBusy ? 'Opening contacts…' : 'Choose from Contacts'}</button>")
  })

  it('"Enter Manually" is present as the secondary action on the supported-device path too, unconditionally', () => {
    const idx = PANEL_SOURCE.indexOf('<div className="addDocumentOption">\n                <h3>Enter Manually</h3>')
    expect(idx).toBeGreaterThan(-1)
  })
})

describe('UX polish pass — Import Contact Card action (the primary iPhone/unsupported-device action)', () => {
  it('the button reads "Import Contact Card" (busy state: "Reading file…") and includes a short helper line beneath it', () => {
    expect(PANEL_SOURCE).toContain("onClick={() => vcardInputRef.current?.click()}>{vcardBusy ? 'Reading file…' : 'Import Contact Card'}</button>")
    expect(PANEL_SOURCE).toContain('<p className="muted propCrewImportHelper">Choose the contact file you saved from Contacts.</p>')
  })

  it('none of the fallback UI uses warning/error styling for the normal (non-error) state — only the existing shared .errorMessage class is used, and only when something actually failed', () => {
    const idx = PANEL_SOURCE.indexOf('Import from iPhone Contacts')
    const body = PANEL_SOURCE.slice(idx, PANEL_SOURCE.indexOf('propCrewImportFutureNote') + 50)
    expect(body).not.toMatch(/className="[^"]*\b(warning|danger|pillBad)\b/)
  })
})

describe('vCard import wiring', () => {
  it('the file input requests only a vCard file, is hidden, and is triggered by a real button click (a genuine user gesture, required for the file picker to open)', () => {
    expect(PANEL_SOURCE).toContain('accept=".vcf,text/vcard,text/x-vcard"')
    expect(PANEL_SOURCE).toContain('hidden onChange={(e) => void handleVCardFile(e)}')
    expect(PANEL_SOURCE).toContain('onClick={() => vcardInputRef.current?.click()}')
  })

  it('handleVCardFile no-ops when no file was actually selected (e.g. the user cancelled the OS file picker) — no draft set, no form opened', () => {
    const idx = PANEL_SOURCE.indexOf('async function handleVCardFile')
    const body = PANEL_SOURCE.slice(idx, PANEL_SOURCE.indexOf('async function pickFromContacts'))
    expect(body).toContain('if (!file) return')
  })

  it('resets the input value after reading so selecting the exact same file again still fires onChange', () => {
    const idx = PANEL_SOURCE.indexOf('async function handleVCardFile')
    const body = PANEL_SOURCE.slice(idx, idx + 400)
    expect(body).toContain("e.target.value = ''")
  })

  it('reads the file client-side (file.text()) and hands it to the pure parseVCardFile() — never uploads the file anywhere', () => {
    expect(PANEL_SOURCE).toContain("import { parseVCardFile } from '../lib/propcrew/vcard'")
    const idx = PANEL_SOURCE.indexOf('async function handleVCardFile')
    const body = PANEL_SOURCE.slice(idx, idx + 800)
    expect(body).toContain('const text = await file.text()')
    expect(body).toContain('const result = parseVCardFile(text)')
    expect(body).not.toMatch(/fetch\(|supabase\.storage/)
  })

  it('a rejected file (no_card/multiple_cards/empty_card) shows an explanatory error and never opens the Add form', () => {
    const idx = PANEL_SOURCE.indexOf('async function handleVCardFile')
    const body = PANEL_SOURCE.slice(idx, PANEL_SOURCE.indexOf('async function pickFromContacts'))
    expect(body).toContain("if (!result.ok) {")
    expect(body).toContain("result.reason === 'multiple_cards'")
    expect(body).toContain("result.reason === 'empty_card'")
    expect(body).not.toMatch(/result\.ok[\s\S]{0,20}setShowForm/)
  })

  it('a successful single-value parse routes through the exact same applyImportCandidate() as the native picker — one prefill pipeline, not two', () => {
    const idx = PANEL_SOURCE.indexOf('async function handleVCardFile')
    const body = PANEL_SOURCE.slice(idx, PANEL_SOURCE.indexOf('async function pickFromContacts'))
    expect(body).toContain("applyImportCandidate(candidate, candidate.phones[0] || '', candidate.emails[0] || '')")
  })

  it('a vCard result with more than one phone or email routes through the SAME multi-value picker the Contact Picker path uses, never a second implementation', () => {
    const idx = PANEL_SOURCE.indexOf('async function handleVCardFile')
    const body = PANEL_SOURCE.slice(idx, PANEL_SOURCE.indexOf('async function pickFromContacts'))
    expect(body).toContain('candidate.phones.length > 1 || candidate.emails.length > 1')
    expect(body).toContain('setMultiValueCandidate(candidate)')
  })

  it('a read/parse exception is caught and shown as a friendly error, manual entry stays available — never an unhandled crash', () => {
    const idx = PANEL_SOURCE.indexOf('async function handleVCardFile')
    const body = PANEL_SOURCE.slice(idx, PANEL_SOURCE.indexOf('async function pickFromContacts'))
    expect(body).toContain('} catch {')
    expect(body).toContain('You can still add this contact manually.')
  })
})

describe('Company/business prefill — only when the source actually provided one, never invented', () => {
  it('applyImportCandidate() prefills businessName from candidate.businessName, falling back to empty (not undefined/omitted) for the draft field', () => {
    expect(PANEL_SOURCE).toContain("businessName: candidate.businessName || '', phone, email,")
  })

  it('no code path fabricates a business name from the contact\'s own name or email', () => {
    const idx = PANEL_SOURCE.indexOf('function applyImportCandidate')
    const body = PANEL_SOURCE.slice(idx, idx + 500)
    expect(body).not.toMatch(/businessName:\s*candidate\.name/)
    expect(body).not.toMatch(/businessName:\s*candidate\.emails?/)
  })
})

describe('No autosave: import only ever prefills the existing review form; Save stays the one explicit write', () => {
  it('handleVCardFile never calls save() or writes to Supabase directly', () => {
    const idx = PANEL_SOURCE.indexOf('async function handleVCardFile')
    const body = PANEL_SOURCE.slice(idx, PANEL_SOURCE.indexOf('async function pickFromContacts'))
    expect(body).not.toMatch(/\bsave\(/)
    expect(body).not.toContain('supabase.from')
  })

  it('the Save button in the Add/Edit form is still the only thing that calls save(), unconditioned on where the draft came from', () => {
    expect(PANEL_SOURCE).toContain('onClick={() => void save()}')
  })
})

describe('Section 5 — deterministic duplicate-avoidance on new-contact Save, never fuzzy, never automatic', () => {
  it('save() checks findExactContactMatch only when creating (not editingId) and not forced, and shows the confirmation instead of inserting', () => {
    expect(PANEL_SOURCE).toContain("import { findExactContactMatch } from '../lib/propcrew/dedupe'")
    const idx = PANEL_SOURCE.indexOf('async function save(force')
    const body = PANEL_SOURCE.slice(idx, idx + 400)
    expect(body).toContain('if (!editingId && !force) {')
    expect(body).toContain('const match = findExactContactMatch(contacts, draft.phone, draft.email)')
    expect(body).toContain('if (match) { setDedupeMatch(match); return }')
  })

  it('editing an existing contact never triggers the dedupe check against itself', () => {
    const idx = PANEL_SOURCE.indexOf('async function save(force')
    const body = PANEL_SOURCE.slice(idx, idx + 300)
    expect(body).toMatch(/if \(!editingId && !force\)/)
  })

  it('"Create new anyway" is an explicit override that proceeds with the original insert, not an automatic merge', () => {
    const idx = PANEL_SOURCE.indexOf('Use existing contact?')
    const body = PANEL_SOURCE.slice(idx, idx + 900)
    expect(body).toContain('Create new anyway')
    expect(body).toContain('void save(true)')
    expect(body).toContain('Use existing contact')
  })

  it('useDedupeMatch() only ever writes to property_contact_links — never a second property_contacts row, and never edits the existing row\'s own fields', () => {
    const idx = PANEL_SOURCE.indexOf('async function useDedupeMatch')
    const body = PANEL_SOURCE.slice(idx, PANEL_SOURCE.indexOf('async function linkExistingContact'))
    expect(body).toContain("supabase.from('property_contact_links').insert(")
    expect(body).not.toContain("supabase.from('property_contacts')")
  })

  it('useDedupeMatch() only links properties the match ISN\'T already associated with, and skips the write entirely when there is nothing new to link', () => {
    const idx = PANEL_SOURCE.indexOf('async function useDedupeMatch')
    const body = PANEL_SOURCE.slice(idx, PANEL_SOURCE.indexOf('async function linkExistingContact'))
    expect(body).toContain('const alreadyLinkedIds = propertyIdsFor(dedupeMatch)')
    expect(body).toContain('const newPropertyIds = draft.propertyIds.filter((id) => !alreadyLinkedIds.includes(id))')
    expect(body).toContain('if (newPropertyIds.length) {')
  })

  it('useDedupeMatch() refreshes local state and notifies the parent (onChanged) exactly like a normal save, so the maintenance assignment dropdown picks up the link immediately', () => {
    const idx = PANEL_SOURCE.indexOf('async function useDedupeMatch')
    const body = PANEL_SOURCE.slice(idx, PANEL_SOURCE.indexOf('async function linkExistingContact'))
    expect(body).toContain('await load()')
    expect(body).toContain('onChanged?.()')
  })
})

describe('Section 9 — "Link Existing Contact": reuse an existing provider for another property, no re-typing, no duplicate row', () => {
  it('linkableContacts is every contact NOT already associated with scopePropertyId, and is always empty when scopePropertyId is unset (no "this property" to link to from the portfolio-wide directory)', () => {
    const idx = PANEL_SOURCE.indexOf('const linkableContacts = useMemo')
    const body = PANEL_SOURCE.slice(idx, idx + 400)
    expect(body).toContain('if (!scopePropertyId) return []')
    expect(body).toContain('return contacts.filter((c) => !propertyIdsFor(c).includes(scopePropertyId))')
  })

  it('the "Link Existing Contact" button only renders when there is at least one linkable contact', () => {
    const matches = [...PANEL_SOURCE.matchAll(/linkableContacts\.length > 0 && <button/g)]
    expect(matches.length).toBeGreaterThanOrEqual(2) // header + empty-state
  })

  it('linkExistingContact() writes only to property_contact_links, scoped to scopePropertyId, never a new property_contacts row, and refuses to run when scopePropertyId is unset', () => {
    const idx = PANEL_SOURCE.indexOf('async function linkExistingContact')
    const body = PANEL_SOURCE.slice(idx, PANEL_SOURCE.indexOf('// Selecting "NO" must never'))
    expect(body).toContain('if (!supabase || !scopePropertyId) return')
    expect(body).toContain("supabase.from('property_contact_links').insert({ contact_id: contactId, property_id: scopePropertyId, owner_id: ownerId })")
    expect(body).not.toContain("supabase.from('property_contacts')")
  })

  it('linkExistingContact() refreshes local state and notifies the parent so the newly linked contact becomes assignable in Maintenance without a manual reload', () => {
    const idx = PANEL_SOURCE.indexOf('async function linkExistingContact')
    const body = PANEL_SOURCE.slice(idx, PANEL_SOURCE.indexOf('// Selecting "NO" must never'))
    expect(body).toContain('await load()')
    expect(body).toContain('onChanged?.()')
  })

  it('the existing contact\'s own fields (name, business, role, notes, history) are never edited by linking — only an association row is written', () => {
    const idx = PANEL_SOURCE.indexOf('async function linkExistingContact')
    const body = PANEL_SOURCE.slice(idx, PANEL_SOURCE.indexOf('// Selecting "NO" must never'))
    expect(body).not.toContain('.update(')
  })

  it('the search box filters by name, business name, and role/category', () => {
    const idx = PANEL_SOURCE.indexOf('const filteredLinkableContacts = useMemo')
    const body = PANEL_SOURCE.slice(idx, idx + 300)
    expect(body).toContain('`${c.name} ${c.business_name || \'\'} ${c.role}`')
  })
})

describe('Privacy (Section 7): unchanged guarantees still hold for the new code', () => {
  it('no new file references a bulk/whole-address-book API, third-party contact sync, or a service-role/admin client', () => {
    for (const source of [PANEL_SOURCE, readFileSync(join(ROOT, 'lib/propcrew/vcard.ts'), 'utf8'), readFileSync(join(ROOT, 'lib/propcrew/dedupe.ts'), 'utf8')]) {
      expect(source).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE|supabaseAdmin/)
      expect(source).not.toMatch(/carddav|google\.com\/contacts|contacts-sync|oauth/i)
    }
  })

  it('lib/propcrew/vcard.ts is pure — no DOM, no network, no Supabase — the file is read by the component, this module only ever receives already-read text', () => {
    const source = readFileSync(join(ROOT, 'lib/propcrew/vcard.ts'), 'utf8')
    expect(source).not.toMatch(/fetch\(|XMLHttpRequest|supabase|document\.|window\./)
  })

  it('lib/propcrew/dedupe.ts is pure — no Supabase, no network — it only ever compares already-fetched, already-scoped contacts the caller passes in', () => {
    const source = readFileSync(join(ROOT, 'lib/propcrew/dedupe.ts'), 'utf8')
    expect(source).not.toMatch(/fetch\(|supabase/)
  })

  it('no contact data is written to Supabase until an explicit write action (Save, Use existing contact, or Link) — nothing in the import/parse path writes on its own', () => {
    expect(PANEL_SOURCE.match(/from\('property_contacts'\)\.insert/g)?.length).toBe(1)
    // Exactly three writers to property_contact_links: the original
    // multi-property save() path, useDedupeMatch(), and
    // linkExistingContact() — each gated behind its own explicit tap.
    expect(PANEL_SOURCE.match(/from\('property_contact_links'\)\.insert/g)?.length).toBe(3)
  })

  it('every new write still carries owner_id from the ownerId prop (the caller\'s own authenticated identity) — never a client-suppliable value', () => {
    for (const fn of ['async function useDedupeMatch', 'async function linkExistingContact']) {
      const idx = PANEL_SOURCE.indexOf(fn)
      const body = PANEL_SOURCE.slice(idx, idx + 900)
      expect(body).toMatch(/owner_id:\s*ownerId/)
    }
  })
})

describe('No provider outreach anywhere in the new code (unchanged from M3)', () => {
  it('none of the new functions send a message, create a token, or imply scheduling/acceptance', () => {
    for (const fn of ['async function handleVCardFile', 'async function useDedupeMatch', 'async function linkExistingContact']) {
      const idx = PANEL_SOURCE.indexOf(fn)
      const body = PANEL_SOURCE.slice(idx, idx + 900)
      expect(body).not.toMatch(/property_messages|access_token|provider_token|notifyTenantConnect|schedule_appointment/i)
    }
  })
})

describe('Mobile UX: existing visual language reused, no new desktop-only pattern', () => {
  it('the "Link Existing Contact" list and vCard chooser reuse the existing .overlay/.modal pattern, not a new one-off dialog', () => {
    const idx = PANEL_SOURCE.indexOf('{showLinkExisting && (')
    const body = PANEL_SOURCE.slice(idx, idx + 400)
    expect(body).toContain('className="overlay"')
    expect(body).toContain('className="modal"')
  })

  it('no <table> introduced anywhere in this file', () => {
    expect(PANEL_SOURCE).not.toContain('<table')
  })
})
