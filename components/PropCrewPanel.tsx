'use client'

// PropRoster — PropCrew (Sections 10-13).
//
// PropCrew is the owner's private historical directory of service
// providers — NOT a marketplace, NOT public reviews (Part 10). Backed by
// the EXISTING property_contacts table, evolved rather than duplicated
// (see supabase/milestone-11-property-profile-2.sql's Section 10-13
// commentary) — property_contacts already had exactly this shape
// (name/business_name/role/phone/email/website/notes); this migration
// only added would_use_again/experience_note plus a
// property_contact_links join table so one provider can serve multiple
// properties (Part 10).
//
// Self-contained: does its own Supabase reads/writes (same pattern as
// DocumentIntelligencePanel). Works in two contexts from the same
// component — pass `scopePropertyId` to show only that property's
// providers (the per-property People tab); omit it for the full
// portfolio-wide directory (app/propcrew/page.tsx).
//
// Property Profile / PropCrew UX Improvement: "Add from Contacts" is now
// implemented, superseding the prior QA finding below (kept for the
// full history — the underlying platform-support facts it found are
// still exactly true, and still exactly why this stays feature-detected
// rather than always shown).
//
// Prior QA audit (phone contact picker, at that time deliberately NOT
// implemented): the W3C Contact Picker API (navigator.contacts.select())
// is what a "Choose from Contacts" button would need — it's only
// implemented in Chromium on Android; Safari (desktop and iOS) has never
// shipped it, and this app's primary mobile web target is iOS Safari.
// There is no reliable, secure way to do single-contact selection from
// the mobile web on that target today, and the privacy requirement here
// (import ONLY the one contact the user explicitly picks — never request
// broad address-book access) rules out any broader-permission
// workaround. What changed: rather than leaving the option out
// entirely, it's now real feature-detected (isContactPickerSupported,
// lib/propcrew/contact-picker.ts) — "Add from Contacts" only ever
// appears on the Chromium-Android browsers that actually support it;
// every other browser (iOS Safari included) sees the exact same
// manual-entry-only workflow this component always had. This is NOT a
// workaround for iOS — there isn't one on the web platform today — it's
// the feature working correctly where the platform allows it, and
// staying invisible everywhere else, per this milestone's own explicit
// "do not show a broken control" requirement. The real fix for iOS
// remains native contact picking in a future PropRoster iOS app; this
// component was already the natural extension point for that (see
// `prefill`/`onPrefillConsumed` below), and still is.
//
// PropCrew Mobile Contact Import V1 — re-confirmed the above by direct
// audit (isContactPickerSupported's own two-part spec check; nothing in
// this codebase or an installed-as-PWA context changes it — WebKit is
// WebKit whether the site is opened in Safari or added to the Home
// Screen) and adds two things real-device iPhone testing showed were
// still missing:
//   1. An iOS/other-unsupported-browser fallback that's a genuine
//      upgrade over typing everything by hand — importing a
//      user-exported vCard (.vcf) file (lib/propcrew/vcard.ts) — shown
//      with a brief, honest explanation instead of silently skipping
//      straight past any chooser (Section 3's own "do not leave a
//      button that appears broken, but also do not pretend the native
//      picker exists" instruction). Investigated and rejected: any
//      approach that would need broader address-book access, an
//      undocumented API, or scraping — none exist safely on the web
//      platform for iOS today.
//   2. Deterministic (never fuzzy/AI) duplicate avoidance
//      (lib/propcrew/dedupe.ts) plus an explicit "Link Existing
//      Contact" entry point, so the same HVAC company/handyman doesn't
//      need to be re-entered for every property one property_contacts
//      row can already legally serve via property_contact_links.

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PROPCREW_PRIVACY_DISCLOSURE, PROPCREW_PRIVATE_NOTE_LABEL, REUSE_PREFERENCE_LABELS, REUSE_PREFERENCE_OPTIONS, reusePreferenceTone, type ReusePreference } from '../lib/propcrew/reuse-preference'
import { isContactPickerSupported, normalizeContactPickerResult, type ContactPickerResult, type PropCrewImportCandidate } from '../lib/propcrew/contact-picker'
import { parseVCardFile } from '../lib/propcrew/vcard'
import { findExactContactMatch } from '../lib/propcrew/dedupe'

export const PROPCREW_CATEGORIES = [
  'HVAC', 'Plumbing', 'Electrical', 'Roofing', 'Handyman', 'Landscaping', 'Pest Control',
  'Pool Service', 'Cleaning', 'General Contractor', 'Inspector', 'Realtor', 'Insurance Agent',
  'Lender', 'Attorney', 'CPA/Accountant', 'Property Manager', 'HOA/Association Contact', 'Other',
] as const

export type PropCrewContact = {
  id: string
  property_id: string
  owner_id: string
  name: string
  business_name: string | null
  role: string
  phone: string | null
  email: string | null
  website: string | null
  notes: string | null
  would_use_again: ReusePreference | null
  experience_note: string | null
  created_at: string
}

type ContactLink = { contact_id: string; property_id: string }
type MaintenanceForHistory = { id: string; propcrew_contact_id: string | null; service_date: string; cost: number }
type SystemForHistory = { id: string; propcrew_contact_id: string | null; cost: number | null }
type PropertyRef = { id: string; address: string; city: string }

const normalizeUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`)

const emptyDraft = {
  name: '', businessName: '', role: 'HVAC' as string, phone: '', email: '', website: '', notes: '',
  wouldUseAgain: '' as '' | ReusePreference, experienceNote: '', propertyIds: [] as string[],
}

export type PropCrewPrefill = { name: string; businessName?: string; phone?: string; email?: string; website?: string }

export function PropCrewPanel({
  ownerId, properties, scopePropertyId, onChanged, prefill, onPrefillConsumed, showHeader = true,
}: {
  ownerId: string
  properties: PropertyRef[]
  scopePropertyId?: string
  /** Optional — lets a parent that ALSO keeps its own copy of property_contacts (e.g. for a document-intelligence "already a contact?" check, or a system's provider dropdown) refresh after a PropCrew add/edit/delete here, so the two never drift out of sync. */
  onChanged?: () => void
  /** Opens the Add form pre-filled — used by Document Intelligence's "Add this business to PropCrew" apply action (see app/page.tsx's applyExtractedToModule). */
  prefill?: PropCrewPrefill | null
  onPrefillConsumed?: () => void
  /** QA: default true (unchanged behavior — the property workspace's
   * People tab has no PropCrew heading of its own, so this panel's is the
   * only one there). app/propcrew/page.tsx passes false: that page
   * already has its own "PROPCREW" intro immediately above this panel —
   * showing both back-to-back was the reported redundant-intro bug. The
   * "+ Add to PropCrew" button always renders either way. */
  showHeader?: boolean
}) {
  const [contacts, setContacts] = useState<PropCrewContact[]>([])
  const [links, setLinks] = useState<ContactLink[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceForHistory[]>([])
  const [systems, setSystems] = useState<SystemForHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [busy, setBusy] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Property Profile / PropCrew UX Improvement: "Add from Contacts."
  // pickerSupported is computed once on mount (client-only — navigator/
  // window don't exist during SSR) via the real spec/MDN feature-detection
  // check, never a browser/OS guess. showAddChooser is the small
  // "Add from Contacts / Enter Manually" first step; it's skipped
  // entirely (openAddChooser jumps straight to the existing manual form)
  // on any browser where the picker isn't supported — never a chooser
  // with a dead option.
  const [pickerSupported, setPickerSupported] = useState(false)
  const [showAddChooser, setShowAddChooser] = useState(false)
  const [pickerBusy, setPickerBusy] = useState(false)
  const [pickerError, setPickerError] = useState('')
  // Set only when the picked contact has more than one phone AND/OR more
  // than one email — the small "which one?" step (Section "If a selected
  // contact has multiple phone numbers or email addresses..."). Never
  // silently guesses; null the rest of the time (single or zero values
  // go straight into the form).
  const [multiValueCandidate, setMultiValueCandidate] = useState<PropCrewImportCandidate | null>(null)
  const [multiValueChoice, setMultiValueChoice] = useState<{ phone: string; email: string }>({ phone: '', email: '' })

  // PropCrew Mobile Contact Import V1 — the iOS/unsupported-browser
  // fallback: a user-selected .vcf file, read and parsed entirely
  // client-side (lib/propcrew/vcard.ts). vcardInputRef is a hidden
  // <input type=file>, clicked programmatically from a real button so
  // the file picker still opens from a genuine user gesture.
  const vcardInputRef = useRef<HTMLInputElement | null>(null)
  const [vcardBusy, setVcardBusy] = useState(false)
  const [vcardError, setVcardError] = useState('')

  // "Link Existing Contact" (Section 9) — a SEPARATE entry point from
  // "+ Add to PropCrew," not a third option crowding that chooser
  // (which stays exactly the two options the milestone specifies).
  // Only ever rendered when scopePropertyId is set (there is no "this
  // property" to link to from the unscoped, portfolio-wide directory)
  // and at least one existing contact isn't already associated with it.
  const [showLinkExisting, setShowLinkExisting] = useState(false)
  const [linkFilter, setLinkFilter] = useState('')

  // Deterministic duplicate-avoidance (Section 5) — set when save()
  // finds an existing contact whose normalized phone/email exactly
  // matches the draft being created (never on an edit — see save()).
  // Never merges automatically; only offers the choice.
  const [dedupeMatch, setDedupeMatch] = useState<PropCrewContact | null>(null)

  useEffect(() => {
    setPickerSupported(isContactPickerSupported(typeof navigator === 'undefined' ? undefined : navigator, typeof window === 'undefined' ? undefined : window))
  }, [])

  useEffect(() => {
    if (!prefill) return
    setDraft({ ...emptyDraft, name: prefill.name, businessName: prefill.businessName || '', phone: prefill.phone || '', email: prefill.email || '', website: prefill.website || '', propertyIds: scopePropertyId ? [scopePropertyId] : [] })
    setEditingId(null)
    setShowForm(true)
    onPrefillConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill])

  async function load() {
    if (!supabase) return
    setLoading(true)
    const [{ data: contactRows, error: contactError }, { data: linkRows }, { data: maintenanceRows }, { data: systemRows }] = await Promise.all([
      supabase.from('property_contacts').select('*').order('name', { ascending: true }),
      supabase.from('property_contact_links').select('contact_id, property_id'),
      supabase.from('maintenance_records').select('id, propcrew_contact_id, service_date, cost'),
      supabase.from('property_systems').select('id, propcrew_contact_id, cost'),
    ])
    if (contactError) setError(contactError.message)
    setContacts((contactRows || []) as PropCrewContact[])
    setLinks((linkRows || []) as ContactLink[])
    setMaintenance((maintenanceRows || []) as MaintenanceForHistory[])
    setSystems((systemRows || []) as SystemForHistory[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [ownerId])

  const propertiesById = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties])

  function propertyIdsFor(contact: PropCrewContact): string[] {
    const ids = new Set<string>([contact.property_id])
    for (const link of links) if (link.contact_id === contact.id) ids.add(link.property_id)
    return [...ids].filter((id) => propertiesById.has(id))
  }

  const visibleContacts = useMemo(() => {
    const list = scopePropertyId ? contacts.filter((c) => propertyIdsFor(c).includes(scopePropertyId)) : contacts
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, links, scopePropertyId])

  // Section 9 — every existing contact NOT already associated with
  // THIS property (i.e. every one "Link Existing Contact" could
  // actually add here). Always [] when scopePropertyId isn't set —
  // there is no single "this property" to link to from the unscoped,
  // portfolio-wide directory.
  const linkableContacts = useMemo(() => {
    if (!scopePropertyId) return []
    return contacts.filter((c) => !propertyIdsFor(c).includes(scopePropertyId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, links, scopePropertyId])

  const filteredLinkableContacts = useMemo(() => {
    const q = linkFilter.trim().toLowerCase()
    if (!q) return linkableContacts
    return linkableContacts.filter((c) => `${c.name} ${c.business_name || ''} ${c.role}`.toLowerCase().includes(q))
  }, [linkableContacts, linkFilter])

  function serviceHistoryFor(contactId: string) {
    const records = maintenance.filter((m) => m.propcrew_contact_id === contactId)
    const linkedSystems = systems.filter((s) => s.propcrew_contact_id === contactId)
    const lastServiceDate = records.map((r) => r.service_date).sort().at(-1) || null
    const documentedSpend = records.reduce((sum, r) => sum + Number(r.cost || 0), 0) + linkedSystems.reduce((sum, s) => sum + Number(s.cost || 0), 0)
    return { serviceCount: records.length, lastServiceDate, documentedSpend, systemsCount: linkedSystems.length }
  }

  function openAdd() {
    setDraft({ ...emptyDraft, propertyIds: scopePropertyId ? [scopePropertyId] : [] })
    setEditingId(null)
    setShowForm(true)
    setError('')
  }

  // The "+ Add to PropCrew" entry point. PropCrew Mobile Contact Import
  // V1: the chooser is now ALWAYS shown (previously skipped entirely
  // when the Contact Picker API was unsupported) — every browser now
  // has at least one real, working import path (native picker on
  // Chromium/Android, vCard import everywhere else) plus manual entry,
  // so there is never a chooser with a dead option, and iOS no longer
  // silently loses the chooser step it never had a use for before.
  function openAddChooser() {
    setError('')
    setPickerError('')
    setVcardError('')
    setShowAddChooser(true)
  }

  function closeAddChooser() {
    setShowAddChooser(false)
    setPickerError('')
    setVcardError('')
  }

  // Populates the SAME draft/showForm the manual "+ Add to PropCrew" flow
  // already uses — the review-before-save form is identical either way,
  // every field stays editable, and Save is still the one explicit
  // action that writes anything (Section "Do not automatically save
  // anything merely because a contact was selected"). businessName is
  // only ever set when the source actually provided one (vCard ORG) —
  // never invented (Contact Picker never provides it at all, so that
  // path's candidate has no businessName key and this falls back to '').
  function applyImportCandidate(candidate: PropCrewImportCandidate, phone: string, email: string) {
    setDraft({ ...emptyDraft, name: candidate.name, businessName: candidate.businessName || '', phone, email, propertyIds: scopePropertyId ? [scopePropertyId] : [] })
    setEditingId(null)
    setShowForm(true)
    setShowAddChooser(false)
    setMultiValueCandidate(null)
    setPickerError('')
    setVcardError('')
  }

  // The iOS/unsupported-browser fallback: read the ONE file the user
  // explicitly selected (nothing else is ever touched), parse it
  // entirely client-side, and route through the exact same
  // applyImportCandidate()/multi-value-picker path as the native
  // Contact Picker result — one prefill pipeline, not two.
  async function handleVCardFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later (onChange only fires on a value change otherwise)
    if (!file) return
    setVcardError('')
    setVcardBusy(true)
    try {
      const text = await file.text()
      const result = parseVCardFile(text)
      setVcardBusy(false)
      if (!result.ok) {
        if (result.reason === 'multiple_cards') setVcardError('That file has more than one contact. Export and select just one contact’s card, then try again.')
        else if (result.reason === 'empty_card') setVcardError('That contact card has no name, phone, or email to import.')
        else setVcardError('That doesn’t look like a contact card (.vcf) file.')
        return
      }
      const { candidate } = result
      if (candidate.phones.length > 1 || candidate.emails.length > 1) {
        setMultiValueCandidate(candidate)
        setMultiValueChoice({ phone: candidate.phones[0] || '', email: candidate.emails[0] || '' })
        return
      }
      applyImportCandidate(candidate, candidate.phones[0] || '', candidate.emails[0] || '')
    } catch {
      setVcardBusy(false)
      setVcardError('Could not read that file. You can still add this contact manually.')
    }
  }

  // The one real Contact Picker API call in this component — everything
  // else (support detection, result normalization) is the pure,
  // unit-tested lib/propcrew/contact-picker.ts. Only ever requests name/
  // tel/email (Section "request only fields that are useful..."), never
  // `multiple: true` (Section "the user should explicitly select the
  // contact they want to import" — one at a time, never a batch).
  async function pickFromContacts() {
    setPickerBusy(true)
    setPickerError('')
    try {
      const nav = navigator as Navigator & { contacts: { select: (props: string[], opts?: { multiple?: boolean }) => Promise<ContactPickerResult[]> } }
      const results = await nav.contacts.select(['name', 'tel', 'email'], { multiple: false })
      setPickerBusy(false)
      if (!results || !results.length) return // user cancelled the native picker — stay on the chooser
      const candidate = normalizeContactPickerResult(results[0])
      if (candidate.phones.length > 1 || candidate.emails.length > 1) {
        // More than one number/email on file — let the user pick which
        // one, never silently choosing the first (Section "provide a
        // sensible way for the user to select which one should be used
        // rather than silently choosing potentially incorrect
        // information").
        setMultiValueCandidate(candidate)
        setMultiValueChoice({ phone: candidate.phones[0] || '', email: candidate.emails[0] || '' })
        return
      }
      applyImportCandidate(candidate, candidate.phones[0] || '', candidate.emails[0] || '')
    } catch (err) {
      setPickerBusy(false)
      // AbortError is the user backing out of the native picker (or
      // denying the one-time permission prompt) — not a real failure,
      // never surfaced as an error; manual entry is still one tap away.
      if ((err as { name?: string })?.name === 'AbortError') return
      setPickerError('Could not import that contact. You can still add it manually.')
    }
  }

  function openEdit(contact: PropCrewContact) {
    setDraft({
      name: contact.name, businessName: contact.business_name || '', role: contact.role, phone: contact.phone || '', email: contact.email || '',
      website: contact.website || '', notes: contact.notes || '', wouldUseAgain: contact.would_use_again || '', experienceNote: contact.experience_note || '',
      propertyIds: propertyIdsFor(contact),
    })
    setEditingId(contact.id)
    setShowForm(true)
    setError('')
  }

  // Section 5 — deterministic duplicate-avoidance, new contacts only.
  // Never runs on an edit (editingId set): editing an existing row's
  // own phone/email can never be "a duplicate of itself," and this
  // must never block a legitimate edit. `force` is set only by the
  // dedupe-confirmation modal's own "Create new anyway" action — the
  // landlord's explicit override for the rare case of two real people
  // who happen to share a phone/email (e.g. a shared office line).
  async function save(force = false) {
    if (!supabase || !draft.name.trim() || !draft.propertyIds.length) return
    if (!editingId && !force) {
      const match = findExactContactMatch(contacts, draft.phone, draft.email)
      if (match) { setDedupeMatch(match); return }
    }
    setBusy(true)
    setError('')
    const [primaryPropertyId, ...otherPropertyIds] = draft.propertyIds
    const payload = {
      owner_id: ownerId,
      property_id: primaryPropertyId,
      name: draft.name.trim(),
      business_name: draft.businessName.trim() || null,
      role: draft.role,
      phone: draft.phone.trim() || null,
      email: draft.email.trim() || null,
      website: draft.website.trim() || null,
      notes: draft.notes.trim() || null,
      would_use_again: draft.wouldUseAgain || null,
      experience_note: draft.experienceNote.trim() || null,
    }

    let contactId = editingId
    if (editingId) {
      const { error: saveError } = await supabase.from('property_contacts').update(payload).eq('id', editingId)
      if (saveError) { setError(saveError.message); setBusy(false); return }
      await supabase.from('property_contact_links').delete().eq('contact_id', editingId)
    } else {
      const { data: inserted, error: saveError } = await supabase.from('property_contacts').insert(payload).select('id').single()
      if (saveError || !inserted) { setError(saveError?.message || 'Unable to save.'); setBusy(false); return }
      contactId = inserted.id
    }

    if (contactId && otherPropertyIds.length) {
      await supabase.from('property_contact_links').insert(otherPropertyIds.map((propertyId) => ({ contact_id: contactId, property_id: propertyId, owner_id: ownerId })))
    }

    setShowForm(false)
    await load()
    onChanged?.()
    setBusy(false)
  }

  // The landlord's explicit "Use existing contact" choice from the
  // dedupe-confirmation modal — links the ALREADY-existing contact to
  // whatever properties in the draft it isn't already linked to,
  // rather than creating a second property_contacts row for the same
  // person/company. Never touches the existing row's own fields (name,
  // role, notes, would_use_again, etc.) — the draft's own edits to
  // those are discarded, exactly like "Enter Manually" was abandoned in
  // favor of the existing record, not merged into it (Section 5: "Do
  // not merge records automatically").
  async function useDedupeMatch() {
    if (!supabase || !dedupeMatch) return
    setBusy(true)
    setError('')
    const alreadyLinkedIds = propertyIdsFor(dedupeMatch)
    const newPropertyIds = draft.propertyIds.filter((id) => !alreadyLinkedIds.includes(id))
    if (newPropertyIds.length) {
      const { error: linkError } = await supabase.from('property_contact_links').insert(newPropertyIds.map((propertyId) => ({ contact_id: dedupeMatch.id, property_id: propertyId, owner_id: ownerId })))
      if (linkError) { setError(linkError.message); setBusy(false); return }
    }
    setDedupeMatch(null)
    setShowForm(false)
    await load()
    onChanged?.()
    setBusy(false)
  }

  // Section 9 — links an ALREADY-existing PropCrew contact to
  // scopePropertyId with a single explicit tap, no re-typing of any of
  // that contact's details and no new property_contacts row. Only ever
  // reachable when scopePropertyId is set (see linkableContacts/the
  // "Link Existing Contact" button, both scopePropertyId-gated).
  async function linkExistingContact(contactId: string) {
    if (!supabase || !scopePropertyId) return
    setBusy(true)
    setError('')
    const { error: linkError } = await supabase.from('property_contact_links').insert({ contact_id: contactId, property_id: scopePropertyId, owner_id: ownerId })
    if (linkError) { setError(linkError.message); setBusy(false); return }
    setShowLinkExisting(false)
    setLinkFilter('')
    await load()
    onChanged?.()
    setBusy(false)
  }

  // Selecting "NO" must never delete/hide the historical record (Part 11)
  // — there is no delete-on-NO path anywhere in this component; removal
  // is always a separate, explicit action.
  async function remove(id: string) {
    if (!supabase) return
    setBusy(true)
    const { error: deleteError } = await supabase.from('property_contacts').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else { await load(); onChanged?.() }
    setBusy(false)
  }

  if (loading) return <p className="muted">Loading PropCrew…</p>

  return (
    <div className="propCrewPanel">
      <div className="sectionHead workspaceHeading">
        {showHeader ? (
          <div>
            {/* Launch Polish: approved mixed-case brand casing, an
                explicit exception for this branded product name. */}
            <p className="eyebrow">PropCrew</p>
            <h2>Your private crew directory</h2>
            <p>Every contractor, agent, lender and professional you&apos;ve worked with — {PROPCREW_PRIVACY_DISCLOSURE.toLowerCase()}</p>
          </div>
        ) : <div />}
        <div className="propCrewHeaderActions">
          {linkableContacts.length > 0 && <button className="secondary" onClick={() => setShowLinkExisting(true)}>Link Existing Contact</button>}
          <button className="primary" onClick={openAddChooser}>+ Add to PropCrew</button>
        </div>
      </div>

      {error && <div className="statusMessage errorMessage">{error}</div>}

      {visibleContacts.length ? (
        <div className="moduleGrid contactGrid">
          {visibleContacts.map((contact) => {
            const history = serviceHistoryFor(contact.id)
            const propertyLabels = propertyIdsFor(contact).map((id) => propertiesById.get(id)?.address).filter(Boolean)
            const expanded = expandedId === contact.id
            return (
              <article className="recordCard contactCard propCrewCard" key={contact.id}>
                <div className="recordTop">
                  <div>
                    <span className="statusPill">{contact.role}</span>
                    {contact.would_use_again && <span className={`reusePill reuse-${reusePreferenceTone(contact.would_use_again)}`}>Would use again: {REUSE_PREFERENCE_LABELS[contact.would_use_again]}</span>}
                    <h3>{contact.business_name || contact.name}</h3>
                    <p>{contact.business_name ? contact.name : 'No business name added'}</p>
                  </div>
                  <button className="recordDelete" onClick={() => void remove(contact.id)}>×</button>
                </div>
                <div className="contactLinks">
                  {contact.phone && <a href={`tel:${contact.phone}`}>{contact.phone}</a>}
                  {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
                  {contact.website && <a href={normalizeUrl(contact.website)} target="_blank" rel="noopener noreferrer">{contact.website}</a>}
                  {!contact.phone && !contact.email && !contact.website && <span className="muted">No contact details added</span>}
                </div>
                {!scopePropertyId && propertyLabels.length > 0 && <p className="propCrewProperties muted">Properties: {propertyLabels.join(', ')}</p>}
                {(history.serviceCount > 0 || history.systemsCount > 0) && (
                  <p className="propCrewHistory muted">
                    {history.serviceCount > 0 && `${history.serviceCount} service record${history.serviceCount === 1 ? '' : 's'}`}
                    {history.lastServiceDate && ` · Last: ${new Date(`${history.lastServiceDate}T12:00:00`).toLocaleDateString()}`}
                    {history.documentedSpend > 0 && ` · $${history.documentedSpend.toLocaleString()} documented`}
                  </p>
                )}
                <button type="button" className="propCrewToggle" onClick={() => setExpandedId(expanded ? null : contact.id)}>{expanded ? 'Hide details' : 'View details'}</button>
                {expanded && (
                  <div className="propCrewDetails">
                    {contact.experience_note ? (
                      <div className="propCrewExperienceNote">
                        <span>{PROPCREW_PRIVATE_NOTE_LABEL}</span>
                        <p>{contact.experience_note}</p>
                      </div>
                    ) : <p className="muted">No private note added yet.</p>}
                    {contact.notes && <div className="recordRows"><div><span>Notes</span><strong>{contact.notes}</strong></div></div>}
                    <button className="secondary" onClick={() => openEdit(contact)}>Edit</button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="emptyModule"><strong>No PropCrew providers yet</strong><span>Add contractors, agents, lenders and other professionals as you work with them.</span><div className="propCrewHeaderActions">{linkableContacts.length > 0 && <button className="secondary" onClick={() => setShowLinkExisting(true)}>Link Existing Contact</button>}<button className="primary" onClick={openAddChooser}>+ Add to PropCrew</button></div></div>
      )}

      {/* PropCrew Mobile Contact Import V1: the first step, ALWAYS
          shown now — "Choose from Contacts" (native picker) OR "Import
          Contact Card" (vCard fallback), whichever this browser
          actually supports, plus "Enter Manually." Never both import
          options at once, and never a native-picker button on a
          browser that doesn't support it (Section 3: "never claim
          contact access is available when it is not") — pickerSupported
          alone decides which import option renders. */}
      {showAddChooser && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && closeAddChooser()}>
          <div className="modal addDocumentModal">
            <div className="modalTop"><div><p className="eyebrow">PROPCREW</p><h2>Add a PropCrew member</h2></div><button className="iconButton" onClick={closeAddChooser}>×</button></div>
            {pickerError && <p className="errorMessage">{pickerError}</p>}
            {vcardError && <p className="errorMessage">{vcardError}</p>}
            {!pickerSupported && (
              <p className="muted propCrewPickerUnsupportedNote">This browser can&apos;t open your contacts directly. In your Contacts app, share the contact and save it as a file, then import that file below — or enter the details yourself.</p>
            )}
            <div className="addDocumentChooser">
              {pickerSupported ? (
                <div className="addDocumentOption addDocumentOptionSmart">
                  <h3>Choose from Contacts</h3>
                  <p>Choose one contact from your device — only that contact&apos;s name, phone and email are imported, nothing else from your address book.</p>
                  <button className="primary" disabled={pickerBusy} onClick={() => void pickFromContacts()}>{pickerBusy ? 'Opening contacts…' : 'Choose a contact'}</button>
                </div>
              ) : (
                <div className="addDocumentOption addDocumentOptionSmart">
                  <h3>Import Contact Card</h3>
                  <p>Select a contact card (.vcf) file you&apos;ve saved from your Contacts app — only that one file is read, nothing else from your address book.</p>
                  <input ref={vcardInputRef} type="file" accept=".vcf,text/vcard,text/x-vcard" hidden onChange={(e) => void handleVCardFile(e)} />
                  <button className="primary" disabled={vcardBusy} onClick={() => vcardInputRef.current?.click()}>{vcardBusy ? 'Reading file…' : 'Import a contact card'}</button>
                </div>
              )}
              <div className="addDocumentOption">
                <h3>Enter Manually</h3>
                <p>Type in their name, category, contact details and notes yourself.</p>
                <button className="secondary" onClick={openAdd}>Enter manually</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 9 — a SEPARATE, lightweight entry point from the "+ Add
          to PropCrew" chooser above: link an already-existing PropCrew
          contact to this property with one tap, no re-typing any of
          their details and no new property_contacts row. Only ever
          reachable when scopePropertyId is set (see linkableContacts). */}
      {showLinkExisting && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowLinkExisting(false)}>
          <div className="modal">
            <div className="modalTop"><div><p className="eyebrow">PROPCREW</p><h2>Link an existing contact</h2></div><button className="iconButton" onClick={() => setShowLinkExisting(false)}>×</button></div>
            <p className="muted">Already in PropCrew for another property? Link them here instead of adding them again.</p>
            {error && <p className="errorMessage">{error}</p>}
            <input className="propCrewLinkSearch" type="text" placeholder="Search by name, business or category…" value={linkFilter} onChange={(e) => setLinkFilter(e.target.value)} aria-label="Search existing PropCrew contacts" />
            <div className="propCrewLinkExistingList">
              {filteredLinkableContacts.length ? filteredLinkableContacts.map((c) => (
                <div className="propCrewLinkRow" key={c.id}>
                  <div>
                    <strong>{c.business_name || c.name}</strong>
                    <span className="muted">{c.business_name ? `${c.name} · ` : ''}{c.role}</span>
                  </div>
                  <button className="secondary" disabled={busy} onClick={() => void linkExistingContact(c.id)}>Link</button>
                </div>
              )) : <p className="muted">No matching contacts.</p>}
            </div>
          </div>
        </div>
      )}

      {/* The "which number/email?" step — only rendered when the picked
          contact actually has more than one of either (Section "If a
          selected contact has multiple phone numbers or email
          addresses, provide a sensible way for the user to select which
          one should be used rather than silently choosing potentially
          incorrect information"). A single value on either field skips
          this entirely and goes straight into the form. */}
      {multiValueCandidate && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setMultiValueCandidate(null)}>
          <div className="modal">
            <div className="modalTop"><h2>Which details for {multiValueCandidate.name || 'this contact'}?</h2><button className="iconButton" onClick={() => setMultiValueCandidate(null)}>×</button></div>
            {multiValueCandidate.phones.length > 1 && (
              <div className="fullField reusePreferenceField">
                <span>Phone number</span>
                <div className="modeToggle">
                  {multiValueCandidate.phones.map((phone) => <button type="button" key={phone} className={multiValueChoice.phone === phone ? 'active' : ''} onClick={() => setMultiValueChoice((c) => ({ ...c, phone }))}>{phone}</button>)}
                </div>
              </div>
            )}
            {multiValueCandidate.emails.length > 1 && (
              <div className="fullField reusePreferenceField">
                <span>Email address</span>
                <div className="modeToggle">
                  {multiValueCandidate.emails.map((email) => <button type="button" key={email} className={multiValueChoice.email === email ? 'active' : ''} onClick={() => setMultiValueChoice((c) => ({ ...c, email }))}>{email}</button>)}
                </div>
              </div>
            )}
            <div className="modalActions">
              <button className="secondary" onClick={() => setMultiValueCandidate(null)}>Cancel</button>
              <button className="primary" onClick={() => applyImportCandidate(multiValueCandidate, multiValueChoice.phone, multiValueChoice.email)}>Continue</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal moduleModal">
            <div className="modalTop"><h2>{editingId ? 'Edit PropCrew provider' : 'Add to PropCrew'}</h2><button className="iconButton" onClick={() => setShowForm(false)}>×</button></div>
            <div className="formGrid">
              <label>Name<input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Mike" /></label>
              <label>Business name<input value={draft.businessName} onChange={(e) => setDraft((d) => ({ ...d, businessName: e.target.value }))} placeholder="ABC Air" /></label>
              <label>Category<select value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}>{PROPCREW_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label>Phone<input value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} /></label>
              <label>Email<input value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} /></label>
              <label>Website<input value={draft.website} onChange={(e) => setDraft((d) => ({ ...d, website: e.target.value }))} /></label>
              <label className="fullField">Associated properties<div className="propertyCheckList">{properties.map((p) => (
                <label key={p.id} className="propertyCheckItem">
                  <input type="checkbox" checked={draft.propertyIds.includes(p.id)} onChange={(e) => setDraft((d) => ({ ...d, propertyIds: e.target.checked ? [...d.propertyIds, p.id] : d.propertyIds.filter((id) => id !== p.id) }))} />
                  <span>{p.address}</span>
                </label>
              ))}</div></label>
              <label className="fullField">Notes<input value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} /></label>

              <div className="fullField reusePreferenceField">
                <span>Would you use them again?</span>
                <div className="modeToggle">
                  {REUSE_PREFERENCE_OPTIONS.map((opt) => <button type="button" key={opt} className={draft.wouldUseAgain === opt ? 'active' : ''} onClick={() => setDraft((d) => ({ ...d, wouldUseAgain: opt }))}>{REUSE_PREFERENCE_LABELS[opt]}</button>)}
                </div>
              </div>
              <label className="fullField">{PROPCREW_PRIVATE_NOTE_LABEL}<small>{PROPCREW_PRIVACY_DISCLOSURE}</small><input value={draft.experienceNote} onChange={(e) => setDraft((d) => ({ ...d, experienceNote: e.target.value }))} placeholder="Excellent work. Ask for Mike." /></label>
            </div>
            <div className="modalActions"><button className="secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="primary" disabled={busy || !draft.name.trim() || !draft.propertyIds.length} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button></div>
          </div>
        </div>
      )}

      {/* Section 5 — offered whenever save() finds an existing contact
          whose normalized phone or email exactly matches the draft
          being created. Never auto-applied; "Create new anyway" stays
          one tap away for the rare true-coincidence case. Rendered
          AFTER (so it stacks visually on top of) the Add/Edit form
          above — save() leaves that form open underneath while this
          confirmation is decided, so nothing entered is lost if the
          landlord backs out of this prompt. */}
      {dedupeMatch && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setDedupeMatch(null)}>
          <div className="modal">
            <div className="modalTop"><h2>Use existing contact?</h2><button className="iconButton" onClick={() => setDedupeMatch(null)}>×</button></div>
            <p>You already have <strong>{dedupeMatch.business_name || dedupeMatch.name}</strong> in PropCrew with this phone number or email. Use that contact and link them to the selected propert{draft.propertyIds.length === 1 ? 'y' : 'ies'} instead of creating a new entry?</p>
            <div className="modalActions">
              <button className="secondary" disabled={busy} onClick={() => { setDedupeMatch(null); void save(true) }}>Create new anyway</button>
              <button className="primary" disabled={busy} onClick={() => void useDedupeMatch()}>Use existing contact</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
