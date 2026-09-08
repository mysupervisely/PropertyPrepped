import { describe, expect, it } from 'vitest'
import {
  NO_TENANT_LABEL, defaultNewMaintenanceRequestDraft, isNewMaintenanceRequestValid, buildNewMaintenanceRequestPayload,
} from './new-request'

describe('defaultNewMaintenanceRequestDraft', () => {
  it('defaults to Normal priority, Submitted status, no tenant attached', () => {
    const draft = defaultNewMaintenanceRequestDraft('prop-1')
    expect(draft).toEqual({ propertyId: 'prop-1', title: '', description: '', priority: 'Normal', status: 'Submitted', onBehalfOfTenant: false, tenantName: '', tenantEmail: '' })
  })

  it('defaults propertyId to empty string when omitted (portfolio-level entry, property not yet chosen)', () => {
    expect(defaultNewMaintenanceRequestDraft().propertyId).toBe('')
  })
})

describe('isNewMaintenanceRequestValid', () => {
  it('requires a property and a non-blank title — nothing else', () => {
    const base = defaultNewMaintenanceRequestDraft('prop-1')
    expect(isNewMaintenanceRequestValid({ ...base, title: 'AC not cooling' })).toBe(true)
  })

  it('is invalid with no property chosen', () => {
    expect(isNewMaintenanceRequestValid({ ...defaultNewMaintenanceRequestDraft(), title: 'AC not cooling' })).toBe(false)
  })

  it('is invalid with a blank/whitespace-only title', () => {
    expect(isNewMaintenanceRequestValid({ ...defaultNewMaintenanceRequestDraft('prop-1'), title: '' })).toBe(false)
    expect(isNewMaintenanceRequestValid({ ...defaultNewMaintenanceRequestDraft('prop-1'), title: '   ' })).toBe(false)
  })

  it('never requires tenant information — a vacant-property report is valid with tenant fields entirely empty', () => {
    const draft = { ...defaultNewMaintenanceRequestDraft('prop-1'), title: 'AC not cooling', onBehalfOfTenant: false, tenantName: '', tenantEmail: '' }
    expect(isNewMaintenanceRequestValid(draft)).toBe(true)
  })
})

describe('buildNewMaintenanceRequestPayload — never invents a fake tenant', () => {
  it('a vacant-property / no-tenant report gets the honest NO_TENANT_LABEL placeholder, never a fabricated name', () => {
    const draft = { ...defaultNewMaintenanceRequestDraft('prop-1'), title: 'AC not cooling', description: 'Blows warm air', onBehalfOfTenant: false, tenantName: '', tenantEmail: '' }
    const payload = buildNewMaintenanceRequestPayload(draft)
    expect(payload.tenantName).toBe(NO_TENANT_LABEL)
    expect(payload.tenantName).toBe('Landlord')
    expect(payload.tenantEmail).toBeNull()
  })

  it('when onBehalfOfTenant is true and a name was typed/prefilled, uses it verbatim', () => {
    const draft = { ...defaultNewMaintenanceRequestDraft('prop-1'), title: 'Leaking faucet', onBehalfOfTenant: true, tenantName: 'Taylor Morgan', tenantEmail: 'taylor@example.com' }
    const payload = buildNewMaintenanceRequestPayload(draft)
    expect(payload.tenantName).toBe('Taylor Morgan')
    expect(payload.tenantEmail).toBe('taylor@example.com')
  })

  it('onBehalfOfTenant=true but an EMPTY typed name still falls back to the honest placeholder, never an empty string reaching the NOT NULL column', () => {
    const draft = { ...defaultNewMaintenanceRequestDraft('prop-1'), title: 'Leaking faucet', onBehalfOfTenant: true, tenantName: '  ', tenantEmail: '' }
    const payload = buildNewMaintenanceRequestPayload(draft)
    expect(payload.tenantName).toBe(NO_TENANT_LABEL)
  })

  it('onBehalfOfTenant=false ignores whatever is left in the tenant fields, even if previously filled', () => {
    const draft = { ...defaultNewMaintenanceRequestDraft('prop-1'), title: 'Leaking faucet', onBehalfOfTenant: false, tenantName: 'Stale Name', tenantEmail: 'stale@example.com' }
    const payload = buildNewMaintenanceRequestPayload(draft)
    expect(payload.tenantName).toBe(NO_TENANT_LABEL)
    expect(payload.tenantEmail).toBeNull()
  })

  it('trims title/description/tenant fields', () => {
    const draft = { ...defaultNewMaintenanceRequestDraft('prop-1'), title: '  AC not cooling  ', description: '  blows warm air  ', onBehalfOfTenant: true, tenantName: '  Taylor Morgan  ', tenantEmail: '  taylor@example.com  ' }
    const payload = buildNewMaintenanceRequestPayload(draft)
    expect(payload.title).toBe('AC not cooling')
    expect(payload.description).toBe('blows warm air')
    expect(payload.tenantName).toBe('Taylor Morgan')
    expect(payload.tenantEmail).toBe('taylor@example.com')
  })

  it('preserves the chosen priority/status/property verbatim', () => {
    const draft = { ...defaultNewMaintenanceRequestDraft('prop-1'), title: 'x', priority: 'Urgent', status: 'Scheduled' }
    const payload = buildNewMaintenanceRequestPayload(draft)
    expect(payload.priority).toBe('Urgent')
    expect(payload.status).toBe('Scheduled')
    expect(payload.propertyId).toBe('prop-1')
  })
})
