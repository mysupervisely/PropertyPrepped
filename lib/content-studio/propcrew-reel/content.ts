// PropRoster Content Studio — Feature Reel #3: PropCrew
//
// A THIRD, fully independent Reel definition, built on the shared
// engine (../reel-engine.ts) rather than the original Reel's files
// (../reel-content.ts / ../reel-html.ts) OR Feature Reel #2's files
// (../property-overview/content.ts / html.ts) — neither of which this
// Reel imports or modifies. This module is data-only (no rendering
// logic — see html.ts for that), mirroring the other two Reels' split.
//
// UNLIKE Reel #2 (a continuous-camera product demonstration), Reel #3 is
// a short landlord STORY that leads into the product reveal — see the
// brief for the full storyboard. Deliberately differentiated from Reel
// #2's visual language:
//   - No continuous Ken-Burns camera movement is used as the primary
//     device. The screenshot is shown at a small number of STATIC crops
//     (one per scene), cut between with the normal scene crossfade —
//     not panned/zoomed continuously.
//   - The "people you trust" moment uses a CARD-POP treatment (a card
//     visually lifted forward while the rest of the screenshot dims),
//     not Reel #2's spotlight-rectangle-over-a-moving-camera technique.
//   - The hook is plain branded typography with no screenshot at all —
//     the viewer is meant to recognize the problem before seeing the
//     product.

import { BRAND } from '../reel-content.ts'

export const REEL3_WIDTH = 1080
export const REEL3_HEIGHT = 1920
export const REEL3_FPS = 30

// Re-exported (not redefined), same as Reel #2 — all three Reels share
// one brand-token source of truth. Read-only import; reel-content.ts is
// never written to.
export { BRAND }

// ---------------------------------------------------------------------
// The real screenshot's geometry. Every crop/card/mask box below is
// expressed in these RAW pixel coordinates (the screenshot's own
// 996x750 pixel grid), measured directly against the source image using
// a graduated grid overlay (same calibration method as Reel #2) — never
// invented, never guessed. See content.test.ts for the bounds checks
// that keep these honest.
// ---------------------------------------------------------------------
export const SCREENSHOT_WIDTH = 996
export const SCREENSHOT_HEIGHT = 750

// Fixed display "device card" the screenshot is shown inside — same
// DISPLAY_WIDTH convention as Reel #2 (900px within the 1080px stage,
// generous safe margins each side), but a much SHORTER fixed viewport
// (240px, not Reel #2's 640px): this Reel's screenshot moments are
// short, wide crops (a heading strip, two side-by-side cards), not a
// tall scrolling page, so a short "banner" card is the honest shape for
// the content being shown, and gives Reel #3 its own distinct on-screen
// silhouette from Reel #2's taller phone-shaped card.
export const DISPLAY_WIDTH = 900
export const VIEWPORT_HEIGHT = 240
export const SCALE_FACTOR = DISPLAY_WIDTH / SCREENSHOT_WIDTH

export type Rect = { x: number; y: number; w: number; h: number }
export type Camera = { s: number; tx: number; ty: number }

// Converts a desired "show this raw-pixel box, fully, with the viewport
// filled" target into a (scale, translateX, translateY) camera state —
// identical formula/derivation to Reel #2's frameFor() (see that
// module's comment for the full explanation), kept as this Reel's own
// copy rather than an import: each Reel's screen geometry is specific to
// its own screenshot and display frame, so this small helper is
// intentionally not promoted into the shared engine.
export function frameFor(x0: number, x1: number, y0: number, y1: number): Camera {
  const sx = DISPLAY_WIDTH / (SCALE_FACTOR * (x1 - x0))
  const sy = VIEWPORT_HEIGHT / (SCALE_FACTOR * (y1 - y0))
  const s = Math.min(sx, sy)
  return { s, tx: -x0 * SCALE_FACTOR * s, ty: -y0 * SCALE_FACTOR * s }
}

// Pure viewport-space rect for a raw-pixel box at a given camera state —
// the exact math the renderer's JS uses each frame, exposed here so
// tests can verify (without a browser) that every card/mask stays
// within the 900x240 viewport.
export function rectFor(raw: Rect, camera: Camera): Rect {
  return {
    x: raw.x * SCALE_FACTOR * camera.s + camera.tx,
    y: raw.y * SCALE_FACTOR * camera.s + camera.ty,
    w: raw.w * SCALE_FACTOR * camera.s,
    h: raw.h * SCALE_FACTOR * camera.s,
  }
}

// --- Scene 4/5 static camera: wide shot of the PropCrew heading row +
// both contact cards together ("let the viewer understand the overall
// screen first" per the brief). Scene 4 and Scene 5 use the SAME crop —
// a deliberate hard cut between two static, identically-framed shots
// (no camera motion to keep continuous across the cut, so the cut reads
// as clean, not as a jump).
export const REVEAL_TARGET_BOX = { x0: 10, x1: 985, y0: 428, y1: 670 }
export const REVEAL_CAMERA: Camera = frameFor(
  REVEAL_TARGET_BOX.x0, REVEAL_TARGET_BOX.x1, REVEAL_TARGET_BOX.y0, REVEAL_TARGET_BOX.y1,
)

// --- Scene 6 static camera: tight zoom on just the PropCrew heading +
// description text (excludes both cards and the "+ Add to PropCrew"
// button) — a genuinely closer view than Scene 4/5 (~1.57x vs ~1.02x),
// so "return attention to the heading" is a real zoom-in moment, not a
// repeat of the same framing.
//
// IMPORTANT — privacy: this crop uses its OWN, SHORTER viewport height
// (PRIVATE_VIEWPORT_HEIGHT, not the shared VIEWPORT_HEIGHT), deliberately
// NOT frameFor()'s "fit both axes" scale. frameFor() always picks
// min(sx, sy) so the WIDTH fits, which leaves the height under-filled —
// at the shared 240px viewport height, that leftover vertical margin
// would show ~170px further down the page than the target's own y1,
// reaching well INTO the contact cards' un-masked phone-number rows
// (verified empirically by rendering a frame at the shared height and
// finding "727-898-5484"/"813-948-5967" peeking in unmasked — a real
// privacy bug, caught and fixed before this Reel was finalized). Capping
// the viewport at 80px keeps the visible raw-pixel range to
// [434, ~485] — the heading block only, ~16px of margin before the
// cards (raw y=501) ever enter frame — see content.test.ts's
// "private crop never reaches the cards" test for the guard against
// this regressing.
export const PRIVATE_TARGET_BOX = { x0: 20, x1: 655, y0: 434, y1: 490 }
export const PRIVATE_VIEWPORT_HEIGHT = 80
export const PRIVATE_CAMERA: Camera = (() => {
  const sx = DISPLAY_WIDTH / (SCALE_FACTOR * (PRIVATE_TARGET_BOX.x1 - PRIVATE_TARGET_BOX.x0))
  const sy = PRIVATE_VIEWPORT_HEIGHT / (SCALE_FACTOR * (PRIVATE_TARGET_BOX.y1 - PRIVATE_TARGET_BOX.y0))
  const s = Math.min(sx, sy)
  return { s, tx: -PRIVATE_TARGET_BOX.x0 * SCALE_FACTOR * s, ty: -PRIVATE_TARGET_BOX.y0 * SCALE_FACTOR * s }
})()

// The lowest raw-pixel Y the "private" scene's viewport can ever show —
// exposed so a test can assert (without a browser) that it stays above
// both cards' own top edge, i.e. this crop can never reveal any card
// content, masked or not.
export const PRIVATE_CROP_BOTTOM_RAW_Y = PRIVATE_TARGET_BOX.y0 + PRIVATE_VIEWPORT_HEIGHT / PRIVATE_CAMERA.s

// --- The two real contact cards, raw pixel boxes (verified against the
// source image with a 10px-grid crop — see the completion report).
export const CARD_HANDYMAN: Rect = { x: 22, y: 501, w: 466, h: 166 }
export const CARD_BREEZE_AIR: Rect = { x: 500, y: 501, w: 466, h: 166 }

// --- Privacy masking (presentation-layer only — the source PNG itself
// is never edited). Per the brief: names/business names may stay
// visible ("Independent Handyman" / "Jose Rodriguez" / "Breeze Air" /
// "Joseph Bartow" — the exact names the brief itself names as approved
// to use), but phone numbers and email addresses are masked. Each rect
// is sized generously (verified with a rendered simulation — see the
// completion report) so the underlying digits/characters never peek out
// past an edge.
export const MASK_HANDYMAN_PHONE: Rect = { x: 45, y: 590, w: 160, h: 24 } // "727-898-5484"
export const MASK_BREEZE_AIR_PHONE: Rect = { x: 516, y: 589, w: 170, h: 26 } // "813-948-5967"
export const MASK_BREEZE_AIR_EMAIL: Rect = { x: 516, y: 605, w: 222, h: 26 } // "info@breezeair.com"
// "breezeair.com" (the business's own public website domain — distinct
// from a personal phone/email) is intentionally left unmasked; see the
// completion report for the reasoning.

export const ALL_MASKS: Rect[] = [MASK_HANDYMAN_PHONE, MASK_BREEZE_AIR_PHONE, MASK_BREEZE_AIR_EMAIL]

// ---------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------

export type Reel3Scene =
  | { id: 'hook1'; kind: 'hook1'; durationMs: number; line: string }
  | { id: 'hook2'; kind: 'hook2'; durationMs: number; lineA: string; lineB: string; lineBDelayMs: number }
  | { id: 'recognition'; kind: 'recognition'; durationMs: number; line: string }
  | { id: 'reveal'; kind: 'reveal'; durationMs: number; label: string }
  | {
      id: 'trust'
      kind: 'trust'
      durationMs: number
      lineA: string
      lineB: string
      card1FocusStartMs: number
      card1FocusEndMs: number
      card2FocusStartMs: number
    }
  | { id: 'private'; kind: 'private'; durationMs: number; lineA: string; lineB: string }
  | { id: 'close'; kind: 'close'; durationMs: number; tagline: string; cta: string; url: string }

export const REEL3_SCENES: Reel3Scene[] = [
  {
    id: 'hook1',
    kind: 'hook1',
    durationMs: 2000,
    line: 'Who fixed that AC last time?',
  },
  {
    id: 'hook2',
    kind: 'hook2',
    durationMs: 1800,
    lineA: 'And that handyman…',
    lineB: 'what was his number?',
    lineBDelayMs: 700,
  },
  {
    id: 'recognition',
    kind: 'recognition',
    durationMs: 1200,
    line: 'Sound familiar?',
  },
  {
    id: 'reveal',
    kind: 'reveal',
    durationMs: 3500,
    label: 'Meet PropCrew.',
  },
  {
    id: 'trust',
    kind: 'trust',
    durationMs: 3000,
    lineA: 'The people you trust.',
    lineB: 'Saved with the property.',
    card1FocusStartMs: 200,
    card1FocusEndMs: 1500,
    card2FocusStartMs: 1700,
  },
  {
    id: 'private',
    kind: 'private',
    durationMs: 1800,
    lineA: 'Private to you.',
    // Verified verbatim against production: lib/propcrew/reuse-preference.ts's
    // PROPCREW_PRIVACY_DISCLOSURE and components/PropCrewPanel.tsx's real
    // PropCrew heading copy — never shared with the provider is the
    // actual, current product behavior, not an invented claim.
    lineB: 'Never shared with the provider.',
  },
  {
    id: 'close',
    kind: 'close',
    durationMs: 2700,
    // Same verified-real pricing claim as Reel #2's close card (see that
    // module's comment) — lib/billing/plans.ts's real `free` plan has
    // maxProperties: 1, priceMonthly: 0.
    tagline: 'Your properties. Organized.',
    cta: 'Start with 1 property free.',
    url: 'proproster.com',
  },
]

export const REEL3_TOTAL_MS = REEL3_SCENES.reduce((sum, s) => sum + s.durationMs, 0)

export function reel3SceneStartMs(sceneId: Reel3Scene['id']): number {
  let t = 0
  for (const s of REEL3_SCENES) {
    if (s.id === sceneId) return t
    t += s.durationMs
  }
  throw new Error(`Unknown Reel #3 scene id: ${sceneId}`)
}

// PropCrew is a private directory, not a marketplace — same standing
// rule as the other two Reels' FORBIDDEN_TERMS, extended with the exact
// marketplace/discovery/booking/bidding/payment/messaging phrasing this
// Reel's brief explicitly rules out.
export const FORBIDDEN_TERMS = [
  'marketplace',
  'bidding',
  'name your price',
  'name-your-price',
  'find contractors',
  'find a contractor',
  'hire professionals',
  'hire a pro',
  'book a pro',
  'book now',
  'get bids',
  'compare contractors',
  'professionals near you',
  'connect with contractors',
  'send a job',
  'request service',
  'job board',
  'booking service',
  'provider network',
  'rating platform',
  'payment service',
  'messaging service',
  'download now',
  'app store',
  'google play',
  'sign up free',
  'free trial',
  'encrypted',
  'end-to-end encryption',
  'bank-level security',
]
