import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Production Readiness & Product Analytics V1.
//
// Same no-jsdom, source-read wiring-test convention as every other
// app/page.tsx-scale wiring test in this repo. lib/analytics.test.ts
// already proves trackEvent() itself is correct (safe no-ops, exact
// event names, no PII ever passed through); this file proves each
// CALL SITE only invokes it after a genuinely successful action, never
// on a failure path, and never with query/address/file-name text.

const ROOT = join(__dirname, '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const landingSource = readFile('components/LandingPage.tsx')
const taxCenterSource = readFile('app/tax-center/page.tsx')
const searchSource = readFile('app/search/page.tsx')

describe('sign_up_completed / login_completed — components/LandingPage.tsx', () => {
  it('login_completed fires only in the else branch after signInWithPassword succeeds (no signInError)', () => {
    const start = landingSource.indexOf("if (authMode === 'signin')")
    const end = landingSource.indexOf('signInWithPassword', start) + 400
    const slice = landingSource.slice(start, end)
    expect(slice).toMatch(/if \(signInError\) \{\s*setError\(signInError\.message\)\s*\} else \{\s*trackEvent\('login_completed'\)/)
  })

  it('sign_up_completed fires only after signUp succeeds (no signUpError) — never inside the signUpError branch', () => {
    const start = landingSource.indexOf('const { data, error: signUpError }')
    const end = landingSource.indexOf('switchMode', start)
    const slice = landingSource.slice(start, end)
    const errorBranch = slice.slice(slice.indexOf('if (signUpError) {'), slice.indexOf('} else {'))
    expect(errorBranch).not.toContain('trackEvent')
    expect(slice).toContain("trackEvent('sign_up_completed')")
  })

  it('neither event call passes an email, password, or any other identifying parameter', () => {
    expect(landingSource).toMatch(/trackEvent\('login_completed'\)\s*\}/)
    expect(landingSource).toMatch(/trackEvent\('sign_up_completed'\)\s*\n/)
  })
})

describe('first_property_created / property_created — app/page.tsx addProperty()', () => {
  it('fires only after the insert succeeds — after the insertError-or-!inserted early return, never before or inside it', () => {
    const fnStart = pageSource.indexOf('async function addProperty()')
    const guardStart = pageSource.indexOf('if (insertError || !inserted) {', fnStart)
    const guardEnd = pageSource.indexOf('\n      }\n', guardStart)
    const guardBody = pageSource.slice(guardStart, guardEnd)
    expect(guardBody).not.toContain('trackEvent')

    const trackIndex = pageSource.indexOf("trackEvent(isFirstProperty ? 'first_property_created' : 'property_created')", fnStart)
    expect(trackIndex).toBeGreaterThan(guardEnd)
  })

  it('reuses the existing isFirstProperty capture (Onboarding & First-Run Experience V2) rather than a second calculation', () => {
    expect(pageSource).toContain('const isFirstProperty = properties.length === 0')
    expect(pageSource).toContain("trackEvent(isFirstProperty ? 'first_property_created' : 'property_created')")
  })

  it('never passes the address, city, or any draft field as an event parameter', () => {
    const line = "trackEvent(isFirstProperty ? 'first_property_created' : 'property_created')"
    expect(pageSource).toContain(line)
    expect(pageSource).not.toMatch(/trackEvent\([^)]*draft\.(address|city)/)
  })
})

describe('expense_created — app/page.tsx addTransaction()', () => {
  it('fires only in the success (else) branch of the insert, never when insertError is set', () => {
    const fnStart = pageSource.indexOf('async function addTransaction()')
    const fnEnd = pageSource.indexOf('\n  }\n', fnStart)
    const body = pageSource.slice(fnStart, fnEnd)
    const errorBranchEnd = body.indexOf('else {')
    expect(body.slice(0, errorBranchEnd)).not.toContain('trackEvent')
    expect(body).toContain("if (transactionDraft.type === 'Expense') trackEvent('expense_created')")
  })

  it('only fires for Expense-type transactions, never Income', () => {
    expect(pageSource).toContain("if (transactionDraft.type === 'Expense') trackEvent('expense_created')")
  })

  it('never passes the description, vendor, category, or amount as an event parameter', () => {
    expect(pageSource).not.toMatch(/trackEvent\([^)]*transactionDraft\.(description|vendor|amount|category)/)
  })
})

describe('document_uploaded — app/page.tsx addDocumentFiles()', () => {
  it('fires once per file only after BOTH the storage upload and the property_documents insert succeed', () => {
    const fnStart = pageSource.indexOf('async function addDocumentFiles(')
    const fnEnd = pageSource.indexOf('\n  }\n', fnStart)
    const body = pageSource.slice(fnStart, fnEnd)
    const dbSuccessIndex = body.indexOf("logUploadDiagnostic('upload-multiple', 'UPLOAD_DB_SUCCESS'")
    const trackIndex = body.indexOf("trackEvent('document_uploaded')")
    expect(trackIndex).toBeGreaterThan(dbSuccessIndex)
    // Never inside the storage-error or db-error branches (both `continue`
    // or fall into the `if (rowError)` branch before this line).
    const rowErrorBranch = body.slice(body.indexOf('if (rowError) {'), body.indexOf('} else {'))
    expect(rowErrorBranch).not.toContain('trackEvent')
  })

  it('never passes the file name, storage path, or mime type as an event parameter', () => {
    expect(pageSource).not.toMatch(/trackEvent\([^)]*file\.name/)
    expect(pageSource).not.toMatch(/trackEvent\([^)]*\bpath\b/)
  })
})

describe('tax_center_viewed — app/tax-center/page.tsx', () => {
  it('fires from a useEffect with an empty dependency array, so it can only run once per mount — never on a re-render', () => {
    expect(taxCenterSource).toContain("useEffect(() => { trackEvent('tax_center_viewed') }, [])")
  })

  it('this effect is declared inside TaxCenterWorkspace, which only mounts after the page-level auth gate (ready && user) has already passed', () => {
    const workspaceStart = taxCenterSource.indexOf('function TaxCenterWorkspace()')
    const effectIndex = taxCenterSource.indexOf("trackEvent('tax_center_viewed')")
    const pageStart = taxCenterSource.indexOf('export default function TaxCenterPage()')
    expect(workspaceStart).toBeGreaterThan(pageStart)
    expect(effectIndex).toBeGreaterThan(workspaceStart)
  })
})

describe('global_search_used — app/search/page.tsx', () => {
  it('fires only after every one of the 12 parallel queries succeeded (past the anyError early-return)', () => {
    const fnStart = searchSource.indexOf('async function runSearch(')
    const anyErrorReturnIndex = searchSource.indexOf('if (anyError) {', fnStart)
    const anyErrorBlockEnd = searchSource.indexOf('\n      }\n', anyErrorReturnIndex)
    const trackIndex = searchSource.indexOf("trackEvent('global_search_used')", fnStart)
    expect(trackIndex).toBeGreaterThan(anyErrorBlockEnd)
  })

  it('never fires inside the anyError branch or the catch block (failed search)', () => {
    const fnStart = searchSource.indexOf('async function runSearch(')
    const anyErrorStart = searchSource.indexOf('if (anyError) {', fnStart)
    const anyErrorEnd = searchSource.indexOf('\n      }\n', anyErrorStart)
    expect(searchSource.slice(anyErrorStart, anyErrorEnd)).not.toContain('trackEvent')

    const catchStart = searchSource.indexOf('} catch (unexpected) {', fnStart)
    const catchEnd = searchSource.indexOf('} finally {', catchStart)
    expect(searchSource.slice(catchStart, catchEnd)).not.toContain('trackEvent')
  })

  it('never passes the raw query text (rawQuery/words/query) as an event parameter — the call takes no arguments at all', () => {
    expect(searchSource).toContain("trackEvent('global_search_used')")
    expect(searchSource).not.toMatch(/trackEvent\('global_search_used',/)
  })
})

describe('Global Search silent-failure fix (Production Readiness Phase 12) — a failed search is no longer indistinguishable from zero results', () => {
  it('every one of the 12 query results now has its .error captured (via the responses array), not just .data', () => {
    const fnStart = searchSource.indexOf('async function runSearch(')
    const fnEnd = searchSource.indexOf('\n  }\n', fnStart)
    const body = searchSource.slice(fnStart, fnEnd)
    expect(body).toContain('const anyError = responses.some((r) => r.error)')
  })

  it('a query failure sets a distinct searchFailed state, separate from "no results", and is rendered with different copy', () => {
    expect(searchSource).toContain('const [searchFailed, setSearchFailed] = useState(false)')
    expect(searchSource).toContain('setSearchFailed(true)')
    expect(searchSource).toContain("<strong>Search couldn&apos;t complete</strong>")
    expect(searchSource).toContain('searched && !loading && searchFailed && (')
    expect(searchSource).toContain('searched && !loading && !searchFailed && results.length === 0 && (')
  })

  it('a hard-thrown exception (not a returned {error}) no longer leaves the loading spinner stuck forever — a finally block always clears it for the current request', () => {
    const fnStart = searchSource.indexOf('async function runSearch(')
    const fnEnd = searchSource.indexOf('\n  }\n', fnStart)
    const body = searchSource.slice(fnStart, fnEnd)
    expect(body).toContain('} finally {')
    expect(body).toContain('if (requestId === requestIdRef.current) setLoading(false)')
  })

  it('a stale (superseded) request never clears loading for a newer request still in flight — the finally still respects requestIdRef', () => {
    const fnStart = searchSource.indexOf('async function runSearch(')
    const fnEnd = searchSource.indexOf('\n  }\n', fnStart)
    const body = searchSource.slice(fnStart, fnEnd)
    expect(body).toContain('if (requestId !== requestIdRef.current) return')
  })
})
