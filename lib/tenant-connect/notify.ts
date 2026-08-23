// PropRoster — Tenant Connect V1 (Milestone 24), extended by Tenant
// Connect Onboarding V2: transactional email.
//
// Section 11 (M24): "FIRST audit whether PropRoster already has a
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
// TENANT_CONNECT_FROM_EMAIL is now configured in production and email
// delivery is confirmed working — this module's own gate
// (isTenantConnectEmailConfigured) is unchanged and untouched by this
// milestone; only buildInviteEmail() gained a real destination link
// (Onboarding V2, Section 2).

import type { TenantRequestCategory } from './types'

export type TenantConnectEmail = { subject: string; body: string; html?: string }

const APP_NAME = 'PropRoster'

// Onboarding V2, Section 3: no NEW env var is required for this. Netlify
// automatically injects `URL` (the site's own production URL) into every
// serverless function at runtime, so this reads that first; APP_BASE_URL
// is an optional manual override if it's ever needed (e.g. a non-Netlify
// host), and the literal production domain is the final fallback so an
// invite email NEVER ships with a broken/local link. Never read from
// anything client-suppliable.
export function tenantConnectBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.APP_BASE_URL || env.URL || 'https://proproster.com').replace(/\/+$/, '')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * To the invited tenant's email — Section 11 (M24), "Tenant invitation,"
 * extended by Onboarding V2 Section 2/4. The link carries only
 * tenant_property_access.id — the SAME opaque, non-sequential (v4 UUID)
 * identifier accept_tenant_invite(p_access_id) already takes as its one
 * argument, already exposed to the client via the existing tenant
 * portal/status-card queries. It grants nothing by itself: reading it
 * back is still gated by RLS (tenant_access_select — only returns the
 * row to a signed-in user whose own JWT email matches), and accepting
 * it is still gated by accept_tenant_invite() re-deriving auth.uid()/
 * auth.jwt() itself, never trusting the id's mere presence as proof of
 * anything. No session token, no service-role key, no landlord
 * identifier, and no property/financial data is ever placed in the URL.
 * Plain-text and HTML share the exact same destination URL.
 */
export function buildInviteEmail(propertyAddress: string, accessId: string, env: Record<string, string | undefined> = process.env): TenantConnectEmail {
  const url = `${tenantConnectBaseUrl(env)}/tenant?invite=${encodeURIComponent(accessId)}`
  const addr = escapeHtml(propertyAddress)
  return {
    subject: `You've been invited to connect on ${APP_NAME}`,
    body: [
      `You've been invited to connect on ${APP_NAME}`,
      '',
      `Your landlord has invited you to connect on ${APP_NAME} for:`,
      '',
      propertyAddress,
      '',
      `Connect to ${APP_NAME}: ${url}`,
      '',
      'Sign in or create an account using the email address that received this invitation.',
    ].join('\n'),
    html: [
      `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#16241d;max-width:480px;margin:0 auto;">`,
      `<p style="font-size:16px;margin:0 0 16px;">You've been invited to connect on ${APP_NAME}</p>`,
      `<p style="font-size:14px;line-height:1.5;margin:0 0 4px;color:#4b5a53;">Your landlord has invited you to connect on ${APP_NAME} for:</p>`,
      `<p style="font-size:16px;font-weight:700;margin:0 0 20px;">${addr}</p>`,
      `<p style="margin:0 0 20px;"><a href="${url}" style="display:inline-block;background:#1f6f4a;color:#ffffff;text-decoration:none;font-weight:650;font-size:15px;padding:12px 22px;border-radius:9px;">Connect to ${APP_NAME}</a></p>`,
      `<p style="font-size:13px;line-height:1.5;color:#4b5a53;margin:0;">Sign in or create an account using the email address that received this invitation.</p>`,
      `</div>`,
    ].join(''),
  }
}

/** To the property owner's email — Section 11, "New tenant request → landlord." */
export function buildNewRequestEmail(propertyAddress: string, category: TenantRequestCategory, title: string): TenantConnectEmail {
  return {
    subject: `New request — ${propertyAddress}`,
    body: [
      `A tenant submitted a new ${category} request for ${propertyAddress}.`,
      '',
      title,
      '',
      `Open ${APP_NAME} to read the full request and reply.`,
    ].join('\n'),
  }
}

/** To the tenant's email — Section 11, "Landlord reply/status update → tenant." One shared template for both events (a reply and a status change read the same to the tenant: "there's an update, go look"), never distinguishing message content in the email body itself (never echoes the landlord's actual reply text — that stays inside the app, same "transactional and concise" instruction). */
export function buildLandlordUpdateEmail(propertyAddress: string, requestTitle: string): TenantConnectEmail {
  return {
    subject: `Update on your request — ${propertyAddress}`,
    body: [
      `There's an update on your request "${requestTitle}" for ${propertyAddress}.`,
      '',
      `Open ${APP_NAME} to see the details.`,
    ].join('\n'),
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
        // Onboarding V2: only the invite email sets this (Section 9 —
        // "if HTML is added... retain a plain-text version"); every
        // other Tenant Connect email stays text-only, unchanged.
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
