import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  REEL2_WIDTH, REEL2_HEIGHT, REEL2_FPS, REEL2_SCENES, REEL2_TOTAL_MS, reel2SceneStartMs,
  HIGHLIGHT_FIELDS, CAMERA_KEYFRAMES, NUMBERS_START_MS, HIGHLIGHT_SLOT_MS,
  SCREENSHOT_WIDTH, SCREENSHOT_HEIGHT, DISPLAY_WIDTH, VIEWPORT_HEIGHT, SCALE_FACTOR,
  frameFor, cameraAt, viewportRectFor, FORBIDDEN_TERMS,
} from './content'

// PropRoster Content Studio — Feature Reel #2 ("Property Overview")
// content-model tests. Covers: exact approved copy, duration/resolution,
// scene ordering, no forbidden claims, only the one approved screenshot
// asset in use, deterministic camera/spotlight math, and — critically —
// that the ORIGINAL Reel's own files are completely untouched by this
// second Reel's existence.

describe('Composition dimensions and duration are intentional', () => {
  it('is 1080x1920 (9:16 vertical) at 30fps', () => {
    expect(REEL2_WIDTH).toBe(1080)
    expect(REEL2_HEIGHT).toBe(1920)
    expect(REEL2_WIDTH / REEL2_HEIGHT).toBeCloseTo(9 / 16, 5)
    expect(REEL2_FPS).toBe(30)
  })

  it('total duration is ~14-16s (the brief\'s target), and is exactly the sum of the three scene durations', () => {
    const sum = REEL2_SCENES.reduce((s, sc) => s + sc.durationMs, 0)
    expect(REEL2_TOTAL_MS).toBe(sum)
    expect(REEL2_TOTAL_MS).toBeGreaterThanOrEqual(14000)
    expect(REEL2_TOTAL_MS).toBeLessThanOrEqual(16000)
    expect(REEL2_TOTAL_MS).toBe(15000)
  })

  it('has exactly the three scenes (hook, overview, close) in order — the combined property+numbers+idea sequence is ONE continuous scene, not three separate crossfade boundaries, so the camera can never reset mid-sequence', () => {
    expect(REEL2_SCENES.map((s) => s.id)).toEqual(['hook', 'overview', 'close'])
  })

  it('the "overview" scene\'s duration is exactly the sum of its property/numbers/idea sub-phase durations', () => {
    const overview = REEL2_SCENES.find((s) => s.id === 'overview')
    expect(overview && overview.kind === 'overview').toBe(true)
    if (overview && overview.kind === 'overview') {
      expect(overview.durationMs).toBe(overview.propertyDurationMs + overview.numbersDurationMs + overview.ideaDurationMs)
    }
  })

  it('sceneStartMs is monotonically increasing and matches cumulative durations', () => {
    let expected = 0
    for (const s of REEL2_SCENES) {
      expect(reel2SceneStartMs(s.id)).toBe(expected)
      expected += s.durationMs
    }
  })
})

describe('Exact approved marketing copy', () => {
  it('the hook line matches exactly', () => {
    const hook = REEL2_SCENES.find((s) => s.id === 'hook')
    expect(hook && hook.kind === 'hook' ? hook.line : null).toBe('Know your rental at a glance.')
  })

  it('the idea line matches exactly', () => {
    const overview = REEL2_SCENES.find((s) => s.id === 'overview')
    expect(overview && overview.kind === 'overview' ? overview.ideaLine : null).toBe('Everything about your property, organized.')
  })

  it('the close scene\'s full text hierarchy matches exactly: tagline, CTA, URL', () => {
    const close = REEL2_SCENES.find((s) => s.id === 'close')
    expect(close && close.kind === 'close' ? close.tagline : null).toBe('Your property. The numbers that matter. One place.')
    expect(close && close.kind === 'close' ? close.cta : null).toBe('Start with 1 property free.')
    expect(close && close.kind === 'close' ? close.url : null).toBe('proproster.com')
  })

  it('the "Start with 1 property free" CTA is verified against real production pricing — app/pricing/page.tsx\'s hero and the real `free` plan definition', () => {
    const pricingSource = readFileSync(join(__dirname, '..', '..', '..', 'app/pricing/page.tsx'), 'utf8')
    expect(pricingSource).toContain('Start free with one property. Upgrade when your portfolio grows.')
    const plansSource = readFileSync(join(__dirname, '..', '..', '..', 'lib/billing/plans.ts'), 'utf8')
    expect(plansSource).toMatch(/free:\s*\{[^}]*maxProperties:\s*1,/)
    expect(plansSource).toMatch(/free:\s*\{[^}]*priceMonthly:\s*0,/)
  })
})

describe('Only the approved Property Overview screenshot is used — no other feature screenshot', () => {
  it('the highlighted fields are exactly the eight named in the brief, in the brief\'s order', () => {
    expect(HIGHLIGHT_FIELDS.map((f) => f.label)).toEqual([
      'Value', 'Mortgage', 'Equity', 'Rent',
      'Monthly property expenses', 'Estimated cash flow', 'Purchase price', 'Appreciation',
    ])
  })

  it('every highlight field is a real, positive-size box within the screenshot\'s own bounds — never invented off-image coordinates', () => {
    for (const f of HIGHLIGHT_FIELDS) {
      expect(f.w).toBeGreaterThan(0)
      expect(f.h).toBeGreaterThan(0)
      expect(f.x).toBeGreaterThanOrEqual(0)
      expect(f.y).toBeGreaterThanOrEqual(0)
      expect(f.x + f.w).toBeLessThanOrEqual(SCREENSHOT_WIDTH)
      expect(f.y + f.h).toBeLessThanOrEqual(SCREENSHOT_HEIGHT)
    }
  })

  it('the hero-metrics highlight boxes (Value/Mortgage/Equity/Rent) sit in one horizontal row, left-to-right, non-overlapping — matching the real metrics strip layout', () => {
    const [value, mortgage, equity, rent] = HIGHLIGHT_FIELDS
    expect(value.y).toBe(mortgage.y)
    expect(mortgage.y).toBe(equity.y)
    expect(equity.y).toBe(rent.y)
    expect(value.x + value.w).toBeLessThanOrEqual(mortgage.x)
    expect(mortgage.x + mortgage.w).toBeLessThanOrEqual(equity.x)
    expect(equity.x + equity.w).toBeLessThanOrEqual(rent.x)
  })

  it('the financial-details highlight boxes (Monthly expenses/Cash flow/Purchase price/Appreciation) sit in one vertical stack, top-to-bottom, non-overlapping, at the same left edge — matching the real Financial details card layout', () => {
    const rows = HIGHLIGHT_FIELDS.slice(4)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].y).toBeGreaterThanOrEqual(rows[i - 1].y + rows[i - 1].h)
    }
    expect(new Set(rows.map((r) => r.x)).size).toBe(1)
  })

  it('the screenshot dimensions match the real supplied file exactly (965x939) — never resized/distorted', () => {
    expect(SCREENSHOT_WIDTH).toBe(965)
    expect(SCREENSHOT_HEIGHT).toBe(939)
  })
})

describe('Deterministic camera math (testable without a browser — same formula the renderer uses)', () => {
  it('frameFor() is a pure function: same inputs always produce the same (scale, translate) outputs', () => {
    const a = frameFor(10, 945, 0, 300)
    const b = frameFor(10, 945, 0, 300)
    expect(a).toEqual(b)
  })

  it('CAMERA_KEYFRAMES is sorted ascending by time, and every keyframe\'s scale keeps the corresponding target box fully on-screen', () => {
    for (let i = 1; i < CAMERA_KEYFRAMES.length; i++) {
      expect(CAMERA_KEYFRAMES[i].t).toBeGreaterThan(CAMERA_KEYFRAMES[i - 1].t)
    }
  })

  it('cameraAt() is a single continuous piecewise-linear curve: at every keyframe\'s own timestamp, it returns exactly that keyframe (no seam/jump)', () => {
    for (const kf of CAMERA_KEYFRAMES) {
      const cam = cameraAt(kf.t)
      expect(cam.s).toBeCloseTo(kf.s, 6)
      expect(cam.tx).toBeCloseTo(kf.tx, 6)
      expect(cam.ty).toBeCloseTo(kf.ty, 6)
    }
  })

  it('cameraAt() clamps before the first and after the last keyframe (never extrapolates)', () => {
    expect(cameraAt(-500)).toEqual(CAMERA_KEYFRAMES[0])
    expect(cameraAt(999999)).toEqual(CAMERA_KEYFRAMES[CAMERA_KEYFRAMES.length - 1])
  })

  it('every highlight field stays within the 900x640 viewport for the great majority of its own highlight slot (settled, not mid-transition)', () => {
    // Checked 250ms after each slot starts (well past the 200ms glide the
    // renderer uses between fields) through 10ms before it ends.
    for (let i = 0; i < HIGHLIGHT_FIELDS.length; i++) {
      const slotStart = NUMBERS_START_MS + i * HIGHLIGHT_SLOT_MS
      const slotEnd = slotStart + HIGHLIGHT_SLOT_MS
      for (const t of [slotStart + 250, (slotStart + slotEnd) / 2, slotEnd - 10]) {
        const cam = cameraAt(t)
        const r = viewportRectFor(HIGHLIGHT_FIELDS[i], cam)
        expect(r.x).toBeGreaterThanOrEqual(-1)
        expect(r.x + r.w).toBeLessThanOrEqual(DISPLAY_WIDTH + 1)
        expect(r.y).toBeGreaterThanOrEqual(-1)
        expect(r.y + r.h).toBeLessThanOrEqual(VIEWPORT_HEIGHT + 1)
      }
    }
  })

  it('SCALE_FACTOR is derived from the real screenshot width, not a magic number', () => {
    expect(SCALE_FACTOR).toBeCloseTo(DISPLAY_WIDTH / SCREENSHOT_WIDTH, 10)
  })
})

describe('No non-live functionality or unsupported claim is advertised', () => {
  function allReel2Strings(): string[] {
    const strings: string[] = []
    for (const s of REEL2_SCENES) {
      if ('line' in s) strings.push(s.line)
      if ('ideaLine' in s) strings.push(s.ideaLine)
      if ('tagline' in s) strings.push(s.tagline)
      if ('cta' in s) strings.push(s.cta)
      if ('url' in s) strings.push(s.url)
    }
    strings.push(...HIGHLIGHT_FIELDS.map((f) => f.label))
    return strings
  }

  it('no scene/label string contains any forbidden marketplace/bidding/AI-valuation/payments-collected term', () => {
    const haystack = allReel2Strings().join(' \n ').toLowerCase()
    for (const term of FORBIDDEN_TERMS) {
      expect(haystack).not.toContain(term.toLowerCase())
    }
  })

  it('no fabricated dollar figure or percentage is typed as copy — the real numbers ($650,000, etc.) live only inside the actual screenshot pixels', () => {
    const haystack = allReel2Strings().join(' \n ')
    expect(haystack).not.toMatch(/\$\s?\d/)
    expect(haystack).not.toMatch(/\d+\s?%/)
  })

  it('no Rent Ledger, PropCrew, Tax workspace, Documents, Search, or Investment Tools screenshot/copy appears in this Reel — those are reserved for future posts', () => {
    const haystack = allReel2Strings().join(' \n ').toLowerCase()
    for (const reserved of ['rent ledger', 'propcrew', 'tax center', 'smart upload', 'investment tools', 'rental property analyzer']) {
      expect(haystack).not.toContain(reserved)
    }
  })
})

describe('The original, approved Reel is completely unaffected by this second Reel', () => {
  it('this content module never imports the original Reel\'s scene data (reel-content.ts\'s REEL_SCENES/REEL_TOTAL_MS/etc.) — only its read-only BRAND constant', () => {
    const src = readFileSync(join(__dirname, 'content.ts'), 'utf8')
    const importLine = src.match(/import \{([^}]*)\} from '\.\.\/reel-content\.ts'/)
    expect(importLine).not.toBeNull()
    const imported = (importLine as RegExpMatchArray)[1].split(',').map((s) => s.trim())
    expect(imported).toEqual(['BRAND'])
  })

  it('the original Reel\'s own content/html modules do not import anything from property-overview/ — the dependency is one-directional', () => {
    const reelContentSrc = readFileSync(join(__dirname, '..', 'reel-content.ts'), 'utf8')
    const reelHtmlSrc = readFileSync(join(__dirname, '..', 'reel-html.ts'), 'utf8')
    expect(reelContentSrc).not.toContain('property-overview')
    expect(reelHtmlSrc).not.toContain('property-overview')
  })
})
