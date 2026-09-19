// PropRoster — Subscription Management: pure mapping for the customer
// billing page's "payment method summary" + "recent invoices" section.
//
// Deliberately narrow, hand-picked shapes (never the full Stripe.Customer/
// Stripe.Invoice objects) — this is the boundary that decides exactly
// what leaves the server: a card BRAND and LAST 4 DIGITS only (never a
// full card number, which Stripe's API never even returns), and a short
// list of invoice metadata plus Stripe's own hosted invoice page link
// (safe to expose — that page is Stripe's standard customer-facing
// receipt view, not a secret).

export type PaymentMethodSummary = { brand: string; last4: string } | null

export type StripeCustomerLike = {
  invoice_settings?: {
    default_payment_method?: { card?: { brand: string; last4: string } | null } | string | null
  } | null
}

export function mapPaymentMethod(customer: StripeCustomerLike | null): PaymentMethodSummary {
  const pm = customer?.invoice_settings?.default_payment_method
  if (!pm || typeof pm === 'string') return null
  if (!pm.card) return null
  return { brand: pm.card.brand, last4: pm.card.last4 }
}

export type InvoiceSummary = {
  id: string
  amountPaid: number
  currency: string
  status: string | null
  created: string
  hostedInvoiceUrl: string | null
}

export type StripeInvoiceLike = {
  id: string
  amount_paid: number
  currency: string
  status: string | null
  created: number
  hosted_invoice_url: string | null
}

export function mapInvoice(invoice: StripeInvoiceLike): InvoiceSummary {
  return {
    id: invoice.id,
    amountPaid: invoice.amount_paid / 100,
    currency: invoice.currency,
    status: invoice.status,
    created: new Date(invoice.created * 1000).toISOString(),
    hostedInvoiceUrl: invoice.hosted_invoice_url,
  }
}

export function mapInvoices(invoices: StripeInvoiceLike[]): InvoiceSummary[] {
  return invoices.map(mapInvoice)
}
