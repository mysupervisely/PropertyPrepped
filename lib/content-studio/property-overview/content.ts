// PropRoster Content Studio — Feature Reel #2: Property Overview
//
// A SECOND, fully independent Reel definition, built on the shared
// engine (../reel-engine.ts) rather than the original Reel's files
// (../reel-content.ts / ../reel-html.ts), which this Reel never imports
// and never modifies. Focuses on exactly one feature — the Property
// Overview page — using the one real, supplied screenshot (5645 North
// Eagle Highway) as the entire product UI. No Rent Ledger, PropCrew,
// Tax, Documents, or Search screenshot appears here; those are
// deliberately reserved for future individual posts, per this Reel's
// brief.
//
// This module is data-only (no rendering logic — see html.ts for that),
// mirroring ../reel-content.ts's role for the original Reel.

import { BRAND } from '../reel-content.ts'

export const REEL2_WIDTH = 1080
export const REEL2_HEIGHT = 1920
export const REEL2_FPS = 30

// Re-exported (not redefined) so this Reel visually matches the
// original — same dark forest green / sage / near-black palette, zero
// risk of the two reels' brand tokens drifting apart. This is a
// read-only import; reel-content.ts is never written to.
export { BRAND }

// ---------------------------------------------------------------------
// The real screenshot's geometry. Every highlight box and camera
// keyframe below is expressed in these RAW pixel coordinates (the
// screenshot's own 965x939 pixel grid), verified directly against the
// source image (see the completion report for how each box was
// calibrated) — never invented, never guessed. html.ts converts these
// to on-screen coordinates via SCALE_FACTOR (fit-width display scale)
// and each moment's camera zoom.
// ---------------------------------------------------------------------
export const SCREENSHOT_WIDTH = 965
export const SCREENSHOT_HEIGHT = 939

// Fixed display frame the screenshot is shown inside: a fit-width
// browser-chrome-style card, with a fixed-height clipping viewport the
// "camera" (zoom + vertical pan) moves within.
export const DISPLAY_WIDTH = 900
export const VIEWPORT_HEIGHT = 640
export const SCALE_FACTOR = DISPLAY_WIDTH / SCREENSHOT_WIDTH

export type HighlightField = {
  label: string
  // Raw pixel box within the source screenshot.
  x: number
  y: number
  w: number
  h: number
}

// The eight fields this Reel highlights, one at a time, in this exact
// order — the hero metrics row first (Value/Mortgage/Equity/Rent), then
// the Financial details card (Monthly property expenses/Estimated cash
// flow/Purchase price/Appreciation). Every box was measured directly
// against the supplied screenshot — see
// lib/content-studio/property-overview/content.test.ts for the
// aspect-ratio/bounds sanity checks that keep these honest, and the
// completion report for the calibration method (a 50px reference grid
// overlaid on the source image, refined with tight 10px-grid crops of
// each row).
export const HIGHLIGHT_FIELDS: HighlightField[] = [
  { label: 'Value', x: 400, y: 318, w: 108, h: 48 },
  { label: 'Mortgage', x: 512, y: 318, w: 110, h: 48 },
  { label: 'Equity', x: 628, y: 318, w: 107, h: 48 },
  { label: 'Rent', x: 740, y: 318, w: 103, h: 48 },
  { label: 'Monthly property expenses', x: 20, y: 518, w: 475, h: 24 },
  { label: 'Estimated cash flow', x: 20, y: 550, w: 475, h: 38 },
  { label: 'Purchase price', x: 20, y: 589, w: 475, h: 22 },
  { label: 'Appreciation', x: 20, y: 620, w: 475, h: 23 },
]

export type CameraKeyframe = { t: number; s: number; tx: number; ty: number }

// Converts a desired "show this raw-pixel box, fully, with the viewport
// filled" target into a (scale, translateX, translateY) camera state.
// Because the screenshot has a fixed 965x939 shape, a target region's
// width and height cannot both dictate the zoom independently — using
// the SMALLER of the two required scales guarantees the whole target
// box is visible (the other axis just shows a bit more, as margin,
// rather than cropping). transform-origin is the image's top-left
// corner (0 0), so translateX/Y are plain, scale-independent viewport
// pixel offsets — see the completion report for the full derivation.
export function frameFor(x0: number, x1: number, y0: number, y1: number): { s: number; tx: number; ty: number } {
  const sx = DISPLAY_WIDTH / (SCALE_FACTOR * (x1 - x0))
  const sy = VIEWPORT_HEIGHT / (SCALE_FACTOR * (y1 - y0))
  const s = Math.min(sx, sy)
  return { s, tx: -x0 * SCALE_FACTOR * s, ty: -y0 * SCALE_FACTOR * s }
}

// Where the "camera" (viewport window in raw screenshot-pixel space)
// should be, target-box-first — each box is what the frame should show,
// IN FULL, at that moment; frameFor() converts it to the actual
// (scale, translate) camera state used at render time. Expressed as
// target boxes (not raw scale/translate numbers) so each keyframe stays
// self-documenting and reviewable against the real screenshot.
//
// The combined property+numbers+idea sequence is ONE continuous
// piecewise-linear curve (see reel-engine.ts's lerpKeyframes) — t is ms
// elapsed since the "overview" scene's own start. Because it is a
// single curve, not three separate Ken-Burns calls that each reset to
// their own local time, there is no seam where the camera could jump.
//   0-1700ms:    "property" — wide, near-neutral establishing view of
//                the top identity block (image/name/address). The
//                identity block spans almost the screenshot's full
//                width, so there is little room to zoom in without
//                cropping either the photo or the title — "very subtle
//                controlled zoom" is a physical consequence of that,
//                not an arbitrary choice.
//   1700-2000ms: quick settle into the hero-metrics framing, timed to
//                land exactly as "numbers" begins.
//   2000-4500ms: HOLD on the hero metrics row (Value/Mortgage/Equity/
//                Rent) while the spotlight alone moves between them —
//                calmer than moving the camera and the spotlight at
//                once.
//   4500-4700ms: quick settle into the Financial-details-card framing,
//                timed to land before the first financial-row
//                highlight becomes fully visible.
//   4700-7000ms: HOLD on the Financial details card (Monthly property
//                expenses/Estimated cash flow/Purchase price/
//                Appreciation).
//   7000-9500ms: "idea" — pull back (zoom out) to reveal the metrics
//                row and the full card together.
const CAMERA_TARGET_BOXES: { t: number; x0: number; x1: number; y0: number; y1: number }[] = [
  { t: 0, x0: 10, x1: 945, y0: 0, y1: 300 },
  { t: 1700, x0: 10, x1: 945, y0: 15, y1: 315 },
  { t: 2000, x0: 360, x1: 880, y0: 270, y1: 410 },
  { t: 4500, x0: 360, x1: 880, y0: 270, y1: 410 },
  { t: 4700, x0: 0, x1: 510, y0: 460, y1: 700 },
  { t: 7000, x0: 0, x1: 510, y0: 460, y1: 700 },
  { t: 9500, x0: 10, x1: 945, y0: 280, y1: 700 },
]

export const CAMERA_KEYFRAMES: CameraKeyframe[] = CAMERA_TARGET_BOXES.map(({ t, x0, x1, y0, y1 }) => ({
  t,
  ...frameFor(x0, x1, y0, y1),
}))

// Pure viewport-space rect for a highlight field at a given camera
// state — the exact math the renderer's JS uses each frame, exposed
// here so tests can verify (without a browser) that every field stays
// within the 900x640 viewport for the whole time it is meant to be
// highlighted.
export function viewportRectFor(field: HighlightField, camera: { s: number; tx: number; ty: number }) {
  return {
    x: field.x * SCALE_FACTOR * camera.s + camera.tx,
    y: field.y * SCALE_FACTOR * camera.s + camera.ty,
    w: field.w * SCALE_FACTOR * camera.s,
    h: field.h * SCALE_FACTOR * camera.s,
  }
}

export function cameraAt(t: number): { s: number; tx: number; ty: number } {
  const kfs = CAMERA_KEYFRAMES
  if (t <= kfs[0].t) return kfs[0]
  const last = kfs[kfs.length - 1]
  if (t >= last.t) return last
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i]
    const b = kfs[i + 1]
    if (t >= a.t && t <= b.t) {
      const p = (t - a.t) / (b.t - a.t)
      return { s: a.s + (b.s - a.s) * p, tx: a.tx + (b.tx - a.tx) * p, ty: a.ty + (b.ty - a.ty) * p }
    }
  }
  return last
}

// Each highlight is shown for this many ms, in HIGHLIGHT_FIELDS' order,
// starting at NUMBERS_START_MS (2000ms into the "overview" scene, i.e.
// exactly when "property" ends).
export const NUMBERS_START_MS = 2000
export const HIGHLIGHT_SLOT_MS = 625

export type Reel2Scene =
  | { id: 'hook'; kind: 'hook'; durationMs: number; line: string }
  | {
      id: 'overview'
      kind: 'overview'
      durationMs: number
      propertyDurationMs: number
      numbersDurationMs: number
      ideaDurationMs: number
      ideaLine: string
      highlights: HighlightField[]
    }
  | { id: 'close'; kind: 'close'; durationMs: number; tagline: string; cta: string; url: string }

const PROPERTY_DURATION_MS = 2000
const NUMBERS_DURATION_MS = 5000
const IDEA_DURATION_MS = 2500

export const REEL2_SCENES: Reel2Scene[] = [
  {
    id: 'hook',
    kind: 'hook',
    durationMs: 2500,
    line: 'Know your rental at a glance.',
  },
  {
    id: 'overview',
    kind: 'overview',
    durationMs: PROPERTY_DURATION_MS + NUMBERS_DURATION_MS + IDEA_DURATION_MS,
    propertyDurationMs: PROPERTY_DURATION_MS,
    numbersDurationMs: NUMBERS_DURATION_MS,
    ideaDurationMs: IDEA_DURATION_MS,
    ideaLine: 'Everything about your property, organized.',
    highlights: HIGHLIGHT_FIELDS,
  },
  {
    id: 'close',
    kind: 'close',
    durationMs: 3000,
    // Verified against production: app/pricing/page.tsx's hero reads
    // "Start free with one property. Upgrade when your portfolio
    // grows." and lib/billing/plans.ts's real `free` plan has
    // maxProperties: 1, priceMonthly: 0 — this is a live, accurate
    // paraphrase, not an invented offer.
    tagline: 'Your property. The numbers that matter. One place.',
    cta: 'Start with 1 property free.',
    url: 'proproster.com',
  },
]

export const REEL2_TOTAL_MS = REEL2_SCENES.reduce((sum, s) => sum + s.durationMs, 0)

export function reel2SceneStartMs(sceneId: Reel2Scene['id']): number {
  let t = 0
  for (const s of REEL2_SCENES) {
    if (s.id === sceneId) return t
    t += s.durationMs
  }
  throw new Error(`Unknown Reel #2 scene id: ${sceneId}`)
}

// Same standing rule as the original Reel: never advertise anything not
// actually live. Extended here with a couple of terms specific to this
// Reel's numbers (never imply PropRoster VALUES or APPRAISES a
// property, or that the displayed figures are anything other than what
// the owner entered).
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
  'app store',
  'google play',
  'sign up free',
  'free trial',
  'collects rent',
  'collect rent',
  'collects payments',
  'collect payments',
  'payments collected by proproster',
  'ai-powered valuation',
  'automatic appraisal',
  'we value your property',
]
