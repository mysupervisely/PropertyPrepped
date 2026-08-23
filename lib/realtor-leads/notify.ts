// PropRoster Milestone 21: Realtor Connect V1 — lead notification email.
//
// Resend is now configured for PropRoster (RESEND_API_KEY,
// REALTOR_LEAD_NOTIFICATION_EMAIL, REALTOR_LEAD_FROM_EMAIL — all
// server-side only, read here, never sent to the browser, never
// hardcoded). This module stays split exactly as it was when no
// provider existed:
//   - buildLeadNotificationEmail(): pure, fully testable — builds the
//     exact subject/body from a lead row. No network, no provider. Used
//     unchanged from before Resend was wired in.
//   - sendLeadNotificationEmail(): the one integration point. Calls
//     Resend's HTTP API directly via fetch — same "plain fetch, no SDK
//     dependency" convention this codebase already uses for its other
//     third-party HTTP integrations (lib/address/providers/mapbox.ts,
//     lib/valuation/providers/*.ts) — rather than adding the `resend`
//     npm package for what is a single POST endpoint. Every failure mode
//     (missing config, a non-2xx response, a thrown network error) is
//     caught here and turned into a logged, non-throwing
//     { sent: false, reason } — this function must NEVER throw, since
//     lib/realtor-leads/handle-lead-submission.ts calls it only AFTER
//     the lead is already durably persisted, and a notification failure
//     must never take the successful submission down with it.

import type { RealtorLeadRow } from './types'

export type LeadNotificationEmail = { subject: string; body: string }

function formatMoney(n: number | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function formatPercent(n: number | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return `${n.toFixed(1)}%`
}

const SOURCE_LABEL: Record<string, string> = {
  rental_analyzer: 'Rental Property Analyzer',
  home_purchase: 'Home Purchase Calculator',
}

const SNAPSHOT_LABELS: Array<{ key: keyof NonNullable<RealtorLeadRow['analysis_snapshot']>; label: string; format: 'money' | 'percent' | 'number' }> = [
  { key: 'purchasePrice', label: 'Purchase price', format: 'money' },
  { key: 'downPaymentAmount', label: 'Down payment', format: 'money' },
  { key: 'downPaymentPercent', label: 'Down payment %', format: 'percent' },
  { key: 'loanAmount', label: 'Loan amount', format: 'money' },
  { key: 'interestRatePercent', label: 'Interest rate', format: 'percent' },
  { key: 'estimatedRentMonthly', label: 'Estimated rent', format: 'money' },
  { key: 'operatingExpensesMonthly', label: 'Operating expenses (monthly)', format: 'money' },
  { key: 'noiAnnual', label: 'NOI (annual)', format: 'money' },
  { key: 'monthlyCashFlow', label: 'Monthly cash flow', format: 'money' },
  { key: 'capRatePercent', label: 'Cap rate', format: 'percent' },
  { key: 'cashOnCashReturnPercent', label: 'Cash-on-cash return', format: 'percent' },
  { key: 'dscr', label: 'DSCR', format: 'number' },
  { key: 'estimatedMonthlyPayment', label: 'Estimated monthly payment', format: 'money' },
  { key: 'propertyTaxMonthly', label: 'Property tax (monthly)', format: 'money' },
  { key: 'insuranceMonthly', label: 'Insurance (monthly)', format: 'money' },
  { key: 'hoaMonthly', label: 'HOA (monthly)', format: 'money' },
  { key: 'closingCostsAmount', label: 'Closing costs', format: 'money' },
  { key: 'cashNeededToClose', label: 'Cash needed to close', format: 'money' },
]

/**
 * Pure: builds the exact subject/body for a lead notification. Never
 * includes anything beyond what's already on the lead row — no
 * secret/internal data (Section 10).
 */
export function buildLeadNotificationEmail(lead: RealtorLeadRow): LeadNotificationEmail {
  const isHomePurchase = lead.source === 'home_purchase'
  const baseLabel = isHomePurchase ? 'New PropRoster Home Buyer Lead' : 'New PropRoster Investment Lead'
  // Only append " - <address>" when the visitor actually supplied one —
  // a blank/missing property_address is a real, legitimate case (e.g. a
  // home buyer running the calculator before they've picked a specific
  // property), never fabricated. Previously this always appended a
  // literal "- address not provided" suffix, which read as broken
  // rather than as the honest "no address given" case it actually was.
  const subject = lead.property_address ? `${baseLabel} - ${lead.property_address}` : baseLabel

  const lines: string[] = []
  lines.push(`Calculator: ${SOURCE_LABEL[lead.source] || lead.source}`)
  lines.push(`Geography: ${lead.geography_bucket}`)
  lines.push('')
  lines.push('Contact')
  lines.push(`  Name: ${lead.name}`)
  if (lead.email) lines.push(`  Email: ${lead.email}`)
  if (lead.phone) lines.push(`  Phone: ${lead.phone}`)
  lines.push(`  Preferred contact method: ${lead.preferred_contact_method}`)
  lines.push('')
  lines.push('Property')
  lines.push(`  Address: ${lead.property_address || 'Not provided'}`)
  lines.push('')

  const snapshot = lead.analysis_snapshot
  if (snapshot) {
    const metricLines = SNAPSHOT_LABELS
      .map(({ key, label, format }) => {
        const raw = snapshot[key]
        if (typeof raw !== 'number') return null
        const formatted = format === 'money' ? formatMoney(raw) : format === 'percent' ? formatPercent(raw) : Number.isFinite(raw) ? String(raw) : null
        return formatted ? `  ${label}: ${formatted}` : null
      })
      .filter((line): line is string => Boolean(line))
    if (metricLines.length) {
      lines.push('Analysis')
      lines.push(...metricLines)
      lines.push('')
    }
  }

  if (lead.message) {
    lines.push('Message from the visitor')
    lines.push(`  ${lead.message}`)
    lines.push('')
  }

  return { subject, body: lines.join('\n') }
}

/** True only when every env var Resend needs is present — a partial config is treated as unconfigured, never a partial/best-effort send. */
export function isEmailNotificationConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.RESEND_API_KEY && env.REALTOR_LEAD_NOTIFICATION_EMAIL && env.REALTOR_LEAD_FROM_EMAIL)
}

export type SendResult = { sent: boolean; reason?: string; messageId?: string }

const RESEND_API_URL = 'https://api.resend.com/emails'

/**
 * The one integration seam for the email provider — sends via Resend's
 * HTTP API. Never throws: every failure (missing config, a non-2xx
 * response, a network error) is caught, logged server-side only (never
 * to the client — Resend's raw response body is never returned to the
 * caller), and reported back as a non-throwing { sent: false, reason }.
 * The lead itself is already durably persisted by the time this ever
 * runs (see handle-lead-submission.ts) — this function's outcome can
 * never take that back.
 *
 * Logs on BOTH outcomes now, always keyed by leadId (never by the
 * lead's own email/phone/message content) so a specific production
 * submission can be traced end-to-end without exposing anything
 * personal: a success logs Resend's own message id (the key needed to
 * look this exact send up in Resend's dashboard/API afterwards — a 200
 * here only means Resend ACCEPTED the message, not that it reached an
 * inbox; delivered/bounced/complained status lands in Resend
 * asynchronously after this call returns), a failure logs the status
 * and Resend's error body.
 */
export async function sendLeadNotificationEmail(lead: RealtorLeadRow, env: Record<string, string | undefined> = process.env): Promise<SendResult> {
  if (!isEmailNotificationConfigured(env)) {
    console.error('realtor-leads: email notification is not fully configured (RESEND_API_KEY / REALTOR_LEAD_NOTIFICATION_EMAIL / REALTOR_LEAD_FROM_EMAIL) — lead notification email was not sent.', { leadId: lead.id })
    return { sent: false, reason: 'not_configured' }
  }

  const { subject, body } = buildLeadNotificationEmail(lead)

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.REALTOR_LEAD_FROM_EMAIL,
        to: env.REALTOR_LEAD_NOTIFICATION_EMAIL,
        subject,
        text: body,
        // Lets whoever reads the notification hit "Reply" and email the
        // lead directly, instead of copying their address out of the
        // body by hand. Only set when the lead actually gave an email —
        // never sent as an empty/undefined value.
        ...(lead.email ? { reply_to: lead.email } : {}),
      }),
    })

    // Read once, defensively — Resend returns a JSON body on both
    // success ({ id: "..." }) and failure; never let a parse failure
    // here turn into an uncaught throw either way.
    const responseText = await response.text().catch(() => '')
    let responseJson: { id?: string } = {}
    try {
      responseJson = responseText ? JSON.parse(responseText) : {}
    } catch {
      // Non-JSON body (e.g. an upstream proxy error page) — fall
      // through with responseJson = {}, handled the same as "no id".
    }

    if (!response.ok) {
      // Logged, never returned to the caller — the raw body can include
      // Resend's own error detail (e.g. "Invalid `from` field"), which
      // is useful for tracing but not something to surface to the user.
      console.error('realtor-leads: Resend email send failed', { leadId: lead.id, status: response.status, body: responseText })
      return { sent: false, reason: 'provider_error' }
    }

    console.log('realtor-leads: Resend accepted the lead notification email', { leadId: lead.id, resendMessageId: responseJson.id })
    return { sent: true, messageId: responseJson.id }
  } catch (err) {
    console.error('realtor-leads: Resend email send threw', { leadId: lead.id, err })
    return { sent: false, reason: 'provider_error' }
  }
}
