import { describe, expect, it } from 'vitest'
import { isFullyCreated, shouldCreateContact, shouldCreateFinancialTransaction, shouldCreateMaintenanceRecord } from './idempotency'

const blank = { created_financial_transaction_id: null, created_maintenance_record_id: null, created_contact_id: null }

describe('RECEIPTS — no duplicate expense on repeated save', () => {
  it('shouldCreateFinancialTransaction is true before any save', () => {
    expect(shouldCreateFinancialTransaction(blank)).toBe(true)
  })
  it('shouldCreateFinancialTransaction is false once a transaction id is recorded — a second Save click is a no-op', () => {
    expect(shouldCreateFinancialTransaction({ created_financial_transaction_id: 'tx-1' })).toBe(false)
  })
})

describe('MAINTENANCE — no duplicate maintenance record on repeated save', () => {
  it('true before, false after', () => {
    expect(shouldCreateMaintenanceRecord(blank)).toBe(true)
    expect(shouldCreateMaintenanceRecord({ created_maintenance_record_id: 'm-1' })).toBe(false)
  })
})

describe('PROPCREW — no duplicate contact on repeated save', () => {
  it('true before, false after', () => {
    expect(shouldCreateContact(blank)).toBe(true)
    expect(shouldCreateContact({ created_contact_id: 'c-1' })).toBe(false)
  })
})

describe('isFullyCreated', () => {
  it('a blank item wanting only a financial transaction is not fully created yet', () => {
    expect(isFullyCreated(blank, { financialTransaction: true, maintenanceRecord: false, contact: false })).toBe(false)
  })
  it('is fully created once every wanted action has a recorded id', () => {
    const item = { created_financial_transaction_id: 'tx-1', created_maintenance_record_id: 'm-1', created_contact_id: null }
    expect(isFullyCreated(item, { financialTransaction: true, maintenanceRecord: true, contact: false })).toBe(true)
  })
  it('is NOT fully created if a wanted action has no recorded id yet, even when others are done', () => {
    const item = { created_financial_transaction_id: 'tx-1', created_maintenance_record_id: null, created_contact_id: null }
    expect(isFullyCreated(item, { financialTransaction: true, maintenanceRecord: true, contact: false })).toBe(false)
  })
  it('an item wanting nothing is trivially fully created', () => {
    expect(isFullyCreated(blank, { financialTransaction: false, maintenanceRecord: false, contact: false })).toBe(true)
  })
})
