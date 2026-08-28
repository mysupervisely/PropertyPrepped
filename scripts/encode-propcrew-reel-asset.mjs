#!/usr/bin/env node
// One-time (re-runnable) generator for
// lib/content-studio/propcrew-reel/assets.ts — Feature Reel #3's single
// embedded screenshot.
//
// Deliberately a small, separate script — mirrors
// scripts/encode-property-overview-asset.mjs's shape exactly, but is its
// own file rather than a generalization of it or of the original Reel's
// scripts/encode-reel-assets.mjs, so neither of those is touched here.
// Source image:
// lib/content-studio/assets/propcrew-5645-north-eagle.png (the real
// PropCrew screenshot supplied for this Reel — the 5645 North Eagle
// Highway property's PropCrew tab, copied in as-is: no crop, no recolor,
// no edit of any kind, no masking baked into the source file itself).
// Kept as PNG (not JPEG) so the card text stays crisp when the video
// zooms in on it. Any privacy masking of phone/email text happens
// entirely in the Reel's presentation layer (html.ts), never here.

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = join(__dirname, '..', 'lib', 'content-studio', 'assets', 'propcrew-5645-north-eagle.png')
const OUT_FILE = join(__dirname, '..', 'lib', 'content-studio', 'propcrew-reel', 'assets.ts')

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
// Produced by scripts/encode-propcrew-reel-asset.mjs from
// lib/content-studio/assets/propcrew-5645-north-eagle.png (the real
// PropRoster PropCrew screenshot — 5645 North Eagle Highway — supplied
// for Feature Reel #3). Re-run that script after replacing the source
// image.

export type ReelAsset = { dataUri: string; width: number; height: number }

export const propcrewShot: ReelAsset = {
  dataUri: '${dataUri}',
  width: ${width},
  height: ${height},
}
`

writeFileSync(OUT_FILE, out, 'utf8')
console.log(`Wrote ${OUT_FILE} (${width}x${height}, ${(buf.length / 1024).toFixed(1)}KB raw -> base64)`)
