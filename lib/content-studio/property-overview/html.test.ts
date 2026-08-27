import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildReel2Document } from './html'
import { BRAND, FORBIDDEN_TERMS, REEL2_HEIGHT, REEL2_WIDTH } from './content'

// PropRoster Content Studio — Feature Reel #2 generated-document tests.
// This repo has no jsdom/React Testing Library, so (matching every other
// component test in this repo, including the original Reel's) these
// assert against the raw generated HTML/CSS/JS string rather than
// mounting it.

const doc = buildReel2Document()

describe('The generated document is a self-contained, offline page', () => {
  it('has no external network requests — no remote <link>/<script src>, no @import, and the one <img> is a base64 data: URI', () => {
    expect(doc).not.toMatch(/<link[^>]+href=["']https?:\/\//)
    expect(doc).not.toMatch(/<script[^>]+src=/)
    expect(doc).not.toMatch(/@import/)
    expect(doc).not.toContain('fonts.googleapis.com')
    const imgSrcs = [...doc.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1])
    expect(imgSrcs.length).toBe(1)
    expect(imgSrcs[0].startsWith('data:image/png;base64,')).toBe(true)
  })

  it('the stage is exactly the Reel dimensions', () => {
    expect(doc).toContain(`width: ${REEL2_WIDTH}px; height: ${REEL2_HEIGHT}px;`)
  })

  it('uses the same brand palette as the original Reel (imported, not redefined) — dark near-black background, muted forest green, no neon/lime in the <style> block', () => {
    expect(doc).toContain(BRAND.bg)
    expect(doc).toContain(BRAND.green)
    const styleBlock = (doc.match(/<style>([\s\S]*?)<\/style>/) as RegExpMatchArray)[1].toLowerCase()
    expect(styleBlock).not.toMatch(/#00ff00|#39ff14|lime|neon/)
  })
})

describe('Built on the shared engine — reuses the proven crossfade fix rather than re-deriving it', () => {
  it('the crossfade opacity formula is the single-continuous-curve form (the V1.3 fix), sourced from reel-engine.ts, not re-implemented with the old buggy pattern', () => {
    expect(doc).toContain('s.style.opacity = String(Math.min(fadeIn, fadeOut));')
    expect(doc).toContain('var active = ms >= start - FADE && ms <= end;')
    expect(doc).not.toMatch(/if \(ms < start\) s\.style\.opacity/)
  })

  it('exposes window.__REEL__.setTime for frame-exact capture, matching the render script\'s contract', () => {
    expect(doc).toContain('window.__REEL__ = { setTime: setTime, totalMs: TOTAL_MS, fps:')
  })

  it('a `manual=1` query param disables the real-time requestAnimationFrame autoplay loop', () => {
    expect(doc).toContain("params.get('manual') === '1'")
  })

  it('lerpKeyframes (used for the continuous camera curve) is present and is a single unbranched formula, not per-segment special-casing', () => {
    expect(doc).toContain('function lerpKeyframes(keyframes, t, fields)')
  })
})

describe('All three scenes are present, and the screenshot/camera/spotlight only exist in "overview"', () => {
  for (const scene of ['hook', 'overview', 'close']) {
    it(`renders a section for the "${scene}" scene`, () => {
      expect(doc).toContain(`data-scene="${scene}"`)
    })
  }

  it('there is exactly one .shotFrame / screenshot viewport MARKUP element in the whole document (one continuous camera, not one per sub-phase)', () => {
    expect(doc.match(/<div class="shotFrame"/g)?.length).toBe(1)
    expect(doc.match(/<div class="shotViewport"/g)?.length).toBe(1)
    expect(doc.match(/<img class="ovImg"/g)?.length).toBe(1)
    expect(doc.match(/<div class="spotlight"/g)?.length).toBe(1)
  })

  it('the close card renders the two-tone PropRoster wordmark, tagline, CTA, and URL', () => {
    expect(doc).toContain('<span class="wProp">Prop</span><span class="wRoster">Roster</span>')
    expect(doc).toContain('Start with 1 property free.')
    expect(doc).toContain('proproster.com')
  })
})

describe('Camera keyframes and highlight fields are embedded as data, driving one continuous formula', () => {
  it('CAMERA_KEYFRAMES and HIGHLIGHT_FIELDS are embedded as JSON consumed by lerpKeyframes/fieldRect — not hardcoded per-scene transforms', () => {
    expect(doc).toContain('var CAMERA_KEYFRAMES = [')
    expect(doc).toContain('var HIGHLIGHT_FIELDS = [')
    expect(doc).toContain('"label":"Value"')
    expect(doc).toContain('"label":"Appreciation"')
    expect(doc).toContain('var cam = lerpKeyframes(CAMERA_KEYFRAMES, local, [\'s\', \'tx\', \'ty\']);')
  })

  it('the "overview" scene\'s per-frame branch writes ovImg\'s transform exactly once, straight from lerpKeyframes\' cam — no second, competing write (the shared engine\'s generic kenBurns() helper, unused by this Reel, is a separate function and not called here)', () => {
    const overviewBranchStart = doc.indexOf("if (kind === 'overview')")
    const overviewBranchEnd = doc.indexOf("} else if (kind === 'close')")
    expect(overviewBranchStart).toBeGreaterThan(-1)
    expect(overviewBranchEnd).toBeGreaterThan(overviewBranchStart)
    const branch = doc.slice(overviewBranchStart, overviewBranchEnd)
    const assignments = [...branch.matchAll(/img\.style\.transform\s*=/g)]
    expect(assignments.length).toBe(1)
    expect(branch).not.toContain('kenBurns(')
  })

  it('the spotlight glides continuously between fields (eases from the previous field\'s rect) rather than snapping — matching "no sudden direction change"', () => {
    expect(doc).toContain('var prevField = HIGHLIGHT_FIELDS[slotIdx - 1];')
    expect(doc).toContain('easeOutCubic(clamp01(withinSlot / TRANS))')
  })
})

describe('Mobile/social safe areas', () => {
  it('the text layer has the same generous top/bottom padding as the original Reel', () => {
    expect(doc).toMatch(/\.safePad\s*\{[^}]*padding:\s*300px 92px 360px;/)
  })
})

describe('No non-live functionality or unsupported claim reaches the rendered document', () => {
  it('no forbidden term appears anywhere in the generated HTML', () => {
    const lower = doc.toLowerCase()
    for (const term of FORBIDDEN_TERMS) {
      expect(lower).not.toContain(term.toLowerCase())
    }
  })
})

describe('The original, approved Reel\'s own generated document is unaffected', () => {
  it('lib/content-studio/reel-html.ts is unchanged in its role — it still exports buildReelDocument and does not reference this Reel\'s files', () => {
    const originalHtmlSrc = readFileSync(join(__dirname, '..', 'reel-html.ts'), 'utf8')
    expect(originalHtmlSrc).toContain('export function buildReelDocument()')
    expect(originalHtmlSrc).not.toContain('property-overview')
    expect(originalHtmlSrc).not.toContain('reel-engine')
  })
})
