import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  REEL_WIDTH, REEL_HEIGHT, REEL_FPS, REEL_SCENES, REEL_TOTAL_MS, FEATURE_TABS, FORBIDDEN_TERMS, sceneStartMs,
} from './reel-content'

// Animated Marketing Reel Prototype V1 — content-model tests. These lock
// in the composition's technical requirements (dimensions/fps/duration)
// and, most importantly, that every feature named in the Reel is real,
// verifiable production functionality — never the contractor
// marketplace, bidding, "name your price," Rental Turnover marketplace,
// or any provider-network concept, none of which is live.

describe('Composition dimensions and timing are intentional, per the brief', () => {
  it('is 1080x1920 (9:16 vertical) at 30fps', () => {
    expect(REEL_WIDTH).toBe(1080)
    expect(REEL_HEIGHT).toBe(1920)
    expect(REEL_WIDTH / REEL_HEIGHT).toBeCloseTo(9 / 16, 5)
    expect(REEL_FPS).toBe(30)
  })

  it('total duration is ~15-20 seconds, and is exactly the sum of the six scene durations (not incidental)', () => {
    const sum = REEL_SCENES.reduce((s, sc) => s + sc.durationMs, 0)
    expect(REEL_TOTAL_MS).toBe(sum)
    expect(REEL_TOTAL_MS).toBeGreaterThanOrEqual(15000)
    expect(REEL_TOTAL_MS).toBeLessThanOrEqual(20000)
  })

  it('has exactly the six scenes from the brief, in order: hook, change, meet, propertyView, value, end', () => {
    expect(REEL_SCENES.map((s) => s.kind)).toEqual(['hook', 'change', 'meet', 'propertyView', 'value', 'end'])
  })

  it('sceneStartMs is monotonically increasing and matches cumulative durations', () => {
    let expected = 0
    for (const s of REEL_SCENES) {
      expect(sceneStartMs(s.id)).toBe(expected)
      expected += s.durationMs
    }
  })
})

describe('Every advertised feature tab matches production terminology exactly', () => {
  const pageSource = readFileSync(join(__dirname, '..', '..', 'app/page.tsx'), 'utf8')

  it("FEATURE_TABS labels equal app/page.tsx's real top-level `tabs` array, verbatim and in the same order", () => {
    const match = pageSource.match(/const tabs: Tab\[\] = \[([^\]]+)\]/)
    expect(match).not.toBeNull()
    const liveLabels = (match as RegExpMatchArray)[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
    expect(FEATURE_TABS.map((t) => t.label)).toEqual(liveLabels)
  })

  it('the "meet" and "propertyView" scenes both use the same verified FEATURE_TABS list — no separate, drifting copy of feature names', () => {
    const meet = REEL_SCENES.find((s) => s.kind === 'meet')
    const propertyView = REEL_SCENES.find((s) => s.kind === 'propertyView')
    expect(meet && 'tabs' in meet ? meet.tabs : null).toBe(FEATURE_TABS)
    expect(propertyView && 'tabs' in propertyView ? propertyView.tabs : null).toBe(FEATURE_TABS)
  })

  it('Details caption mentions maintenance, which is verified live as a Details sub-tab (PropertySubTab), not a top-level tab', () => {
    expect(pageSource).toContain("type PropertySubTab = 'Mortgage' | 'Insurance' | 'Maintenance' | 'Systems' | 'Ownership'")
    const details = FEATURE_TABS.find((t) => t.label === 'Details')
    expect(details?.caption.toLowerCase()).toContain('maintenance')
  })

  it('PropCrew caption matches the real, live empty-state copy in components/PropCrewPanel.tsx (contractors, agents, lenders)', () => {
    const panelSource = readFileSync(join(__dirname, '..', '..', 'components/PropCrewPanel.tsx'), 'utf8')
    expect(panelSource).toContain('Add contractors, agents, lenders and other professionals as you work with them.')
    const propCrew = FEATURE_TABS.find((t) => t.label === 'PropCrew')
    expect(propCrew?.caption).toBe('Contractors, agents & lenders')
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
      if ('tabs' in s) for (const t of s.tabs) { strings.push(t.label); strings.push(t.caption) }
    }
    return strings
  }

  it('no scene string contains any forbidden marketplace/bidding/turnover term', () => {
    const haystack = allReelStrings().join(' \n ').toLowerCase()
    for (const term of FORBIDDEN_TERMS) {
      expect(haystack).not.toContain(term.toLowerCase())
    }
  })

  it('no scene string contains a fabricated metric (a % or $ figure) or the word "testimonial"/"review" — nothing here is a real user quote or number', () => {
    const haystack = allReelStrings().join(' \n ')
    expect(haystack).not.toMatch(/\$\s?\d/)
    expect(haystack).not.toMatch(/\d+\s?%/)
    expect(haystack.toLowerCase()).not.toContain('testimonial')
  })

  it('the end card uses the real production domain (proproster.com) and the exact required tagline', () => {
    const end = REEL_SCENES.find((s) => s.kind === 'end')
    expect(end && 'url' in end ? end.url : null).toBe('proproster.com')
    expect(end && 'tagline' in end ? end.tagline : null).toBe('Property management built for independent landlords.')
  })
})
