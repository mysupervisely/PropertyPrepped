'use client'

// PropRoster — Property Profile 2.0, Section 8: Property Notes 2.0.
// Free-form, pinnable, private property-level notes. related_table/
// related_id exist on the row (see supabase/milestone-11-property-profile-2.sql)
// for future record-specific notes but are never read/written here — V1
// is property-level notes only, exactly as scoped.

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export type PropertyNote = {
  id: string
  property_id: string
  owner_id: string
  body: string
  is_pinned: boolean
  created_at: string
  updated_at: string
}

export function PropertyNotesPanel({
  propertyId, ownerId, notes, onRefresh, compact = false,
}: {
  propertyId: string
  ownerId: string
  notes: PropertyNote[]
  onRefresh: () => void
  /** Overview tab shows a compact preview (pinned + a few recent); the Property tab (or a future dedicated view) shows everything with full add/edit. Compact mode still allows adding a note — just keeps the list short. */
  compact?: boolean
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const pinned = notes.filter((n) => n.is_pinned)
  const unpinned = notes.filter((n) => !n.is_pinned)
  const visible = compact ? [...pinned, ...unpinned].slice(0, 5) : [...pinned, ...unpinned]

  async function addNote() {
    if (!supabase || !draft.trim()) return
    setBusy(true)
    setError('')
    const { error: saveError } = await supabase.from('property_notes').insert({ owner_id: ownerId, property_id: propertyId, body: draft.trim() })
    if (saveError) setError(saveError.message)
    else { setDraft(''); onRefresh() }
    setBusy(false)
  }

  async function togglePin(note: PropertyNote) {
    if (!supabase) return
    const { error: saveError } = await supabase.from('property_notes').update({ is_pinned: !note.is_pinned, updated_at: new Date().toISOString() }).eq('id', note.id)
    if (saveError) setError(saveError.message)
    else onRefresh()
  }

  async function removeNote(id: string) {
    if (!supabase) return
    const { error: deleteError } = await supabase.from('property_notes').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else onRefresh()
  }

  return (
    <div className="notesPanel">
      {error && <div className="statusMessage errorMessage">{error}</div>}
      <div className="noteComposer">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Gate code is 1832." onKeyDown={(e) => { if (e.key === 'Enter') void addNote() }} />
        <button className="secondary" disabled={busy || !draft.trim()} onClick={() => void addNote()}>Add note</button>
      </div>
      {visible.length ? (
        <ul className="noteList">
          {visible.map((note) => (
            <li className={`noteItem ${note.is_pinned ? 'notePinned' : ''}`} key={note.id}>
              <button className="notePin" title={note.is_pinned ? 'Unpin' : 'Pin'} aria-label={note.is_pinned ? 'Unpin note' : 'Pin note'} onClick={() => void togglePin(note)}>{note.is_pinned ? '★' : '☆'}</button>
              <div className="noteBody">
                <p>{note.body}</p>
                <small>{new Date(note.updated_at).toLocaleDateString()}{note.updated_at !== note.created_at ? ' (edited)' : ''}</small>
              </div>
              <button className="noteDelete" aria-label="Delete note" onClick={() => void removeNote(note.id)}>×</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No notes yet — private reminders like a gate code or paint color live here.</p>
      )}
      {compact && notes.length > visible.length && <p className="ledgerNote">+{notes.length - visible.length} more note{notes.length - visible.length === 1 ? '' : 's'}</p>}
    </div>
  )
}
