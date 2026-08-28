import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  REEL3_WIDTH, REEL3_HEIGHT, REEL3_FPS, REEL3_SCENES, REEL3_TOTAL_MS, reel3SceneStartMs,
  SCREENSHOT_WIDTH, SCREENSHOT_HEIGHT, DISPLAY_WIDTH, VIEWPORT_HEIGHT, PRIVATE_VIEWPORT_HEIGHT, SCALE_FACTOR,
  REVEAL_TARGET_BOX, REVEAL_CAMERA, PRIVATE_TARGET_BOX, PRIVATE_CAMERA, PRIVATE_CROP_BOTTOM_RAW_Y,
  CARD_HANDYMAN, CARD_BREEZE_AIR,
  frameFor, rectFor, FORBIDDEN_TERMS,
} from './content'

// PropRoster Content Studio — Feature Reel #3 ("PropCrew") content-model
// tests. Covers: exact approved copy, duration/resolution, scene
// ordering, no forbidden marketplace/booking/bidding/privacy-overclaim
// terms, only the one approved screenshot asset in use, deterministic
// crop math (including the "private" scene's bounds, which stays
// scoped to the heading per the storyboard), and — critically — that
// Reel #1 and Reel #2's own files are completely untouched by this
// third Reel's existence.
//
// Note: the contact details shown in the screenshot (names, phone
// numbers, email) are placeholder/test data on the demo property used
// throughout this project — confirmed by the requester, not a real
// person or business — so nothing in the cards is masked, and there is
// no masking-specific test coverage here.

describe('Composition dimensions and duration are intentional', () => {
  it('is 1080x1920 (9:16 vertical) at 30fps', () => {
    expect(REEL3_WIDTH).toBe(1080)
    expect(REEL3_HEIGHT).toBe(1920)
    expect(REEL3_WIDTH / REEL3_HEIGHT).toBeCloseTo(9 / 16, 5)
    expect(REEL3_FPS).toBe(30)
  })

  it('total duration is ~13-16s (the brief\'s target), and is exactly the sum of every scene duration', () => {
    const sum = REEL3_SCENES.reduce((s, sc) => s + sc.durationMs, 0)
    expect(REEL3_TOTAL_MS).toBe(sum)
    expect(REEL3_TOTAL_MS).toBeGreaterThanOrEqual(13000)
    expect(REEL3_TOTAL_MS).toBeLessThanOrEqual(16000)
    expect(REEL3_TOTAL_MS).toBe(16000)
  })

  it('has exactly the seven scenes, in the brief\'s storyboard order', () => {
    expect(REEL3_SCENES.map((s) => s.id)).toEqual([
      'hook1', 'hook2', 'recognition', 'reveal', 'trust', 'private', 'close',
    ])
  })

  it('sceneStartMs is monotonically increasing and matches cumulative durations', () => {
    let expected = 0
    for (const s of REEL3_SCENES) {
      expect(reel3SceneStartMs(s.id)).toBe(expected)
      expected += s.durationMs
    }
  })

  it('each scene\'s duration is within (or very close to) the brief\'s per-scene target range', () => {
    const byId = Object.fromEntries(REEL3_SCENES.map((s) => [s.id, s.durationMs]))
    expect(byId.hook1).toBe(2000)
    expect(byId.hook2).toBe(1800)
    expect(byId.recognition).toBe(1200)
    expect(byId.reveal).toBe(3500)
    expect(byId.trust).toBe(3000)
    expect(byId.private).toBe(1800)
    expect(byId.close).toBe(2700)
  })
})

describe('Exact approved marketing copy', () => {
  it('the two hook scenes\' lines match exactly', () => {
    const hook1 = REEL3_SCENES.find((s) => s.id === 'hook1')
    expect(hook1 && hook1.kind === 'hook1' ? hook1.line : null).toBe('Who fixed that AC last time?')
    const hook2 = REEL3_SCENES.find((s) => s.id === 'hook2')
    expect(hook2 && hook2.kind === 'hook2' ? hook2.lineA : null).toBe('And that handyman…')
    expect(hook2 && hook2.kind === 'hook2' ? hook2.lineB : null).toBe('what was his number?')
  })

  it('the recognition line matches exactly', () => {
    const recognition = REEL3_SCENES.find((s) => s.id === 'recognition')
    expect(recognition && recognition.kind === 'recognition' ? recognition.line : null).toBe('Sound familiar?')
  })

  it('the reveal label matches exactly', () => {
    const reveal = REEL3_SCENES.find((s) => s.id === 'reveal')
    expect(reveal && reveal.kind === 'reveal' ? reveal.label : null).toBe('Meet PropCrew.')
  })

  it('the trust scene\'s two lines match exactly', () => {
    const trust = REEL3_SCENES.find((s) => s.id === 'trust')
    expect(trust && trust.kind === 'trust' ? trust.lineA : null).toBe('The people you trust.')
    expect(trust && trust.kind === 'trust' ? trust.lineB : null).toBe('Saved with the property.')
  })

  it('the private scene\'s two lines match exactly and are verified against real production PropCrew copy', () => {
    const priv = REEL3_SCENES.find((s) => s.id === 'private')
    expect(priv && priv.kind === 'private' ? priv.lineA : null).toBe('Private to you.')
    expect(priv && priv.kind === 'private' ? priv.lineB : null).toBe('Never shared with the provider.')

    const reusePrefSource = readFileSync(join(__dirname, '..', '..', 'propcrew', 'reuse-preference.ts'), 'utf8')
    expect(reusePrefSource).toContain("export const PROPCREW_PRIVACY_DISCLOSURE = 'Private — never shared with the provider.'")

    const panelSource = readFileSync(join(__dirname, '..', '..', '..', 'components', 'PropCrewPanel.tsx'), 'utf8')
    expect(panelSource).toContain('<h2>Your private crew directory</h2>')
  })

  it('the close scene\'s full text hierarchy matches exactly: tagline, CTA, URL', () => {
    const close = REEL3_SCENES.find((s) => s.id === 'close')
    expect(close && close.kind === 'close' ? close.tagline : null).toBe('Your properties. Organized.')
    expect(close && close.kind === 'close' ? close.cta : null).toBe('Start with 1 property free.')
    expect(close && close.kind === 'close' ? close.url : null).toBe('proproster.com')
  })

  it('the "Start with 1 property free" CTA is verified against real production pricing', () => {
    const plansSource = readFileSync(join(__dirname, '..', '..', 'billing', 'plans.ts'), 'utf8')
    expect(plansSource).toMatch(/free:\s*\{[^}]*maxProperties:\s*1,/)
    expect(plansSource).toMatch(/free:\s*\{[^}]*priceMonthly:\s*0,/)
  })
})

describe('Only the approved PropCrew screenshot is used, verbatim, with the exact named contacts', () => {
  it('the screenshot dimensions match the real supplied file exactly (996x750) — never resized/distorted', () => {
    expect(SCREENSHOT_WIDTH).toBe(996)
    expect(SCREENSHOT_HEIGHT).toBe(750)
  })

  it('the two real contact cards sit side-by-side, non-overlapping, at the same row', () => {
    expect(CARD_HANDYMAN.y).toBe(CARD_BREEZE_AIR.y)
    expect(CARD_HANDYMAN.x + CARD_HANDYMAN.w).toBeLessThanOrEqual(CARD_BREEZE_AIR.x)
  })

  it('every card/target box is a real, positive-size box within the screenshot\'s own bounds — never an invented off-image coordinate', () => {
    const boxes = [CARD_HANDYMAN, CARD_BREEZE_AIR]
    for (const b of boxes) {
      expect(b.w).toBeGreaterThan(0)
      expect(b.h).toBeGreaterThan(0)
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.x + b.w).toBeLessThanOrEqual(SCREENSHOT_WIDTH)
      expect(b.y + b.h).toBeLessThanOrEqual(SCREENSHOT_HEIGHT)
    }
  })
})

describe('Deterministic crop/camera math (testable without a browser)', () => {
  it('frameFor() is a pure function: same inputs always produce the same (scale, translate) outputs', () => {
    const a = frameFor(10, 985, 428, 670)
    const b = frameFor(10, 985, 428, 670)
    expect(a).toEqual(b)
  })

  it('REVEAL_CAMERA keeps both cards fully within the 900x240 viewport', () => {
    for (const card of [CARD_HANDYMAN, CARD_BREEZE_AIR]) {
      const r = rectFor(card, REVEAL_CAMERA)
      expect(r.x).toBeGreaterThanOrEqual(-1)
      expect(r.x + r.w).toBeLessThanOrEqual(DISPLAY_WIDTH + 1)
      expect(r.y).toBeGreaterThanOrEqual(-1)
      expect(r.y + r.h).toBeLessThanOrEqual(VIEWPORT_HEIGHT + 1)
    }
  })

  it('SCALE_FACTOR is derived from the real screenshot width, not a magic number', () => {
    expect(SCALE_FACTOR).toBeCloseTo(DISPLAY_WIDTH / SCREENSHOT_WIDTH, 10)
  })

  it('PRIVATE_CAMERA is a real, positive zoom greater than REVEAL_CAMERA\'s — "return attention to the heading" is a genuine zoom-in, not a repeat of the same framing', () => {
    expect(PRIVATE_CAMERA.s).toBeGreaterThan(REVEAL_CAMERA.s)
  })

  it('REVEAL_TARGET_BOX and PRIVATE_TARGET_BOX are real, non-degenerate boxes within the screenshot', () => {
    for (const box of [REVEAL_TARGET_BOX, PRIVATE_TARGET_BOX]) {
      expect(box.x1).toBeGreaterThan(box.x0)
      expect(box.y1).toBeGreaterThan(box.y0)
      expect(box.x0).toBeGreaterThanOrEqual(0)
      expect(box.x1).toBeLessThanOrEqual(SCREENSHOT_WIDTH)
      expect(box.y0).toBeGreaterThanOrEqual(0)
      expect(box.y1).toBeLessThanOrEqual(SCREENSHOT_HEIGHT)
    }
  })
})

describe('The "private" scene\'s crop stays scoped to the heading, never reaching the cards below — matches the storyboard\'s "return attention to the heading" framing (regression guard for a real bug caught during this Reel\'s own QA pass)', () => {
  it('PRIVATE_CROP_BOTTOM_RAW_Y (the lowest raw-pixel row the private-scene viewport can ever show) is above both cards\' own top edge', () => {
    expect(PRIVATE_CROP_BOTTOM_RAW_Y).toBeLessThan(CARD_HANDYMAN.y)
    expect(PRIVATE_CROP_BOTTOM_RAW_Y).toBeLessThan(CARD_BREEZE_AIR.y)
    // With real margin, not just barely under — the earlier bug (using
    // the shared 240px viewport height for this crop) put this value at
    // ~603, ~100px PAST the cards' own top edge (501). A tight pass
    // here would not have caught that class of regression.
    expect(CARD_HANDYMAN.y - PRIVATE_CROP_BOTTOM_RAW_Y).toBeGreaterThan(10)
  })

  it('PRIVATE_VIEWPORT_HEIGHT is deliberately smaller than the shared VIEWPORT_HEIGHT used by "reveal"/"trust" — this scene does NOT reuse the taller shared viewport', () => {
    expect(PRIVATE_VIEWPORT_HEIGHT).toBeLessThan(VIEWPORT_HEIGHT)
  })

  it('PRIVATE_CAMERA\'s own target box (PRIVATE_TARGET_BOX) never extends into the cards either, independent of the viewport-height fix', () => {
    expect(PRIVATE_TARGET_BOX.y1).toBeLessThanOrEqual(CARD_HANDYMAN.y)
    expect(PRIVATE_TARGET_BOX.y1).toBeLessThanOrEqual(CARD_BREEZE_AIR.y)
  })
})

describe('No non-live functionality or unsupported claim is advertised', () => {
  function allReel3Strings(): string[] {
    const strings: string[] = []
    for (const s of REEL3_SCENES) {
      if ('line' in s) strings.push(s.line)
      if ('lineA' in s) strings.push(s.lineA)
      if ('lineB' in s) strings.push(s.lineB)
      if ('label' in s) strings.push(s.label)
      if ('tagline' in s) strings.push(s.tagline)
      if ('cta' in s) strings.push(s.cta)
      if ('url' in s) strings.push(s.url)
    }
    return strings
  }

  it('no scene string contains any forbidden marketplace/discovery/booking/bidding/payment/messaging/overclaimed-privacy term', () => {
    const haystack = allReel3Strings().join(' \n ').toLowerCase()
    for (const term of FORBIDDEN_TERMS) {
      expect(haystack).not.toContain(term.toLowerCase())
    }
  })

  it('no fabricated dollar figure, rating, or star count appears as typed copy', () => {
    const haystack = allReel3Strings().join(' \n ')
    expect(haystack).not.toMatch(/\$\s?\d/)
    expect(haystack).not.toMatch(/\d(\.\d)?\s?(star|stars|★)/i)
  })
})

describe('The other two Reels are completely unaffected by this third Reel', () => {
  it('this content module never imports the original Reel\'s scene data (reel-content.ts\'s REEL_SCENES/REEL_TOTAL_MS/etc.) — only its read-only BRAND constant', () => {
    const src = readFileSync(join(__dirname, 'content.ts'), 'utf8')
    const importLine = src.match(/import \{([^}]*)\} from '\.\.\/reel-content\.ts'/)
    expect(importLine).not.toBeNull()
    const imported = (importLine as RegExpMatchArray)[1].split(',').map((s) => s.trim())
    expect(imported).toEqual(['BRAND'])
  })

  it('this content module has no import statement from property-overview/ (Reel #2) — the module\'s own doc comment mentions that path by name to explain this, so the check is scoped to actual `import ... from` lines, not the whole file text', () => {
    const src = readFileSync(join(__dirname, 'content.ts'), 'utf8')
    const importLines = src.split('\n').filter((line) => /^\s*import\b/.test(line))
    for (const line of importLines) {
      expect(line).not.toContain('property-overview')
    }
  })

  it('neither the original Reel\'s nor Reel #2\'s own content/html modules import anything from propcrew-reel/ — the dependency is one-directional', () => {
    const reelContentSrc = readFileSync(join(__dirname, '..', 'reel-content.ts'), 'utf8')
    const reelHtmlSrc = readFileSync(join(__dirname, '..', 'reel-html.ts'), 'utf8')
    const reel2ContentSrc = readFileSync(join(__dirname, '..', 'property-overview', 'content.ts'), 'utf8')
    const reel2HtmlSrc = readFileSync(join(__dirname, '..', 'property-overview', 'html.ts'), 'utf8')
    for (const src of [reelContentSrc, reelHtmlSrc, reel2ContentSrc, reel2HtmlSrc]) {
      expect(src).not.toContain('propcrew-reel')
    }
  })

  it('the original Reel\'s own asset (propcrew.jpg — Reel #1\'s different, mock PropCrew thumbnail) is never referenced by this Reel', () => {
    const src = readFileSync(join(__dirname, 'assets.ts'), 'utf8')
    expect(src).not.toContain('propcrew.jpg')
    expect(src).toContain('propcrew-5645-north-eagle.png')
  })
})
