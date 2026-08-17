'use client'

// PropRoster — Property Profile 2.0, Section 7: Property Systems &
// Appliances. Self-contained (owns its own Supabase reads/writes), same
// pattern as components/DocumentIntelligencePanel.tsx — the parent only
// supplies what it already has loaded (documents, PropCrew contacts) and
// an onRefresh to re-pull the parent's own data after a change.

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export const SYSTEM_TYPES = [
  'Roof', 'HVAC', 'Water Heater', 'Electrical', 'Plumbing', 'Refrigerator',
  'Range/Oven', 'Dishwasher', 'Washer', 'Dryer', 'Pool Equipment', 'Solar', 'Other',
] as const

export type PropertySystem = {
  id: string
  property_id: string
  owner_id: string
  system_type: typeof SYSTEM_TYPES[number]
  name: string | null
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  install_date: string | null
  last_service_date: string | null
  warranty_expiration: string | null
  cost: number | null
  propcrew_contact_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

type ContactOption = { id: string; name: string; business_name: string | null }
type DocumentOption = { id: string; name: string }

const emptyDraft = {
  systemType: 'HVAC' as typeof SYSTEM_TYPES[number],
  name: '', manufacturer: '', model: '', serialNumber: '',
  installDate: '', lastServiceDate: '', warrantyExpiration: '', cost: '',
  propcrewContactId: '', notes: '',
}

function approximateAge(installDate: string | null): string | null {
  if (!installDate) return null
  const years = (Date.now() - new Date(`${installDate}T12:00:00`).getTime()) / (365.25 * 86400000)
  if (years < 0) return null
  if (years < 1) return 'Less than 1 year old'
  const rounded = Math.floor(years)
  return `${rounded} year${rounded === 1 ? '' : 's'} old`
}

export function PropertySystemsPanel({
  propertyId, ownerId, systems, contacts, documents, onRefresh,
}: {
  propertyId: string
  ownerId: string
  systems: PropertySystem[]
  contacts: ContactOption[]
  documents: DocumentOption[]
  onRefresh: () => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function openAdd() {
    setDraft(emptyDraft)
    setEditingId(null)
    setShowForm(true)
    setError('')
  }

  function openEdit(system: PropertySystem) {
    setDraft({
      systemType: system.system_type,
      name: system.name || '', manufacturer: system.manufacturer || '', model: system.model || '', serialNumber: system.serial_number || '',
      installDate: system.install_date || '', lastServiceDate: system.last_service_date || '', warrantyExpiration: system.warranty_expiration || '', cost: system.cost != null ? String(system.cost) : '',
      propcrewContactId: system.propcrew_contact_id || '', notes: system.notes || '',
    })
    setEditingId(system.id)
    setShowForm(true)
    setError('')
  }

  async function save() {
    if (!supabase) return
    setBusy(true)
    setError('')
    const payload = {
      owner_id: ownerId,
      property_id: propertyId,
      system_type: draft.systemType,
      name: draft.name.trim() || null,
      manufacturer: draft.manufacturer.trim() || null,
      model: draft.model.trim() || null,
      serial_number: draft.serialNumber.trim() || null,
      install_date: draft.installDate || null,
      last_service_date: draft.lastServiceDate || null,
      warranty_expiration: draft.warrantyExpiration || null,
      cost: draft.cost ? Number(draft.cost) : null,
      propcrew_contact_id: draft.propcrewContactId || null,
      notes: draft.notes.trim() || null,
    }
    const { error: saveError } = editingId
      ? await supabase.from('property_systems').update(payload).eq('id', editingId)
      : await supabase.from('property_systems').insert(payload)
    if (saveError) {
      setError(saveError.message)
    } else {
      setShowForm(false)
      onRefresh()
    }
    setBusy(false)
  }

  async function remove(id: string) {
    if (!supabase) return
    setBusy(true)
    const { error: deleteError } = await supabase.from('property_systems').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else onRefresh()
    setBusy(false)
  }

  return (
    <div className="systemsPanel">
      <div className="sectionHead workspaceHeading">
        <div><p className="eyebrow">PROPERTY SYSTEMS &amp; APPLIANCES</p><h2>Every system, one record</h2><p>Roof, HVAC, water heater and every major appliance — install dates, warranties and the provider who services them.</p></div>
        <button className="primary" onClick={openAdd}>+ Add system</button>
      </div>

      {error && <div className="statusMessage errorMessage">{error}</div>}

      {systems.length ? (
        <div className="moduleGrid">
          {systems.map((system) => {
            const provider = contacts.find((c) => c.id === system.propcrew_contact_id)
            const age = approximateAge(system.install_date)
            return (
              <article className="recordCard" key={system.id}>
                <div className="recordTop">
                  <div><span className="statusPill">{system.system_type}</span><h3>{system.name || system.system_type}</h3><p>{[system.manufacturer, system.model].filter(Boolean).join(' · ') || 'No manufacturer/model added'}</p></div>
                  <button className="recordDelete" onClick={() => void remove(system.id)}>×</button>
                </div>
                <div className="recordRows">
                  {system.install_date && <div><span>Installed</span><strong>{new Date(`${system.install_date}T12:00:00`).toLocaleDateString()}{age ? ` · ${age}` : ''}</strong></div>}
                  {system.last_service_date && <div><span>Last serviced</span><strong>{new Date(`${system.last_service_date}T12:00:00`).toLocaleDateString()}</strong></div>}
                  {system.warranty_expiration && <div><span>Warranty expires</span><strong>{new Date(`${system.warranty_expiration}T12:00:00`).toLocaleDateString()}</strong></div>}
                  {system.serial_number && <div><span>Serial</span><strong>{system.serial_number}</strong></div>}
                  {system.cost != null && <div><span>Cost</span><strong>${system.cost.toLocaleString()}</strong></div>}
                  {provider && <div><span>PropCrew provider</span><strong>{provider.business_name || provider.name}</strong></div>}
                  {system.notes && <div><span>Notes</span><strong>{system.notes}</strong></div>}
                  <div><span>Edit</span><button onClick={() => openEdit(system)}>Edit details</button></div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="emptyModule"><strong>No systems added yet</strong><span>Add your roof, HVAC, water heater and major appliances as you get to them — nothing is required.</span><button className="primary" onClick={openAdd}>+ Add system</button></div>
      )}

      {showForm && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal moduleModal">
            <div className="modalTop"><h2>{editingId ? 'Edit system' : 'Add a system'}</h2><button className="iconButton" onClick={() => setShowForm(false)}>×</button></div>
            <div className="formGrid">
              <label>Type<select value={draft.systemType} onChange={(e) => setDraft((d) => ({ ...d, systemType: e.target.value as typeof SYSTEM_TYPES[number] }))}>{SYSTEM_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
              <label>Name / description<input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Upstairs unit" /></label>
              <label>Manufacturer<input value={draft.manufacturer} onChange={(e) => setDraft((d) => ({ ...d, manufacturer: e.target.value }))} /></label>
              <label>Model<input value={draft.model} onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))} /></label>
              <label>Serial number<input value={draft.serialNumber} onChange={(e) => setDraft((d) => ({ ...d, serialNumber: e.target.value }))} /></label>
              <label>Cost<input inputMode="decimal" value={draft.cost} onChange={(e) => setDraft((d) => ({ ...d, cost: e.target.value }))} /></label>
              <label>Install / replacement date<input type="date" value={draft.installDate} onChange={(e) => setDraft((d) => ({ ...d, installDate: e.target.value }))} /></label>
              <label>Last service date<input type="date" value={draft.lastServiceDate} onChange={(e) => setDraft((d) => ({ ...d, lastServiceDate: e.target.value }))} /></label>
              <label>Warranty expiration<input type="date" value={draft.warrantyExpiration} onChange={(e) => setDraft((d) => ({ ...d, warrantyExpiration: e.target.value }))} /></label>
              <label>PropCrew provider<select value={draft.propcrewContactId} onChange={(e) => setDraft((d) => ({ ...d, propcrewContactId: e.target.value }))}><option value="">Not set</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.business_name || c.name}</option>)}</select></label>
              <label className="fullField">Linked document<select onChange={async (e) => { const docId = e.target.value; e.target.value = ''; if (!docId || !editingId || !supabase) return; await supabase.from('property_system_documents').insert({ system_id: editingId, document_id: docId, owner_id: ownerId }) }} disabled={!editingId}><option value="">{editingId ? 'Link a document…' : 'Save this system first'}</option>{documents.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
              <label className="fullField">Notes<input value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} /></label>
            </div>
            <div className="modalActions"><button className="secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
