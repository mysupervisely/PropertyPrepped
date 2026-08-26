import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  REEL_WIDTH, REEL_HEIGHT, REEL_FPS, REEL_SCENES, REEL_TOTAL_MS, FEATURE_TAB_LABELS, FORBIDDEN_TERMS, sceneStartMs,
} from './reel-content'
import * as ASSETS from './reel-assets'

// Animated Marketing Reel Prototype — content-model tests. Covers V1,
// V1.1, V1.2 ("visual expansion + faster pacing" — ten shorter scenes,
// real embedded screenshots instead of an abstract hero card), and V1.3
// ("pacing + house motion polish" — a slower middle-ground pace so the
// product screens are actually readable at mobile size, plus a fix for
// a one-frame crossfade-opacity bug; see reel-html.test.ts for the
// motion-specific regression guards). These lock in the composition's
// technical requirements (dimensions/fps/duration) and, most
// importantly, that every feature named or shown in the Reel is real,
// verifiable production functionality — never the contractor
// marketplace, professional bidding, the Rental Turnover marketplace,
// "Find a PropRoster Pro," a provider network, name-your-price jobs, or
// payments collected by PropRoster, none of which is live.

describe('Composition dimensions and timing are intentional, per the brief', () => {
  it('is 1080x1920 (9:16 vertical) at 30fps', () => {
    expect(REEL_WIDTH).toBe(1080)
    expect(REEL_HEIGHT).toBe(1920)
    expect(REEL_WIDTH / REEL_HEIGHT).toBeCloseTo(9 / 16, 5)
    expect(REEL_FPS).toBe(30)
  })

  it('total duration is ~22-23 seconds (V1.3 pacing pass), and is exactly the sum of the ten scene durations (not incidental)', () => {
    const sum = REEL_SCENES.reduce((s, sc) => s + sc.durationMs, 0)
    expect(REEL_TOTAL_MS).toBe(sum)
    expect(REEL_TOTAL_MS).toBeGreaterThanOrEqual(22000)
    expect(REEL_TOTAL_MS).toBeLessThanOrEqual(23000)
  })

  it('V1.3: every real-screenshot montage scene and the end card got MORE time than V1.2, a deliberate middle ground (slower than V1.2, still faster than V1.1)', () => {
    const v12Durations: Record<string, number> = {
      hook: 2400, transition: 1600, meet: 1400, rentLedger: 2000, propCrew: 2000,
      search: 1600, investmentTools: 2200, attention: 1600, value: 1800, end: 3000,
    }
    for (const s of REEL_SCENES) {
      const prior = v12Durations[s.id]
      if (s.id === 'hook') {
        expect(s.durationMs).toBe(prior) // the hook stays quick — it's the hook
      } else {
        expect(s.durationMs).toBeGreaterThan(prior)
      }
      // Still every scene is comfortably readable on a phone without
      // ballooning into V1.1's much slower six-scene pace.
      expect(s.durationMs).toBeGreaterThanOrEqual(1800)
      expect(s.durationMs).toBeLessThanOrEqual(3500)
    }
  })

  it('has the ten scenes from this pass\'s brief, in order', () => {
    expect(REEL_SCENES.map((s) => s.id)).toEqual([
      'hook', 'transition', 'meet', 'rentLedger', 'propCrew', 'search', 'investmentTools', 'attention', 'value', 'end',
    ])
  })

  it('sceneStartMs is monotonically increasing and matches cumulative durations', () => {
    let expected = 0
    for (const s of REEL_SCENES) {
      expect(sceneStartMs(s.id)).toBe(expected)
      expected += s.durationMs
    }
  })
})

describe('The "meet" scene\'s six tabs match production terminology exactly', () => {
  const pageSource = readFileSync(join(__dirname, '..', '..', 'app/page.tsx'), 'utf8')

  it("FEATURE_TAB_LABELS equals app/page.tsx's real top-level `tabs` array, verbatim and in the same order", () => {
    const match = pageSource.match(/const tabs: Tab\[\] = \[([^\]]+)\]/)
    expect(match).not.toBeNull()
    const liveLabels = (match as RegExpMatchArray)[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
    expect(FEATURE_TAB_LABELS).toEqual(liveLabels)
    const meet = REEL_SCENES.find((s) => s.kind === 'meet')
    expect(meet && 'tabs' in meet ? meet.tabs : null).toBe(FEATURE_TAB_LABELS)
  })
})

describe('V1.2: the product montage embeds real screenshots, not invented UI', () => {
  const montageScenes = REEL_SCENES.filter((s) => s.kind === 'montage') as Extract<typeof REEL_SCENES[number], { kind: 'montage' }>[]

  it('every montage scene references a real asset that exists in reel-assets.ts, with sane pixel dimensions', () => {
    expect(montageScenes.length).toBe(5)
    for (const s of montageScenes) {
      const a = (ASSETS as Record<string, { dataUri: string; width: number; height: number }>)[s.asset]
      expect(a).toBeDefined()
      expect(a.dataUri.startsWith('data:image/jpeg;base64,')).toBe(true)
      expect(a.width).toBeGreaterThan(100)
      expect(a.height).toBeGreaterThan(100)
    }
  })

  it('only the Investment Tools montage scene requests the results "shine" highlight', () => {
    const withShine = montageScenes.filter((s) => s.shine)
    expect(withShine.map((s) => s.id)).toEqual(['investmentTools'])
  })

  it('the "transition" and "end" scenes both use the supplied property photo (propertyHome), never a montage screenshot as a full-bleed background', () => {
    const transition = REEL_SCENES.find((s) => s.id === 'transition')
    const end = REEL_SCENES.find((s) => s.id === 'end')
    expect(transition && 'asset' in transition ? transition.asset : null).toBe('propertyHome')
    expect(end && 'asset' in end ? end.asset : null).toBe('propertyHome')
  })

  it('Rent Ledger copy never implies PropRoster collects rent/payments — it is a recordkeeping tool', () => {
    const rentLedger = montageScenes.find((s) => s.id === 'rentLedger')!
    const attention = montageScenes.find((s) => s.id === 'attention')!
    for (const line of [rentLedger.line, attention.line]) {
      expect(line.toLowerCase()).not.toMatch(/collect(s)?\s+(rent|payment)/)
    }
  })

  it('PropCrew copy describes a private directory, never a marketplace or shared provider network', () => {
    const propCrew = montageScenes.find((s) => s.id === 'propCrew')!
    expect(propCrew.line.toLowerCase()).toContain('private')
    expect(propCrew.line.toLowerCase()).not.toMatch(/marketplace|network|bid/)
  })
})

describe('No non-live functionality is advertised anywhere in the Reel content', () => {
  function allReelStrings(): string[] {
    const strings: string[] = []
    for (const s of REEL_SCENES) {
      if ('line' in s) strings.push(s.line)
      if ('chaos' in s) strings.push(...s.chaos)
      if ('lines' in s) strings.push(...s.lines)
      if ('tagline' in s) strings.push(s.tagline)
      if ('url' in s) strings.push(s.url)
      if ('eyebrow' in s) strings.push(s.eyebrow)
      if ('tabs' in s) strings.push(...s.tabs)
    }
    return strings
  }

  it('no scene string contains any forbidden marketplace/bidding/turnover/unverified-CTA/payments-collected term', () => {
    const haystack = allReelStrings().join(' \n ').toLowerCase()
    for (const term of FORBIDDEN_TERMS) {
      expect(haystack).not.toContain(term.toLowerCase())
    }
  })

  it('no scene string contains a fabricated metric (a % or $ figure) or the word "testimonial" — the real numbers visible in the Investment Tools scene live only inside the actual screenshot pixels, never restated as separate copy', () => {
    const haystack = allReelStrings().join(' \n ')
    expect(haystack).not.toMatch(/\$\s?\d/)
    expect(haystack).not.toMatch(/\d+\s?%/)
    expect(haystack.toLowerCase()).not.toContain('testimonial')
  })

  it('the end card uses the real production domain (proproster.com) and the exact required tagline', () => {
    const end = REEL_SCENES.find((s) => s.kind === 'end')
    expect(end && 'url' in end ? end.url : null).toBe('proproster.com')
    expect(end && 'tagline' in end ? end.tagline : null).toBe('Every property. Everything in its place.')
  })

  it('no unsupported CTA ("Download now", "Start free", etc.) appears anywhere', () => {
    const haystack = allReelStrings().join(' \n ').toLowerCase()
    expect(haystack).not.toContain('download')
    expect(haystack).not.toContain('start free')
    expect(haystack).not.toContain('sign up')
  })
})
