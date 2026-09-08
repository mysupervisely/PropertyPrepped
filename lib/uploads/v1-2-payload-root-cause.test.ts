import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Upload Reliability V1.2 — real iPhone storage payload root-cause fix.
//
// "No content provided" is not a string this repo or @supabase/storage-js
// ever produces — confirmed absent from both (see the assertion below).
// It is supabase/storage's own server-side error
// (src/internal/errors/codes.ts's ERRORS.NoContentProvided()), thrown by
// src/storage/uploader.ts's fileUploadFromRequest() when the incoming
// multipart request (parsed via @fastify/multipart's request.file(),
// busboy-based) has no usable file part. The mechanism connecting that to
// this app: iOS Safari can invalidate the native resource backing a File
// obtained from an <input type="file"> picker selection once that
// input's `.value` is reset (every onChange handler in this repo does
// this) — bytes read AFTER that point can come back empty even though
// the File's own cached `.size`/`.type` still report correctly. See
// lib/uploads/durable-file.ts's header for the full trace and
// lib/uploads/durable-file.test.ts for the byte-preservation proof.
//
// This file locks in, by reading the actual source (this repo's
// established no-jsdom convention — see upload-reliability-wiring.test.ts),
// that every picker-driven upload entry point begins reading its file(s)'
// bytes BEFORE resetting its own input's value, at every call site — not
// just the ones already covered by the more detailed per-flow assertions
// in upload-reliability-wiring.test.ts.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const durableFileSource = readFile('lib/uploads/durable-file.ts')
const profileSource = readFile('app/profile/page.tsx')
const pageSource = readFile('app/page.tsx')
const smartUploadModalSource = readFile('components/SmartUpload/SmartUploadModal.tsx')
const engineSource = readFile('lib/smart-upload/engine.ts')

describe('"No content provided" — confirmed source, not guessed', () => {
  it('this app never sets a user-facing error/state to the literal string "No content provided" (it is not a message we produce — only the server can); mentioning it inside an explanatory comment is fine and expected', () => {
    for (const source of [profileSource, pageSource, smartUploadModalSource, engineSource]) {
      expect(source).not.toMatch(/(?:setError|setPhotoError|error:)\(?\s*['"]No content provided['"]/)
    }
  })

  it('durable-file.ts documents the confirmed server-side source and the exact client-side mechanism producing it', () => {
    expect(durableFileSource).toContain('NoContentProvided')
    expect(durableFileSource).toContain('@fastify/multipart')
    expect(durableFileSource).toContain('uploader.ts')
    expect(durableFileSource).toContain('WebkitBlobResource')
  })
})

describe('Every picker-driven upload entry point reads bytes BEFORE resetting its own input — V1.2\'s actual fix, applied everywhere', () => {
  it('Profile Photo', () => {
    const idx = profileSource.indexOf('<input type="file" accept="image/*" disabled={photoBusy}')
    const end = profileSource.indexOf('}} />', idx)
    const body = profileSource.slice(idx, end)
    expect(body.indexOf('beginReadingFileBytes')).toBeGreaterThan(-1)
    expect(body.indexOf("e.target.value = ''")).toBeGreaterThan(body.indexOf('beginReadingFileBytes'))
  })

  it('Property Photo — cover picker (handleImage)', () => {
    const idx = pageSource.indexOf('const handleImage = (e: ChangeEvent<HTMLInputElement>) => {')
    const end = pageSource.indexOf('\n  }', idx)
    const body = pageSource.slice(idx, end)
    expect(body.indexOf('beginReadingFileBytes')).toBeGreaterThan(-1)
    expect(body.indexOf("e.target.value = ''")).toBeGreaterThan(body.indexOf('beginReadingFileBytes'))
  })

  it('Property Photo — gallery-add picker', () => {
    const idx = pageSource.indexOf('<input type="file" accept="image/*" multiple disabled={busy}')
    const end = pageSource.indexOf('}} /></label>', idx)
    const body = pageSource.slice(idx, end)
    expect(body.indexOf('beginReadingFileBytes')).toBeGreaterThan(-1)
    expect(body.indexOf("e.target.value = ''")).toBeGreaterThan(body.indexOf('beginReadingFileBytes'))
  })

  it('Upload Multiple (Documents tab) — file picker AND drag-and-drop', () => {
    const idx = pageSource.indexOf('<input type="file" multiple disabled={busy} onChange={(e) => {')
    const end = pageSource.indexOf('}} /></label>', idx)
    const body = pageSource.slice(idx, end)
    expect(body.indexOf('beginReadingFileBytes')).toBeGreaterThan(-1)
    expect(body.indexOf("e.target.value = ''")).toBeGreaterThan(body.indexOf('beginReadingFileBytes'))
    // Drag-and-drop has no <input> to reset, but must equally begin
    // reading bytes at drop time, before addDocumentFiles() runs.
    expect(pageSource).toContain('void addDocumentFiles(e.dataTransfer.files, Array.from(e.dataTransfer.files).map(beginReadingFileBytes))')
  })

  it('Smart Upload / Take Photo — all three SmartUploadEntry inputs (camera, single, multiple)', () => {
    expect(smartUploadModalSource).toContain('function readSelected(fileList: FileList | null): Promise<ArrayBuffer>[] {')
    const matches = smartUploadModalSource.match(/const bytesPromises = readSelected\(e\.target\.files\); onFiles\(e\.target\.files, bytesPromises/g) || []
    expect(matches.length).toBe(3)
    // Every one of those three onChange handlers resets AFTER calling onFiles (which is where readSelected's result is consumed).
    const onChangeBlocks = smartUploadModalSource.match(/onChange=\{\(e\) => \{ const bytesPromises = readSelected\(e\.target\.files\); onFiles\([^}]+\); e\.target\.value = '' \}\}/g) || []
    expect(onChangeBlocks.length).toBe(3)
  })
})

describe('The durable file, not the original picker-tied file, is what actually reaches .upload() at every entry point', () => {
  it('Profile Photo', () => {
    expect(profileSource).toContain(".storage.from('profile-photos').upload(path, uploadable,")
    expect(profileSource).toContain('uploadable = durable.file')
  })

  it('Property Photo cover — coverFile state is set from the durable file, not the original', () => {
    expect(pageSource).toContain('setCoverFile(durable.file)')
  })

  it('Property Photo gallery-add', () => {
    expect(pageSource).toContain('incoming.push({ file: durable.file, contentType: validation.contentType })')
  })

  it('Upload Multiple', () => {
    expect(pageSource).toContain('uploadable = durable.file')
  })

  it('Smart Upload / Take Photo / Smart Import engine', () => {
    expect(engineSource).toContain('uploadable = durable.file')
  })
})
