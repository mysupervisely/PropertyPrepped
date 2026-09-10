// PropRoster — Tenant Connect V1 (Milestone 24): transactional email.
//
// Section 11: "FIRST audit whether PropRoster already has a
// production-safe email provider/infrastructure... If it does, use the
// existing infrastructure conservatively." It does — Resend, already
// wired for Realtor Connect (lib/realtor-leads/notify.ts,
// RESEND_API_KEY). This module is the SAME pattern applied to Tenant
// Connect's three required notifications, not a new provider/vendor:
//   - buildInviteEmail() / buildNewRequestEmail() / buildLandlordUpdateEmail():
//     pure, fully testable, no network.
//   - sendTenantConnectEmail(): the one integration point — same "plain
//     fetch to Resend's HTTP API, never throws, logs and returns
//     { sent: false, reason } on any failure" contract as
//     lib/realtor-leads/notify.ts's sendLeadNotificationEmail().
//
// EMAIL DELIVERY REQUIRES FOLLOW-UP: this module is gated on a NEW env
// var, TENANT_CONNECT_FROM_EMAIL (alongside the already-configured
// RESEND_API_KEY), so it stays disabled — safely, non-throwing, exactly
// like an unconfigured Realtor Connect would — until that var is set in
// production. See the completion report for exactly what to set.

import type { TenantRequestCategory } from './types'
import { maintenanceCategoryLabel } from '../maintenance/categories'

// `html` is optional (existing callers/tests that only build { subject,
// body } still typecheck and still send fine — sendTenantConnectEmail
// only adds an html field to the Resend payload when one is present);
// every builder below now always populates it, so every recipient gets
// a real HTML email with a clickable button, not just a client's own
// best-effort auto-linking of a bare URL in the plain-text body.
export type TenantConnectEmail = { subject: string; body: string; html?: string }

const APP_NAME = 'PropRoster'

/** Minimal escaping for the few dynamic strings (property address, request title) that land inside the HTML variant — this is a plain address/title, never markup, but email HTML still shouldn't trust it unescaped. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * One shared, minimal HTML shell for all three Tenant Connect emails —
 * plain paragraphs plus a single prominent button-styled link when a
 * destination URL is given. Inline styles only (no external CSS/
 * images/fonts), the same "no dependency on anything outside the email
 * itself" constraint transactional email always needs. `paragraphs` are
 * already-composed, trusted display strings (callers already escape
 * anything dynamic via escapeHtml before handing it here).
 */
function emailHtml(paragraphs: string[], link?: { url: string; label: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#1a1a1a;">${p}</p>`).join('')
  const button = link
    ? `<p style="margin:0 0 16px;"><a href="${link.url}" style="display:inline-block;background:#1f6f4a;color:#ffffff;text-decoration:none;font-weight:650;font-size:15px;padding:12px 22px;border-radius:8px;">${escapeHtml(link.label)}</a></p><p style="margin:0;font-size:12.5px;color:#6b7280;word-break:break-all;">${link.url}</p>`
    : ''
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;max-width:480px;">${body}${button}</div>`
}

/**
 * The exact link the invite email sends — always `/tenant`, optionally
 * carrying the access row's own id purely as a UX hint (which pending
 * invite to bring into view / whether to open in tenant-signup context
 * rather than send the visitor through the landlord dashboard first).
 * Deliberately NOT a bearer credential the way Provider Outreach V1's
 * token is: knowing this id grants nothing by itself — every real
 * authorization decision (which invite is visible, whether it can be
 * accepted) still comes entirely from RLS's own email-match check and
 * accept_tenant_invite()'s own re-verification (supabase/schema.sql).
 * Origin comes from the request that triggered the send (see the
 * notify route), never a hardcoded/env-var host — same convention
 * providerOutreachLink() already established.
 */
export function tenantInviteLink(origin: string, accessId: string): string {
  return `${origin.replace(/\/$/, '')}/tenant?invite=${accessId}`
}

/**
 * The landlord's link for a "new tenant request" notification — the
 * SAME deep link Needs Your Attention's own click-through already uses
 * for a TenantRequest item (lib/tenant-connect/requests.ts's
 * buildTenantRequestDateItems: `{ tab: 'Rent', rentSubTab: 'Tenant' }`),
 * expressed through app/page.tsx's existing ?openProperty=/?openTab=/
 * ?openRentSubTab= deep-link mechanism (the same one app/search/page.tsx
 * already reuses) rather than a new one. A specific, already-authenticated
 * destination — never the bare origin/homepage.
 */
export function landlordRequestLink(origin: string, propertyId: string): string {
  return `${origin.replace(/\/$/, '')}/?openProperty=${propertyId}&openTab=Rent&openRentSubTab=Tenant`
}

/**
 * The tenant's link for a landlord reply/status-update notification —
 * the same dedicated Tenant Portal route the invite email itself links
 * to (tenantInviteLink() above), without the one-time `?invite=` hint
 * (there is no pending invite to bring into view once the tenant is
 * already Active) — a real, specific authenticated destination, not the
 * landlord-facing homepage this same account might otherwise resolve
 * to if it's dual-role.
 */
export function tenantPortalLink(origin: string): string {
  return `${origin.replace(/\/$/, '')}/tenant`
}

/**
 * To the invited tenant's email — Section 11, "Tenant invitation."
 *
 * Tenant-Facing Experience V1: now includes a "Connect to your rental"
 * link (tenantInviteLink() above) — the milestone's own explicit
 * instruction. This does NOT weaken the invitation's security model:
 * the link is a plain deep-link into the tenant-context sign-in/
 * signup flow, never a credential — the tenant still must authenticate
 * with THIS EXACT email address before RLS or accept_tenant_invite()
 * ever grants them anything (see tenantInviteLink()'s own comment).
 */
export function buildInviteEmail(propertyAddress: string, inviteUrl: string): TenantConnectEmail {
  return {
    subject: `You've been invited to connect on ${APP_NAME}`,
    body: [
      `Your landlord has invited you to connect on ${APP_NAME} for ${propertyAddress}.`,
      '',
      `Connect to your rental:`,
      inviteUrl,
      '',
      `Sign in or create an account with this email address to accept the invitation and view your lease and submit requests.`,
    ].join('\n'),
    html: emailHtml(
      [
        `Your landlord has invited you to connect on ${APP_NAME} for ${escapeHtml(propertyAddress)}.`,
        `Sign in or create an account with this email address to accept the invitation and view your lease and submit requests.`,
      ],
      { url: inviteUrl, label: 'Connect to your rental' },
    ),
  }
}

/**
 * To the property owner's email — Section 11, "New tenant request →
 * landlord." `category` is the stable machine-readable id
 * (lib/maintenance/categories.ts) stored on the request row — this
 * function is the one place that gets converted to the human-readable
 * label before it reaches an actual recipient, so no caller has to
 * remember to do that conversion itself.
 */
export function buildNewRequestEmail(propertyAddress: string, category: TenantRequestCategory, title: string, requestUrl: string): TenantConnectEmail {
  return {
    subject: `New request — ${propertyAddress}`,
    body: [
      `A tenant submitted a new ${maintenanceCategoryLabel(category)} request for ${propertyAddress}.`,
      '',
      title,
      '',
      `Open the request:`,
      requestUrl,
    ].join('\n'),
    html: emailHtml(
      [
        `A tenant submitted a new ${escapeHtml(maintenanceCategoryLabel(category))} request for ${escapeHtml(propertyAddress)}.`,
        escapeHtml(title),
      ],
      { url: requestUrl, label: 'Open the request' },
    ),
  }
}

/** To the tenant's email — Section 11, "Landlord reply/status update → tenant." One shared template for both events (a reply and a status change read the same to the tenant: "there's an update, go look"), never distinguishing message content in the email body itself (never echoes the landlord's actual reply text — that stays inside the app, same "transactional and concise" instruction). */
export function buildLandlordUpdateEmail(propertyAddress: string, requestTitle: string, tenantPortalUrl: string): TenantConnectEmail {
  return {
    subject: `Update on your request — ${propertyAddress}`,
    body: [
      `There's an update on your request "${requestTitle}" for ${propertyAddress}.`,
      '',
      `Open your Tenant Portal:`,
      tenantPortalUrl,
    ].join('\n'),
    html: emailHtml(
      [`There's an update on your request "${escapeHtml(requestTitle)}" for ${escapeHtml(propertyAddress)}.`],
      { url: tenantPortalUrl, label: 'Open your Tenant Portal' },
    ),
  }
}

/** True only when every env var Resend needs is present — mirrors lib/realtor-leads/notify.ts's isEmailNotificationConfigured() exactly. A partial config is treated as unconfigured, never a partial/best-effort send. */
export function isTenantConnectEmailConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.RESEND_API_KEY && env.TENANT_CONNECT_FROM_EMAIL)
}

export type SendResult = { sent: boolean; reason?: string }

const RESEND_API_URL = 'https://api.resend.com/emails'

/**
 * Sends one transactional Tenant Connect email via Resend's HTTP API.
 * Never throws — every failure (missing config, non-2xx response,
 * network error) is caught, logged server-side only, and reported back
 * as a non-throwing { sent: false, reason }. Callers (the notify API
 * route) always call this AFTER the real DB write already succeeded —
 * an email failure must never take that back or block the caller's UI.
 */
export async function sendTenantConnectEmail(to: string, email: TenantConnectEmail, env: Record<string, string | undefined> = process.env): Promise<SendResult> {
  if (!isTenantConnectEmailConfigured(env)) {
    console.error('tenant-connect: email is not fully configured (RESEND_API_KEY / TENANT_CONNECT_FROM_EMAIL) — notification was not sent.', { to, subject: email.subject })
    return { sent: false, reason: 'not_configured' }
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.TENANT_CONNECT_FROM_EMAIL,
        to,
        subject: email.subject,
        text: email.body,
        // HTML variant is optional on the type (existing callers that
        // only build { subject, body } still work), but every builder
        // in this file now always sets it — this is what actually makes
        // the invite/notification "Connect to your rental" / "Open the
        // request" / "Open your Tenant Portal" link a real clickable
        // button, rather than relying on a mail client's own best-effort
        // auto-linking of a bare URL in the plain-text body.
        ...(email.html ? { html: email.html } : {}),
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      console.error('tenant-connect: Resend email send failed', { to, status: response.status, body: errorBody })
      return { sent: false, reason: 'provider_error' }
    }

    return { sent: true }
  } catch (err) {
    console.error('tenant-connect: Resend email send threw', { to, err })
    return { sent: false, reason: 'provider_error' }
  }
}
