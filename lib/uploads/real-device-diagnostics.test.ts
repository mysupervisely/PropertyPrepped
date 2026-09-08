import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { initialSmartUploadDebugState, safeErrorSummary } from './diagnostics'

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const smartUploadModalSource = readFile('components/SmartUpload/SmartUploadModal.tsx')
const engineSource = readFile('lib/smart-upload/engine.ts')
const pageSource = readFile('app/page.tsx')
const profileSource = readFile('app/profile/page.tsx')

// V1.1 — every code path in SmartUploadModal.tsx that can produce the
// raw `'Failed'` status (displayed as "Needs attention" per
// QUEUE_STATUS_LABEL) — found by reading the actual state machine, not
// guessed. Exactly two call sites set status: 'Failed':
//   1. processFile(): uploadDocumentForReview() returned {ok:false} —
//      an UPLOAD failure (Storage, property_documents insert, or
//      smart_upload_items insert — three sub-stages inside ONE result).
//   2. runAnalyze(): analyzeDocument() returned {ok:false} — an
//      ANALYSIS failure, itself covering many distinct server-side
//      reasons (lib/document-intelligence/analyze-request.ts): no
//      session, AI not configured, AI_LIMIT_REACHED (plan/quota),
//      unsupported resolved MIME (415), empty/too-large file, signed-
//      URL/download failure, the provider call itself throwing, or the
//      analysis row missing on read-back.
// 'Unsupported' is a SEPARATE raw status with its own distinct label
// ("Not supported") — not part of the "Needs attention" ambiguity.
describe('Smart Upload "Needs attention" — every producing code path is now traceable', () => {
  it('exactly two call sites set status: \'Failed\' in the whole component', () => {
    const matches = smartUploadModalSource.match(/status: 'Failed'/g) || []
    expect(matches.length).toBe(2)
  })

  it('the upload-failure branch (processFile) records a distinct debug breakdown from the analysis-failure branch (runAnalyze)', () => {
    const processFileStart = smartUploadModalSource.indexOf('async function processFile(')
    const processFileEnd = smartUploadModalSource.indexOf('\n  function handleFiles(')
    const processFileBody = smartUploadModalSource.slice(processFileStart, processFileEnd)
    expect(processFileBody).toContain("storageUpload: 'failed', storageError: uploadResult.error, databaseRecord: 'skipped', analysis: 'skipped'")

    const runAnalyzeStart = smartUploadModalSource.indexOf('async function runAnalyze(')
    const runAnalyzeEnd = smartUploadModalSource.indexOf('\n  async function processFile(')
    const runAnalyzeBody = smartUploadModalSource.slice(runAnalyzeStart, runAnalyzeEnd)
    expect(runAnalyzeBody).toContain("debug: { ...it.debug, analysis: 'failed', analysisError: result.error }")
  })

  it('the queue list itself (not just the tap-in detail view) renders a compact debug line identifying the failing stage and reason for a Failed item', () => {
    expect(smartUploadModalSource).toContain("item.status === 'Failed' && !item.completedAt && <SmartUploadDebugLine debug={item.debug} />")
    const fnStart = smartUploadModalSource.indexOf('function SmartUploadDebugLine(')
    const fnBody = smartUploadModalSource.slice(fnStart, fnStart + 2200)
    expect(fnBody).toContain('Failing stage')
    expect(fnBody).toContain('Reason')
    // Distinguishes Upload vs Database record vs Analysis vs Validation explicitly.
    expect(fnBody).toContain("? 'Upload' :")
    expect(fnBody).toContain("? 'Database record' :")
    expect(fnBody).toContain("? 'Analysis' :")
  })
})

describe('Smart Upload analysis diagnostics — every server-side failure reason is logged, not silently collapsed into "Failed"', () => {
  it('logs UPLOAD_ANALYSIS_START/SUCCESS/ERROR at every real branch of analyzeDocument()', () => {
    const fnStart = engineSource.indexOf('export async function analyzeDocument(')
    const fnBody = engineSource.slice(fnStart, engineSource.length)
    expect(fnBody).toContain("logUploadDiagnostic(flow, 'UPLOAD_ANALYSIS_START', {})")
    expect(fnBody).toContain("logUploadDiagnostic(flow, 'UPLOAD_ANALYSIS_SUCCESS', {})")
    // Session expired, server !resp.ok, fetch threw, and result-missing-after-success are FOUR distinct ERROR log call sites.
    const errorLogs = fnBody.match(/logUploadDiagnostic\(flow, 'UPLOAD_ANALYSIS_ERROR'/g) || []
    expect(errorLogs.length).toBeGreaterThanOrEqual(4)
  })

  it('accepts an optional flow parameter defaulting to smart-upload, so Smart Import\'s pre-existing calls are unaffected', () => {
    expect(engineSource).toContain("export async function analyzeDocument(supabase: SupabaseClient, documentId: string, flow: UploadFlow = 'smart-upload')")
    expect(engineSource).toContain("export async function uploadDocumentForReview(")
    expect(engineSource).toContain("flow: UploadFlow = 'smart-upload',")
  })
})

describe('Camera flow is distinguishable from regular Smart Upload (Section 4)', () => {
  it('the Take Photo input tags every downstream call with the smart-upload-camera flow, not a separate implementation', () => {
    // V1.2: every call site below now also threads a per-file
    // bytesPromise (lib/uploads/durable-file.ts) — the flow-tagging
    // itself is unchanged, only additive.
    expect(smartUploadModalSource).toContain("onFiles(e.target.files, bytesPromises, 'smart-upload-camera')")
    expect(smartUploadModalSource).toContain("function handleFiles(fileList: FileList | null, bytesPromises: Promise<ArrayBuffer>[], flow: 'smart-upload' | 'smart-upload-camera' = 'smart-upload')")
    expect(smartUploadModalSource).toContain('void processFile(file, batchId, flow, bytesPromises[i])')
    expect(smartUploadModalSource).toContain('uploadDocumentForReview(supabase, ownerId, file, batchId, \'SmartUpload\', flow, bytesPromise)')
    expect(smartUploadModalSource).toContain('analyzeDocument(supabase, documentId, flow)')
  })

  it('the debug line surfaces which flow produced the item, so a camera capture is visually distinguishable from a file-picker selection', () => {
    expect(smartUploadModalSource).toContain('Debug ({debug.flow})')
  })

  it('initialSmartUploadDebugState() carries the flow it was given, verbatim', () => {
    expect(initialSmartUploadDebugState({ name: 'a.jpg', type: 'image/jpeg' }, 'smart-upload-camera').flow).toBe('smart-upload-camera')
    expect(initialSmartUploadDebugState({ name: 'a.jpg', type: 'image/jpeg' }, 'smart-upload').flow).toBe('smart-upload')
  })
})

describe('One failed file does not hide/obscure the others (Smart Upload and Upload Multiple)', () => {
  it('Smart Upload: every debug/status patch is scoped to its own item id via a functional setItems update, never a batch-wide overwrite', () => {
    expect(smartUploadModalSource).toContain('setItems((prev) => prev.map((it) => (it.id === itemId ?')
    expect(smartUploadModalSource).toContain('setItems((prev) => prev.map((it) => (it.id === localId ?')
  })

  it('Upload Multiple: documentUploadDebug is patched by INDEX, one entry per file, never replacing the whole array on a single file\'s failure', () => {
    const fnStart = pageSource.indexOf('async function addDocumentFiles(')
    const fnEnd = pageSource.indexOf('\n  }', fnStart)
    const fnBody = pageSource.slice(fnStart, fnEnd)
    expect(fnBody).toContain('function patchFileDebug(index: number, patch: Partial<UploadDebugState>)')
    expect(fnBody).toContain('setDocumentUploadDebug((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))')
    expect(fnBody).toContain('continue') // a failed file's loop iteration still lets the next file run
  })

  it('Upload Multiple renders one debug panel PER FILE, not one shared panel for the whole batch', () => {
    expect(pageSource).toContain('{documentUploadDebug.map((state, i) => <UploadDebugPanel key={i} state={state} />)}')
  })
})

describe('Safe diagnostic filtering — no sensitive values ever reach the debug display', () => {
  it('safeErrorSummary never returns anything beyond message/code/status', () => {
    const raw = {
      message: 'upload failed',
      access_token: 'super-secret-token',
      refresh_token: 'another-secret',
      signedUrl: 'https://example.supabase.co/storage/v1/object/sign/bucket/path?token=abc',
      service_role: 'sk-service-role-key',
    }
    const summary = safeErrorSummary(raw)
    const serialized = JSON.stringify(summary)
    expect(serialized).not.toContain('super-secret-token')
    expect(serialized).not.toContain('another-secret')
    expect(serialized).not.toContain('sk-service-role-key')
    expect(serialized).not.toContain('signedUrl')
    expect(Object.keys(summary || {}).sort()).toEqual(['message'])
  })

  it('none of the new debug UI ever interpolates a raw storage_path, token, or signed URL — only message/extension/mime/size/stage fields', () => {
    for (const source of [smartUploadModalSource, pageSource, profileSource]) {
      expect(source).not.toMatch(/debug\.[a-zA-Z]*[Tt]oken/)
      expect(source).not.toMatch(/debug\.[a-zA-Z]*signedUrl/i)
      expect(source).not.toMatch(/\{debug\.storage_path\}|\{state\.storage_path\}/)
    }
  })
})

describe('Profile Photo debug panel remains functional (Section 5) — kept, not removed', () => {
  it('UploadDebugPanel is still imported and rendered for profile photo, distinguishing file received/validation/storage/DB/render URL', () => {
    expect(profileSource).toContain("import { UploadDebugPanel } from '../../components/uploads/UploadDebugPanel'")
    expect(profileSource).toContain('<UploadDebugPanel state={photoDebug} />')
    expect(profileSource).toContain("setPhotoDebug((d) => d && { ...d, storageUpload: 'success' })")
    expect(profileSource).toContain("setPhotoDebug((d) => d && { ...d, databaseRecord: 'success' })")
    expect(profileSource).toContain("setPhotoDebug((d) => d && d.renderUrl === 'pending' ? { ...d, renderUrl: 'success' } : d)")
  })
})

describe('Property Photo diagnostics still exist where applicable — no new speculative fix, re-verified only', () => {
  it('lib/property-photos/diagnostics.ts and its PHOTO_* stage taxonomy are untouched by this pass', () => {
    const source = readFile('lib/property-photos/diagnostics.ts')
    expect(source).toContain("export type PhotoUploadStage")
    expect(source).toContain('PHOTO_UPLOAD_START')
    expect(source).toContain('PHOTO_UPLOAD_ERROR')
  })

  it('app/page.tsx still logs PHOTO_* diagnostics for the property-photo paths, unmodified by this pass', () => {
    expect(pageSource).toContain("logPhotoUploadDiagnostic('PHOTO_UPLOAD_START'")
  })
})

describe('Confirmed MIME fixes from commit 87beb80 remain intact', () => {
  it('lib/uploads/image-file.ts is unchanged in its public API', () => {
    const source = readFile('lib/uploads/image-file.ts')
    expect(source).toContain('export function resolveImageContentType(')
    expect(source).toContain('export function validateImageFile(')
    expect(source).toContain('export function toUploadableImageFile(')
  })

  it('profile photo validation is still permissive on a blank type (the confirmed fix), not the old strict check', () => {
    expect(profileSource).not.toContain("if (!file.type.startsWith('image/')) { setPhotoError('Choose an image file.'); return }")
    expect(profileSource).toContain('validateImageFile(file)')
    // V1.2: the MIME-correction contentType still flows through
    // unchanged — it's now delivered via toDurableUploadableFile()
    // (lib/uploads/durable-file.ts) instead of the old, picker-resource-
    // tied toUploadableImageFile() wrap. See upload-reliability-
    // wiring.test.ts for the full V1.2 root-cause coverage.
    expect(profileSource).toContain('toDurableUploadableFile(file, validation.contentType, bytesPromise)')
  })

  it('Smart Upload engine still normalizes an image file before .upload() when no early bytesPromise is available (Smart Import\'s pre-existing, unchanged call path)', () => {
    expect(engineSource).toContain('toUploadableImageFile(file, resolvedContentType)')
  })

  it('Upload Multiple normalizes an image file\'s content type, now via the durable, byte-safe path (V1.2)', () => {
    expect(pageSource).toContain('toDurableUploadableFile(file, looksLikeImage ? resolvedContentType : file.type || undefined, bytesPromises[index])')
  })
})
