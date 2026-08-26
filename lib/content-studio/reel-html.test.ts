import { describe, expect, it } from 'vitest'
import { buildReelDocument } from './reel-html'
import { BRAND, FORBIDDEN_TERMS, REEL_HEIGHT, REEL_WIDTH } from './reel-content'

// Animated Marketing Reel Prototype — generated-document tests. Covers
// both the original V1 requirements and the V1.1 visual-refinement pass
// (word-by-word text reveals, the 3x2 "meet" grid, the content-rich
// propertyView hero card, the ambient background drift). This repo has
// no jsdom/React Testing Library, so (matching every other component
// test in this repo) these assert against the raw generated
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

  it('the waveform bars and the ambient background spotlight are both a deterministic function of ms (Math.sin/Math.cos), never Math.random() — so re-rendering the same frame twice is reproducible', () => {
    expect(doc).not.toContain('Math.random(')
    expect(doc).toContain('Math.sin(ms /')
    expect(doc).toContain("stageEl.style.setProperty('--spot-x'")
  })
})

describe('All six scenes are present in the markup with the required brand elements', () => {
  for (const scene of ['hook', 'change', 'meet', 'propertyView', 'value', 'end']) {
    it(`renders a section for the "${scene}" scene`, () => {
      expect(doc).toContain(`data-scene="${scene}"`)
    })
  }

  it('the end card renders the two-tone PropRoster wordmark, the V1.1 tagline, and the URL', () => {
    expect(doc).toContain('<span class="wProp">Prop</span><span class="wRoster">Roster</span>')
    expect(doc).toContain('Every property. Everything in its place.'.split(' ').map((w) => `<span class="word">${w}</span>`).join(' '))
    expect(doc).toContain('proproster.com')
  })

  it('the propertyView scene renders a phone-card mock, not a real (tiny/unreadable) screenshot — no <img> tag anywhere in the document', () => {
    expect(doc).toContain('class="phoneCard"')
    expect(doc).not.toContain('<img')
  })
})

describe('V1.1: text reveals are word-by-word, not one whole-line block fade', () => {
  it('multi-word headlines (hook/change/meet/value/end tagline) are split into individually-animatable .word spans', () => {
    expect(doc).toContain('<p class="hookLine" data-el="hookLine"><span class="word">Still</span>')
    expect(doc).toContain('<p class="changeLine" data-el="changeLine"><span class="word">What</span>')
    expect(doc).toContain('<p class="meetLine" data-el="meetLine"><span class="word">Meet</span>')
  })

  it('the JS staggers each .word\'s reveal with revealWords(), not a single revealStyle() call on the whole line', () => {
    expect(doc).toContain('function revealWords(container, localMs, delayMs, stepMs, durMs)')
    expect(doc).toContain('revealWords(s.querySelector(\'[data-el="hookLine"]\'), local, 0, 55, 460)')
  })
})

describe('V1.1: the meet scene uses a 3x2 grid, matching production\'s real mobile tab layout', () => {
  it('.tabGrid is 3 columns (repeat(3, 1fr)), not the V1 2-column layout', () => {
    expect(doc).toMatch(/\.tabGrid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\)/)
  })
})

describe('V1.1: propertyView is the product\'s visual hero, with real content pills per tab', () => {
  it('renders a PROPROSTER hero label and a phoneCardTags pill container', () => {
    expect(doc).toContain('<div class="heroLabel" data-el="heroLabel">PROPROSTER</div>')
    expect(doc).toContain('data-el="phoneCardTags"')
  })

  it('the JS drives per-tab caption + tag pills off the same verified FEATURE_TABS data (labels appear in the embedded JSON)', () => {
    expect(doc).toContain('var propertyViewTabs = ')
    expect(doc).toContain('"label":"Overview"')
    expect(doc).toContain('"tags":["Value","Equity","Rent"]')
  })

  it('the phone card is visually larger/richer than a plain caption — a box-shadow and a tags row are present', () => {
    expect(doc).toMatch(/\.phoneCard\s*\{[^}]*box-shadow:/)
    expect(doc).toContain('.phoneCardTags')
  })
})

describe('V1.1: the hook scene\'s chaos items form a compact, gently-rotated 2x2 grid, not a plain vertical list', () => {
  it('.chaosGrid is a 2-column grid (not a flex column list)', () => {
    expect(doc).toMatch(/\.chaosGrid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*1fr\)/)
  })

  it('each chaos item carries a small deterministic rotation via a data attribute, applied by cardStyle()', () => {
    expect(doc).toMatch(/data-el="chaos0" data-rot="-3"/)
    expect(doc).toContain('function cardStyle(el, localMs, delayMs, durMs, rotateDeg)')
  })
})

describe('Mobile/social safe areas: important copy stays clear of the edges', () => {
  it('every scene has generous top/bottom padding clear of where Instagram/TikTok draw their caption, controls, and username overlays', () => {
    expect(doc).toMatch(/\.scene\s*\{[^}]*padding:\s*300px 92px 360px;/)
  })
})

describe('No non-live functionality or unsupported CTA reaches the rendered document', () => {
  it('no forbidden marketplace/bidding/turnover/unverified-CTA term appears anywhere in the generated HTML', () => {
    const lower = doc.toLowerCase()
    for (const term of FORBIDDEN_TERMS) {
      expect(lower).not.toContain(term.toLowerCase())
    }
  })
})
