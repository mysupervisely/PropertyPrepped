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

export type TenantConnectEmail = { subject: string; body: string }

const APP_NAME = 'PropRoster'

/** To the invited tenant's email — Section 11, "Tenant invitation." Never includes a raw token/link with elevated access baked in; the tenant signs in with this exact email and accepts from inside the app (Section 3's "not a generic invitation" + Section 4's least-privilege intent). */
export function buildInviteEmail(propertyAddress: string): TenantConnectEmail {
  return {
    subject: `You've been invited to connect on ${APP_NAME}`,
    body: [
      `Your landlord has invited you to connect on ${APP_NAME} for ${propertyAddress}.`,
      '',
      `Sign in at ${APP_NAME} with this email address to accept the invitation and view your lease and submit requests.`,
    ].join('\n'),
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
