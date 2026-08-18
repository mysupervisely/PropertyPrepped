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
// QA audit (phone contact picker, deliberately NOT implemented): the
// W3C Contact Picker API (navigator.contacts.select()) is what a
// "Choose from Contacts" button would need — it's only implemented in
// Chromium on Android; Safari (desktop and iOS) has never shipped it, and
// this app's primary mobile web target is iOS Safari. There is no
// reliable, secure way to do single-contact selection from the mobile
// web on that target today, and the privacy requirement here (import
// ONLY the one contact the user explicitly picks — never request broad
// address-book access) rules out any broader-permission workaround. Per
// that finding: manual entry (the Add form below) stays the only path on
// web. The real fix is native contact picking in a future PropRoster
// iOS/Android app, which can use each platform's real contact-selection
// UI; this component is already the natural extension point for that —
// a future native wrapper can prefill `prefill` (below) from a picked
// contact exactly the way Document Intelligence's "Add this business to
// PropCrew" apply action already does, still landing on this same
// review-before-save form, still never auto-setting
// would_use_again/experience_note/category without the user confirming
// them.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PROPCREW_PRIVACY_DISCLOSURE, PROPCREW_PRIVATE_NOTE_LABEL, REUSE_PREFERENCE_LABELS, REUSE_PREFERENCE_OPTIONS, reusePreferenceTone, type ReusePreference } from '../lib/propcrew/reuse-preference'

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
            <p className="eyebrow">PROPCREW</p>
            <h2>Your private crew directory</h2>
            <p>Every contractor, agent, lender and professional you&apos;ve worked with — {PROPCREW_PRIVACY_DISCLOSURE.toLowerCase()}</p>
          </div>
        ) : <div />}
        <button className="primary" onClick={openAdd}>+ Add to PropCrew</button>
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
        <div className="emptyModule"><strong>No PropCrew providers yet</strong><span>Add contractors, agents, lenders and other professionals as you work with them.</span><button className="primary" onClick={openAdd}>+ Add to PropCrew</button></div>
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
