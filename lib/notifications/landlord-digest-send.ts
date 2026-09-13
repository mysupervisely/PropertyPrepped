// PropRoster — Landlord Digest V1: the one integration point that
// actually calls Resend.
//
// Same "plain fetch to Resend's HTTP API, never throws, logs and
// returns { sent: false, reason } on any failure" contract as
// lib/tenant-connect/notify.ts's sendTenantConnectEmail() and
// lib/realtor-leads/notify.ts's sendLeadNotificationEmail() — no new
// email vendor, no SDK dependency, the same convention this codebase
// already uses for every third-party HTTP integration.
//
// Gated on its own new env var (LANDLORD_DIGEST_FROM_EMAIL, alongside
// the already-configured RESEND_API_KEY) so it stays safely disabled —
// non-throwing, every owner logged as "not_configured" — until that var
// is set in production, exactly like Tenant Connect's own email gating.
// This is also what makes a deploy preview safe by default: unless the
// preview environment has LANDLORD_DIGEST_FROM_EMAIL configured, this
// milestone cannot send a single real email from it.

import type { LandlordDigestEmail } from './landlord-digest-email'

/** True only when every env var Resend needs is present — a partial config is treated as unconfigured, never a partial/best-effort send. */
export function isLandlordDigestEmailConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.RESEND_API_KEY && env.LANDLORD_DIGEST_FROM_EMAIL)
}

export type SendResult = { sent: boolean; reason?: string }

const RESEND_API_URL = 'https://api.resend.com/emails'

/**
 * Sends one landlord's weekly digest via Resend's HTTP API. Never
 * throws — every failure (missing config, non-2xx response, network
 * error) is caught, logged server-side only (keyed by ownerId, never by
 * email address or any portfolio content — see this module's own
 * observability rules in landlord-digest-run.ts), and reported back as
 * a non-throwing { sent: false, reason }.
 */
export async function sendLandlordDigestEmail(to: string, email: LandlordDigestEmail, env: Record<string, string | undefined> = process.env): Promise<SendResult> {
  if (!isLandlordDigestEmailConfigured(env)) {
    console.error('landlord-digest: email is not configured (RESEND_API_KEY / LANDLORD_DIGEST_FROM_EMAIL) — digest was not sent.')
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
        from: env.LANDLORD_DIGEST_FROM_EMAIL,
        to,
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      console.error('landlord-digest: Resend send failed', { status: response.status, body: errorBody })
      return { sent: false, reason: 'provider_error' }
    }

    return { sent: true }
  } catch (err) {
    console.error('landlord-digest: Resend send threw', { err })
    return { sent: false, reason: 'provider_error' }
  }
}
