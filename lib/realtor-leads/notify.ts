// PropRoster Milestone 21: Realtor Connect V1 — lead notification email.
//
// Section 10: "STOP before adding a paid/external email provider
// automatically... Do not silently introduce a new paid service." This
// codebase has NO email infrastructure at all today (checked: no
// resend/sendgrid/nodemailer/SMTP dependency or code anywhere) — adding
// one is a real product/infra decision (which provider, whose account,
// whose billing) that isn't this milestone's call to make silently.
//
// So this module is split cleanly in two:
//   - buildLeadNotificationEmail(): pure, fully testable — builds the
//     exact subject/body from a lead row. No network, no provider.
//   - sendLeadNotificationEmail(): the ONLY place an external email
//     provider would ever be wired in. Today it does not call one — it
//     logs the built email server-side (visible in Netlify/server
//     function logs) so a submitted lead is never silently lost even
//     before a provider is chosen, and returns { sent: false, reason }
//     so the API route can report accurately. Swapping in a real
//     provider later is a one-function change here; nothing else in this
//     module needs to change.
//
// REALTOR_LEAD_NOTIFICATION_EMAIL (server-side only, never sent to the
// browser) is read here — see .env.example. Never hardcode a personal
// email in source (Section 10).

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
  const addressForSubject = lead.property_address || 'address not provided'
  const subject = isHomePurchase
    ? `New PropRoster Home Buyer Lead - ${addressForSubject}`
    : `New PropRoster Investment Lead - ${addressForSubject}`

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

export function isEmailNotificationConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.REALTOR_LEAD_NOTIFICATION_EMAIL)
}

export type SendResult = { sent: boolean; reason?: string }

/**
 * The one integration seam for an actual email provider. No provider is
 * configured in this codebase today, so this always logs the built
 * email server-side (never to the client, never to the browser console)
 * and returns sent: false — the lead itself is still safely persisted by
 * the caller regardless of this result (Section 10/11: submission
 * success must never depend on notification succeeding). See this file's
 * top comment for what changes here once a real provider is chosen.
 */
export async function sendLeadNotificationEmail(lead: RealtorLeadRow, env: Record<string, string | undefined> = process.env): Promise<SendResult> {
  if (!isEmailNotificationConfigured(env)) {
    console.error('realtor-leads: REALTOR_LEAD_NOTIFICATION_EMAIL is not set — lead notification email was not sent.', { leadId: lead.id })
    return { sent: false, reason: 'not_configured' }
  }

  const { subject, body } = buildLeadNotificationEmail(lead)
  // No email provider is wired into this codebase yet (Section 10) — log
  // the fully-built notification server-side so it's never silently lost,
  // rather than fabricating a "sent" result.
  console.error('realtor-leads: no email provider configured — logging notification instead of sending.', {
    leadId: lead.id,
    to: env.REALTOR_LEAD_NOTIFICATION_EMAIL,
    subject,
    body,
  })
  return { sent: false, reason: 'no_provider_configured' }
}
