'use client'

// PropRoster — Smart Upload Foundation, Part 10/11/13/14/15: the
// polished V1 receipt review screen. "We found this information" (Part
// 18) — every value below is pre-filled from the ONE analysis this
// upload already ran (never a second AI call), clearly editable, and
// nothing here writes to a canonical record until the user presses Save.

import { useMemo, useState } from 'react'
import type { ApplyFields } from '../../lib/document-intelligence/schemas'
import type { SmartUploadContact, SmartUploadProperty, SmartUploadSystem } from '../../lib/smart-upload/types'
import { matchProperty } from '../../lib/smart-upload/match-property'
import { findMatchingContact } from '../../lib/smart-upload/match-contact'
import { extractReceiptFields, looksLikeServiceInvoice, missingReceiptFields } from '../../lib/smart-upload/receipt-fields'
import { FINANCIAL_CATEGORIES, MAINTENANCE_CATEGORIES } from '../../lib/property-categories'
import { PROPCREW_CATEGORIES } from '../PropCrewPanel'
import { PropertyPicker } from './PropertyPicker'

export type ReceiptSaveInput = {
  vendor: string
  date: string
  amount: string
  description: string
  financialCategory: string
  createMaintenanceRecord: boolean
  maintenanceCategory: string
  systemId: string | null
  contactId: string | null
}

export function ReceiptReview({
  applyFields,
  properties,
  contacts,
  systems,
  confirmedPropertyId,
  busy,
  saved,
  onSelectProperty,
  onAddToPropCrew,
  onSave,
}: {
  applyFields: ApplyFields
  properties: SmartUploadProperty[]
  contacts: SmartUploadContact[]
  systems: SmartUploadSystem[]
  confirmedPropertyId: string | null
  busy: boolean
  saved: boolean
  onSelectProperty: (propertyId: string) => void
  onAddToPropCrew: (prefill: { name: string; businessName: string | null; phone: string | null; email: string | null; role: string }) => Promise<{ id: string | null; error?: string }>
  onSave: (input: ReceiptSaveInput) => void
}) {
  const extracted = useMemo(() => extractReceiptFields(applyFields), [applyFields])
  const missing = missingReceiptFields(extracted)
  const suggestion = useMemo(() => matchProperty(applyFields.propertyAddress, properties), [applyFields.propertyAddress, properties])

  const [vendor, setVendor] = useState(extracted.vendor || '')
  const [date, setDate] = useState(extracted.date || new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState(extracted.amount || '')
  const [description, setDescription] = useState(extracted.description || '')
  const [financialCategory, setFinancialCategory] = useState<string>(
    FINANCIAL_CATEGORIES.find((c) => c.toLowerCase() === (extracted.suggestedCategory || '').toLowerCase()) || 'Repairs',
  )

  const serviceGuess = looksLikeServiceInvoice(extracted)
  const [createMaintenanceRecord, setCreateMaintenanceRecord] = useState(serviceGuess)
  const [maintenanceCategory, setMaintenanceCategory] = useState<string>(
    MAINTENANCE_CATEGORIES.find((c) => c.toLowerCase() === (extracted.suggestedCategory || '').toLowerCase()) || 'Repair',
  )
  const [systemId, setSystemId] = useState<string>('')
  const [contactId, setContactId] = useState<string>('')
  const [addingContact, setAddingContact] = useState(false)
  const [skippedContact, setSkippedContact] = useState(false)
  // Core Experience Bundle, item 2: "Add to PropCrew" no longer creates
  // the provider immediately — it opens this small editable confirmation
  // form first ("do not silently create the provider"), prefilled only
  // from what Smart Upload's one analysis call actually extracted.
  const [showContactForm, setShowContactForm] = useState(false)
  const [contactDraft, setContactDraft] = useState({ name: '', businessName: '', phone: '', email: '', role: 'Other' })
  const [contactError, setContactError] = useState('')

  const propertySystems = useMemo(() => systems.filter((s) => s.property_id === confirmedPropertyId), [systems, confirmedPropertyId])
  const matchedContact = useMemo(() => findMatchingContact(vendor || applyFields.businessName, contacts), [vendor, applyFields.businessName, contacts])

  const canSave = Boolean(confirmedPropertyId) && description.trim().length > 0 && Number(amount) > 0 && !busy

  // Category guess where reliable (Part 2): only reuse the maintenance
  // category already inferred from the extracted invoice when it's also
  // a real PropCrew category — the two lists overlap (HVAC, Plumbing,
  // Electrical, Landscaping, Other) but aren't the same list, so this
  // never invents a PropCrew category the extraction didn't support.
  function openContactForm() {
    const reliableRole = (PROPCREW_CATEGORIES as readonly string[]).includes(maintenanceCategory) ? maintenanceCategory : 'Other'
    setContactDraft({
      name: applyFields.name || applyFields.businessName || vendor || '',
      businessName: applyFields.businessName || '',
      phone: applyFields.phone || '',
      email: applyFields.email || '',
      role: reliableRole,
    })
    setContactError('')
    setShowContactForm(true)
  }

  async function confirmAddToPropCrew() {
    if (!contactDraft.name.trim()) return
    setAddingContact(true)
    setContactError('')
    const result = await onAddToPropCrew({
      name: contactDraft.name.trim(),
      businessName: contactDraft.businessName.trim() || null,
      phone: contactDraft.phone.trim() || null,
      email: contactDraft.email.trim() || null,
      role: contactDraft.role,
    })
    setAddingContact(false)
    if (result.id) {
      setContactId(result.id)
      setShowContactForm(false)
    } else {
      setContactError(result.error || 'Could not add this provider to PropCrew. Please try again.')
    }
  }

  return (
    <div className="smartUploadReview">
      <p className="eyebrow">RECEIPT / INVOICE</p>
      {missing.length > 0 && <p className="statusMessage docIntelFailed">We couldn&rsquo;t confidently read {missing.join(', ')} — please fill it in below.</p>}

      <PropertyPicker properties={properties} suggestion={suggestion} confirmedPropertyId={confirmedPropertyId} onSelect={onSelectProperty} />

      <div className="formGrid">
        <label>Vendor<input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="The Home Depot" /></label>
        <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Amount<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="184.72" /></label>
        <label>Expense category<select value={financialCategory} onChange={(e) => setFinancialCategory(e.target.value)}>{FINANCIAL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="fullField">Description<input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="HVAC air filter / supplies" /></label>
      </div>
      {/* Part 11: never "definitely deductible" — expense category is a
          filing aid, not tax advice. Tax treatment depends on individual
          circumstances. */}
      <p className="muted smartUploadTaxNote">This is a potential expense category to help you file this record — not tax advice. Tax treatment depends on your individual circumstances.</p>

      <label className="smartUploadToggle"><input type="checkbox" checked={createMaintenanceRecord} onChange={(e) => setCreateMaintenanceRecord(e.target.checked)} /><span>This is a maintenance / service invoice</span><small>Also creates a linked Maintenance record so you only enter this once.</small></label>

      {createMaintenanceRecord && (
        <div className="smartUploadServiceSection">
          <label>Maintenance category<select value={maintenanceCategory} onChange={(e) => setMaintenanceCategory(e.target.value)}>{MAINTENANCE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>

          {propertySystems.length > 0 && (
            <label>Related system (optional)<select value={systemId} onChange={(e) => setSystemId(e.target.value)}><option value="">No related system</option>{propertySystems.map((s) => <option key={s.id} value={s.id}>{s.name ? `${s.system_type} — ${s.name}` : s.system_type}</option>)}</select></label>
          )}

          <div className="smartUploadContactSection">
            <p className="eyebrow">PROPCREW PROVIDER</p>
            {contactId ? (
              <p className="muted">Linked to PropCrew.</p>
            ) : matchedContact ? (
              <p className="muted">Matched to {matchedContact.business_name || matchedContact.name} in your PropCrew.</p>
            ) : showContactForm ? (
              <div className="smartUploadContactForm">
                <div className="formGrid">
                  <label>Name<input value={contactDraft.name} onChange={(e) => setContactDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Mike" /></label>
                  <label>Business name<input value={contactDraft.businessName} onChange={(e) => setContactDraft((d) => ({ ...d, businessName: e.target.value }))} placeholder="ABC Air" /></label>
                  <label>Phone<input value={contactDraft.phone} onChange={(e) => setContactDraft((d) => ({ ...d, phone: e.target.value }))} placeholder="(555) 123-4567" /></label>
                  <label>Email<input type="email" value={contactDraft.email} onChange={(e) => setContactDraft((d) => ({ ...d, email: e.target.value }))} placeholder="mike@abcair.com" /></label>
                  <label>Category<select value={contactDraft.role} onChange={(e) => setContactDraft((d) => ({ ...d, role: e.target.value }))}>{PROPCREW_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
                </div>
                {contactError && <p className="errorMessage">{contactError}</p>}
                <div className="smartUploadContactActions">
                  <button type="button" className="primary" disabled={addingContact || !contactDraft.name.trim()} onClick={() => void confirmAddToPropCrew()}>{addingContact ? 'Adding…' : 'Confirm & Add'}</button>
                  <button type="button" className="secondary" disabled={addingContact} onClick={() => setShowContactForm(false)}>Cancel</button>
                </div>
              </div>
            ) : skippedContact ? (
              <p className="muted">Not linked to a PropCrew provider.</p>
            ) : (vendor || applyFields.businessName) ? (
              <div className="smartUploadContactPrompt">
                <p>{vendor || applyFields.businessName} isn&rsquo;t in your PropCrew yet.</p>
                <div className="smartUploadContactActions">
                  <button type="button" className="secondary" onClick={openContactForm}>Add to PropCrew</button>
                  <button type="button" className="secondary" onClick={() => setSkippedContact(true)}>Skip</button>
                </div>
              </div>
            ) : (
              <p className="muted">No vendor name identified — add a PropCrew provider later from the People tab if needed.</p>
            )}
          </div>
        </div>
      )}

      {saved ? (
        <div className="smartUploadSavedBanner">Saved.</div>
      ) : (
        <button
          className="primary smartUploadSaveButton"
          disabled={!canSave}
          onClick={() => onSave({
            vendor: vendor.trim(),
            date,
            amount,
            description: description.trim(),
            financialCategory,
            createMaintenanceRecord,
            maintenanceCategory,
            systemId: systemId || null,
            contactId: contactId || (matchedContact ? matchedContact.id : null),
          })}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      )}
    </div>
  )
}
