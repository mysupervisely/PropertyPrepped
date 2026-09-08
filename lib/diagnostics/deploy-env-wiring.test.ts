import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Netlify Deploy Preview env debug — source-read regression guard for
// the temporary /api/diagnostics/deploy-env route (Section 6 of the
// investigation). Confirms it returns booleans/safe metadata only,
// never a secret value.

const source = readFileSync(join(__dirname, '..', '..', 'app', 'api', 'diagnostics', 'deploy-env', 'route.ts'), 'utf8')

describe('GET /api/diagnostics/deploy-env — safe presence/metadata only', () => {
  it('reports presence as a boolean, never the actual URL/key value', () => {
    expect(source).toContain('SUPABASE_URL_PRESENT: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)')
    expect(source).toContain('SUPABASE_ANON_KEY_PRESENT: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)')
    expect(source).not.toMatch(/NEXT_PUBLIC_SUPABASE_URL,?\s*$/m)
    expect(source).not.toContain('process.env.NEXT_PUBLIC_SUPABASE_URL,')
  })

  it('never reads or returns a secret (service role, API keys, webhook secrets)', () => {
    expect(source).not.toMatch(/SERVICE_ROLE|STRIPE_SECRET|WEBHOOK_SECRET|ANTHROPIC_API_KEY|RESEND_API_KEY/)
  })

  it('exposes only documented Netlify deployment metadata, truncating the commit ref', () => {
    expect(source).toContain('process.env.CONTEXT')
    expect(source).toContain('process.env.BRANCH')
    expect(source).toContain('process.env.COMMIT_REF.slice(0, 12)')
  })

  it('is a plain, unauthenticated GET — safe to hit directly from a browser on the deploy preview', () => {
    expect(source).toContain('export async function GET()')
    expect(source).not.toContain('export async function POST')
  })

  it('is a dynamic (never statically cached) route, so it reflects the actual running deploy, not a build-time snapshot', () => {
    expect(source).toContain("export const dynamic = 'force-dynamic'")
  })
})
