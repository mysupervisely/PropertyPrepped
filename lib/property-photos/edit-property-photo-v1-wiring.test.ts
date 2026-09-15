import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Property + Attention Usability V1 — Round 3 (real-iPhone retest):
// "PROPERTY PHOTO IS STILL BROKEN" + "move primary photo management
// into Edit Property." Source-read regression guards, matching this
// repo's established no-jsdom convention (see upload-wiring.test.ts for
// the earlier rounds' equivalent coverage).

const source = readFileSync(join(__dirname, '..', '..', 'app', 'page.tsx'), 'utf8')

function sliceFunction(name: string, nextFnMarker: string): string {
  const fnStart = source.indexOf(name)
  expect(fnStart, `expected to find ${name} in app/page.tsx`).toBeGreaterThan(-1)
  const fnEnd = source.indexOf(nextFnMarker, fnStart)
  expect(fnEnd).toBeGreaterThan(fnStart)
  return source.slice(fnStart, fnEnd)
}

const changeCoverPhotoBody = sliceFunction('async function changeCoverPhoto(', 'async function addTransaction()')

describe('changeCoverPhoto() — the safe ordered sequence (exactly as required)', () => {
  it('step order: validate -> upload -> insert non-cover row -> assign new cover -> best-effort cover_photo_path -> clear OLD cover last', () => {
    const validateIdx = changeCoverPhotoBody.indexOf('validatePropertyPhotoFile(file)')
    const uploadIdx = changeCoverPhotoBody.indexOf("storage.from('property-photos').upload(path, durable.file")
    const insertIdx = changeCoverPhotoBody.indexOf("from('property_photos').insert({ owner_id: user.id, property_id: selectedId, name: durable.file.name, storage_path: path, is_cover: false })")
    const assignIdx = changeCoverPhotoBody.indexOf("update({ is_cover: true }).eq('id', insertedPhoto.id)")
    const pathIdx = changeCoverPhotoBody.indexOf("from('properties').update({ cover_photo_path: path })")
    const clearIdx = changeCoverPhotoBody.indexOf("update({ is_cover: false }).eq('id', previousCover.id)")
    expect(validateIdx).toBeGreaterThan(-1)
    expect(uploadIdx).toBeGreaterThan(validateIdx)
    expect(insertIdx).toBeGreaterThan(uploadIdx)
    expect(assignIdx).toBeGreaterThan(insertIdx)
    expect(pathIdx).toBeGreaterThan(assignIdx)
    expect(clearIdx).toBeGreaterThan(pathIdx)
  })

  it('the new row is inserted as is_cover:false FIRST, never is_cover:true directly — so a mid-sequence failure never produces two simultaneous cover claims from this path', () => {
    expect(changeCoverPhotoBody).toContain('is_cover: false')
    expect(changeCoverPhotoBody).not.toMatch(/\.insert\(\{[^}]*is_cover: true/)
  })

  it('the previous cover is captured BEFORE any write, and is never deleted — only un-covered (preserves existing gallery-retention semantics)', () => {
    const captureIdx = changeCoverPhotoBody.indexOf("const previousCover = selectedPhotos.find((p) => p.is_cover)")
    const uploadIdx = changeCoverPhotoBody.indexOf("storage.from('property-photos').upload(path, durable.file")
    expect(captureIdx).toBeGreaterThan(-1)
    expect(captureIdx).toBeLessThan(uploadIdx)
    expect(changeCoverPhotoBody).not.toMatch(/previousCover[\s\S]*?\.delete\(\)/)
    expect(changeCoverPhotoBody).toContain("update({ is_cover: false }).eq('id', previousCover.id)")
  })

  it('a Storage upload failure returns before ever touching property_photos — the OLD cover is never at risk', () => {
    const uploadIdx = changeCoverPhotoBody.indexOf("storage.from('property-photos').upload(path, durable.file")
    const uploadErrorCheckIdx = changeCoverPhotoBody.indexOf('if (uploadError)', uploadIdx)
    const returnIdx = changeCoverPhotoBody.indexOf('return', uploadErrorCheckIdx)
    const insertIdx = changeCoverPhotoBody.indexOf("insert({ owner_id: user.id", uploadIdx)
    expect(uploadErrorCheckIdx).toBeGreaterThan(uploadIdx)
    expect(returnIdx).toBeGreaterThan(uploadErrorCheckIdx)
    expect(returnIdx).toBeLessThan(insertIdx)
  })

  it('a DB-insert failure after a successful upload cleans up the orphaned storage object before returning', () => {
    const insertIdx = changeCoverPhotoBody.indexOf("insert({ owner_id: user.id")
    const errorCheckIdx = changeCoverPhotoBody.indexOf('if (rowError || !insertedPhoto)', insertIdx)
    const removeIdx = changeCoverPhotoBody.indexOf("storage.from('property-photos').remove([path])", errorCheckIdx)
    expect(errorCheckIdx).toBeGreaterThan(insertIdx)
    expect(removeIdx).toBeGreaterThan(errorCheckIdx)
  })

  it('a failure assigning is_cover:true to the new row still reloads the portfolio and tells the user the photo landed in the gallery — never silently loses the upload', () => {
    expect(changeCoverPhotoBody).toMatch(/if \(assignError\) \{[\s\S]*?surfaceError\('The photo uploaded, but could not be set as the cover[\s\S]*?await loadPortfolio\(\)/)
  })

  it('a cover_photo_path failure is logged but non-fatal (never calls surfaceError) — it is write-only and never read for display', () => {
    const pathIdx = changeCoverPhotoBody.indexOf("from('properties').update({ cover_photo_path: path })")
    const nextClearIdx = changeCoverPhotoBody.indexOf('if (previousCover)', pathIdx)
    const between = changeCoverPhotoBody.slice(pathIdx, nextClearIdx)
    expect(between).toContain('if (pathError)')
    expect(between).not.toContain('surfaceError(')
  })

  it('a failure un-covering the OLD row (the last step) is logged but non-fatal — the new cover is already fully live by that point', () => {
    const clearIdx = changeCoverPhotoBody.indexOf("update({ is_cover: false }).eq('id', previousCover.id)")
    const tail = changeCoverPhotoBody.slice(clearIdx, clearIdx + 500)
    expect(tail).toContain('if (clearError)')
    expect(tail).not.toContain('surfaceError(')
  })

  it('validates before ever reading bytes or touching Storage — a rejected file (e.g. oversized) fails fast', () => {
    const validateIdx = changeCoverPhotoBody.indexOf('validatePropertyPhotoFile(file)')
    const rejectIdx = changeCoverPhotoBody.indexOf("if (!validation.ok) { surfaceError(validation.reason); return }")
    const durableIdx = changeCoverPhotoBody.indexOf('toDurableUploadableFile(')
    expect(validateIdx).toBeGreaterThan(-1)
    expect(rejectIdx).toBeGreaterThan(validateIdx)
    expect(durableIdx).toBeGreaterThan(rejectIdx)
  })

  it('reuses toDurableUploadableFile() — the same durable-byte pipeline as every other upload path, not a second one', () => {
    expect(changeCoverPhotoBody).toContain('toDurableUploadableFile(file, validation.contentType, bytesPromise)')
  })

  it('is wrapped in try/catch/finally, with busy always reset — matching every other photo-mutating function in this file', () => {
    expect(changeCoverPhotoBody).toMatch(/\btry\s*\{/)
    expect(changeCoverPhotoBody).toContain('} catch (unexpected) {')
    expect(changeCoverPhotoBody).toContain('} finally {')
    expect(changeCoverPhotoBody).toContain("logPhotoUploadDiagnostic('PHOTO_UNEXPECTED_EXCEPTION'")
    const finallyIdx = changeCoverPhotoBody.indexOf('} finally {')
    expect(changeCoverPhotoBody.slice(finallyIdx, finallyIdx + 60)).toContain('setBusy(false)')
  })

  it('is invoked fire-and-forget with no .catch() — confirming its own try/catch is load-bearing', () => {
    expect(source).toContain('void changeCoverPhoto(file, bytesPromise)')
    expect(source).not.toMatch(/changeCoverPhoto\([^)]*\)\.catch/)
  })

  it('no new table, bucket, or cover-photo field — reuses property-photos/property_photos/cover_photo_path exactly as every other photo path already does', () => {
    expect(changeCoverPhotoBody).toContain("storage.from('property-photos')")
    expect(changeCoverPhotoBody).toContain("from('property_photos')")
    expect(changeCoverPhotoBody).toContain("from('properties').update({ cover_photo_path: path })")
    expect(source).not.toMatch(/create table|alter table|create policy/i)
  })

  it('reloads the portfolio on success so the Edit Property preview, Property hero and Dashboard card all pick up the new cover from the same coverMap', () => {
    const successIdx = changeCoverPhotoBody.lastIndexOf("logPhotoUploadDiagnostic('PHOTO_SET_COVER_SUCCESS'")
    const reloadIdx = changeCoverPhotoBody.indexOf('await loadPortfolio()', successIdx)
    expect(successIdx).toBeGreaterThan(-1)
    expect(reloadIdx).toBeGreaterThan(successIdx)
  })
})

describe('loadPortfolio() coverMap — prefers the newest is_cover row, defending the rare transient dual-cover state', () => {
  const fnStart = source.indexOf('async function loadPortfolio()')
  const fnEnd = source.indexOf('function openAddProperty()')
  const fnBody = source.slice(fnStart, fnEnd)

  it('no longer builds the map with `new Map(...entries)`, which lets a later (older, since query order is newest-first) entry silently overwrite an earlier one', () => {
    expect(fnBody).not.toMatch(/new Map\(signedPhotos\.filter/)
  })

  it('builds coverMap with an explicit first-match-wins loop instead', () => {
    expect(fnBody).toContain('const coverMap = new Map<string, string | undefined>()')
    expect(fnBody).toMatch(/for \(const p of signedPhotos\) \{\s*if \(p\.is_cover && !coverMap\.has\(p\.property_id\)\) coverMap\.set\(p\.property_id, p\.signedUrl\)/)
  })

  it('rawPhotos is still fetched newest-first, which is what makes "first match" mean "newest"', () => {
    expect(source).toContain("client.from('property_photos').select('*').order('created_at', { ascending: false })")
  })
})

describe('Edit Property modal — primary/cover photo management moved directly into it (near the top)', () => {
  const modalIdx = source.indexOf("{showEdit && <div className=\"overlay\"")
  const modalEnd = source.indexOf('editPropertyFooter', modalIdx)
  const modalBody = source.slice(modalIdx, modalEnd)

  it('the photo section appears before the property-facts formGrid, not buried below it', () => {
    const photoSectionIdx = modalBody.indexOf('editPropertyPhotoSection')
    const formGridIdx = modalBody.indexOf('className="formGrid"')
    expect(photoSectionIdx).toBeGreaterThan(-1)
    expect(formGridIdx).toBeGreaterThan(photoSectionIdx)
  })

  it('shows the current cover via selected.coverUrl — the SAME canonical field the Property hero and Dashboard card already use — or a placeholder when there is none', () => {
    expect(modalBody).toContain('{selected.coverUrl ? <img src={selected.coverUrl} alt={selected.address} /> : <div className="editPropertyPhotoPlaceholder">+</div>}')
  })

  it('the button label switches between "Add photo" (no cover) and "Change photo" (has cover) — same control either way, wired to changeCoverPhoto', () => {
    expect(modalBody).toContain("{busy ? 'Uploading…' : selected.coverUrl ? 'Change photo' : 'Add photo'}")
  })

  it('"Remove photo" only renders when there is a cover to remove, and reuses the EXISTING removePhoto() — no second delete path', () => {
    const removeIdx = modalBody.indexOf('Remove photo')
    expect(removeIdx).toBeGreaterThan(-1)
    const nearby = modalBody.slice(removeIdx - 300, removeIdx + 50)
    expect(nearby).toContain('selected.coverUrl &&')
    expect(nearby).toMatch(/const cover = selectedPhotos\.find\(\(p\) => p\.is_cover\); if \(cover\) void removePhoto\(cover\)/)
  })

  it('the file input follows the same durable-read pattern as every other photo picker: begin reading bytes BEFORE resetting the input value', () => {
    const inputIdx = modalBody.indexOf('<input type="file" accept="image/*" disabled={busy}')
    expect(inputIdx).toBeGreaterThan(-1)
    const handlerBody = modalBody.slice(inputIdx, inputIdx + 700)
    const readIdx = handlerBody.indexOf('beginReadingFileBytes(file)')
    const resetIdx = handlerBody.indexOf("e.target.value = ''")
    const callIdx = handlerBody.indexOf('void changeCoverPhoto(file, bytesPromise)')
    expect(readIdx).toBeGreaterThan(-1)
    expect(resetIdx).toBeGreaterThan(readIdx)
    expect(callIdx).toBeGreaterThan(resetIdx)
  })

  it('is gated on busy the same way every other upload control in this app already is', () => {
    const inputIdx = modalBody.indexOf('<input type="file" accept="image/*" disabled={busy}')
    expect(inputIdx).toBeGreaterThan(-1)
  })

  it('does not introduce a second photo gallery UI — the existing Documents > Photos tab and its photoGallery/photoUploader markup are untouched', () => {
    expect(source).toContain('className="photoUploader"')
    expect(source).toContain('className="photoGallery"')
    expect(source).toContain("Select multiple images at once. The first photo becomes the cover if there is no cover yet.")
  })
})
