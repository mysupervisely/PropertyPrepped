// PropRoster Content Studio — Feature Reel #3: PropCrew
//
// Pure function that turns content.ts's data (plus the real, embedded
// screenshot in assets.ts) into one self-contained HTML document —
// mirroring reel-html.ts's and property-overview/html.ts's role for the
// other two Reels, built on the shared, reel-agnostic engine
// (../reel-engine.ts). Neither of the other two Reels' own files is
// imported here (only reel-content.ts's read-only BRAND constant, via
// content.ts) and neither is modified by anything in this file.
//
// Framework-free (no React), same as the other two Reels.
import {
  BRAND, REEL3_FPS, REEL3_HEIGHT, REEL3_SCENES, REEL3_TOTAL_MS, REEL3_WIDTH, reel3SceneStartMs,
  DISPLAY_WIDTH, VIEWPORT_HEIGHT, PRIVATE_VIEWPORT_HEIGHT, SCREENSHOT_WIDTH, SCREENSHOT_HEIGHT, SCALE_FACTOR,
  REVEAL_CAMERA, PRIVATE_CAMERA, CARD_HANDYMAN, CARD_BREEZE_AIR,
  rectFor, type Reel3Scene, type Rect,
} from './content.ts'
import { propcrewShot } from './assets.ts'
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

// A static "device card" screenshot viewport at a fixed camera (used by
// the "reveal" and "private" scenes — both static crops, no camera
// motion). `viewportHeight` is passed explicitly (rather than always
// using the shared VIEWPORT_HEIGHT) because the "private" scene
// deliberately uses its OWN, shorter viewport — see content.ts's
// PRIVATE_VIEWPORT_HEIGHT comment for why: at the shared 240px height,
// frameFor()'s width-bound scale leaves enough vertical margin that the
// crop reaches into the contact cards below, which this scene isn't
// meant to show.
function staticShotHtml(camera: { s: number; tx: number; ty: number }, viewportHeight: number): string {
  const imgW = SCREENSHOT_WIDTH * SCALE_FACTOR * camera.s
  const imgH = SCREENSHOT_HEIGHT * SCALE_FACTOR * camera.s
  return `
    <div class="shotFrame">
      <div class="shotFrameBar"><span class="shotDot"></span><span class="shotDot"></span><span class="shotDot"></span></div>
      <div class="shotViewport" style="height:${viewportHeight}px;">
        <img class="pcImg" src="${propcrewShot.dataUri}" style="width:${imgW.toFixed(2)}px;height:${imgH.toFixed(2)}px;transform:translate(${camera.tx.toFixed(2)}px, ${camera.ty.toFixed(2)}px);" alt="" />
      </div>
    </div>`
}

// One "card pop" cutout: a clipped window onto the SAME base image
// (same REVEAL_CAMERA), positioned/sized to exactly one card's rect, so
// it reads as that card being lifted forward — background-image (not an
// <img>) so this stays a small, purely-CSS overlay rather than another
// full <img> element.
function cardPopHtml(dataEl: string, card: Rect): string {
  const cardRect = rectFor(card, REVEAL_CAMERA)
  const imgW = SCREENSHOT_WIDTH * SCALE_FACTOR * REVEAL_CAMERA.s
  const imgH = SCREENSHOT_HEIGHT * SCALE_FACTOR * REVEAL_CAMERA.s
  const bgPosX = REVEAL_CAMERA.tx - cardRect.x
  const bgPosY = REVEAL_CAMERA.ty - cardRect.y
  return `<div class="cardPop" data-el="${dataEl}" style="left:${cardRect.x.toFixed(2)}px;top:${cardRect.y.toFixed(2)}px;width:${cardRect.w.toFixed(2)}px;height:${cardRect.h.toFixed(2)}px;background-image:url('${propcrewShot.dataUri}');background-size:${imgW.toFixed(2)}px ${imgH.toFixed(2)}px;background-position:${bgPosX.toFixed(2)}px ${bgPosY.toFixed(2)}px;"></div>`
}

function sceneMarkup(scene: Reel3Scene, index: number): string {
  const start = reel3SceneStartMs(scene.id)
  const end = start + scene.durationMs
  const wrap = (inner: string) =>
    `<section class="scene" data-scene="${scene.id}" data-kind="${scene.kind}" data-start="${start}" data-end="${end}" style="z-index:${index};"><div class="safePad"><div class="centerCol" data-el="centerCol">${inner}</div></div></section>`

  switch (scene.kind) {
    case 'hook1':
      return wrap(`<p class="thoughtLine" data-el="hook1Line">${esc(scene.line)}</p>`)
    case 'hook2':
      return wrap(`
          <p class="thoughtLine thoughtLineSmall" data-el="hook2LineA">${esc(scene.lineA)}</p>
          <p class="thoughtLine" data-el="hook2LineB">${esc(scene.lineB)}</p>`)
    case 'recognition':
      return wrap(`<p class="recognitionLine reveal" data-el="recognitionLine">${esc(scene.line)}</p>`)
    case 'reveal':
      return wrap(`
          <p class="revealLabel" data-el="revealLabel">${splitWords(scene.label)}</p>
          ${staticShotHtml(REVEAL_CAMERA, VIEWPORT_HEIGHT)}`)
    case 'trust': {
      const imgW = SCREENSHOT_WIDTH * SCALE_FACTOR * REVEAL_CAMERA.s
      const imgH = SCREENSHOT_HEIGHT * SCALE_FACTOR * REVEAL_CAMERA.s
      return wrap(`
          <p class="trustLine reveal" data-el="trustLineA">${esc(scene.lineA)}</p>
          <p class="trustLine trustLineB reveal" data-el="trustLineB">${esc(scene.lineB)}</p>
          <div class="shotFrame">
            <div class="shotFrameBar"><span class="shotDot"></span><span class="shotDot"></span><span class="shotDot"></span></div>
            <div class="shotViewport" style="height:${VIEWPORT_HEIGHT}px;">
              <img class="pcImg" src="${propcrewShot.dataUri}" style="width:${imgW.toFixed(2)}px;height:${imgH.toFixed(2)}px;transform:translate(${REVEAL_CAMERA.tx.toFixed(2)}px, ${REVEAL_CAMERA.ty.toFixed(2)}px);" alt="" />
              <div class="scrim" data-el="trustScrim"></div>
              ${cardPopHtml('card1Pop', CARD_HANDYMAN)}
              ${cardPopHtml('card2Pop', CARD_BREEZE_AIR)}
            </div>
          </div>`)
    }
    case 'private':
      // This scene's viewport is capped by PRIVATE_VIEWPORT_HEIGHT (see
      // content.ts) to never show any raw-pixel row at or below the
      // cards' own top edge, keeping the crop scoped to the heading as
      // the storyboard calls for — see content.test.ts's dedicated
      // bounds check for the guard against this regressing.
      return wrap(`
          <p class="privateLine reveal" data-el="privateLineA">${esc(scene.lineA)}</p>
          <p class="privateLine privateLineB reveal" data-el="privateLineB">${esc(scene.lineB)}</p>
          ${staticShotHtml(PRIVATE_CAMERA, PRIVATE_VIEWPORT_HEIGHT)}`)
    case 'close':
      return wrap(`
          <p class="endWordmark reveal" data-el="endWordmark"><span class="wProp">Prop</span><span class="wRoster">Roster</span></p>
          <p class="closeTagline" data-el="closeTagline">${splitWords(scene.tagline)}</p>
          <p class="closeCta reveal" data-el="closeCta">${esc(scene.cta)}</p>
          <p class="closeUrl reveal" data-el="closeUrl">${esc(scene.url)}</p>`)
  }
}

export function buildReel3Document(): string {
  const css = `
    ${engineBaseCss(BRAND)}
    #stage {
      position: relative;
      width: ${REEL3_WIDTH}px; height: ${REEL3_HEIGHT}px;
      background: ${engineStageBackground(BRAND)};
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      color: ${BRAND.ink};
    }

    /* "Thought appearing" treatment (Scenes 1-2) — a blurred fade-in +
       tiny scale settle, deliberately NOT the word-by-word cascade used
       for the product-facing hook lines in Reels #1/#2, so the opening
       reads as an interior thought rather than a headline. */
    .thoughtLine { font-size: 58px; font-weight: 700; line-height: 1.32; letter-spacing: -0.4px; margin: 0; opacity: 0; }
    .thoughtLineSmall { font-size: 40px; font-weight: 600; color: ${BRAND.sage}; margin: 0 0 18px; opacity: 0; }

    .recognitionLine { font-size: 50px; font-weight: 750; letter-spacing: -0.4px; }

    .revealLabel { font-size: 44px; font-weight: 750; letter-spacing: -0.4px; margin: 0 0 26px; }

    .trustLine { font-size: 34px; font-weight: 700; margin: 0 0 10px; letter-spacing: -0.3px; }
    .trustLineB { color: ${BRAND.sage}; margin: 0 0 24px; }

    .privateLine { font-size: 40px; font-weight: 750; margin: 0 0 10px; letter-spacing: -0.4px; }
    .privateLineB { font-size: 26px; font-weight: 600; color: ${BRAND.sage}; margin: 0 0 26px; }

    .shotFrame {
      width: ${DISPLAY_WIDTH}px; margin: 0 auto; border-radius: 20px; overflow: hidden;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.02);
      box-shadow: 0 40px 90px -40px rgba(43,107,79,0.45);
    }
    .shotFrameBar { display: flex; gap: 6px; padding: 12px 14px; background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.08); }
    .shotDot { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,0.18); }
    /* height is set per-instance (inline style) — "private" uses a
       shorter PRIVATE_VIEWPORT_HEIGHT than "reveal"/"trust"'s shared
       VIEWPORT_HEIGHT; see content.ts's PRIVATE_VIEWPORT_HEIGHT comment. */
    .shotViewport { position: relative; width: ${DISPLAY_WIDTH}px; overflow: hidden; background: #f5f7f5; }
    .pcImg { position: absolute; top: 0; left: 0; transform-origin: 0 0; }

    .scrim { position: absolute; inset: 0; background: rgba(6,10,8,0.6); opacity: 0; }
    .cardPop {
      position: absolute; overflow: hidden; border-radius: 14px; opacity: 0;
      box-shadow: 0 18px 40px -14px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.5);
      transform: scale(1);
    }

    .endWordmark { font-size: 72px; font-weight: 800; margin: 0 0 26px; letter-spacing: -1px; }
    .wProp { color: ${BRAND.ink}; }
    .wRoster { color: ${BRAND.green}; }
    /* No container-level opacity:0 here (unlike Reel #2's identical-
       looking class) — each .word span inside already starts hidden via
       engineBaseCss's .word rule and is revealed individually by
       revealWords(), so the container doesn't need its own hide/reveal
       toggle. */
    .closeTagline { font-size: 28px; font-weight: 600; color: ${BRAND.ink}; margin: 0 0 16px; max-width: 660px; margin-left: auto; margin-right: auto; line-height: 1.35; }
    .closeCta { font-size: 24px; font-weight: 650; color: ${BRAND.sage}; margin: 0 0 40px; }
    .closeUrl { font-size: 34px; font-weight: 750; color: ${BRAND.green}; letter-spacing: 0.5px; }
  `

  const scenesHtml = REEL3_SCENES.map(sceneMarkup).join('\n')

  const trustScene = REEL3_SCENES.find((s) => s.kind === 'trust')
  if (!trustScene || trustScene.kind !== 'trust') throw new Error('Reel #3 must have a "trust" scene')
  const hook2Scene = REEL3_SCENES.find((s) => s.kind === 'hook2')
  if (!hook2Scene || hook2Scene.kind !== 'hook2') throw new Error('Reel #3 must have a "hook2" scene')

  const perSceneJs = `
          if (kind === 'hook1') {
            thoughtReveal(s.querySelector('[data-el="hook1Line"]'), local, 0, 600)
          } else if (kind === 'hook2') {
            thoughtReveal(s.querySelector('[data-el="hook2LineA"]'), local, 0, 480)
            thoughtReveal(s.querySelector('[data-el="hook2LineB"]'), local, ${hook2Scene.lineBDelayMs}, 480)
          } else if (kind === 'recognition') {
            revealStyle(s.querySelector('[data-el="recognitionLine"]'), local, 0, 420)
          } else if (kind === 'reveal') {
            revealWords(s.querySelector('[data-el="revealLabel"]'), local, 0, 60, 460)
          } else if (kind === 'trust') {
            var scrim = s.querySelector('[data-el="trustScrim"]');
            if (scrim) scrim.style.opacity = String(0.6 * clamp01(local / 350));

            var c1 = s.querySelector('[data-el="card1Pop"]');
            var c2 = s.querySelector('[data-el="card2Pop"]');
            var c1In = clamp01((local - ${trustScene.card1FocusStartMs}) / 260);
            var c1Out = clamp01((${trustScene.card1FocusEndMs} - local) / 260);
            var c1Opacity = Math.max(0, Math.min(c1In, c1Out));
            var c2In = clamp01((local - ${trustScene.card2FocusStartMs}) / 260);
            if (c1) {
              c1.style.opacity = String(c1Opacity);
              c1.style.transform = 'scale(' + (1 + 0.045 * easeOutCubic(c1Opacity)).toFixed(4) + ')';
            }
            if (c2) {
              c2.style.opacity = String(c2In);
              c2.style.transform = 'scale(' + (1 + 0.045 * easeOutCubic(c2In)).toFixed(4) + ')';
            }

            revealStyle(s.querySelector('[data-el="trustLineA"]'), local, ${trustScene.card1FocusStartMs}, 380)
            revealStyle(s.querySelector('[data-el="trustLineB"]'), local, ${trustScene.card2FocusStartMs}, 380)
          } else if (kind === 'private') {
            revealStyle(s.querySelector('[data-el="privateLineA"]'), local, 0, 400)
            revealStyle(s.querySelector('[data-el="privateLineB"]'), local, 260, 420)
          } else if (kind === 'close') {
            revealStyle(s.querySelector('[data-el="endWordmark"]'), local, 0, 520)
            revealWords(s.querySelector('[data-el="closeTagline"]'), local, 380, 42, 420)
            revealStyle(s.querySelector('[data-el="closeCta"]'), local, 900, 460)
            revealStyle(s.querySelector('[data-el="closeUrl"]'), local, 1300, 460)
          }
  `

  const engineJs = engineScript({ totalMs: REEL3_TOTAL_MS, fps: REEL3_FPS, perSceneJs })

  // thoughtReveal() is this Reel's own small helper (not part of the
  // shared engine — it's a deliberately different reveal signature only
  // this Reel uses: a blurred fade-in rather than the shared engine's
  // translateY reveal). Defined here in the preamble script, which runs
  // BEFORE engineScript's own <script> tag — so it deliberately does
  // NOT call the shared engine's clamp01()/easeOutCubic() (those are
  // declared INSIDE engineScript's IIFE, a separate lexical scope that
  // a function defined in this earlier, outer script cannot close over,
  // even though it ends up being CALLED from within that IIFE via
  // perSceneJs — JS closures resolve by where a function is defined,
  // not where it's called from). It inlines its own tiny clamp/ease
  // math instead, so it has no cross-scope dependency at all.
  const dataAndHelpers = `
    function thoughtReveal(el, localMs, delayMs, durMs) {
      if (!el) return;
      var raw = (localMs - delayMs) / durMs;
      var p = raw < 0 ? 0 : (raw > 1 ? 1 : raw);
      var e = 1 - Math.pow(1 - p, 3);
      el.style.opacity = String(e);
      el.style.filter = 'blur(' + (9 * (1 - e)).toFixed(2) + 'px)';
      el.style.transform = 'scale(' + (0.97 + 0.03 * e).toFixed(4) + ')';
    }
  `

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>PropRoster Reel — PropCrew</title>
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
