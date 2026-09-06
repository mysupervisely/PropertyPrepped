import { describe, expect, it } from 'vitest'
import { presentMaintenanceStatus, summarizeMaintenanceCaseCounts, syncedTenantRequestStatus, REOPENED_STATUS } from './status'

describe('presentMaintenanceStatus', () => {
  it('a tenant-sourced case still in Submitted shows as Needs Review — it has not been looked at yet', () => {
    expect(presentMaintenanceStatus('Submitted', 'tenant')).toEqual({ bucket: 'Needs Review', label: 'Needs Review' })
  })

  it('a landlord-sourced case in Submitted shows as Open — the landlord already knows about their own case', () => {
    expect(presentMaintenanceStatus('Submitted', 'landlord')).toEqual({ bucket: 'Open', label: 'Open' })
  })

  it('Scheduled counts toward the In Progress bucket but keeps its own specific label', () => {
    const presented = presentMaintenanceStatus('Scheduled', 'tenant')
    expect(presented.bucket).toBe('In Progress')
    expect(presented.label).toBe('Scheduled')
  })

  it('In Progress presents as itself, regardless of source', () => {
    expect(presentMaintenanceStatus('In Progress', 'tenant').label).toBe('In Progress')
    expect(presentMaintenanceStatus('In Progress', 'landlord').label).toBe('In Progress')
  })

  it('Completed presents as itself, regardless of source', () => {
    expect(presentMaintenanceStatus('Completed', 'tenant')).toEqual({ bucket: 'Completed', label: 'Completed' })
    expect(presentMaintenanceStatus('Completed', 'landlord')).toEqual({ bucket: 'Completed', label: 'Completed' })
  })
})

describe('summarizeMaintenanceCaseCounts', () => {
  it('tallies a mixed set of cases into the four summary buckets', () => {
    const counts = summarizeMaintenanceCaseCounts([
      { status: 'Submitted', source: 'tenant' },   // Needs Review
      { status: 'Submitted', source: 'landlord' }, // Open
      { status: 'Scheduled', source: 'tenant' },   // In Progress
      { status: 'In Progress', source: 'landlord' }, // In Progress
      { status: 'Completed', source: 'tenant' },   // Completed
    ])
    expect(counts).toEqual({ 'Needs Review': 1, Open: 1, 'In Progress': 2, Completed: 1 })
  })

  it('returns all-zero counts for an empty case list, never throws', () => {
    expect(summarizeMaintenanceCaseCounts([])).toEqual({ 'Needs Review': 0, Open: 0, 'In Progress': 0, Completed: 0 })
  })
})

describe('syncedTenantRequestStatus — the M1.1 tenant/canonical sync fix', () => {
  it('Submitted syncs the tenant view to New', () => {
    expect(syncedTenantRequestStatus('Submitted')).toBe('New')
  })

  it('Scheduled and In Progress both sync the tenant view to In Progress', () => {
    expect(syncedTenantRequestStatus('Scheduled')).toBe('In Progress')
    expect(syncedTenantRequestStatus('In Progress')).toBe('In Progress')
  })

  it('Completed syncs the tenant view to Resolved', () => {
    expect(syncedTenantRequestStatus('Completed')).toBe('Resolved')
  })
})

describe('REOPENED_STATUS', () => {
  it('reopening a case sets it to In Progress, not back to Submitted', () => {
    expect(REOPENED_STATUS).toBe('In Progress')
  })
})
