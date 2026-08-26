#!/usr/bin/env node
// One-time (re-runnable) generator for lib/content-studio/reel-assets.ts.
//
// The Animated Marketing Reel prototype embeds a handful of real
// PropRoster screenshots + a property photo directly into the
// self-contained reel HTML document (see reel-html.ts) as base64 data
// URIs — that document must stay 100% offline (no <img src="/..."> that
// would require a running dev server), and reel-html.ts is imported both
// by the browser (the /dev/content-studio-reel preview page) and by
// plain Node (scripts/render-reel.mjs), so the encoded strings live in a
// plain, dependency-free .ts module rather than being read from disk at
// runtime.
//
// Source images live in lib/content-studio/assets/ (already cropped/
// resized/compressed — see the milestone completion report for exactly
// how each was derived from the reference screenshots supplied for this
// pass). Re-run this script after changing any file in that folder.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ASSETS_DIR = join(__dirname, '..', 'lib', 'content-studio', 'assets')
const OUT_FILE = join(__dirname, '..', 'lib', 'content-studio', 'reel-assets.ts')

function toCamel(name) {
  return name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())
}

function dimensionsOf(path) {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', path,
  ]).toString().trim()
  const [width, height] = out.split('x').map(Number)
  return { width, height }
}

const files = readdirSync(ASSETS_DIR).filter((f) => extname(f) === '.jpg').sort()

const entries = files.map((file) => {
  const key = toCamel(basename(file, '.jpg'))
  const filePath = join(ASSETS_DIR, file)
  const buf = readFileSync(filePath)
  const b64 = buf.toString('base64')
  const { width, height } = dimensionsOf(filePath)
  return { key, file, bytes: buf.length, width, height, dataUri: `data:image/jpeg;base64,${b64}` }
})

const header = `// GENERATED FILE — do not hand-edit.
// Produced by scripts/encode-reel-assets.mjs from lib/content-studio/assets/*.jpg
// (real PropRoster screenshots + a supplied property photo, cropped/
// resized/compressed for the Animated Marketing Reel prototype — see the
// V1.2 completion report for provenance and exact crops). Re-run that
// script after changing any source image; do not edit the base64 below
// by hand.
//
// Each export is a self-contained data: URI (no network request), plus
// its pixel dimensions so reel-html.ts can size an <img> without layout
// shift.

export type ReelAsset = { dataUri: string; width: number; height: number }

`

const body = entries
  .map((e) => {
    return `export const ${e.key}: ReelAsset = {\n  dataUri: '${e.dataUri}',\n  width: ${e.width},\n  height: ${e.height},\n}\n`
  })
  .join('\n')

writeFileSync(OUT_FILE, header + body, 'utf8')
console.log(`Wrote ${OUT_FILE} (${entries.length} assets, ${(entries.reduce((s, e) => s + e.bytes, 0) / 1024).toFixed(0)}KB raw -> base64)`)
for (const e of entries) console.log(`  ${e.key} <- ${e.file} (${(e.bytes / 1024).toFixed(1)}KB)`)
