#!/usr/bin/env node
// PropRoster Content Studio — Animated Reel Prototype V1 render pipeline.
//
// Deliberately isolated from the production app: this script is never
// imported by anything under app/, components/, or lib/ that ships in
// the Next.js bundle — it's a standalone Node tool. It:
//
//   1. Builds the exact same self-contained HTML document the prototype
//      page previews (lib/content-studio/reel-html.ts) and writes it to
//      a temp file.
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
// a licensing question this V1 prototype should not force a decision on.
// Everything this Reel needs (deterministic timeline, six scenes, a
// waveform, text/card reveals) is plain CSS transforms/opacity, so a
// small hand-rolled "headless-Chromium frame capture + FFmpeg encode"
// pipeline gets a real MP4 without adding a licensed dependency or a
// heavy framework — using tooling (Playwright's browser automation
// APIs, FFmpeg) already available in this environment.
//
// REQUIRES: a system `ffmpeg` binary on PATH (this repo does not vendor
// one — see the completion report for exactly how it was made available
// in this environment). Without it, this script fails fast with a clear
// error rather than silently producing no video.

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

const OUTPUT_DIR = join(ROOT, 'reel-output')
const OUTPUT_FILE = join(OUTPUT_DIR, 'propRoster-reel-v1.mp4')

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
      'Install it (e.g. `apt-get install ffmpeg`) and re-run `npm run render:reel`.\n'
    )
    process.exit(1)
  }

  const { buildReelDocument } = await import('../lib/content-studio/reel-html.ts')
  const { REEL_WIDTH, REEL_HEIGHT, REEL_FPS, REEL_TOTAL_MS } = await import('../lib/content-studio/reel-content.ts')

  const html = buildReelDocument()
  const frameDir = await mkdtemp(join(tmpdir(), 'proproster-reel-frames-'))
  const htmlPath = join(frameDir, 'reel.html')
  await writeFile(htmlPath, html, 'utf8')

  const totalFrames = Math.round((REEL_TOTAL_MS / 1000) * REEL_FPS)
  console.log(`Rendering ${totalFrames} frames at ${REEL_WIDTH}x${REEL_HEIGHT}, ${REEL_FPS}fps, ${(REEL_TOTAL_MS / 1000).toFixed(2)}s…`)

  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE, headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: REEL_WIDTH, height: REEL_HEIGHT } })
    await page.goto(`file://${htmlPath}?manual=1`)
    await page.waitForFunction(() => Boolean(window.__REEL__))

    for (let i = 0; i < totalFrames; i++) {
      const ms = Math.min(REEL_TOTAL_MS - 1, (i / REEL_FPS) * 1000)
      await page.evaluate((t) => window.__REEL__.setTime(t), ms)
      const framePath = join(frameDir, `frame_${String(i).padStart(5, '0')}.png`)
      await page.screenshot({ path: framePath })
      if (i % 60 === 0) console.log(`  frame ${i}/${totalFrames}`)
    }
  } finally {
    await browser.close()
  }

  await mkdir(OUTPUT_DIR, { recursive: true })

  console.log('Encoding with FFmpeg…')
  await new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-framerate', String(REEL_FPS),
      '-i', join(frameDir, 'frame_%05d.png'),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-profile:v', 'high',
      '-movflags', '+faststart',
      '-vf', `scale=${REEL_WIDTH}:${REEL_HEIGHT}`,
      OUTPUT_FILE,
    ]
    const proc = spawn('ffmpeg', args, { stdio: 'inherit' })
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))))
  })

  await rm(frameDir, { recursive: true, force: true })

  const stats = await stat(OUTPUT_FILE)
  console.log(`\nDone: ${OUTPUT_FILE} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
