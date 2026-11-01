import * as React from 'react'

type PropertyTab = 'Overview' | 'Rent' | 'Maintenance' | 'PropCrew' | 'Documents' | 'Tax' | 'Details'
const sections: { label: string; tab: PropertyTab; rent?: 'Lease' | 'Tenant' }[] = [
  { label: 'Overview', tab: 'Overview' },
  { label: 'Rent', tab: 'Rent', rent: 'Lease' },
  { label: 'Tenant Connect', tab: 'Rent', rent: 'Tenant' },
  { label: 'Maintenance', tab: 'Maintenance' },
  { label: 'PropCrew', tab: 'PropCrew' },
  { label: 'Documents', tab: 'Documents' },
  { label: 'Tax', tab: 'Tax' },
  { label: 'Details', tab: 'Details' },
]

export function PropertySectionNav({ propertyAddress, activeTab, rentSubTab, maintenanceCount, onSelect, onEdit }: {
  onEdit: () => void
  propertyAddress: string
  activeTab: PropertyTab
  rentSubTab: 'Lease' | 'Ledger' | 'Tenant' | 'Conditions'
  maintenanceCount: number
  onSelect: (tab: PropertyTab, rent?: 'Lease' | 'Tenant') => void
}) {
  return <nav className="propertyWorkspaceSections" aria-label={`Sections for ${propertyAddress}`}>
    {sections.map(section => {
      const current = activeTab === section.tab && (section.tab !== 'Rent'
        || (section.rent === 'Tenant' ? rentSubTab === 'Tenant' : rentSubTab !== 'Tenant'))
      return <button type="button" key={section.label} aria-pressed={current} className={current ? 'active' : ''} onClick={() => onSelect(section.tab, section.rent)}>
        {section.label}{section.tab === 'Maintenance' && maintenanceCount > 0 && <span className="propertySectionCount">- {maintenanceCount}</span>}
      </button>
    })}
    <button key="Edit" type="button" onClick={onEdit} aria-label={`Edit ${propertyAddress}`}>Edit</button>
  </nav>
}
