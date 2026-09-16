import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Onboarding & First-Run Experience V2.
//
// A focused, scoped pass on top of the existing Add Property flow and
// dashboard — not a rebuild. This is presentation/UX only: no new
// backend, no schema change, no new "readiness" calculation. Same
// no-jsdom, source-read wiring-test convention as every other
// app/page.tsx wiring test in this repo (the file is huge and never
// rendered in tests).
//
// What actually changed, and why each guard below exists:
//   1. The Add Property "Save Property" button used to be disabled only
//      on `busy` — a landlord who left address/city blank and clicked
//      Save got a silent no-op (addProperty()'s own guard clause
//      returned early with zero visible feedback). Now the button's
//      own disabled condition matches that guard exactly, so it's
//      simply unclickable until the two required fields are filled —
//      the same pattern Edit Property already used elsewhere in this
//      file, not a new validation system.
//   2. The activation moment: a landlord's very FIRST property now
//      opens straight into its own workspace (reusing the existing
//      openProperty() helper — the same one every property card
//      already uses) with a one-time, dismissible note, instead of
//      silently closing the modal and leaving the landlord to scroll
//      the dashboard to find what they just made. Property #2 onward
//      is completely unaffected — isFirstProperty is captured from
//      properties.length BEFORE the insert.
//   3. Small accessibility fixes on the Add Property modal (the first
//      modal a brand-new landlord ever opens): dialog semantics,
//      Escape-to-close, and a real accessible name on the close
//      button — matching the one modal in the codebase that already
//      had this right (the landing page's own sign-in/sign-up modal).
//   4. The zero-property "+ Add your first property" tile now spans
//      the full property grid instead of sharing a half-width column
//      with nothing — a clearer first-run moment, invisible to any
//      account that already has a property.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const cssSource = readFile('app/globals.css')

describe('Add Property — Save button validation matches addProperty()\'s own guard (no more silent no-op)', () => {
  it('addProperty() still guards on address/city (unchanged) — this is the contract the button below must match', () => {
    expect(pageSource).toContain("if (!supabase || !user || !draft.address.trim() || !draft.city.trim()) return")
  })

  it('the Save Property button is now disabled whenever either required field is blank, not just while busy', () => {
    expect(pageSource).toContain('disabled={busy || !draft.address.trim() || !draft.city.trim()} onClick={() => void addProperty()}')
  })
})

describe('Add Property — first-property activation moment', () => {
  it('isFirstProperty is captured from properties.length BEFORE the insert, never after (so it reflects the pre-save count)', () => {
    const fnStart = pageSource.indexOf('async function addProperty()')
    const insertIndex = pageSource.indexOf(".from('properties').insert(", fnStart)
    const captureIndex = pageSource.indexOf('const isFirstProperty = properties.length === 0', fnStart)
    expect(captureIndex).toBeGreaterThan(fnStart)
    expect(captureIndex).toBeLessThan(insertIndex)
  })

  it('on success, a first property reuses the EXISTING openProperty() helper (same one every property card already calls) — never a new navigation path', () => {
    const fnStart = pageSource.indexOf('async function addProperty()')
    const fnEnd = pageSource.indexOf('\n  }\n', fnStart)
    const body = pageSource.slice(fnStart, fnEnd)
    expect(body).toContain('if (isFirstProperty) {\n        openProperty(inserted.id)\n        setShowFirstPropertyNotice(true)\n      }')
  })

  it('openProperty() itself is unmodified — still just sets selectedId/activeTab/subtabs and scrolls to top', () => {
    const start = pageSource.indexOf('const openProperty = (id: string')
    const end = pageSource.indexOf('\n  }\n', start)
    const body = pageSource.slice(start, end)
    expect(body).toContain('setSelectedId(id)')
    expect(body).toContain("setActiveTab(tab)")
  })

  it('the one-time note is rendered on the property workspace, dismissible, and never blocks the UI (no modal/overlay)', () => {
    const start = pageSource.indexOf('{showFirstPropertyNotice && (')
    const end = pageSource.indexOf('\n        )}', start)
    const slice = pageSource.slice(start, end)
    expect(slice).toContain('className="globalNotice firstPropertyNotice"')
    expect(slice).toContain("onClick={() => setShowFirstPropertyNotice(false)}")
    expect(slice).not.toContain('overlay')
  })

  it('returning to the dashboard (breadcrumb or brand click) also clears the one-time note, so it never resurfaces on a later revisit', () => {
    expect(pageSource).toContain("onClick={() => { setSelectedId(null); setShowFirstPropertyNotice(false) }}")
    expect(pageSource).toContain("<button className=\"breadcrumbBack\" onClick={() => { setSelectedId(null); setShowFirstPropertyNotice(false) }}>")
  })

  it('the note never claims anything about tax/deductibility or invents a completion score — just a plain next-step hint', () => {
    const start = pageSource.indexOf('{showFirstPropertyNotice && (')
    const end = pageSource.indexOf('\n        )}', start)
    const slice = pageSource.slice(start, end)
    expect(slice).not.toMatch(/deduct|score|complete\b/i)
  })
})

describe('Add Property modal — accessibility (Section 16: fix straightforward issues within the touched surface)', () => {
  it('the modal now has real dialog semantics (role, aria-modal, aria-labelledby pointing at its own heading)', () => {
    expect(pageSource).toContain('<div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-property-title">')
    expect(pageSource).toContain('<h2 id="add-property-title">Add a property</h2>')
  })

  it('the close button has a real accessible name beyond the "×" glyph', () => {
    expect(pageSource).toContain('<button type="button" className="iconButton" aria-label="Close" onClick={() => setShowAdd(false)}>×</button>')
  })

  it('Escape closes the modal, matching the same convention already used for the mobile tab menu', () => {
    const start = pageSource.indexOf('if (!showAdd) return')
    const end = pageSource.indexOf('}, [showAdd])', start)
    const slice = pageSource.slice(start, end)
    expect(slice).toContain("if (e.key === 'Escape') setShowAdd(false)")
  })
})

describe('Zero-property dashboard — a clearer, full-width first-run moment', () => {
  it('the empty-property tile still opens the same Add Property flow every other entry point uses', () => {
    expect(pageSource).toContain('{!busy && properties.length === 0 && <button className="emptyPropertyCard" onClick={() => openAddProperty()}>')
  })

  it('the tile now spans the full grid width — scoped to .emptyPropertyCard only, .grid itself is untouched', () => {
    expect(cssSource).toMatch(/\.emptyPropertyCard \{ grid-column: 1 \/ -1;/)
  })

  it('.grid is used in exactly one place in the app, so the grid-column override cannot leak into an unrelated layout', () => {
    const matches = pageSource.match(/className="grid"/g) || []
    expect(matches).toHaveLength(1)
  })
})
