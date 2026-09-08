// PropRoster — Tenant Connect: Provider Outreach V1. The provider's
// response endpoint — deliberately the ONLY route in this app that is
// reachable with NO Supabase session at all, by design (Section 4:
// "The provider must NOT need a PropRoster account"). Authorization is
// entirely the token: the raw token from the emailed link is hashed
// and looked up server-side (admin client — there is no session to
// scope an RLS-safe client to for an anonymous provider); nothing
// about which request/contact/owner this affects is ever read from
// the request body — only from the row the token itself resolves to
// (Section 9: "Never trust provider-supplied maintenance request IDs
// or contact IDs without verifying them against the token").

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-server'
import { hashProviderOutreachToken, type ProviderOutreachStatus } from '../../../../lib/maintenance/provider-outreach'

export const runtime = 'nodejs'

const RESPONSE_ACTIONS: Record<string, ProviderOutreachStatus> = {
  accept: 'accepted',
  decline: 'declined',
  needs_information: 'needs_information',
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { token?: string; action?: string; message?: string }
    if (!body.token || !body.action) return NextResponse.json({ ok: false, reason: 'missing_fields' }, { status: 400 })
    const status = RESPONSE_ACTIONS[body.action]
    if (!status) return NextResponse.json({ ok: false, reason: 'invalid_action' }, { status: 400 })

    const admin = createAdminClient()
    if (!admin) return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 503 })

    const tokenHash = hashProviderOutreachToken(body.token)
    const { data: outreach } = await admin
      .from('maintenance_provider_outreach')
      .select('id, status, token_expires_at')
      .eq('token_hash', tokenHash)
      .maybeSingle()
    if (!outreach) return NextResponse.json({ ok: false, reason: 'invalid_token' }, { status: 404 })
    if (new Date(outreach.token_expires_at).getTime() < Date.now()) {
      return NextResponse.json({ ok: false, reason: 'expired' }, { status: 410 })
    }
    // A response already recorded is not re-overwritten by a second
    // submit (e.g. a double-tap, or the provider re-opening the same
    // link) — the FIRST real response stands; the page's own success
    // screen is what the provider sees on a repeat visit either way.
    if (outreach.status !== 'sent') {
      return NextResponse.json({ ok: true, status: outreach.status, alreadyResponded: true }, { status: 200 })
    }

    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 1000) : null
    const { error: updateError } = await admin
      .from('maintenance_provider_outreach')
      .update({
        status,
        provider_message: message || null,
        responded_at: new Date().toISOString(),
      })
      .eq('id', outreach.id)
    if (updateError) return NextResponse.json({ ok: false, reason: 'update_failed' }, { status: 500 })

    return NextResponse.json({ ok: true, status }, { status: 200 })
  } catch (err) {
    console.error('provider-outreach: respond route unexpected error', err)
    return NextResponse.json({ ok: false, reason: 'unexpected_error' }, { status: 500 })
  }
}
