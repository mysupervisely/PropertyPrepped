import { describe, expect, it } from 'vitest'
import { buildReelDocument } from './reel-html'
import { BRAND, FORBIDDEN_TERMS, REEL_HEIGHT, REEL_WIDTH } from './reel-content'

// Animated Marketing Reel Prototype — generated-document tests. Covers
// V1, V1.1, and the V1.2 "visual expansion + faster pacing" pass. This
// repo has no jsdom/React Testing Library, so (matching every other
// component test in this repo) these assert against the raw generated
// HTML/CSS/JS string rather than mounting it.

const doc = buildReelDocument()

describe('The generated document is a self-contained, offline page (screenshots included)', () => {
  it('has no external network requests — no remote <link>/<script src>, no @import, and every <img> is a base64 data: URI, never a remote or relative file path', () => {
    expect(doc).not.toMatch(/<link[^>]+href=["']https?:\/\//)
    expect(doc).not.toMatch(/<script[^>]+src=/)
    expect(doc).not.toMatch(/@import/)
    expect(doc).not.toContain('fonts.googleapis.com')
    const imgSrcs = [...doc.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1])
    expect(imgSrcs.length).toBeGreaterThan(0)
    for (const src of imgSrcs) expect(src.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it('the stage is exactly the Reel dimensions', () => {
    expect(doc).toContain(`width: ${REEL_WIDTH}px; height: ${REEL_HEIGHT}px;`)
  })

  it('uses the dark, near-black Reel background and the muted (non-neon) brand greens', () => {
    expect(doc).toContain(BRAND.bg)
    expect(doc).toContain(BRAND.green)
    expect(doc).toContain(BRAND.sage)
    // Guard against ever swapping in a bright/neon green by mistake. Scoped
    // to the <style> block only — the full document also contains base64
    // image data, which (being effectively random text) will eventually
    // contain any given short substring, including "lime" or "neon", by
    // coincidence.
    const styleBlock = (doc.match(/<style>([\s\S]*?)<\/style>/) as RegExpMatchArray)[1].toLowerCase()
    expect(styleBlock).not.toMatch(/#00ff00|#39ff14|lime|neon/)
  })
})

describe('A deterministic, externally-drivable animation clock is exposed', () => {
  it('exposes window.__REEL__.setTime for frame-exact capture, and totalMs/fps', () => {
    expect(doc).toContain('window.__REEL__ = { setTime: setTime, totalMs: TOTAL_MS, fps:')
  })

  it('a `manual=1` query param disables the real-time requestAnimationFrame autoplay loop, so an external renderer fully controls time', () => {
    expect(doc).toContain("params.get('manual') === '1'")
    expect(doc).toContain('if (!manual) {')
    expect(doc).toContain('requestAnimationFrame(tick)')
  })

  it('the waveform, ambient spotlight, and Ken Burns image zooms are all deterministic functions of ms/local time, never Math.random()', () => {
    expect(doc).not.toContain('Math.random(')
    expect(doc).toContain('Math.sin(ms /')
    expect(doc).toContain("stageEl.style.setProperty('--spot-x'")
    expect(doc).toContain('function kenBurns(img, localMs, durationMs, fromScale, toScale, fromXPct, toXPct, fromYPct, toYPct)')
  })
})

describe('All ten scenes are present in the markup', () => {
  for (const scene of ['hook', 'transition', 'meet', 'rentLedger', 'propCrew', 'search', 'investmentTools', 'attention', 'value', 'end']) {
    it(`renders a section for the "${scene}" scene`, () => {
      expect(doc).toContain(`data-scene="${scene}"`)
    })
  }

  it('the end card renders the two-tone PropRoster wordmark, the tagline, and the URL', () => {
    expect(doc).toContain('<span class="wProp">Prop</span><span class="wRoster">Roster</span>')
    expect(doc).toContain('Every property. Everything in its place.'.split(' ').map((w) => `<span class="word">${w}</span>`).join(' '))
    expect(doc).toContain('proproster.com')
  })
})

describe('V1.2: full-bleed property-photo scenes reuse the real site\'s hero-image + scrim pattern', () => {
  it('"transition" and "end" both render a bleedBg with an <img> and a dark scrim, matching components/LandingPage.tsx\'s existing .landingHeroBg/.landingHeroScrim idea', () => {
    expect(doc).toContain('.bleedBg { position: absolute; inset: 0; overflow: hidden; }')
    expect(doc).toContain('.bleedScrim')
    const transitionIdx = doc.indexOf('data-scene="transition"')
    const endIdx = doc.indexOf('data-scene="end"')
    expect(doc.slice(transitionIdx, transitionIdx + 400)).toContain('class="bleedBg"')
    expect(doc.slice(endIdx, endIdx + 400)).toContain('class="bleedBg"')
  })

  it('other scenes (hook/meet/montage/value) do not render a bleedBg — only transition/end are full-bleed', () => {
    for (const scene of ['hook', 'meet', 'rentLedger', 'value']) {
      const idx = doc.indexOf(`data-scene="${scene}"`)
      const nextSectionIdx = doc.indexOf('<section', idx + 1)
      const slice = doc.slice(idx, nextSectionIdx > -1 ? nextSectionIdx : idx + 600)
      expect(slice).not.toContain('class="bleedBg"')
    }
  })
})

describe('V1.2: the product montage shows real screenshots in a browser-chrome-style frame', () => {
  it('every montage scene renders a .shotFrame with a chrome bar and an <img>', () => {
    for (const scene of ['rentLedger', 'propCrew', 'search', 'investmentTools', 'attention']) {
      const idx = doc.indexOf(`data-scene="${scene}"`)
      const slice = doc.slice(idx, idx + 1200)
      expect(slice).toContain('class="shotFrame"')
      expect(slice).toContain('class="shotFrameBar"')
      expect(slice).toMatch(/<img class="shotImg"[^>]+src="data:image\/jpeg;base64,/)
    }
  })

  it('only the investmentTools scene\'s JS branch drives the shotShine highlight sweep', () => {
    expect(doc).toContain('var shine = s.querySelector(\'[data-el="shotShine"]\')')
    expect(doc).toContain('shineStart = sceneDur * 0.38')
  })

  it('no <img> is a tiny/unreadable thumbnail — every embedded screenshot has real pixel width/height attributes', () => {
    const imgs = [...doc.matchAll(/<img class="shotImg"[^>]+width="(\d+)"[^>]+height="(\d+)"/g)]
    expect(imgs.length).toBe(5)
    for (const m of imgs) {
      expect(Number(m[1])).toBeGreaterThan(300)
      expect(Number(m[2])).toBeGreaterThan(100)
    }
  })
})

describe('V1.2: the hook scene\'s chaos items flash one at a time (rapid-fire), not all together in a static grid', () => {
  it('the JS computes a single active "flash index" per frame and hides every other chaos item', () => {
    expect(doc).toContain('var flashStart = 450, slot = 375')
    expect(doc).toContain("if (local < flashStart || c !== fi) { chaosEl.style.opacity = '0'; continue; }")
  })
})

describe('Regression guard: the per-frame dispatch branches on scene KIND, not scene id', () => {
  // Caught during V1.2 QA: five montage scenes (rentLedger, propCrew,
  // search, investmentTools, attention) all share kind "montage" but
  // have distinct ids. An earlier draft dispatched on `data-scene`
  // (the id) and checked `=== 'montage'`, which is never true for any
  // of them — every montage scene rendered fully blank (eyebrow/line/
  // shotFrame stuck at their CSS-default opacity 0, never touched by
  // JS) despite the scene container itself fading in correctly. Fixed
  // by adding a `data-kind` attribute and dispatching on that instead.
  it('every scene section carries a data-kind attribute distinct from its data-scene id for montage scenes', () => {
    for (const id of ['rentLedger', 'propCrew', 'search', 'investmentTools', 'attention']) {
      expect(doc).toContain(`data-scene="${id}" data-kind="montage"`)
    }
  })

  it('the JS reads data-kind (not data-scene) to choose the per-frame branch', () => {
    expect(doc).toContain("var kind = s.getAttribute('data-kind');")
    expect(doc).toContain("if (kind === 'hook')")
    expect(doc).toContain("} else if (kind === 'montage') {")
    // The old, broken form must never come back.
    expect(doc).not.toMatch(/var scene = s\.getAttribute\('data-scene'\)/)
  })

  it('every element a revealWords() call targets is built with splitWords() (has .word children) — a plain esc()-only element would have no .word spans for revealWords to ever find, permanently stuck at its CSS default opacity', () => {
    expect(doc).toContain('<p class="montageEyebrow" data-el="montageEyebrow"><span class="word">')
    // .montageEyebrow itself must NOT carry a baked-in opacity:0 — only
    // its .word children may start hidden, or the reveal could never
    // raise the (already-invisible) parent's effective opacity.
    const eyebrowRuleMatch = doc.match(/\.montageEyebrow\s*\{([^}]*)\}/)
    expect(eyebrowRuleMatch).not.toBeNull()
    expect((eyebrowRuleMatch as RegExpMatchArray)[1]).not.toMatch(/opacity:\s*0[^.]/)
  })
})

describe('V1.3 regression guard: the crossfade opacity curve is one continuous formula, no one-frame flash-to-black at scene boundaries', () => {
  // Found via frame-by-frame pixel diffing of the V1.2 render: at the
  // exact instant a scene began (ms === its own start), opacity was
  // computed by TWO competing formulas — fadeIn = clamp01(local / FADE)
  // (exactly 0 at local === 0) and a second, only-for-strictly-earlier-
  // frames correction (`if (ms < start) ...`) that never fired AT
  // ms === start itself. The result: every scene's opacity silently
  // dropped to 0 for exactly one frame right as it began. Invisible
  // against the near-black background on text-only scenes; a glaring
  // one-frame flash-to-black on the property-photo scenes (transition,
  // end), which is exactly the "stutter" reported. Fixed by replacing
  // both formulas with a single min(fadeIn, fadeOut) curve and an
  // inclusive `ms <= end` active window.
  it('there is exactly one opacity formula (Math.min(fadeIn, fadeOut)) and no leftover competing "ms < start" correction', () => {
    expect(doc).toContain('s.style.opacity = String(Math.min(fadeIn, fadeOut));')
    expect(doc).not.toMatch(/if \(ms < start\) s\.style\.opacity/)
    expect(doc).not.toContain("fadeOut === 0 ? 1 : fadeOut")
  })

  it('fadeIn is computed the same way for every ms in the active window (a single continuous ramp), not conditionally overridden', () => {
    expect(doc).toContain("var fadeIn = clamp01((ms - (start - FADE)) / FADE);")
    // The old, buggy form (exactly 0 at local === 0) must not come back.
    expect(doc).not.toContain('var fadeIn = clamp01(local / FADE);')
  })

  it('the active window is inclusive of ms === end, so the natural fadeOut ramp (which reaches exactly 0 there) is what turns the scene invisible — not an abrupt "snap to 0"', () => {
    expect(doc).toContain('var active = ms >= start - FADE && ms <= end;')
  })
})

describe('V1.3: the house-photo Ken Burns motion is one continuous zoom + subtle pan, never reset mid-scene', () => {
  it('kenBurns() computes scale/x/y as pure linear interpolations of a single clamped progress value (no reset, no branch that could jump)', () => {
    const fnMatch = doc.match(/function kenBurns\(img,[^)]*\)\s*\{([\s\S]*?)\n\s{6}\}/)
    expect(fnMatch).not.toBeNull()
    const body = (fnMatch as RegExpMatchArray)[1]
    expect(body).toContain('var p = clamp01(localMs / durationMs);')
    expect(body).toContain('fromScale + (toScale - fromScale) * p')
    expect(body).toContain('fromXPct + (toXPct - fromXPct) * p')
    expect(body).toContain('fromYPct + (toYPct - fromYPct) * p')
  })

  it('the transition and end scenes both pass an explicit pan (non-zero X or Y), and both start above scale 1 and end higher still (continuous with the requested ~1.02-1.07 cinematic range)', () => {
    const pattern = /kenBurns\(s\.querySelector\('\[data-el="bleedImg"\]'\), local, end - start, ([\d.]+), ([\d.]+), (-?[\d.]+), (-?[\d.]+), (-?[\d.]+), (-?[\d.]+)\)/g
    const calls = [...doc.matchAll(pattern)]
    expect(calls.length).toBe(2) // transition + end
    for (const m of calls) {
      const [fromScale, toScale, fromX, toX, fromY, toY] = m.slice(1).map(Number)
      expect(fromScale).toBeGreaterThan(1.0)
      expect(toScale).toBeGreaterThan(fromScale)
      expect(fromX !== toX || fromY !== toY).toBe(true)
    }
  })
})

describe('Mobile/social safe areas: important copy stays clear of the edges', () => {
  it('every scene\'s text layer has generous top/bottom padding clear of where Instagram/TikTok draw their caption, controls, and username overlays', () => {
    expect(doc).toMatch(/\.safePad\s*\{[^}]*padding:\s*300px 92px 360px;/)
  })

  it('full-bleed background images are NOT constrained by the safe-area padding (they must reach the true edges), while the text/content layer is', () => {
    expect(doc).toMatch(/\.bleedBg\s*\{\s*position:\s*absolute;\s*inset:\s*0;/)
    expect(doc).toMatch(/\.safePad\s*\{[\s\S]*?padding:/)
  })
})

describe('No non-live functionality or unsupported CTA reaches the rendered document', () => {
  it('no forbidden marketplace/bidding/turnover/unverified-CTA/payments-collected term appears anywhere in the generated HTML', () => {
    const lower = doc.toLowerCase()
    for (const term of FORBIDDEN_TERMS) {
      expect(lower).not.toContain(term.toLowerCase())
    }
  })
})
