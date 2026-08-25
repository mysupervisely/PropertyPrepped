import { describe, expect, it } from 'vitest'
import { buildReelDocument } from './reel-html'
import { BRAND, FORBIDDEN_TERMS, REEL_HEIGHT, REEL_WIDTH } from './reel-content'

// Animated Marketing Reel Prototype V1 — generated-document tests. This
// repo has no jsdom/React Testing Library, so (matching every other
// component test in this repo) these assert against the raw generated
// HTML/CSS/JS string rather than mounting it.

const doc = buildReelDocument()

describe('The generated document is a self-contained, offline HTML page', () => {
  it('has no external network requests — no <link>/<script src> to a remote host, no @import', () => {
    expect(doc).not.toMatch(/<link[^>]+href=["']https?:\/\//)
    expect(doc).not.toMatch(/<script[^>]+src=/)
    expect(doc).not.toMatch(/@import/)
    expect(doc).not.toContain('fonts.googleapis.com')
  })

  it('the stage is exactly the Reel dimensions', () => {
    expect(doc).toContain(`width: ${REEL_WIDTH}px; height: ${REEL_HEIGHT}px;`)
  })

  it('uses the dark, near-black Reel background and the brand green — not the live app\'s light theme', () => {
    expect(doc).toContain(BRAND.bg)
    expect(doc).toContain(BRAND.green)
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

  it('the waveform bars are a deterministic function of ms (Math.sin(ms / …)), never Math.random() — so re-rendering the same frame twice is reproducible', () => {
    expect(doc).not.toContain('Math.random(')
    expect(doc).toContain('Math.sin(ms /')
  })
})

describe('All six scenes are present in the markup with the required brand elements', () => {
  for (const scene of ['hook', 'change', 'meet', 'propertyView', 'value', 'end']) {
    it(`renders a section for the "${scene}" scene`, () => {
      expect(doc).toContain(`data-scene="${scene}"`)
    })
  }

  it('the end card renders the two-tone PropRoster wordmark and the tagline/URL', () => {
    expect(doc).toContain('<span class="wProp">Prop</span><span class="wRoster">Roster</span>')
    expect(doc).toContain('Property management built for independent landlords.')
    expect(doc).toContain('proproster.com')
  })

  it('the propertyView scene renders a phone-card mock, not a real (tiny/unreadable) screenshot — no <img> tag anywhere in the document', () => {
    expect(doc).toContain('class="phoneCard"')
    expect(doc).not.toContain('<img')
  })
})

describe('Mobile/social safe areas: important copy stays clear of the edges', () => {
  it('every scene has generous top/bottom padding clear of where Instagram/TikTok draw their caption, controls, and username overlays', () => {
    expect(doc).toMatch(/\.scene\s*\{[^}]*padding:\s*320px 96px 380px;/)
  })
})

describe('No non-live functionality reaches the rendered document', () => {
  it('no forbidden marketplace/bidding/turnover term appears anywhere in the generated HTML', () => {
    const lower = doc.toLowerCase()
    for (const term of FORBIDDEN_TERMS) {
      expect(lower).not.toContain(term.toLowerCase())
    }
  })
})
