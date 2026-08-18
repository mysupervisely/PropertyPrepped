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
  onAddToPropCrew: (prefill: { name: string; businessName: string | null; phone: string | null; email: string | null; role: string }) => Promise<string | null>
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

  const propertySystems = useMemo(() => systems.filter((s) => s.property_id === confirmedPropertyId), [systems, confirmedPropertyId])
  const matchedContact = useMemo(() => findMatchingContact(vendor || applyFields.businessName, contacts), [vendor, applyFields.businessName, contacts])

  const canSave = Boolean(confirmedPropertyId) && description.trim().length > 0 && Number(amount) > 0 && !busy

  async function handleAddToPropCrew() {
    setAddingContact(true)
    const id = await onAddToPropCrew({
      name: applyFields.name || applyFields.businessName || vendor || 'New contact',
      businessName: applyFields.businessName || vendor || null,
      phone: applyFields.phone || null,
      email: applyFields.email || null,
      role: maintenanceCategory,
    })
    setAddingContact(false)
    if (id) setContactId(id)
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
            {matchedContact || contactId ? (
              <p className="muted">Matched to {matchedContact?.business_name || matchedContact?.name || 'the selected provider'} in your PropCrew.</p>
            ) : skippedContact ? (
              <p className="muted">Not linked to a PropCrew provider.</p>
            ) : (vendor || applyFields.businessName) ? (
              <div className="smartUploadContactPrompt">
                <p>{vendor || applyFields.businessName} isn&rsquo;t in your PropCrew yet.</p>
                <div className="smartUploadContactActions">
                  <button type="button" className="secondary" disabled={addingContact} onClick={() => void handleAddToPropCrew()}>{addingContact ? 'Adding…' : 'Add to PropCrew'}</button>
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
