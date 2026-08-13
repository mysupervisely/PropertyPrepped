// PropPrepped Milestone 8: the only endpoint that talks to the AI provider.
//
// - API keys never reach the browser: this file runs server-side only
//   (Next.js Route Handler, Node runtime) and reads ANTHROPIC_API_KEY from
//   the server environment.
// - No generic file-fetch endpoint: the client sends a documentId, never a
//   storage path. The path is resolved server-side, only after an
//   RLS-scoped lookup proves the caller owns that document.
// - Every Supabase call in this file uses the caller's own access token
//   (see lib/supabase-server.ts) — never a service-role key. RLS enforces
//   ownership on every read and write.
// - Business logic lives in lib/document-intelligence/analyze-request.ts so
//   it can be unit tested without a live database or network call; this
//   file is just the thin adapter that wires real Supabase/fetch/Anthropic
//   implementations to that logic.

import { NextRequest, NextResponse } from 'next/server'
import { createRequestClient } from '../../../../lib/supabase-server'
import { handleAnalyzeRequest } from '../../../../lib/document-intelligence/analyze-request'
import { analyzeDocument } from '../../../../lib/document-intelligence/analyze-document'
import { getDocumentIntelligenceProvider, isDocumentIntelligenceConfigured } from '../../../../lib/document-intelligence/provider'

export const runtime = 'nodejs'

function getBearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1] : null
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req.headers.get('authorization'))
    if (!token) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const supabase = createRequestClient(token)
    if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 })

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
    }
    const ownerId = userData.user.id

    const payload = (await req.json().catch(() => ({}))) as { documentId?: unknown; documentType?: unknown }
    const configured = isDocumentIntelligenceConfigured()
    // Constructed lazily, only if we actually reach the AI call — a 404
    // (unauthorized document), 415/413/400 (file rejection), or 409
    // (already processing) should never pay the cost of building the
    // provider, and a bad DOCUMENT_INTELLIGENCE_MODEL should only surface
    // once we're genuinely about to analyze something.
    let provider: ReturnType<typeof getDocumentIntelligenceProvider> | null = null

    const result = await handleAnalyzeRequest(payload, {
      isAiConfigured: () => configured,
      getDocument: async (documentId) => {
        // RLS on property_documents already restricts rows to owner_id =
        // auth.uid() of the token above — another user's document simply
        // does not come back here, indistinguishable from "doesn't exist".
        const { data } = await supabase.from('property_documents').select('*').eq('id', documentId).single()
        return data || null
      },
      claimProcessing: async (documentId) => {
        // Atomic conditional UPDATE: only succeeds (returns a row) when the
        // document isn't already Processing. Two concurrent requests race
        // on this single statement at the database level — Postgres row
        // locking guarantees only one can win, closing the
        // check-then-write gap a separate SELECT-then-UPDATE would leave open.
        const { data } = await supabase
          .from('property_documents')
          .update({ analysis_status: 'Processing', analysis_requested_at: new Date().toISOString(), analysis_error: null })
          .eq('id', documentId)
          .neq('analysis_status', 'Processing')
          .select('id')
        return Boolean(data && data.length > 0)
      },
      updateDocumentStatus: async (documentId, patch) => {
        await supabase.from('property_documents').update(patch).eq('id', documentId)
      },
      createSignedUrl: async (storagePath) => {
        // Short expiration — this URL is only ever used server-side, immediately, once.
        const { data } = await supabase.storage.from('property-documents').createSignedUrl(storagePath, 60)
        return data?.signedUrl || null
      },
      fetchFileBytes: async (url) => {
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`download failed (${resp.status})`)
        return resp.arrayBuffer()
      },
      analyze: async (analyzeInput) => {
        if (!configured) throw new Error('AI provider not configured.')
        if (!provider) provider = getDocumentIntelligenceProvider()
        return analyzeDocument(analyzeInput, provider)
      },
      getNextVersion: async (documentId) => {
        const { data } = await supabase
          .from('document_analyses')
          .select('analysis_version')
          .eq('document_id', documentId)
          .order('analysis_version', { ascending: false })
          .limit(1)
        return (data?.[0]?.analysis_version || 0) + 1
      },
      saveAnalysis: async (row) => {
        const { data } = await supabase
          .from('document_analyses')
          .insert({ ...row, owner_id: ownerId })
          .select('id')
          .single()
        return data || null
      },
      recordUsage: async (row) => {
        await supabase.from('ai_usage_events').insert({ ...row, owner_id: ownerId })
      },
    })

    return NextResponse.json(result.body, { status: result.status })
  } catch (err) {
    console.error('document-intelligence analyze error', err)
    return NextResponse.json({ error: 'Something went wrong analyzing this document.' }, { status: 500 })
  }
}
