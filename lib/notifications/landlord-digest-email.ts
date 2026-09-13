// PropRoster — Landlord Digest V1: email composition.
//
// Pure, fully testable — no network, no Supabase. Same split as every
// other PropRoster transactional email (lib/tenant-connect/notify.ts,
// lib/realtor-leads/notify.ts): this module only builds { subject,
// text, html }; lib/notifications/landlord-digest-send.ts is the one
// integration point that actually calls Resend.
//
// Tone: calm, factual, never alarming beyond what the underlying data
// actually warrants (Section "the email should not sound alarming
// unless the underlying status genuinely warrants urgency") — every
// line comes straight from a DashboardDateItem's own canonical `label`/
// `daysUntil`, never a rewritten/dramatized version of it.

import type { DashboardDateItem } from '../dashboard/attention'
import { type DigestGroup, digestItemLink, digestDashboardLink } from './landlord-digest-items'

export type LandlordDigestEmail = { subject: string; text: string; html: string }

const APP_NAME = 'PropRoster'

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** "PropRoster: 3 things need your attention" / "PropRoster: 1 thing needs your attention" — calm, no clickbait, the count is genuinely useful (Section "Email Subject"). Always called with itemCount > 0 — buildLandlordDigestEmail() is never invoked at all when there is nothing to report (Section "if nothing needs attention, send nothing"). */
export function buildLandlordDigestSubject(itemCount: number): string {
  return itemCount === 1 ? `${APP_NAME}: 1 thing needs your attention` : `${APP_NAME}: ${itemCount} things need your attention`
}

/**
 * One factual detail line for an item — the canonical `label` a
 * Dashboard "Needs Attention" row already shows, plus a day count for
 * the date-driven types where that count adds real information. Rent
 * and TenantRequest labels (from lib/rent-ledger/ledger.ts /
 * lib/tenant-connect/requests.ts) are already complete, calendar-
 * relative sentences ("Rent overdue," "New maintenance request") —
 * appending "(in 0 days)" to those would be redundant/confusing, since
 * both types always carry daysUntil === 0 by construction.
 */
export function digestDetailLine(item: DashboardDateItem): string {
  if (item.type === 'Rent' || item.type === 'TenantRequest') return item.label
  const days = item.daysUntil
  if (days < 0) return `${item.label} (${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago)`
  if (days === 0) return `${item.label} (today)`
  return `${item.label} (in ${days} day${days === 1 ? '' : 's'})`
}

const GROUP_HEADING: Record<DigestGroup['name'], string> = {
  Rent: 'Rent',
  Leases: 'Leases',
  Maintenance: 'Maintenance',
  Property: 'Property',
}

/**
 * Builds the complete weekly digest email for one owner. `groups` is
 * already-built, already-sorted, already-grouped output from
 * groupDigestItems() — this function only renders it; it never
 * recomputes urgency, status, or ordering. Caller (landlord-digest-run.ts)
 * is responsible for never calling this with an empty item list.
 */
export function buildLandlordDigestEmail(groups: DigestGroup[], origin: string): LandlordDigestEmail {
  const itemCount = groups.reduce((sum, g) => sum + g.items.length, 0)
  const subject = buildLandlordDigestSubject(itemCount)
  const dashboardUrl = digestDashboardLink(origin)
  const countPhrase = itemCount === 1 ? '1 thing needs your attention this week.' : `${itemCount} things need your attention this week.`

  const textLines: string[] = [`${APP_NAME} Weekly`, '', countPhrase, '']
  const htmlSections: string[] = []

  for (const group of groups) {
    textLines.push(GROUP_HEADING[group.name].toUpperCase())
    for (const item of group.items) {
      textLines.push(`  ${item.propertyLabel} — ${digestDetailLine(item)}`)
    }
    textLines.push('')

    const rows = group.items
      .map((item) => {
        const link = digestItemLink(origin, item.propertyId, item.nav)
        return `<tr>
          <td style="padding:10px 0;border-top:1px solid #e5e9e6;">
            <a href="${link}" style="color:#1a1a1a;text-decoration:none;">
              <strong style="font-size:14px;">${escapeHtml(item.propertyLabel)}</strong><br/>
              <span style="font-size:13.5px;color:#4b5a52;">${escapeHtml(digestDetailLine(item))}</span>
            </a>
          </td>
        </tr>`
      })
      .join('')
    htmlSections.push(`<h2 style="margin:20px 0 4px;font-size:12.5px;font-weight:750;letter-spacing:.03em;text-transform:uppercase;color:#1f6f4a;">${escapeHtml(GROUP_HEADING[group.name])}</h2><table role="presentation" width="100%" style="border-collapse:collapse;">${rows}</table>`)
  }

  textLines.push('View in PropRoster:', dashboardUrl)

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;max-width:520px;">
    <p style="margin:0 0 4px;font-size:17px;font-weight:700;color:#1a1a1a;">${APP_NAME} Weekly</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.5;color:#1a1a1a;">${escapeHtml(countPhrase)}</p>
    ${htmlSections.join('')}
    <p style="margin:26px 0 0;">
      <a href="${dashboardUrl}" style="display:inline-block;background:#1f6f4a;color:#ffffff;text-decoration:none;font-weight:650;font-size:15px;padding:12px 22px;border-radius:8px;">View in PropRoster</a>
    </p>
    <p style="margin:14px 0 0;font-size:11.5px;color:#8b978f;">You're receiving this because weekly digest emails are turned on for your PropRoster account. Turn them off anytime from Profile &gt; Notifications.</p>
  </div>`

  return { subject, text: textLines.join('\n'), html }
}
