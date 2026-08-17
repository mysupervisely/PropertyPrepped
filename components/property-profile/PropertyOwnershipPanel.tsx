'use client'

// PropRoster — Property Profile 2.0, Section 6: Ownership / Entity
// recordkeeping. Explicitly recordkeeping only — never legal/entity
// advice (no validation of entity names, no jurisdiction logic, no
// guidance copy suggesting one structure over another).

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export const OWNERSHIP_TYPES = ['Individual', 'LLC', 'Trust', 'Partnership', 'Other'] as const

export type PropertyOwnership = {
  id: string
  property_id: string
  owner_id: string
  entity_name: string
  ownership_type: typeof OWNERSHIP_TYPES[number]
  ownership_percentage: number | null
  acquisition_date: string | null
  purchase_price: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

const emptyDraft = { entityName: '', ownershipType: 'Individual' as typeof OWNERSHIP_TYPES[number], ownershipPercentage: '', acquisitionDate: '', purchasePrice: '', notes: '' }

export function PropertyOwnershipPanel({
  propertyId, ownerId, records, onRefresh,
}: {
  propertyId: string
  ownerId: string
  records: PropertyOwnership[]
  onRefresh: () => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!supabase || !draft.entityName.trim()) return
    setBusy(true)
    setError('')
    const { error: saveError } = await supabase.from('property_ownership').insert({
      owner_id: ownerId,
      property_id: propertyId,
      entity_name: draft.entityName.trim(),
      ownership_type: draft.ownershipType,
      ownership_percentage: draft.ownershipPercentage ? Number(draft.ownershipPercentage) : null,
      acquisition_date: draft.acquisitionDate || null,
      purchase_price: draft.purchasePrice ? Number(draft.purchasePrice) : null,
      notes: draft.notes.trim() || null,
    })
    if (saveError) setError(saveError.message)
    else { setShowForm(false); setDraft(emptyDraft); onRefresh() }
    setBusy(false)
  }

  async function remove(id: string) {
    if (!supabase) return
    const { error: deleteError } = await supabase.from('property_ownership').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else onRefresh()
  }

  return (
    <div className="ownershipPanel">
      <div className="sectionHead">
        <div><h3>Ownership / Entity</h3><p className="muted">Recordkeeping only — not legal or entity-structuring advice.</p></div>
        <button className="secondary" onClick={() => setShowForm(true)}>+ Add owner/entity</button>
      </div>
      {error && <div className="statusMessage errorMessage">{error}</div>}
      {records.length ? (
        <div className="detailRows">
          {records.map((r) => (
            <div key={r.id}>
              <span>{r.entity_name} <em className="ownershipTypeTag">{r.ownership_type}</em></span>
              <strong>
                {r.ownership_percentage != null ? `${r.ownership_percentage}%` : ''}
                <button className="recordDelete ownershipDelete" onClick={() => void remove(r.id)}>×</button>
              </strong>
            </div>
          ))}
        </div>
      ) : <p className="muted">No ownership/entity records added yet.</p>}

      {showForm && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal moduleModal">
            <div className="modalTop"><h2>Add owner / entity</h2><button className="iconButton" onClick={() => setShowForm(false)}>×</button></div>
            <div className="formGrid">
              <label>Ownership/entity name<input value={draft.entityName} onChange={(e) => setDraft((d) => ({ ...d, entityName: e.target.value }))} placeholder="Jamie Rivera, or Acme Holdings LLC" /></label>
              <label>Ownership type<select value={draft.ownershipType} onChange={(e) => setDraft((d) => ({ ...d, ownershipType: e.target.value as typeof OWNERSHIP_TYPES[number] }))}>{OWNERSHIP_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
              <label>Ownership %<input inputMode="decimal" value={draft.ownershipPercentage} onChange={(e) => setDraft((d) => ({ ...d, ownershipPercentage: e.target.value }))} placeholder="100" /></label>
              <label>Acquisition date<input type="date" value={draft.acquisitionDate} onChange={(e) => setDraft((d) => ({ ...d, acquisitionDate: e.target.value }))} /></label>
              <label>Purchase price<input inputMode="decimal" value={draft.purchasePrice} onChange={(e) => setDraft((d) => ({ ...d, purchasePrice: e.target.value }))} /></label>
              <label className="fullField">Notes<input value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} /></label>
            </div>
            <div className="modalActions"><button className="secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
