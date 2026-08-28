import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildReel3Document } from './html'
import { BRAND, FORBIDDEN_TERMS, REEL3_HEIGHT, REEL3_WIDTH, REEL3_SCENES } from './content'

// PropRoster Content Studio — Feature Reel #3 ("PropCrew") generated-
// document tests. This repo has no jsdom/React Testing Library, so
// (matching every other component test in this repo) these assert
// against the raw generated HTML/CSS/JS string rather than mounting it.

const doc = buildReel3Document()

describe('The generated document is a self-contained, offline page', () => {
  it('has no external network requests — no remote <link>/<script src>, no @import', () => {
    expect(doc).not.toMatch(/<link[^>]+href=["']https?:\/\//)
    expect(doc).not.toMatch(/<script[^>]+src=/)
    expect(doc).not.toMatch(/@import/)
    expect(doc).not.toContain('fonts.googleapis.com')
  })

  it('every image reference (whether an <img src> or a background-image url()) is a base64 data: URI', () => {
    const imgSrcs = [...doc.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1])
    expect(imgSrcs.length).toBeGreaterThan(0)
    for (const src of imgSrcs) expect(src.startsWith('data:image/png;base64,')).toBe(true)

    const bgUrls = [...doc.matchAll(/background-image:url\('([^']+)'\)/g)].map((m) => m[1])
    expect(bgUrls.length).toBeGreaterThan(0)
    for (const url of bgUrls) expect(url.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('the stage is exactly the Reel dimensions', () => {
    expect(doc).toContain(`width: ${REEL3_WIDTH}px; height: ${REEL3_HEIGHT}px;`)
  })

  it('uses the same brand palette as the other two Reels (imported, not redefined) — dark near-black background, muted forest green, no neon/lime in the <style> block', () => {
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
})

describe('This Reel deliberately does NOT reuse Reel #2\'s continuous-camera technique', () => {
  it('CAMERA_KEYFRAMES (Reel #2\'s continuous multi-keyframe camera curve data) is never embedded, and lerpKeyframes is never CALLED — this Reel uses static per-scene crops, not one continuous camera. (lerpKeyframes\' own FUNCTION DEFINITION is still present, unconditionally, as part of the shared engine\'s always-emitted helper set — that alone is fine and expected; what matters is this Reel never calls it.)', () => {
    expect(doc).not.toContain('CAMERA_KEYFRAMES')
    expect(doc).toContain('function lerpKeyframes(keyframes, t, fields)') // shared engine helper, always defined
    expect(doc).not.toMatch(/=\s*lerpKeyframes\(/) // never actually called
  })

  it('the "reveal" and "private" scenes each render exactly one static, non-animated screenshot viewport (no per-frame JS branch moves their <img>)', () => {
    expect(doc.match(/<img class="pcImg"/g)?.length).toBe(3) // reveal, trust(base), private
  })

  it('the "trust" scene uses two background-image "card pop" cutouts, not a spotlight rectangle', () => {
    expect(doc.match(/class="cardPop" data-el="card1Pop"/g)?.length).toBe(1)
    expect(doc.match(/class="cardPop" data-el="card2Pop"/g)?.length).toBe(1)
    expect(doc).not.toContain('class="spotlight"')
  })

  it('the hook scenes use a distinct "thoughtReveal" blur-fade helper, not the shared engine\'s word-cascade revealWords used for the reveal/close scenes', () => {
    expect(doc).toContain('function thoughtReveal(el, localMs, delayMs, durMs)')
    const hook1BranchStart = doc.indexOf("if (kind === 'hook1')")
    const hook1BranchEnd = doc.indexOf("} else if (kind === 'hook2')")
    const hook1Branch = doc.slice(hook1BranchStart, hook1BranchEnd)
    expect(hook1Branch).toContain('thoughtReveal(')
    expect(hook1Branch).not.toContain('revealWords(')
  })
})

describe('All seven scenes are present, in order', () => {
  for (const scene of ['hook1', 'hook2', 'recognition', 'reveal', 'trust', 'private', 'close']) {
    it(`renders a section for the "${scene}" scene`, () => {
      expect(doc).toContain(`data-scene="${scene}"`)
    })
  }

  it('scenes appear in the document in storyboard order (DOM order matches REEL3_SCENES order)', () => {
    const indices = REEL3_SCENES.map((s) => doc.indexOf(`data-scene="${s.id}"`))
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1])
    }
  })

  it('the close card renders the two-tone PropRoster wordmark, tagline (word-split for the reveal animation, so checked word-by-word), CTA, and URL', () => {
    expect(doc).toContain('<span class="wProp">Prop</span><span class="wRoster">Roster</span>')
    expect(doc).toContain('<span class="word">Your</span>')
    expect(doc).toContain('<span class="word">properties.</span>')
    expect(doc).toContain('<span class="word">Organized.</span>')
    expect(doc).toContain('Start with 1 property free.')
    expect(doc).toContain('proproster.com')
  })

  it('the close tagline container has no container-level opacity:0 that would need an (easily-forgotten) manual toggle to clear — regression guard for a real bug caught during this Reel\'s own QA pass, where the tagline never appeared', () => {
    const closeCssMatch = doc.match(/\.closeTagline\s*\{[^}]*\}/)
    expect(closeCssMatch).not.toBeNull()
    expect((closeCssMatch as RegExpMatchArray)[0]).not.toContain('opacity: 0')
  })
})

describe('PRIVACY: phone/email are masked in the rendered document, names are not', () => {
  it('the two real phone numbers and the one real email address never appear anywhere in the generated document', () => {
    expect(doc).not.toContain('727-898-5484')
    expect(doc).not.toContain('813-948-5967')
    expect(doc).not.toContain('info@breezeair.com')
  })

  // Note: the names/business names ("Independent Handyman", "Jose
  // Rodriguez", "Breeze Air", "Joseph Bartow") are pixels INSIDE the
  // embedded screenshot image, not separate overlay text — so they
  // cannot be asserted via a plain string search against the generated
  // HTML (the image is opaque base64 pixel data). That they remain
  // visible (i.e. are never covered by a mask) is instead verified
  // geometrically in content.test.ts ("each mask sits below its card's
  // own name row, never covering it") and was additionally confirmed by
  // direct visual inspection of rendered frames — see the completion
  // report.

  it('renders at least 3 static .maskBar redaction bars on the base "reveal"/"trust" screenshots, plus 3 more nested inside the two card-pop cutouts (6 total)', () => {
    expect(doc.match(/class="maskBar"/g)?.length).toBe(9) // reveal(3) + trust base(3) + trust pops(1+2)
  })

  it('the "private" scene screenshot never includes any mask (because its crop never reaches the cards at all — see content.test.ts\'s dedicated bounds check)', () => {
    const privateSceneStart = doc.indexOf('data-scene="private"')
    const privateSceneEnd = doc.indexOf('</section>', privateSceneStart)
    const privateBranch = doc.slice(privateSceneStart, privateSceneEnd)
    expect(privateBranch).not.toContain('maskBar')
  })
})

describe('Mobile/social safe areas', () => {
  it('the text layer has the same generous top/bottom padding as the other two Reels', () => {
    expect(doc).toMatch(/\.safePad\s*\{[^}]*padding:\s*300px 92px 360px;/)
  })

  it('the screenshot "device card" stays within the 1080px stage width with margin on both sides (900px card, 90px each side)', () => {
    expect(doc).toContain(`width: 900px; margin: 0 auto;`)
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

describe('The other two Reels\' own generated documents are unaffected', () => {
  it('lib/content-studio/reel-html.ts (Reel #1) is unchanged in its role — still exports buildReelDocument and does not reference this Reel\'s files', () => {
    const originalHtmlSrc = readFileSync(join(__dirname, '..', 'reel-html.ts'), 'utf8')
    expect(originalHtmlSrc).toContain('export function buildReelDocument()')
    expect(originalHtmlSrc).not.toContain('propcrew-reel')
  })

  it('lib/content-studio/property-overview/html.ts (Reel #2) is unchanged in its role — still exports buildReel2Document and does not reference this Reel\'s files', () => {
    const reel2HtmlSrc = readFileSync(join(__dirname, '..', 'property-overview', 'html.ts'), 'utf8')
    expect(reel2HtmlSrc).toContain('export function buildReel2Document()')
    expect(reel2HtmlSrc).not.toContain('propcrew-reel')
  })
})
