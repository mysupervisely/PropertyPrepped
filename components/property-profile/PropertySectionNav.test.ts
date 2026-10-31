import { describe, it, expect, vi } from 'vitest'
import { PropertySectionNav } from './PropertySectionNav'

type SectionButton = { key: string; props: { onClick: () => void; 'aria-pressed': boolean; children: unknown[] } }

function render(activeTab: 'Rent' | 'Maintenance' = 'Rent', rentSubTab: 'Lease' | 'Tenant' | 'Ledger' = 'Lease') {
  const onSelect = vi.fn()
  const tree = PropertySectionNav({ propertyAddress: 'Fictional property', activeTab, rentSubTab, maintenanceCount: 2, onSelect })
  return { tree, buttons: tree.props.children as SectionButton[], onSelect }
}

describe('property-scoped section navigation', () => {
  it('exposes all eight sections and names the selected property', () => {
    const { tree, buttons } = render()
    expect(tree.props['aria-label']).toBe('Sections for Fictional property')
    expect(buttons.map(button => button.key)).toEqual(['Overview', 'Rent', 'Tenant Connect', 'Maintenance', 'PropCrew', 'Documents', 'Tax', 'Details'])
  })
  it('routes Tenant Connect into the existing Rent/Tenant view', () => {
    const { buttons, onSelect } = render()
    buttons.find(button => button.key === 'Tenant Connect')!.props.onClick()
    expect(onSelect).toHaveBeenCalledWith('Rent', 'Tenant')
  })
  it('keeps exactly one active section for tenant, lease and ledger views', () => {
    for (const sub of ['Tenant', 'Lease', 'Ledger'] as const) {
      const { buttons } = render('Rent', sub)
      const active = buttons.filter(button => button.props['aria-pressed'])
      expect(active).toHaveLength(1)
      expect(active[0].key).toBe(sub === 'Tenant' ? 'Tenant Connect' : 'Rent')
    }
  })
  it('routes maintenance and PropCrew to their canonical property tabs', () => {
    const { buttons, onSelect } = render('Maintenance')
    for (const tab of ['Maintenance', 'PropCrew'] as const) {
      buttons.find(button => button.key === tab)!.props.onClick()
      expect(onSelect).toHaveBeenLastCalledWith(tab, undefined)
    }
    expect(buttons.find(button => button.key === 'Maintenance')!.props.children[1]).toMatchObject({ props: { children: 2 } })
  })
})
