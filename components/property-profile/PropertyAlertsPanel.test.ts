import { it, expect, vi } from 'vitest'
import { PropertyAlertsPanel } from './PropertyAlertsPanel'
import type { DashboardDateItem } from '../../lib/dashboard/attention'
const item = (id: string, propertyId: string): DashboardDateItem => ({ id, propertyId, propertyLabel: 'Example', type: 'Maintenance', label: 'Service overdue', description: `Repair ${id}`, date: '2026-01-01', daysUntil: -10, urgency: 'Expired', nav: { tab: 'Maintenance' } })
it('shows all of the selected property alerts, without the dashboard top-ten limit or another property', () => {
  const onOpen = vi.fn(), onClose = vi.fn()
  const items = [...Array.from({ length: 14 }, (_, i) => item(String(i), 'a')), item('other', 'b')]
  const tree = PropertyAlertsPanel({ propertyId: 'a', address: 'Example A', items, onOpen, onClose })
  const buttons = tree.props.children[1]
  expect(buttons).toHaveLength(14)
  buttons[13].props.onClick()
  expect(onOpen).toHaveBeenCalledWith('a', { tab: 'Maintenance' })
  tree.props.children[0].props.children[1].props.onClick()
  expect(onClose).toHaveBeenCalledOnce()
})
it('closes on Escape so the parent can restore focus to the status button', () => {
  const onClose = vi.fn(), stopPropagation = vi.fn()
  const tree = PropertyAlertsPanel({ propertyId: 'a', address: 'Example A', items: [], onClose, onOpen: vi.fn() })
  tree.props.onKeyDown({ key: 'Escape', stopPropagation } as never)
  expect(onClose).toHaveBeenCalledOnce()
  expect(stopPropagation).toHaveBeenCalledOnce()
})
