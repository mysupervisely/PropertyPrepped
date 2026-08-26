// PropRoster Content Studio — Animated Marketing Reel Prototype
// V1.2 — Visual Expansion + Faster Pacing
//
// This module is the ONLY place that holds the actual words/claims that
// appear in the Reel. It is deliberately data-only (no JSX, no rendering
// logic — see reel-html.ts for that) so a future Content Studio could
// swap the hook, the feature list, the captions, the CTA, the brand
// colors, or the duration/aspect ratio without touching the renderer.
//
// Every feature named below was verified against app/page.tsx (and, for
// PropCrew's copy, components/PropCrewPanel.tsx) on production main —
// see the milestone completion reports for the exact verification
// tables. Nothing here may reference the contractor marketplace,
// professional bidding, the Rental Turnover marketplace, "Find a
// PropRoster Pro," a provider network, name-your-price jobs, or payments
// collected by PropRoster — none of that is live. PropCrew is a private
// directory; Rent Ledger records that rent was received, it does not
// collect payments — both facts are asserted by the tests in this
// folder, not just documented here.
//
// V1.2's headline change from V1.1: instead of an abstract phone-card
// mockup, the "product montage" scenes now embed real, cropped
// screenshots of the live product (lib/content-studio/reel-assets.ts,
// generated from lib/content-studio/assets/*.jpg by
// scripts/encode-reel-assets.mjs) — showing recognizable PropRoster UI
// rather than invented UI, per this pass's brief.

export const REEL_WIDTH = 1080
export const REEL_HEIGHT = 1920
export const REEL_FPS = 30

// PropRoster's real visual language (app/globals.css's :root — brand
// #204b3b), extended with a muted secondary sage and a pale glow tone
// per this pass's direction: deep forest green primary, muted sage
// secondary, pale desaturated green glow, off-white, charcoal/near-black
// contrast. Deliberately NOT bright lime/neon/fluorescent — every green
// here is desaturated enough to read as "premium SaaS," not "gaming UI."
export const BRAND = {
  green: '#2b6b4f', // primary — deep forest, close to app's --brand #204b3b
  greenDeep: '#173d2c', // deeper shade for large brand text / gradients
  sage: '#87a091', // muted secondary accent (inactive nav items, small labels)
  bg: '#0a0f0c', // near-black, faintly green-tinted charcoal background
  bgAlt: '#0f1712',
  ink: '#f6f8f5',
  muted: '#8fa198',
} as const

// Exact top-level tab labels from app/page.tsx's `tabs` array — verbatim,
// same order as production. Nothing renamed, nothing invented. Shown as
// a quick establishing grid in the "meet" scene (labels only, matching
// how the real product's own tab bar shows just names, no captions).
export const FEATURE_TAB_LABELS = ['Overview', 'Rent', 'Details', 'PropCrew', 'Documents', 'Tax']

export type AssetKey = 'rentLedger' | 'rentLedgerAttention' | 'search' | 'investmentTools' | 'propcrew' | 'propertyHome'

export type Scene =
  | { id: 'hook'; kind: 'hook'; durationMs: number; line: string; chaos: string[] }
  | { id: 'transition'; kind: 'transition'; durationMs: number; line: string; asset: AssetKey }
  | { id: 'meet'; kind: 'meet'; durationMs: number; line: string; tabs: string[] }
  | { id: string; kind: 'montage'; durationMs: number; eyebrow: string; line: string; asset: AssetKey; shine?: boolean }
  | { id: 'value'; kind: 'value'; durationMs: number; lines: string[] }
  | { id: 'end'; kind: 'end'; durationMs: number; tagline: string; url: string; asset: AssetKey }

// Scene-by-scene content. Durations are intentional (not incidental) —
// see reel-content.test.ts for the exact total. V1.2 trades V1.1's six
// longer scenes for ten shorter ones (a new visual beat roughly every
// 1.4-2.2s) while keeping the same 18-20s target window.
export const REEL_SCENES: Scene[] = [
  {
    id: 'hook',
    kind: 'hook',
    durationMs: 2400,
    line: 'Still managing your rentals across…',
    chaos: ['Spreadsheets', 'Text threads', 'Random folders', 'A dozen apps'],
  },
  {
    id: 'transition',
    kind: 'transition',
    durationMs: 1600,
    line: 'What if your property had one home?',
    asset: 'propertyHome',
  },
  {
    id: 'meet',
    kind: 'meet',
    durationMs: 1400,
    line: 'Meet PropRoster.',
    tabs: FEATURE_TAB_LABELS,
  },
  {
    id: 'rentLedger',
    kind: 'montage',
    durationMs: 2000,
    eyebrow: 'RENT LEDGER',
    line: 'Track rent. Month by month.',
    asset: 'rentLedger',
  },
  {
    id: 'propCrew',
    kind: 'montage',
    durationMs: 2000,
    eyebrow: 'PROPCREW',
    line: 'Your private crew. Your trusted pros.',
    asset: 'propcrew',
  },
  {
    id: 'search',
    kind: 'montage',
    durationMs: 1600,
    eyebrow: 'SEARCH',
    line: 'Find anything. Fast.',
    asset: 'search',
  },
  {
    id: 'investmentTools',
    kind: 'montage',
    durationMs: 2200,
    eyebrow: 'INVESTMENT TOOLS',
    line: 'Run the numbers before you commit.',
    asset: 'investmentTools',
    shine: true,
  },
  {
    id: 'attention',
    kind: 'montage',
    durationMs: 1600,
    eyebrow: 'RENT LEDGER',
    line: 'Stay ahead of what needs attention.',
    asset: 'rentLedgerAttention',
  },
  {
    id: 'value',
    kind: 'value',
    durationMs: 1800,
    lines: ['One property. One place.', 'Less chasing. More control.'],
  },
  {
    id: 'end',
    kind: 'end',
    durationMs: 3000,
    tagline: 'Every property. Everything in its place.',
    url: 'proproster.com',
    asset: 'propertyHome',
  },
]

export const REEL_TOTAL_MS = REEL_SCENES.reduce((sum, s) => sum + s.durationMs, 0)

export function sceneStartMs(sceneId: Scene['id']): number {
  let t = 0
  for (const s of REEL_SCENES) {
    if (s.id === sceneId) return t
    t += s.durationMs
  }
  throw new Error(`Unknown scene id: ${sceneId}`)
}

// Terms that must NEVER appear anywhere in Reel copy — none of these are
// live product functionality as of this prototype.
export const FORBIDDEN_TERMS = [
  'marketplace',
  'bidding',
  'name your price',
  'name-your-price',
  'rental turnover',
  'provider network',
  'bid on',
  'find a proproster pro',
  'download now',
  'start free',
  'sign up free',
  'free trial',
  'collects rent',
  'collect rent',
  'collects payments',
  'collect payments',
  'payments collected by proproster',
]
