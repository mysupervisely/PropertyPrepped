'use client'

// PropRoster — Smart Upload Foundation (Part 8/9/22): "Which property is
// this for?" — large, equal, tap-friendly choices, never a preselected
// value the user didn't actively choose. A "Suggested match" badge marks
// lib/smart-upload/match-property.ts's best guess, but it's rendered as
// exactly the same tappable button as every other property — selecting
// it is still a real, explicit confirmation, never assumed.

import type { SmartUploadProperty } from '../../lib/smart-upload/types'
import type { PropertyMatchResult } from '../../lib/smart-upload/match-property'

export function PropertyPicker({
  properties,
  suggestion,
  confirmedPropertyId,
  onSelect,
}: {
  properties: SmartUploadProperty[]
  suggestion: PropertyMatchResult
  confirmedPropertyId: string | null
  onSelect: (propertyId: string) => void
}) {
  const suggestedId = suggestion.confidence !== 'None' ? suggestion.property?.id : null

  return (
    <div className="propertyPicker">
      <p className="eyebrow">PROPERTY</p>
      {!confirmedPropertyId && <p className="propertyPickerPrompt">Which property is this for?</p>}
      <div className="propertyPickerGrid">
        {properties.map((property) => {
          const isSuggested = property.id === suggestedId && !confirmedPropertyId
          const isSelected = property.id === confirmedPropertyId
          return (
            <button
              key={property.id}
              type="button"
              className={`propertyPickerOption ${isSelected ? 'selected' : ''} ${isSuggested ? 'suggested' : ''}`}
              onClick={() => onSelect(property.id)}
            >
              {isSuggested && <span className="propertyPickerBadge">Suggested match</span>}
              <strong>{property.address}</strong>
              <span>{property.city}</span>
            </button>
          )
        })}
      </div>
      {!properties.length && <p className="muted">Add a property first — Smart Upload needs at least one property to file this under.</p>}
    </div>
  )
}
