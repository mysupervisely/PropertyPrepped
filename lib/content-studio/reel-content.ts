// PropRoster Content Studio — Animated Marketing Reel Prototype
// V1.1 — Visual Refinement Pass
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
// bidding, "name your price," the Rental Turnover marketplace, or any
// provider-network concept — none of that is live.

export const REEL_WIDTH = 1080
export const REEL_HEIGHT = 1920
export const REEL_FPS = 30

export const BRAND = {
  // Same tokens as app/globals.css's :root — no new green introduced.
  green: '#2f7a5c',
  greenDeep: '#204b3b',
  // The Reel's own near-black background. The live product's chrome is a
  // light theme (--bg: #f5f7f9), so this is a deliberately new, Reel-only
  // background — not a reuse of an app token — chosen for the "premium,
  // dark, technology-forward" marketing look the brief calls for.
  bg: '#0b100d',
  bgAlt: '#111813',
  ink: '#f5f7f5',
  muted: '#8fa198',
} as const

export type FeatureTab = {
  label: string // exact production tab label, verbatim
  caption: string // short, verified-accurate description of what's inside
  // Short "content pills" shown inside the V1.1 propertyView hero card —
  // each one is an exact, verified production term (a real sub-tab
  // label, hero metric label, or a phrase lifted from real product
  // copy) — never an invented feature.
  tags: string[]
}

// Exact top-level tab labels from app/page.tsx's `tabs` array — verbatim,
// same order as production. Nothing renamed, nothing invented.
export const FEATURE_TABS: FeatureTab[] = [
  { label: 'Overview', caption: 'Value, equity & cash flow', tags: ['Value', 'Equity', 'Rent'] },
  { label: 'Rent', caption: 'Lease, ledger & tenant', tags: ['Lease', 'Ledger', 'Tenant'] },
  { label: 'Details', caption: 'Mortgage, insurance & maintenance', tags: ['Mortgage', 'Insurance', 'Maintenance'] },
  { label: 'PropCrew', caption: 'Contractors, agents & lenders', tags: ['Contractors', 'Agents', 'Lenders'] },
  { label: 'Documents', caption: 'Every document, organized', tags: ['Documents', 'Photos'] },
  { label: 'Tax', caption: 'Property tax at a glance', tags: ['Property tax', 'Documents'] },
]

export type Scene =
  | { id: 'hook'; kind: 'hook'; durationMs: number; line: string; chaos: string[] }
  | { id: 'change'; kind: 'change'; durationMs: number; line: string }
  | { id: 'meet'; kind: 'meet'; durationMs: number; line: string; tabs: FeatureTab[] }
  | { id: 'propertyView'; kind: 'propertyView'; durationMs: number; tabs: FeatureTab[] }
  | { id: 'value'; kind: 'value'; durationMs: number; lines: string[] }
  | { id: 'end'; kind: 'end'; durationMs: number; tagline: string; url: string }

// Scene-by-scene content. Durations are intentional (not incidental) —
// see reel-content.test.ts for the exact total. Ordering is the
// suggested 6-scene sequence from the brief, unchanged.
//
// V1.1 rebalance: the "meet" grid-reveal and "propertyView" cycle both
// showed the same six tabs in V1, which read as repetitive at a fixed
// pace. "meet" is now a quick, punchy establishing beat (all six areas
// at a glance) and "propertyView" — the product's hero moment — gets
// more time so each of the six tabs' real content pills are actually
// readable without pausing. "end" gets more time so the brand/domain
// register before the loop point.
export const REEL_SCENES: Scene[] = [
  {
    id: 'hook',
    kind: 'hook',
    durationMs: 3000,
    line: 'Still managing your rentals across…',
    chaos: ['Spreadsheets', 'Text threads', 'Random folders', 'A dozen apps'],
  },
  {
    id: 'change',
    kind: 'change',
    durationMs: 2200,
    line: 'What if your property had one home?',
  },
  {
    id: 'meet',
    kind: 'meet',
    durationMs: 2800,
    line: 'Meet PropRoster.',
    tabs: FEATURE_TABS,
  },
  {
    id: 'propertyView',
    kind: 'propertyView',
    durationMs: 5000,
    tabs: FEATURE_TABS,
  },
  {
    id: 'value',
    kind: 'value',
    durationMs: 2400,
    lines: ['One property. One place.', 'Less chasing. More control.'],
  },
  {
    id: 'end',
    kind: 'end',
    durationMs: 3600,
    tagline: 'Every property. Everything in its place.',
    url: 'proproster.com',
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
  'rental turnover',
  'provider network',
  'bid on',
  'download now',
  'start free',
  'sign up free',
  'free trial',
]
