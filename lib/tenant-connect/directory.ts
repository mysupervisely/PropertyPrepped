// PropRoster — Tenant Connect V2.1: portfolio-wide tenant directory.
//
// Pure data-shaping only — no Supabase, no React, same convention as
// lib/leases/status.ts and lib/maintenance/command-center.ts. Builds one
// directory row per property's CURRENT lease (selectCurrentLease — the
// exact function app/page.tsx's own property workspace already uses to
// decide "who is the tenant here right now"), joined to that lease's own
// Tenant Connect access row via lib/tenant-connect/helpers.ts's
// findAccessForLease. This module never invents a connection status, an
// unread count, or a request count of its own — every field here is a
// direct read or join of data that already exists elsewhere.
//
// A property with no current lease has no tenant to connect yet and is
// simply not a row — nothing to search, invite, or show for it here.

import { selectCurrentLease } from '../leases/status'
import { findAccessForLease, tenantConnectStatusLabel, type TenantConnectStatusLabel } from './helpers'
import type { TenantPropertyAccess, TenantRequestStatus } from './types'

export type DirectoryProperty = { id: string; address: string; city: string }
export type DirectoryLease = {
  id: string
  property_id: string
  tenant_name: string
  tenant_email: string | null
  start_date: string | null
  end_date: string | null
}
export type DirectoryTenantRequest = { tenant_access_id: string; status: TenantRequestStatus }

export type TenantDirectoryRow = {
  propertyId: string
  propertyLabel: string
  leaseId: string
  tenantName: string
  tenantEmail: string | null
  access: TenantPropertyAccess | null
  statusLabel: TenantConnectStatusLabel
  openRequestCount: number
}

/** Same "Address, City" join every other portfolio-wide list in this app already uses (e.g. app/maintenance/page.tsx's propertyLabel()). */
export function directoryPropertyLabel(property: DirectoryProperty): string {
  return property.city ? `${property.address}, ${property.city}` : property.address
}

export function buildTenantDirectory(
  properties: DirectoryProperty[],
  leases: DirectoryLease[],
  access: TenantPropertyAccess[],
  tenantRequests: DirectoryTenantRequest[],
): TenantDirectoryRow[] {
  const leasesByProperty = new Map<string, DirectoryLease[]>()
  for (const lease of leases) {
    const list = leasesByProperty.get(lease.property_id) || []
    list.push(lease)
    leasesByProperty.set(lease.property_id, list)
  }

  const rows: TenantDirectoryRow[] = []
  for (const property of properties) {
    const current = selectCurrentLease(leasesByProperty.get(property.id) || [])
    if (!current) continue
    const accessRow = findAccessForLease(access, current.id)
    rows.push({
      propertyId: property.id,
      propertyLabel: directoryPropertyLabel(property),
      leaseId: current.id,
      tenantName: current.tenant_name,
      tenantEmail: current.tenant_email,
      access: accessRow,
      statusLabel: tenantConnectStatusLabel(accessRow?.status ?? null),
      openRequestCount: accessRow
        ? tenantRequests.filter((r) => r.tenant_access_id === accessRow.id && r.status !== 'Resolved').length
        : 0,
    })
  }
  return rows
}

export type TenantDirectorySummary = { connected: number; pending: number; notConnected: number; total: number }

export function summarizeTenantDirectory(rows: TenantDirectoryRow[]): TenantDirectorySummary {
  const connected = rows.filter((r) => r.statusLabel === 'Connected').length
  const pending = rows.filter((r) => r.statusLabel === 'Invited').length
  return { connected, pending, notConnected: rows.length - connected - pending, total: rows.length }
}

/** Case-insensitive match on tenant name, tenant email, or property label — the three fields the directory actually displays, nothing hidden. */
export function filterTenantDirectory(rows: TenantDirectoryRow[], query: string): TenantDirectoryRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter(
    (r) =>
      r.tenantName.toLowerCase().includes(q) ||
      (r.tenantEmail || '').toLowerCase().includes(q) ||
      r.propertyLabel.toLowerCase().includes(q),
  )
}
