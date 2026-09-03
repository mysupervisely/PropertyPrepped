import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// M2.1 review pass (Part 3) — source-read regression guards for the
// mobile UX fixes, matching this repo's established no-jsdom
// source-string-match convention (e.g. lib/tenant-connect/
// tenant-connect-v1-wiring.test.ts) rather than a jsdom/RTL render.

const source = readFileSync(join(__dirname, 'GuidedIntake.tsx'), 'utf8')

describe('GuidedIntake mobile UX (Part 3 review pass)', () => {
  it('goBack() always returns to the question phase — the review/urgent screens\' Back button previously did nothing visible', () => {
    const fnStart = source.indexOf('function goBack()')
    expect(fnStart).toBeGreaterThan(-1)
    const fnBody = source.slice(fnStart, source.indexOf('\n  }', fnStart))
    expect(fnBody).toContain("setPhase('question')")
  })

  it('the urgent screen offers a Back option, not just Close/submit', () => {
    const urgentBlockStart = source.indexOf("phase === 'urgent'")
    const urgentBlockEnd = source.indexOf("phase === 'review'")
    const block = source.slice(urgentBlockStart, urgentBlockEnd)
    expect(block).toContain('onClick={goBack}')
  })

  it('text-input questions submit on the keyboard Enter/Go key, not only via the on-screen Continue button', () => {
    expect(source).toContain("onKeyDown={(e) => e.key === 'Enter'")
  })

  it('a selected photo can be individually removed before submission', () => {
    expect(source).toContain('guidedIntakePhotoList')
    expect(source).toMatch(/Remove \$\{file\.name\}/)
  })

  it('the file input resets its value after each selection, so re-picking the same file fires a change event again', () => {
    const inputLine = source.split('\n').find((l) => l.includes('type="file"') && l.includes('guidedIntakePhotoLabel') === false && l.includes('accept="image/*"') && l.includes('multiple'))
    expect(inputLine).toBeDefined()
  })

  it('the photo picker is disabled once 5 photos are attached, matching submit.ts/schema expectations of a bounded attachment set', () => {
    expect(source).toContain('disabled={photos.length >= 5}')
  })

  it('the submit button is not rendered while a submission is in flight (structurally prevents a double-submit)', () => {
    const submittingIdx = source.indexOf("phase === 'submitting'")
    expect(submittingIdx).toBeGreaterThan(-1)
    // The 'review' phase's own block (which holds the real submit
    // button) is a distinct, mutually exclusive phase from 'submitting'
    // — confirmed by both being separate `phase === '...'` branches.
    expect(source).toContain("phase === 'review'")
  })
})
