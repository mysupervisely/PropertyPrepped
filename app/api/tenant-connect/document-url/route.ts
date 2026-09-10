// PropRoster — Tenant-Facing Experience V1. Signed URL for a document
// the landlord has explicitly shared with the tenant.
//
// The tenant's client-side Supabase session cannot sign this URL
// itself — the property-documents storage bucket's own RLS
// (property_documents_select_own, supabase/schema.sql) is
// deliberately owner-only, unchanged by this milestone (Migration 29's
// own header explains why). Same pattern already established by
// Provider Outreach V1 / Scheduling Coordination V1: an RLS-scoped
// re-fetch through the CALLER'S OWN client is the authorization check
// (here, via tenant_documents_view — it can only ever return a row
// that is both tenant_visible = true AND belongs to a property this
// caller has active tenant access to), and only after that succeeds
// does the admin client do the one thing the RLS-scoped client can't:
// sign the storage object. Never trusts a client-supplied storage
// path — only the path the view itself returns.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createRequestClient } from '../../../../lib/supabase-server'

export const runtime = 'nodejs'

function getBearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1] : null
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req.headers.get('authorization'))
    if (!token) return NextResponse.json({ url: null }, { status: 401 })
    const client = createRequestClient(token)
    if (!client) return NextResponse.json({ url: null }, { status: 503 })

    const body = (await req.json().catch(() => ({}))) as { documentId?: string }
    if (!body.documentId) return NextResponse.json({ url: null }, { status: 400 })

    const { data: doc } = await client
      .from('tenant_documents_view')
      .select('storage_path')
      .eq('id', body.documentId)
      .maybeSingle()
    if (!doc) return NextResponse.json({ url: null }, { status: 404 })

    const admin = createAdminClient()
    if (!admin) return NextResponse.json({ url: null }, { status: 503 })
    const { data: signed, error: signError } = await admin.storage.from('property-documents').createSignedUrl(doc.storage_path, 3600)
    if (signError || !signed) return NextResponse.json({ url: null }, { status: 500 })

    return NextResponse.json({ url: signed.signedUrl }, { status: 200 })
  } catch (err) {
    console.error('tenant-connect: document-url route unexpected error', err)
    return NextResponse.json({ url: null }, { status: 500 })
  }
}
