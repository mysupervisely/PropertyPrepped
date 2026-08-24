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

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PROPCREW_PRIVACY_DISCLOSURE, PROPCREW_PRIVATE_NOTE_LABEL, REUSE_PREFERENCE_LABELS, REUSE_PREFERENCE_OPTIONS, reusePreferenceTone, type ReusePreference } from '../lib/propcrew/reuse-preference'
import { isContactPickerSupported, normalizeContactPickerResult, type ContactPickerResult, type PropCrewImportCandidate } from '../lib/propcrew/contact-picker'

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

  // The "+ Add to PropCrew" entry point. On a browser without the
  // Contact Picker API, this behaves EXACTLY as before — straight to the
  // manual form, no chooser step, no dead option ever shown.
  function openAddChooser() {
    setError('')
    setPickerError('')
    if (pickerSupported) setShowAddChooser(true)
    else openAdd()
  }

  // Populates the SAME draft/showForm the manual "+ Add to PropCrew" flow
  // already uses — the review-before-save form is identical either way,
  // every field stays editable, and Save is still the one explicit
  // action that writes anything (Section "Do not automatically save
  // anything merely because a contact was selected").
  function applyImportCandidate(candidate: PropCrewImportCandidate, phone: string, email: string) {
    setDraft({ ...emptyDraft, name: candidate.name, phone, email, propertyIds: scopePropertyId ? [scopePropertyId] : [] })
    setEditingId(null)
    setShowForm(true)
    setShowAddChooser(false)
    setMultiValueCandidate(null)
    setPickerError('')
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

  async function save() {
    if (!supabase || !draft.name.trim() || !draft.propertyIds.length) return
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
        <button className="primary" onClick={openAddChooser}>+ Add to PropCrew</button>
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
        <div className="emptyModule"><strong>No PropCrew providers yet</strong><span>Add contractors, agents, lenders and other professionals as you work with them.</span><button className="primary" onClick={openAddChooser}>+ Add to PropCrew</button></div>
      )}

      {/* Property Profile / PropCrew UX Improvement: the first step when
          the picker IS supported — "Add from Contacts" vs "Enter
          Manually." Never rendered at all when pickerSupported is false
          (openAddChooser skips straight to the manual form in that
          case), so there's never a chooser with a dead/disabled option. */}
      {showAddChooser && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowAddChooser(false)}>
          <div className="modal addDocumentModal">
            <div className="modalTop"><div><p className="eyebrow">PROPCREW</p><h2>Add a PropCrew member</h2></div><button className="iconButton" onClick={() => setShowAddChooser(false)}>×</button></div>
            {pickerError && <p className="errorMessage">{pickerError}</p>}
            <div className="addDocumentChooser">
              <div className="addDocumentOption addDocumentOptionSmart">
                <h3>Add from Contacts</h3>
                <p>Choose one contact from your device — only that contact&apos;s name, phone and email are imported, nothing else from your address book.</p>
                <button className="primary" disabled={pickerBusy} onClick={() => void pickFromContacts()}>{pickerBusy ? 'Opening contacts…' : 'Choose a contact'}</button>
              </div>
              <div className="addDocumentOption">
                <h3>Enter Manually</h3>
                <p>Type in their name, category, contact details and notes yourself.</p>
                <button className="secondary" onClick={openAdd}>Enter manually</button>
              </div>
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
    </div>
  )
}
