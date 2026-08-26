// PropRoster Content Studio — Animated Marketing Reel Prototype
// V1.2 — Visual Expansion + Faster Pacing
//
// Pure function that turns reel-content.ts's data (plus the real,
// embedded screenshots in reel-assets.ts) into one self-contained HTML
// document (inline CSS + inline vanilla JS + base64 image data URIs —
// still zero external network requests). The animation clock is driven
// by an explicit `setTime(ms)` function exposed on `window.__REEL__`
// rather than real CSS @keyframes timing, so a headless-browser renderer
// can call setTime() for each output frame and get an exact,
// reproducible frame every time — real wall-clock CSS animation timing
// is not reliable enough to screenshot frame-by-frame.
//
// This file is intentionally framework-free (no React) — it is used
// both by the prototype preview page (via an <iframe srcDoc={...}>) and
// by scripts/render-reel.mjs (loaded directly in headless Chromium). No
// animation library or video framework was installed for this, in V1,
// V1.1, or this V1.2 pass: everything here is plain CSS transforms/
// opacity driven by small interpolation helpers.
//
// V1.2 changes from V1.1 (see the completion report for the full list):
//   - the abstract "phone card with tag pills" hero scene is retired —
//     replaced by five real, embedded product screenshots (montage
//     scenes) in a browser-chrome-style frame, per this pass's brief to
//     prefer actual recognizable UI over invented UI
//   - a full-bleed property-photo background (with a dark scrim, the
//     same visual idea as components/LandingPage.tsx's existing
//     .landingHeroBg/.landingHeroScrim treatment) for the "transition"
//     and "end" scenes
//   - the hook scene's four "chaos" items now flash one at a time
//     (rapid-fire) instead of appearing together in a grid
//   - ten shorter scenes instead of six longer ones, for a new visual
//     beat roughly every 1.4-2.2s
//   - a muted secondary "sage" brand tone; every green here stays
//     deliberately desaturated (no neon/lime)

// The explicit .ts extension below is required so this file can be
// loaded two ways: (a) normally, by Next.js/webpack, via tsconfig's
// "moduleResolution": "bundler" (which resolves .ts-suffixed relative
// specifiers to the .ts file itself); and (b) directly by Node's native
// TypeScript support (`node --experimental-strip-types`) in
// scripts/render-reel.mjs, which — unlike a bundler — needs a real,
// resolvable file extension in every relative import.
import { BRAND, REEL_FPS, REEL_HEIGHT, REEL_SCENES, REEL_TOTAL_MS, REEL_WIDTH, sceneStartMs, type AssetKey, type Scene } from './reel-content.ts'
import * as ASSETS from './reel-assets.ts'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function splitWords(text: string): string {
  return text
    .split(' ')
    .map((w) => `<span class="word">${esc(w)}</span>`)
    .join(' ')
}

function asset(key: AssetKey) {
  return (ASSETS as Record<string, { dataUri: string; width: number; height: number }>)[key]
}

// Full-bleed background image + dark scrim, used by the "transition" and
// "end" scenes — the same visual idea already used on the real marketing
// site (components/LandingPage.tsx's .landingHeroBg/.landingHeroScrim).
function bleedMarkup(key: AssetKey): string {
  const a = asset(key)
  return `<div class="bleedBg"><img class="bleedImg" data-el="bleedImg" src="${a.dataUri}" alt="" /><div class="bleedScrim"></div></div>`
}

function shotFrameMarkup(key: AssetKey): string {
  const a = asset(key)
  return `
    <div class="shotFrame" data-el="shotFrame">
      <div class="shotFrameBar"><span class="shotDot"></span><span class="shotDot"></span><span class="shotDot"></span></div>
      <div class="shotImgWrap"><img class="shotImg" data-el="shotImg" src="${a.dataUri}" width="${a.width}" height="${a.height}" alt="" /><div class="shotShine" data-el="shotShine"></div></div>
    </div>`
}

function sceneMarkup(scene: Scene, index: number): string {
  const start = sceneStartMs(scene.id)
  const end = start + scene.durationMs
  const wrap = (inner: string, bleedAsset?: AssetKey) =>
    `<section class="scene" data-scene="${scene.id}" data-kind="${scene.kind}" data-start="${start}" data-end="${end}" style="z-index:${index};">${bleedAsset ? bleedMarkup(bleedAsset) : ''}<div class="safePad"><div class="centerCol" data-el="centerCol">${inner}</div></div></section>`

  switch (scene.kind) {
    case 'hook':
      return wrap(`
          <p class="hookLine" data-el="hookLine">${splitWords(scene.line)}</p>
          <div class="chaosFlash">
            ${scene.chaos.map((c, i) => `<div class="chaosItem" data-el="chaos${i}">${esc(c)}</div>`).join('')}
          </div>`)
    case 'transition':
      return wrap(`<p class="transitionLine" data-el="transitionLine">${splitWords(scene.line)}</p>`, scene.asset)
    case 'meet':
      return wrap(`
          <p class="meetLine" data-el="meetLine">${splitWords(scene.line)}</p>
          <div class="tabGrid">
            ${scene.tabs.map((t, i) => `<div class="tabChip" data-i="${i}">${esc(t)}</div>`).join('')}
          </div>`)
    case 'montage':
      return wrap(`
          <p class="montageEyebrow" data-el="montageEyebrow">${splitWords(scene.eyebrow)}</p>
          <p class="montageLine" data-el="montageLine">${splitWords(scene.line)}</p>
          ${shotFrameMarkup(scene.asset)}`)
    case 'value':
      return wrap(`
          ${scene.lines.map((l, i) => `<p class="valueLine" data-el="value${i}">${splitWords(l)}</p>`).join('')}`)
    case 'end':
      return wrap(`
          <p class="endWordmark reveal" data-el="endWordmark"><span class="wProp">Prop</span><span class="wRoster">Roster</span></p>
          <p class="endTagline" data-el="endTagline">${splitWords(scene.tagline)}</p>
          <p class="endUrl reveal" data-el="endUrl">${esc(scene.url)}</p>`, scene.asset)
  }
}

function waveformBars(): string {
  const bars = 28
  let out = ''
  for (let i = 0; i < bars; i++) out += `<div class="wfBar" data-i="${i}"></div>`
  return out
}

export function buildReelDocument(): string {
  const css = `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: ${BRAND.bg}; overflow: hidden; }
    #stage {
      position: relative;
      width: ${REEL_WIDTH}px; height: ${REEL_HEIGHT}px;
      background: radial-gradient(120% 90% at var(--spot-x, 50%) var(--spot-y, 0%), ${BRAND.bgAlt} 0%, ${BRAND.bg} 62%);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      color: ${BRAND.ink};
    }
    .scene { position: absolute; inset: 0; opacity: 0; pointer-events: none; }
    .bleedBg { position: absolute; inset: 0; overflow: hidden; }
    .bleedImg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scale(1); }
    .bleedScrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10,15,12,0.5) 0%, rgba(10,15,12,0.72) 55%, rgba(10,15,12,0.94) 100%); }
    .safePad {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      /* Safe area: keep all copy clear of the top status/caption zone and
         the bottom Reel-controls/caption zone social apps draw over
         vertical video. */
      padding: 300px 92px 360px;
    }
    .centerCol { width: 100%; max-width: 880px; text-align: center; transform: scale(1); position: relative; z-index: 1; }
    .reveal { opacity: 0; transform: translateY(28px); will-change: transform, opacity; }
    .word { display: inline-block; opacity: 0; transform: translateY(20px); will-change: transform, opacity; }

    .hookLine { font-size: 58px; font-weight: 750; line-height: 1.22; margin: 0 0 64px; letter-spacing: -0.5px; }
    .chaosFlash { position: relative; height: 110px; }
    .chaosItem {
      position: absolute; top: 50%; left: 50%; font-size: 40px; font-weight: 700; color: ${BRAND.ink};
      border: 1px solid rgba(135,160,145,0.4); border-radius: 16px;
      padding: 20px 34px; background: rgba(255,255,255,0.035);
      opacity: 0; transform: translate(-50%, -50%) scale(0.94); white-space: nowrap;
    }

    .transitionLine { font-size: 62px; font-weight: 750; line-height: 1.26; letter-spacing: -0.5px; }

    .meetLine { font-size: 60px; font-weight: 800; margin: 0 0 40px; letter-spacing: -0.5px; }
    .tabGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    .tabChip {
      font-size: 20px; font-weight: 750; color: ${BRAND.ink}; text-align: center;
      border: 1px solid rgba(43,107,79,0.5); border-radius: 14px;
      background: rgba(43,107,79,0.1); padding: 20px 10px;
      opacity: 0; transform: translateY(16px) scale(0.96);
    }

    .montageEyebrow { font-size: 17px; font-weight: 800; letter-spacing: 3px; color: ${BRAND.sage}; margin: 0 0 14px; }
    .montageLine { font-size: 40px; font-weight: 750; line-height: 1.25; margin: 0 0 30px; letter-spacing: -0.3px; }
    .shotFrame {
      width: 620px; margin: 0 auto; border-radius: 22px; overflow: hidden;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.02);
      box-shadow: 0 40px 90px -40px rgba(43,107,79,0.45);
      opacity: 0; transform: translateY(26px) scale(0.96);
    }
    .shotFrameBar { display: flex; gap: 6px; padding: 12px 14px; background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.08); }
    .shotDot { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,0.18); }
    .shotImgWrap { position: relative; overflow: hidden; max-height: 760px; }
    .shotImg { display: block; width: 100%; height: auto; transform-origin: center top; }
    .shotShine {
      position: absolute; top: 0; bottom: 0; width: 32%;
      background: linear-gradient(100deg, transparent, rgba(255,255,255,0.16), transparent);
      transform: translateX(-160%); pointer-events: none;
    }

    .valueLine { font-size: 52px; font-weight: 750; line-height: 1.32; margin: 0 0 18px; letter-spacing: -0.5px; }

    .endWordmark { font-size: 76px; font-weight: 800; margin: 0 0 28px; letter-spacing: -1px; }
    .wProp { color: ${BRAND.ink}; }
    .wRoster { color: ${BRAND.green}; }
    .endTagline { font-size: 29px; font-weight: 600; color: ${BRAND.ink}; opacity: 0.86; margin: 0 0 42px; max-width: 660px; margin-left: auto; margin-right: auto; line-height: 1.35; }
    .endUrl { font-size: 35px; font-weight: 750; color: ${BRAND.green}; letter-spacing: 0.5px; }

    .waveform {
      position: absolute; left: 0; right: 0; bottom: 240px; z-index: 2;
      height: 84px; display: flex; align-items: flex-end; justify-content: center; gap: 6px;
      opacity: 0.28; pointer-events: none;
    }
    .wfBar { width: 8px; border-radius: 4px; background: ${BRAND.green}; height: 10px; }
  `

  const scenesHtml = REEL_SCENES.map(sceneMarkup).join('\n')

  const js = `
    (function () {
      var TOTAL_MS = ${REEL_TOTAL_MS};
      var scenes = Array.prototype.slice.call(document.querySelectorAll('.scene'));
      var wfBars = Array.prototype.slice.call(document.querySelectorAll('.wfBar'));
      var stageEl = document.getElementById('stage');

      function clamp01(x) { return Math.max(0, Math.min(1, x)); }
      function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

      function revealStyle(el, localMs, delayMs, durMs) {
        if (!el) return;
        var p = clamp01((localMs - delayMs) / durMs);
        var e = easeOutCubic(p);
        el.style.opacity = String(e);
        el.style.transform = 'translateY(' + (28 * (1 - e)) + 'px)';
      }

      // Word-by-word reveal: each .word span inside "container" gets its
      // own staggered delay (stepMs apart), so a headline builds in
      // left-to-right rather than appearing as one block.
      function revealWords(container, localMs, delayMs, stepMs, durMs) {
        if (!container) return;
        var words = container.querySelectorAll('.word');
        for (var i = 0; i < words.length; i++) {
          var p = clamp01((localMs - (delayMs + i * stepMs)) / durMs);
          var e = easeOutCubic(p);
          words[i].style.opacity = String(e);
          words[i].style.transform = 'translateY(' + (16 * (1 - e)) + 'px)';
        }
      }

      function cardStyle(el, localMs, delayMs, durMs) {
        if (!el) return;
        var p = clamp01((localMs - delayMs) / durMs);
        var e = easeOutCubic(p);
        el.style.opacity = String(e);
        el.style.transform = 'translateY(' + (18 * (1 - e)) + 'px) scale(' + (0.96 + 0.04 * e) + ')';
      }

      function chipStyle(el, localMs, delayMs, durMs) {
        if (!el) return;
        var p = clamp01((localMs - delayMs) / durMs);
        var e = easeOutCubic(p);
        el.style.opacity = String(e);
        el.style.transform = 'translateY(' + (16 * (1 - e)) + 'px) scale(' + (0.96 + 0.04 * e) + ')';
      }

      // Subtle settle-in scale on the whole centered content column.
      function settleScale(container, localMs) {
        if (!container) return;
        var p = clamp01(localMs / 700);
        var e = easeOutCubic(p);
        var scale = 1.03 - 0.03 * e;
        container.style.transform = 'scale(' + scale.toFixed(4) + ')';
      }

      // Slow, deterministic "Ken Burns" zoom on a full-bleed or montage
      // image — a function of elapsed time within the scene only, so it
      // is exactly reproducible frame-by-frame.
      function kenBurns(img, localMs, durationMs, fromScale, toScale) {
        if (!img) return;
        var p = clamp01(localMs / durationMs);
        var scale = fromScale + (toScale - fromScale) * p;
        img.style.transform = 'scale(' + scale.toFixed(4) + ')';
      }

      function setTime(ms) {
        ms = Math.max(0, Math.min(TOTAL_MS - 1, ms));

        // Ambient background spotlight: a slow, fully deterministic drift
        // so the dark background never feels static.
        var spotX = 50 + 6 * Math.sin(ms / 5200);
        var spotY = 8 + 5 * Math.cos(ms / 6100);
        stageEl.style.setProperty('--spot-x', spotX.toFixed(2) + '%');
        stageEl.style.setProperty('--spot-y', spotY.toFixed(2) + '%');

        for (var i = 0; i < scenes.length; i++) {
          var s = scenes[i];
          var start = Number(s.getAttribute('data-start'));
          var end = Number(s.getAttribute('data-end'));
          var FADE = 220;
          var active = ms >= start - FADE && ms < end;
          if (!active) { s.style.opacity = '0'; continue; }
          var local = ms - start;
          var fadeIn = clamp01(local / FADE);
          var fadeOut = clamp01((end - ms) / FADE);
          s.style.opacity = String(Math.min(fadeIn, fadeOut === 0 ? 1 : fadeOut, 1));
          if (ms < start) s.style.opacity = String(clamp01((ms - (start - FADE)) / FADE));

          settleScale(s.querySelector('[data-el="centerCol"]'), local);

          // Dispatch on the scene's KIND (data-kind), not its id
          // (data-scene) — several montage scenes (rentLedger, propCrew,
          // search, investmentTools, attention) all share kind
          // "montage" but each has a distinct id, so matching on id
          // here would silently skip every one of them.
          var kind = s.getAttribute('data-kind');
          if (kind === 'hook') {
            revealWords(s.querySelector('[data-el="hookLine"]'), local, 0, 45, 380)
            var flashStart = 450, slot = 375, inD = 110, outD = 110;
            var fi = Math.floor((local - flashStart) / slot);
            for (var c = 0; c < 4; c++) {
              var chaosEl = s.querySelector('[data-el="chaos' + c + '"]');
              if (!chaosEl) continue;
              if (local < flashStart || c !== fi) { chaosEl.style.opacity = '0'; continue; }
              var within = local - (flashStart + fi * slot);
              var holdEnd = slot - outD;
              var op;
              if (within < inD) op = clamp01(within / inD);
              else if (within < holdEnd) op = 1;
              else op = clamp01((slot - within) / outD);
              chaosEl.style.opacity = String(op);
              chaosEl.style.transform = 'translate(-50%, -50%) scale(' + (0.94 + 0.06 * op).toFixed(3) + ')';
            }
          } else if (kind === 'transition') {
            revealWords(s.querySelector('[data-el="transitionLine"]'), local, 120, 50, 480)
            kenBurns(s.querySelector('[data-el="bleedImg"]'), local, end - start, 1.0, 1.06)
          } else if (kind === 'meet') {
            revealWords(s.querySelector('[data-el="meetLine"]'), local, 0, 45, 360)
            var chips = s.querySelectorAll('.tabChip');
            for (var k = 0; k < chips.length; k++) chipStyle(chips[k], local, 380 + k * 90, 320)
          } else if (kind === 'montage') {
            revealWords(s.querySelector('[data-el="montageEyebrow"]'), local, 0, 20, 260)
            revealWords(s.querySelector('[data-el="montageLine"]'), local, 120, 40, 400)
            var frameEl = s.querySelector('[data-el="shotFrame"]');
            cardStyle(frameEl, local, 380, 420)
            var sceneDur = end - start;
            kenBurns(s.querySelector('[data-el="shotImg"]'), local, sceneDur, 1.0, 1.05)
            var shine = s.querySelector('[data-el="shotShine"]');
            if (shine) {
              var shineStart = sceneDur * 0.38, shineDur = 700;
              var sp = clamp01((local - shineStart) / shineDur);
              shine.style.transform = 'translateX(' + (-160 + 320 * sp) + '%)';
            }
          } else if (kind === 'value') {
            var valueLines = s.querySelectorAll('.valueLine');
            for (var v = 0; v < valueLines.length; v++) revealWords(valueLines[v], local, v * 460, 42, 420)
          } else if (kind === 'end') {
            revealStyle(s.querySelector('[data-el="endWordmark"]'), local, 0, 520)
            revealWords(s.querySelector('[data-el="endTagline"]'), local, 400, 45, 440)
            revealStyle(s.querySelector('[data-el="endUrl"]'), local, 900, 520)
            kenBurns(s.querySelector('[data-el="bleedImg"]'), local, end - start, 1.0, 1.05)
          }
        }

        // Restrained animated waveform, deterministic function of time —
        // not random per frame, so re-rendering a frame is reproducible.
        for (var b = 0; b < wfBars.length; b++) {
          var phase = b * 0.35;
          var h = 10 + 34 * (0.5 + 0.5 * Math.sin(ms / 420 + phase));
          wfBars[b].style.height = h.toFixed(1) + 'px';
        }
      }

      window.__REEL__ = { setTime: setTime, totalMs: TOTAL_MS, fps: ${REEL_FPS} };

      var params = new URLSearchParams(location.search);
      var manual = params.get('manual') === '1';
      if (!manual) {
        var startTs = null;
        function tick(ts) {
          if (startTs === null) startTs = ts;
          var elapsed = (ts - startTs) % TOTAL_MS;
          setTime(elapsed);
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      } else {
        setTime(0);
      }
    })();
  `

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>PropRoster Reel Prototype</title>
<style>${css}</style>
</head>
<body>
<div id="stage">
${scenesHtml}
<div class="waveform" aria-hidden="true">${waveformBars()}</div>
</div>
<script>${js}</script>
</body>
</html>`
}
