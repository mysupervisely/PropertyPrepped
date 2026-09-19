import { describe, expect, it } from 'vitest'
import { mapPaymentMethod, mapInvoices } from './summary'

describe('mapPaymentMethod', () => {
  it('returns brand/last4 only from an expanded default payment method', () => {
    const result = mapPaymentMethod({ invoice_settings: { default_payment_method: { card: { brand: 'visa', last4: '4242' } } } })
    expect(result).toEqual({ brand: 'visa', last4: '4242' })
  })

  it('never leaks anything beyond brand/last4 even if the card object had more fields', () => {
    const result = mapPaymentMethod({
      invoice_settings: { default_payment_method: { card: { brand: 'mastercard', last4: '0000', ...({ exp_month: 1, funding: 'credit' } as Record<string, unknown>) } as { brand: string; last4: string } } },
    })
    expect(Object.keys(result || {})).toEqual(['brand', 'last4'])
  })

  it('returns null when there is no default payment method', () => {
    expect(mapPaymentMethod({ invoice_settings: { default_payment_method: null } })).toBeNull()
  })

  it('returns null when the payment method is an unexpanded string id (never leaks a raw pm_ id as if it were a summary)', () => {
    expect(mapPaymentMethod({ invoice_settings: { default_payment_method: 'pm_123' } })).toBeNull()
  })

  it('returns null when the payment method is not a card (e.g. bank transfer)', () => {
    expect(mapPaymentMethod({ invoice_settings: { default_payment_method: {} } })).toBeNull()
  })

  it('returns null for a null customer', () => {
    expect(mapPaymentMethod(null)).toBeNull()
  })
})

describe('mapInvoices', () => {
  it('maps amount_paid from cents to dollars and created from unix seconds to ISO', () => {
    const result = mapInvoices([
      { id: 'in_1', amount_paid: 999, currency: 'usd', status: 'paid', created: 1750000000, hosted_invoice_url: 'https://invoice.stripe.com/i/1' },
    ])
    expect(result).toEqual([
      { id: 'in_1', amountPaid: 9.99, currency: 'usd', status: 'paid', created: new Date(1750000000 * 1000).toISOString(), hostedInvoiceUrl: 'https://invoice.stripe.com/i/1' },
    ])
  })

  it('preserves order and handles an empty list', () => {
    expect(mapInvoices([])).toEqual([])
  })
})
