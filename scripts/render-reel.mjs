#!/usr/bin/env node
// PropRoster Content Studio — Reel render pipeline.
//
// Deliberately isolated from the production app: this script is never
// imported by anything under app/, components/, or lib/ that ships in
// the Next.js bundle — it's a standalone Node tool. It:
//
//   1. Builds a self-contained HTML document from whichever Reel's
//      document-builder module is selected (see CLI flags below) and
//      writes it to a temp file.
//   2. Loads that file in headless Chromium (via playwright-core,
//      pointed at this environment's pre-installed browser — no browser
//      download) and, for every output frame, calls the document's own
//      window.__REEL__.setTime(ms) to move its deterministic animation
//      clock to an exact timestamp, then screenshots the stage.
//   3. Pipes the resulting PNG sequence into a local FFmpeg process
//      (system dependency — NOT an npm package; see README note below)
//      to encode a real H.264 MP4 at the composition's exact dimensions.
//
// Why this approach instead of Remotion: Remotion (the most common
// programmatic-video framework for the web) is source-available but its
// license requires a paid plan for a company above a revenue threshold —
// a licensing question this prototype should not force a decision on.
// Everything these Reels need (deterministic timeline, text/card
// reveals, Ken Burns pans) is plain CSS transforms/opacity, so a small
// hand-rolled "headless-Chromium frame capture + FFmpeg encode" pipeline
// gets a real MP4 without adding a licensed dependency or a heavy
// framework — using tooling (Playwright's browser automation APIs,
// FFmpeg) already available in this environment.
//
// REQUIRES: a system `ffmpeg` binary on PATH (this repo does not vendor
// one — see the completion report for exactly how it was made available
// in this environment). Without it, this script fails fast with a clear
// error rather than silently producing no video.
//
// CLI flags (all optional — every default below reproduces the exact
// behavior this script had before it supported more than one Reel, so
// plain `npm run render:reel` with no flags is 100% unchanged):
//   --module=<path>   document-builder module, relative to this script's
//                      directory (default: ../lib/content-studio/reel-html.ts)
//   --fn=<name>        the module's exported build-function name
//                      (default: buildReelDocument)
//   --output=<path>    output file, relative to the repo root
//                      (default: reel-output/propRoster-reel-v1-3.mp4)
//   --width=<px>       Playwright viewport / composition width (default: 1080)
//   --height=<px>      Playwright viewport / composition height (default: 1920)
// fps and total duration are read from the rendered document's own
// window.__REEL__ after it loads — never duplicated as a second,
// separately-imported source of truth.

import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, mkdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const CHROMIUM_EXECUTABLE = process.env.PROPROSTER_CHROMIUM_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

function parseArgs(argv) {
  const out = {}
  for (const arg of argv) {
    const m = /^--([a-z]+)=(.*)$/.exec(arg)
    if (m) out[m[1]] = m[2]
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const MODULE_PATH = args.module || '../lib/content-studio/reel-html.ts'
const FN_NAME = args.fn || 'buildReelDocument'
const OUTPUT_FILE = join(ROOT, args.output || 'reel-output/propRoster-reel-v1-3.mp4')
const WIDTH = Number(args.width || 1080)
const HEIGHT = Number(args.height || 1920)

async function which(bin) {
  return new Promise((resolve) => {
    const p = spawn('which', [bin])
    p.on('close', (code) => resolve(code === 0))
  })
}

async function main() {
  if (!(await which('ffmpeg'))) {
    console.error(
      '\nERROR: `ffmpeg` was not found on PATH.\n' +
      'This render pipeline encodes frames to MP4 with FFmpeg, which is a system\n' +
      'dependency, not an npm package (see scripts/render-reel.mjs header comment).\n' +
      'Install it (e.g. `apt-get install ffmpeg`) and re-run this script.\n'
    )
    process.exit(1)
  }

  const mod = await import(MODULE_PATH)
  const buildDocument = mod[FN_NAME]
  if (typeof buildDocument !== 'function') {
    throw new Error(`${MODULE_PATH} does not export a "${FN_NAME}" function (--fn)`)
  }

  const html = buildDocument()
  const frameDir = await mkdtemp(join(tmpdir(), 'proproster-reel-frames-'))
  const htmlPath = join(frameDir, 'reel.html')
  await writeFile(htmlPath, html, 'utf8')

  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE, headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })
    await page.goto(`file://${htmlPath}?manual=1`)
    await page.waitForFunction(() => Boolean(window.__REEL__))
    const { totalMs, fps } = await page.evaluate(() => ({ totalMs: window.__REEL__.totalMs, fps: window.__REEL__.fps }))

    const totalFrames = Math.round((totalMs / 1000) * fps)
    console.log(`Rendering ${totalFrames} frames at ${WIDTH}x${HEIGHT}, ${fps}fps, ${(totalMs / 1000).toFixed(2)}s…`)

    for (let i = 0; i < totalFrames; i++) {
      const ms = Math.min(totalMs - 1, (i / fps) * 1000)
      await page.evaluate((t) => window.__REEL__.setTime(t), ms)
      const framePath = join(frameDir, `frame_${String(i).padStart(5, '0')}.png`)
      await page.screenshot({ path: framePath })
      if (i % 60 === 0) console.log(`  frame ${i}/${totalFrames}`)
    }

    await mkdir(dirname(OUTPUT_FILE), { recursive: true })

    console.log('Encoding with FFmpeg…')
    await new Promise((resolve, reject) => {
      const ffmpegArgs = [
        '-y',
        '-framerate', String(fps),
        '-i', join(frameDir, 'frame_%05d.png'),
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-profile:v', 'high',
        '-movflags', '+faststart',
        '-vf', `scale=${WIDTH}:${HEIGHT}`,
        OUTPUT_FILE,
      ]
      const proc = spawn('ffmpeg', ffmpegArgs, { stdio: 'inherit' })
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))))
    })
  } finally {
    await browser.close()
  }

  await rm(frameDir, { recursive: true, force: true })

  const stats = await stat(OUTPUT_FILE)
  console.log(`\nDone: ${OUTPUT_FILE} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
