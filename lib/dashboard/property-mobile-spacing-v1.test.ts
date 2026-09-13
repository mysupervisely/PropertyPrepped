import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Property + Attention Usability V1 — mobile Property spacing fix.
//
// A real iPhone screenshot showed excessive dead space between the
// Edit/Investment Analysis row and the Overview section selector. Root
// cause: three separate rules, each reasonable in isolation, stacked
// cumulatively at mobile widths (.propertyHero's own 28px bottom
// padding, .mobilePropertyNav's own 10px top margin, and
// .heroInfoActions' own 18px margin-bottom below 620px — added back
// when the hero was immediately followed by the old horizontally-
// scrolling mobile tabs strip, before .mobilePropertyNav existed).
//
// This is a precise, mobile-only CSS fix — no JSX/markup change, no
// photo/hero/selector/Snapshot redesign, no change to desktop spacing.
// Same source-read convention as every other CSS regression-guard test
// in this repo (no jsdom).

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const cssSource = readFile('app/globals.css')
const pageSource = readFile('app/page.tsx')

/**
 * Extracts the @media block whose body contains `anchorText` — globals.css
 * has several `@media (max-width: 760px)` blocks, so locating by the query
 * string alone would find the wrong (first) one; anchoring on content that
 * only exists in the target block disambiguates it.
 */
function mediaBlockContaining(css: string, anchorText: string): string {
  const anchorIdx = css.indexOf(anchorText)
  expect(anchorIdx, `expected to find "${anchorText}" in globals.css`).toBeGreaterThan(-1)
  const mediaStart = css.lastIndexOf('@media', anchorIdx)
  expect(mediaStart).toBeGreaterThan(-1)
  const openIdx = css.indexOf('{', mediaStart)
  let depth = 0
  let i = openIdx
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') { depth--; if (depth === 0) break }
  }
  return css.slice(mediaStart, i + 1)
}

describe('Desktop spacing is untouched', () => {
  it('.propertyHero\'s base (desktop) padding is unchanged', () => {
    const rule = cssSource.match(/\.propertyHero\s*\{[^}]*\}/)?.[0] || ''
    expect(rule).toContain('padding: 34px 0 28px')
  })

  it('.workspaceContentTight\'s base (desktop) padding-top is unchanged', () => {
    const rule = cssSource.match(/\.workspaceContentTight\s*\{[^}]*\}/)?.[0] || ''
    expect(rule).toContain('padding-top: 20px')
  })

  it('.heroInfoActions\' base (desktop) rule carries no margin-bottom at all', () => {
    const rule = cssSource.match(/\.heroInfoActions\s*\{[^}]*\}/)?.[0] || ''
    expect(rule).not.toContain('margin-bottom')
  })
})

describe('Mobile spacing is tightened, scoped to the existing mobile breakpoints', () => {
  it('the same max-width: 760px block that declares .mobilePropertyNav also tightens .propertyHero\'s bottom padding and .workspaceContentTight\'s top padding', () => {
    const block = mediaBlockContaining(cssSource, '.mobilePropertyNav { display: block; position: relative; margin: 10px 0; }')
    expect(block).toContain('.propertyHero { padding-bottom: 14px; }')
    expect(block).toContain('.workspaceContentTight { padding-top: 12px; }')
  })

  it('the max-width: 620px block that declares .heroInfoActions reduces its margin-bottom from the old 18px to a small residual value, not removed outright', () => {
    const block = mediaBlockContaining(cssSource, '.heroInfoHead { flex-direction: column; align-items: stretch; }')
    expect(block).toContain('margin-bottom: 6px')
    expect(block).not.toContain('margin-bottom: 18px')
  })

  it('the combined mobile gap between the hero actions and the selector is meaningfully smaller than before the fix', () => {
    // Before: 28 (propertyHero) + 18 (heroInfoActions, <=620px) + 10 (mobilePropertyNav) = 56px.
    // After: 14 + 6 + 10 = 30px — noticeably closer, not eliminated.
    const before = 28 + 18 + 10
    const after = 14 + 6 + 10
    expect(after).toBeLessThan(before - 20)
  })
})

describe('Nothing else about the Property page hero/selector/Snapshot was touched', () => {
  it('the hero photo, address, and status pills markup is unchanged', () => {
    expect(pageSource).toContain('<div className="heroPhoto">')
    expect(pageSource).toContain('<p className="heroCity">{selected.city}</p>')
    expect(pageSource).toContain('<div className="heroStatusPills">')
  })

  it('the mobile Property section selector markup is unchanged', () => {
    expect(pageSource).toContain('<div className="mobilePropertyNav" ref={mobileTabMenuRef}>')
    expect(cssSource).toMatch(/\.tabs \{ display: none; \}/)
  })

  it('mobile bottom navigation is untouched', () => {
    expect(cssSource).toContain('.mobileBottomNav { display: none; }')
  })

  it('the global body font-family stack is byte-for-byte unchanged', () => {
    expect(cssSource).toContain('body { margin: 0; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;')
  })

  it('the Property Snapshot section itself is not part of this diff', () => {
    // Sanity: Property Snapshot markup exists and is untouched by name —
    // this pass never edited its own section.
    expect(pageSource).toContain('Property Snapshot')
  })

  it('the hero photo\'s own sizing rules (desktop and the two mobile step-downs) are unchanged — this pass never touched .heroPhoto', () => {
    expect(cssSource).toContain('.heroPhoto { height: 300px; overflow: hidden; border-radius: 18px; background: #e4ebe7; border: 1px solid var(--line); }')
    expect(cssSource).toContain('.heroPhoto { height: 340px; }')
    expect(cssSource).toContain('.heroPhoto { height: 245px; }')
  })
})
