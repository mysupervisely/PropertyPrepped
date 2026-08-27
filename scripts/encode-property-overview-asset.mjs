#!/usr/bin/env node
// One-time (re-runnable) generator for
// lib/content-studio/property-overview/assets.ts — Feature Reel #2's
// single embedded screenshot.
//
// Deliberately a small, separate script rather than a generalization of
// scripts/encode-reel-assets.mjs (which is part of the original,
// approved Reel's tooling and is left untouched here) — see the
// completion report for why. Source image:
// lib/content-studio/assets/property-overview-5645-north-eagle.png
// (the real screenshot supplied for this Reel, copied in as-is — no
// crop/recolor/edit of any kind). Kept as PNG (not JPEG) so the small
// dollar-figure text stays crisp when the video zooms in on it.

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = join(__dirname, '..', 'lib', 'content-studio', 'assets', 'property-overview-5645-north-eagle.png')
const OUT_FILE = join(__dirname, '..', 'lib', 'content-studio', 'property-overview', 'assets.ts')

function dimensionsOf(path) {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', path,
  ]).toString().trim()
  const [width, height] = out.split('x').map(Number)
  return { width, height }
}

const buf = readFileSync(SRC)
const { width, height } = dimensionsOf(SRC)
const dataUri = `data:image/png;base64,${buf.toString('base64')}`

const out = `// GENERATED FILE — do not hand-edit.
// Produced by scripts/encode-property-overview-asset.mjs from
// lib/content-studio/assets/property-overview-5645-north-eagle.png (the
// real PropRoster Property Overview screenshot supplied for Feature
// Reel #2 — unedited, only base64-encoded). Re-run that script after
// replacing the source image.

export type ReelAsset = { dataUri: string; width: number; height: number }

export const propertyOverview: ReelAsset = {
  dataUri: '${dataUri}',
  width: ${width},
  height: ${height},
}
`

writeFileSync(OUT_FILE, out, 'utf8')
console.log(`Wrote ${OUT_FILE} (${width}x${height}, ${(buf.length / 1024).toFixed(1)}KB raw -> base64)`)
