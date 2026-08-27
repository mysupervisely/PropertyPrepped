// PropRoster Content Studio — Feature Reel #2: Property Overview
//
// Pure function that turns content.ts's data (plus the real, embedded
// screenshot in assets.ts) into one self-contained HTML document —
// mirroring ../reel-html.ts's role for the original Reel, but built on
// the shared, reel-agnostic engine (../reel-engine.ts) instead of
// duplicating it. The original Reel's own files are never imported
// here (only its read-only BRAND constant, via content.ts) and are
// never modified by anything in this file.
//
// Framework-free (no React), same as the original Reel — used both by
// the /dev/content-studio-reel-2 preview page and by
// scripts/render-reel.mjs (via its --module/--output flags).
import {
  BRAND, REEL2_FPS, REEL2_HEIGHT, REEL2_SCENES, REEL2_TOTAL_MS, REEL2_WIDTH, reel2SceneStartMs,
  DISPLAY_WIDTH, VIEWPORT_HEIGHT, CAMERA_KEYFRAMES, HIGHLIGHT_FIELDS, NUMBERS_START_MS, HIGHLIGHT_SLOT_MS,
  SCALE_FACTOR, type Reel2Scene,
} from './content.ts'
import { propertyOverview } from './assets.ts'
import { engineBaseCss, engineScript, engineStageBackground, waveformBarsMarkup } from '../reel-engine.ts'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function splitWords(text: string): string {
  return text
    .split(' ')
    .map((w) => `<span class="word">${esc(w)}</span>`)
    .join(' ')
}

function sceneMarkup(scene: Reel2Scene, index: number): string {
  const start = reel2SceneStartMs(scene.id)
  const end = start + scene.durationMs
  const wrap = (inner: string) =>
    `<section class="scene" data-scene="${scene.id}" data-kind="${scene.kind}" data-start="${start}" data-end="${end}" style="z-index:${index};"><div class="safePad"><div class="centerCol" data-el="centerCol">${inner}</div></div></section>`

  switch (scene.kind) {
    case 'hook':
      return wrap(`<p class="hookLine" data-el="hookLine">${splitWords(scene.line)}</p>`)
    case 'overview':
      return wrap(`
          <p class="ideaLine" data-el="ideaLine">${splitWords(scene.ideaLine)}</p>
          <div class="shotFrame" data-el="shotFrame">
            <div class="shotFrameBar"><span class="shotDot"></span><span class="shotDot"></span><span class="shotDot"></span></div>
            <div class="shotViewport" data-el="shotViewport">
              <img class="ovImg" data-el="ovImg" src="${propertyOverview.dataUri}" width="${propertyOverview.width}" height="${propertyOverview.height}" alt="" />
              <div class="spotlight" data-el="spotlight"></div>
            </div>
          </div>`)
    case 'close':
      return wrap(`
          <p class="endWordmark reveal" data-el="endWordmark"><span class="wProp">Prop</span><span class="wRoster">Roster</span></p>
          <p class="closeTagline" data-el="closeTagline">${splitWords(scene.tagline)}</p>
          <p class="closeCta reveal" data-el="closeCta">${esc(scene.cta)}</p>
          <p class="closeUrl reveal" data-el="closeUrl">${esc(scene.url)}</p>`)
  }
}

export function buildReel2Document(): string {
  const css = `
    ${engineBaseCss(BRAND)}
    #stage {
      position: relative;
      width: ${REEL2_WIDTH}px; height: ${REEL2_HEIGHT}px;
      background: ${engineStageBackground(BRAND)};
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      color: ${BRAND.ink};
    }

    .hookLine { font-size: 56px; font-weight: 750; line-height: 1.28; letter-spacing: -0.5px; }

    .ideaLine { font-size: 34px; font-weight: 700; line-height: 1.3; margin: 0 0 22px; letter-spacing: -0.3px; opacity: 0; }

    .shotFrame {
      width: ${DISPLAY_WIDTH}px; margin: 0 auto; border-radius: 20px; overflow: hidden;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.02);
      box-shadow: 0 40px 90px -40px rgba(43,107,79,0.45);
    }
    .shotFrameBar { display: flex; gap: 6px; padding: 12px 14px; background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.08); }
    .shotDot { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,0.18); }
    .shotViewport { position: relative; width: ${DISPLAY_WIDTH}px; height: ${VIEWPORT_HEIGHT}px; overflow: hidden; background: #f5f7f5; }
    .ovImg { position: absolute; top: 0; left: 0; width: ${DISPLAY_WIDTH}px; height: auto; transform-origin: 0 0; }
    .spotlight {
      position: absolute; left: 0; top: 0; width: 0; height: 0;
      border: 2px solid ${BRAND.green}; border-radius: 8px;
      box-shadow: 0 0 0 9999px rgba(10,15,12,0.6), 0 0 22px rgba(43,107,79,0.55);
      opacity: 0; pointer-events: none;
    }

    .endWordmark { font-size: 72px; font-weight: 800; margin: 0 0 26px; letter-spacing: -1px; }
    .wProp { color: ${BRAND.ink}; }
    .wRoster { color: ${BRAND.green}; }
    .closeTagline { font-size: 28px; font-weight: 600; color: ${BRAND.ink}; opacity: 0; margin: 0 0 16px; max-width: 660px; margin-left: auto; margin-right: auto; line-height: 1.35; }
    .closeCta { font-size: 24px; font-weight: 650; color: ${BRAND.sage}; margin: 0 0 40px; }
    .closeUrl { font-size: 34px; font-weight: 750; color: ${BRAND.green}; letter-spacing: 0.5px; }
  `

  const scenesHtml = REEL2_SCENES.map(sceneMarkup).join('\n')

  const overviewScene = REEL2_SCENES.find((s) => s.kind === 'overview')
  if (!overviewScene || overviewScene.kind !== 'overview') throw new Error('Reel #2 must have an "overview" scene')
  const propertyDurationMs = overviewScene.propertyDurationMs
  const numbersEndMs = NUMBERS_START_MS + overviewScene.numbersDurationMs

  const perSceneJs = `
          if (kind === 'hook') {
            revealWords(s.querySelector('[data-el="hookLine"]'), local, 0, 55, 460)
          } else if (kind === 'overview') {
            // ONE continuous camera curve for the whole property+numbers+
            // idea sequence (see content.ts's CAMERA_KEYFRAMES for the
            // full derivation/rationale) — local here is elapsed ms
            // since THIS scene's own start, so it is exactly the "t"
            // the keyframes are authored against. No per-sub-phase
            // reset, no seam.
            var cam = lerpKeyframes(CAMERA_KEYFRAMES, local, ['s', 'tx', 'ty']);
            var img = s.querySelector('[data-el="ovImg"]');
            if (img) img.style.transform = 'translate(' + cam.tx.toFixed(2) + 'px, ' + cam.ty.toFixed(2) + 'px) scale(' + cam.s.toFixed(4) + ')';

            var ideaStart = ${propertyDurationMs + overviewScene.numbersDurationMs};
            revealWords(s.querySelector('[data-el="ideaLine"]'), local - ideaStart, 0, 45, 420)
            var ideaLineEl = s.querySelector('[data-el="ideaLine"]');
            if (ideaLineEl) ideaLineEl.style.opacity = (local >= ideaStart - 200) ? '1' : '0';

            // Spotlight: one field highlighted at a time, in order,
            // during the "numbers" sub-phase only. Eases (glides) from
            // the previous field's rect to the new one over the first
            // 200ms of each slot, then holds — a single continuous
            // formula, never reset mid-glide.
            var spot = s.querySelector('[data-el="spotlight"]');
            if (spot) {
              var inNumbers = local >= ${NUMBERS_START_MS} && local < ${numbersEndMs};
              if (!inNumbers) {
                spot.style.opacity = '0';
              } else {
                var t3 = local - ${NUMBERS_START_MS};
                var slotIdx = Math.max(0, Math.min(${HIGHLIGHT_FIELDS.length - 1}, Math.floor(t3 / ${HIGHLIGHT_SLOT_MS})));
                var withinSlot = t3 - slotIdx * ${HIGHLIGHT_SLOT_MS};
                var TRANS = 200;
                var field = HIGHLIGHT_FIELDS[slotIdx];
                var rect = fieldRect(field, cam);
                var opacity = 1;
                if (slotIdx === 0) {
                  opacity = clamp01(withinSlot / TRANS);
                } else if (withinSlot < TRANS) {
                  var prevField = HIGHLIGHT_FIELDS[slotIdx - 1];
                  var prevRect = fieldRect(prevField, cam);
                  var p = easeOutCubic(clamp01(withinSlot / TRANS));
                  rect = {
                    x: prevRect.x + (rect.x - prevRect.x) * p,
                    y: prevRect.y + (rect.y - prevRect.y) * p,
                    w: prevRect.w + (rect.w - prevRect.w) * p,
                    h: prevRect.h + (rect.h - prevRect.h) * p,
                  };
                }
                // Fade the whole spotlight in/out at the numbers
                // sub-phase's own boundaries too.
                var phaseFade = Math.min(clamp01((local - ${NUMBERS_START_MS}) / 150), clamp01((${numbersEndMs} - local) / 150));
                spot.style.opacity = String(opacity * phaseFade);
                spot.style.left = rect.x.toFixed(2) + 'px';
                spot.style.top = rect.y.toFixed(2) + 'px';
                spot.style.width = rect.w.toFixed(2) + 'px';
                spot.style.height = rect.h.toFixed(2) + 'px';
              }
            }
          } else if (kind === 'close') {
            revealStyle(s.querySelector('[data-el="endWordmark"]'), local, 0, 520)
            revealWords(s.querySelector('[data-el="closeTagline"]'), local, 380, 42, 420)
            var taglineEl = s.querySelector('[data-el="closeTagline"]');
            if (taglineEl) taglineEl.style.opacity = (local >= 380) ? '1' : '0';
            revealStyle(s.querySelector('[data-el="closeCta"]'), local, 900, 460)
            revealStyle(s.querySelector('[data-el="closeUrl"]'), local, 1300, 460)
          }
  `

  const engineJs = engineScript({ totalMs: REEL2_TOTAL_MS, fps: REEL2_FPS, perSceneJs })

  // fieldRect() / CAMERA_KEYFRAMES / HIGHLIGHT_FIELDS / lerpKeyframes
  // are appended as a small preamble ahead of the shared engine script
  // — lerpKeyframes is defined INSIDE engineScript's IIFE, so this
  // preamble's fieldRect() (which the per-scene JS above calls) is
  // defined in the same outer scope engineScript runs in, and reads the
  // embedded keyframe/field data as plain JSON.
  const dataAndHelpers = `
    var CAMERA_KEYFRAMES = ${JSON.stringify(CAMERA_KEYFRAMES)};
    var HIGHLIGHT_FIELDS = ${JSON.stringify(HIGHLIGHT_FIELDS)};
    var SCALE_FACTOR = ${SCALE_FACTOR};
    function fieldRect(field, cam) {
      return {
        x: field.x * SCALE_FACTOR * cam.s + cam.tx,
        y: field.y * SCALE_FACTOR * cam.s + cam.ty,
        w: field.w * SCALE_FACTOR * cam.s,
        h: field.h * SCALE_FACTOR * cam.s,
      };
    }
  `

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>PropRoster Reel — Property Overview</title>
<style>${css}</style>
</head>
<body>
<div id="stage">
${scenesHtml}
<div class="waveform" aria-hidden="true">${waveformBarsMarkup()}</div>
</div>
<script>${dataAndHelpers}</script>
<script>${engineJs}</script>
</body>
</html>`
}
