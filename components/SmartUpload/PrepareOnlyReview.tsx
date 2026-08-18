'use client'

// PropRoster — Smart Upload Foundation, Part 16/17: lease/insurance/
// mortgage/tax/inspection/HOA/appraisal/other documents. Classifies,
// assigns a property, and shows what Document Intelligence already
// extracted — but never auto-creates or silently changes a lease/
// insurance/mortgage/tax record. Applying those values still only ever
// happens through the existing, already-shipped Apply-to-form flow
// (components/DocumentIntelligencePanel.tsx's onApply, reached from the
// property's own Documents tab once this document has a property and
// its already-completed analysis is visible there) — that flow already
// ends in the user's own explicit form Save, so nothing new is invented
// here for it.

import { useMemo } from 'react'
import type { DocumentAnalysisOutput } from '../../lib/document-intelligence/schemas'
import type { DocumentType } from '../../lib/document-intelligence/types'
import type { SmartUploadProperty } from '../../lib/smart-upload/types'
import { matchProperty } from '../../lib/smart-upload/match-property'
import { PropertyPicker } from './PropertyPicker'

export function PrepareOnlyReview({
  documentType,
  analysis,
  properties,
  confirmedPropertyId,
  busy,
  saved,
  onSelectProperty,
  onSave,
}: {
  documentType: DocumentType
  analysis: DocumentAnalysisOutput
  properties: SmartUploadProperty[]
  confirmedPropertyId: string | null
  busy: boolean
  saved: boolean
  onSelectProperty: (propertyId: string) => void
  onSave: () => void
}) {
  const suggestion = useMemo(() => matchProperty(analysis.applyFields.propertyAddress, properties), [analysis.applyFields.propertyAddress, properties])
  const canSave = Boolean(confirmedPropertyId) && !busy

  return (
    <div className="smartUploadReview">
      <p className="eyebrow">{documentType.toUpperCase()}</p>
      <p className="docOverview">{analysis.overview}</p>

      <PropertyPicker properties={properties} suggestion={suggestion} confirmedPropertyId={confirmedPropertyId} onSelect={onSelectProperty} />

      {analysis.groups.map((group, i) => (
        <div className="docGroup" key={i}>
          <h4>{group.title}</h4>
          <div className="docFieldGrid">
            {group.fields.map((f, j) => (
              <div className="docField" key={j}>
                <div className="docFieldHead"><span className="docFieldLabel">{f.label}</span></div>
                <div className="docFieldValue">{f.value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="muted">AI-extracted — review against the original document before relying on it. Nothing above has been saved to your {documentType} records yet.</p>

      {saved ? (
        <div className="smartUploadSavedBanner">
          Saved to Documents{confirmedPropertyId ? ' on this property' : ''}.
          {confirmedPropertyId && <a className="secondary smartUploadOpenLink" href={`/?openProperty=${confirmedPropertyId}`}>Open on property → Documents</a>}
        </div>
      ) : (
        <button className="primary smartUploadSaveButton" disabled={!canSave} onClick={onSave}>{busy ? 'Saving…' : 'Save to Documents'}</button>
      )}
    </div>
  )
}
