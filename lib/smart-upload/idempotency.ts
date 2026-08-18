// PropRoster — Smart Upload Foundation: duplicate-save protection (Part
// 25). A smart_upload_items row records which downstream record it has
// already created — these pure guards are the ONE place that decides
// "has this already happened," so a double-tapped Save button, a
// retried request, or a re-render can never insert a second
// financial_transaction / maintenance_record / property_contacts row for
// the same Smart Upload item. The actual Supabase calls stay in the UI
// layer (untestable without a live database); these are the plain
// booleans that gate them.

import type { SmartUploadItemRow } from './types'

export function shouldCreateFinancialTransaction(item: Pick<SmartUploadItemRow, 'created_financial_transaction_id'>): boolean {
  return item.created_financial_transaction_id == null
}

export function shouldCreateMaintenanceRecord(item: Pick<SmartUploadItemRow, 'created_maintenance_record_id'>): boolean {
  return item.created_maintenance_record_id == null
}

export function shouldCreateContact(item: Pick<SmartUploadItemRow, 'created_contact_id'>): boolean {
  return item.created_contact_id == null
}

/** True once every action the user chose for this item has already run. Save becomes "Already saved" instead of a live button. */
export function isFullyCreated(
  item: Pick<SmartUploadItemRow, 'created_financial_transaction_id' | 'created_maintenance_record_id' | 'created_contact_id'>,
  wanted: { financialTransaction: boolean; maintenanceRecord: boolean; contact: boolean },
): boolean {
  if (wanted.financialTransaction && !item.created_financial_transaction_id) return false
  if (wanted.maintenanceRecord && !item.created_maintenance_record_id) return false
  if (wanted.contact && !item.created_contact_id) return false
  return true
}
