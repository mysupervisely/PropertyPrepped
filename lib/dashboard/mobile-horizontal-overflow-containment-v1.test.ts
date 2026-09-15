import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Property + Attention Usability V1 follow-up — real-iPhone report (via
// an in-app WebView browser) of Dashboard content clipped on the left,
// uniformly across unrelated sections (the greeting, "Needs Your
// Attention", its item count) while boxed content (Portfolio Snapshot,
// cards) looked "mostly aligned" — the fingerprint of the document
// being horizontally scrolled a few pixels right. This repo has hit and
// fixed this exact symptom class twice before (.topbar, .sectionHead —
// see their own comments in app/globals.css) by making a specific flex
// row wrap instead of forcing extra width. This time the fix is at the
// correct root level instead: `.shell` already clips everything inside
// itself, but `.installHint` (components/InstallPrompt.tsx) deliberately
// renders OUTSIDE `.shell`, as a sibling at the end of <body> — the one
// piece of UI `.shell`'s own containment can't reach. html/body now
// carry their own overflow-x: hidden + max-width: 100%, so the true
// document root cannot become wider than the viewport regardless of
// which descendant (present or future, inside or outside .shell) tries.
//
// A headless-Chromium reproduction (not part of this automated suite —
// this repo has no browser-based test harness, only source-read
// regression guards) confirmed the fix empirically: with a deliberately
// 600px-wide adversarial sibling injected after .installHint, html's
// scrollWidth - clientWidth stayed exactly 0 at every common iPhone
// width (375/390/393/402/430) — the document could not be scrolled to
// reveal that overflow. See this milestone's own completion report for
// the full methodology; these tests lock in the CSS that produced it.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const cssSource = readFile('app/globals.css')

describe('Document-root horizontal-overflow containment', () => {
  it('html and body cannot become wider than the viewport, no matter what a descendant does', () => {
    expect(cssSource).toMatch(/html,\s*body\s*\{[^}]*overflow-x:\s*hidden[^}]*\}/)
    expect(cssSource).toMatch(/html,\s*body\s*\{[^}]*max-width:\s*100%[^}]*\}/)
  })

  it('.shell\'s own existing containment (the first line of defense, for everything INSIDE it) is unchanged', () => {
    const shellRule = cssSource.match(/\.shell\s*\{[^}]*\}/)?.[0] || ''
    expect(shellRule).toContain('overflow-x: hidden')
  })
})

describe('.installHint — the one body-level sibling outside .shell\'s containment', () => {
  const installHintRule = cssSource.match(/\.installHint\s*\{[^}]*\}/)?.[0] || ''

  it('cannot itself exceed the viewport width', () => {
    expect(installHintRule).toContain('max-width: 100%')
  })

  it('wraps instead of forcing extra width when its content does not fit on one line (same fix pattern as .topbar/.sectionHead)', () => {
    expect(installHintRule).toContain('flex-wrap: wrap')
  })

  it('its text child can actually shrink/wrap (min-width: 0), matching the same established fix as .sectionHead > div:first-child', () => {
    expect(cssSource).toContain('.installHint > span { min-width: 0; }')
  })

  it('still renders outside .shell, in normal document flow (unchanged architecture — this fix hardens it, does not move it)', () => {
    const layoutSource = readFile('app/layout.tsx')
    expect(layoutSource).toContain('<InstallPrompt />')
    // InstallPrompt renders as a sibling of {children} inside <body>, not
    // nested inside the page's own <main className="shell">.
    const bodyStart = layoutSource.indexOf('<body>')
    const installPromptIdx = layoutSource.indexOf('<InstallPrompt />')
    const childrenIdx = layoutSource.indexOf('{children}')
    expect(bodyStart).toBeGreaterThan(-1)
    expect(childrenIdx).toBeGreaterThan(bodyStart)
    expect(installPromptIdx).toBeGreaterThan(childrenIdx)
  })
})

describe('No new width: 100vw usage was introduced (a common source of this exact bug class)', () => {
  it('the only 100vw usage remaining is the one pre-existing, already-reviewed one (a calc(100vw - 24px) modal-sizing rule, unrelated to full-bleed layout)', () => {
    const matches = cssSource.match(/100vw/g) || []
    expect(matches.length).toBe(1)
  })
})
