// PropRoster Content Studio — Animated Marketing Reel Prototype V1
//
// Pure function that turns reel-content.ts's data into one self-contained
// HTML document (inline CSS + inline vanilla JS, no external requests,
// no fonts/images fetched over the network). The animation clock is
// driven by an explicit `setTime(ms)` function exposed on
// `window.__REEL__` rather than real CSS @keyframes timing, so a
// headless-browser renderer can call setTime() for each output frame and
// get an exact, reproducible frame every time — real wall-clock CSS
// animation timing is not reliable enough to screenshot frame-by-frame.
//
// This file is intentionally framework-free (no React) — it is used
// both by the prototype preview page (via an <iframe srcDoc={...}>) and
// by scripts/render-reel.mjs (loaded directly in headless Chromium). No
// animation library was installed for this: everything here is plain
// CSS transforms/opacity driven by small interpolation helpers, which is
// all six scenes need.

// The explicit .ts extension below is required so this file can be
// loaded two ways: (a) normally, by Next.js/webpack, via tsconfig's
// "moduleResolution": "bundler" (which resolves .ts-suffixed relative
// specifiers to the .ts file itself); and (b) directly by Node's native
// TypeScript support (`node --experimental-strip-types`) in
// scripts/render-reel.mjs, which — unlike a bundler — needs a real,
// resolvable file extension in every relative import.
import { BRAND, REEL_FPS, REEL_HEIGHT, REEL_SCENES, REEL_TOTAL_MS, REEL_WIDTH, sceneStartMs, type FeatureTab, type Scene } from './reel-content.ts'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function tabChip(tab: FeatureTab, index: number): string {
  return `<div class="tabChip" data-i="${index}"><span class="tabChipLabel">${esc(tab.label)}</span><span class="tabChipCaption">${esc(tab.caption)}</span></div>`
}

function sceneMarkup(scene: Scene, index: number): string {
  const start = sceneStartMs(scene.id)
  const end = start + scene.durationMs
  const wrap = (inner: string) => `<section class="scene" data-scene="${scene.id}" data-start="${start}" data-end="${end}" style="z-index:${index};">${inner}</section>`

  switch (scene.kind) {
    case 'hook':
      return wrap(`
        <div class="centerCol">
          <p class="hookLine reveal" data-el="hookLine">${esc(scene.line)}</p>
          <div class="chaosList">
            ${scene.chaos.map((c, i) => `<div class="chaosItem reveal" data-el="chaos${i}">${esc(c)}</div>`).join('')}
          </div>
        </div>`)
    case 'change':
      return wrap(`
        <div class="centerCol">
          <p class="changeLine reveal" data-el="changeLine">${esc(scene.line)}</p>
        </div>`)
    case 'meet':
      return wrap(`
        <div class="centerCol">
          <p class="meetLine reveal" data-el="meetLine">${esc(scene.line)}</p>
          <div class="tabGrid">
            ${scene.tabs.map((t, i) => tabChip(t, i)).join('')}
          </div>
        </div>`)
    case 'propertyView':
      return wrap(`
        <div class="centerCol">
          <div class="phoneCard">
            <div class="phoneCardNav">
              ${scene.tabs.map((t, i) => `<span class="phoneNavItem" data-i="${i}">${esc(t.label)}</span>`).join('')}
              <div class="phoneNavHighlight" data-el="phoneNavHighlight"></div>
            </div>
            <p class="phoneCardCaption reveal" data-el="phoneCardCaption"></p>
          </div>
        </div>`)
    case 'value':
      return wrap(`
        <div class="centerCol">
          ${scene.lines.map((l, i) => `<p class="valueLine reveal" data-el="value${i}">${esc(l)}</p>`).join('')}
        </div>`)
    case 'end':
      return wrap(`
        <div class="centerCol">
          <p class="endWordmark reveal" data-el="endWordmark"><span class="wProp">Prop</span><span class="wRoster">Roster</span></p>
          <p class="endTagline reveal" data-el="endTagline">${esc(scene.tagline)}</p>
          <p class="endUrl reveal" data-el="endUrl">${esc(scene.url)}</p>
        </div>`)
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
      background: radial-gradient(120% 90% at 50% 0%, ${BRAND.bgAlt} 0%, ${BRAND.bg} 60%);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      color: ${BRAND.ink};
    }
    .scene {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      opacity: 0; pointer-events: none;
      /* Safe area: keep all copy within a centered column clear of the
         top status/caption zone and the bottom Reel-controls/caption zone
         social apps draw over vertical video (Step 9). */
      padding: 320px 96px 380px;
    }
    .centerCol { width: 100%; max-width: 880px; text-align: center; }
    .reveal { opacity: 0; transform: translateY(28px); will-change: transform, opacity; }

    .hookLine { font-size: 64px; font-weight: 750; line-height: 1.18; margin: 0 0 56px; }
    .chaosList { display: flex; flex-direction: column; gap: 22px; align-items: center; }
    .chaosItem {
      font-size: 34px; font-weight: 600; color: ${BRAND.muted};
      border: 1px solid rgba(143,161,152,0.35); border-radius: 14px;
      padding: 14px 28px; background: rgba(255,255,255,0.02);
    }

    .changeLine { font-size: 68px; font-weight: 750; line-height: 1.2; }

    .meetLine { font-size: 72px; font-weight: 800; margin: 0 0 64px; }
    .meetLine .wRosterInline { color: ${BRAND.green}; }
    .tabGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
    .tabChip {
      display: flex; flex-direction: column; gap: 6px; text-align: left;
      border: 1px solid rgba(47,122,92,0.45); border-radius: 16px;
      background: rgba(47,122,92,0.08); padding: 22px 24px;
      opacity: 0; transform: translateY(20px) scale(0.97);
    }
    .tabChipLabel { font-size: 30px; font-weight: 750; color: ${BRAND.ink}; }
    .tabChipCaption { font-size: 19px; color: ${BRAND.muted}; }

    .phoneCard {
      width: 620px; margin: 0 auto; border-radius: 28px;
      border: 1px solid rgba(255,255,255,0.14);
      background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015));
      padding: 26px 22px 40px; position: relative; overflow: hidden;
    }
    .phoneCardNav { position: relative; display: flex; justify-content: space-between; padding-bottom: 18px; border-bottom: 1px solid rgba(255,255,255,0.12); z-index: 0; }
    .phoneNavItem { font-size: 17px; font-weight: 700; color: ${BRAND.muted}; z-index: 1; position: relative; }
    .phoneNavHighlight {
      position: absolute; bottom: -1px; height: 3px; width: 16.66%;
      background: ${BRAND.green}; left: 0; border-radius: 3px;
    }
    .phoneCardCaption { font-size: 26px; font-weight: 650; margin: 40px 0 0; min-height: 70px; }

    .valueLine { font-size: 58px; font-weight: 750; line-height: 1.3; margin: 0 0 18px; }

    .endWordmark { font-size: 76px; font-weight: 800; margin: 0 0 28px; }
    .wProp { color: ${BRAND.ink}; }
    .wRoster { color: ${BRAND.green}; }
    .endTagline { font-size: 32px; font-weight: 600; color: ${BRAND.muted}; margin: 0 0 40px; max-width: 720px; margin-left: auto; margin-right: auto; }
    .endUrl { font-size: 34px; font-weight: 750; color: ${BRAND.green}; letter-spacing: 0.5px; }

    .waveform {
      position: absolute; left: 0; right: 0; bottom: 260px;
      height: 90px; display: flex; align-items: flex-end; justify-content: center; gap: 6px;
      opacity: 0.35; pointer-events: none;
    }
    .wfBar { width: 8px; border-radius: 4px; background: ${BRAND.green}; height: 10px; }
  `

  const scenesHtml = REEL_SCENES.map(sceneMarkup).join('\n')

  const js = `
    (function () {
      var TOTAL_MS = ${REEL_TOTAL_MS};
      var scenes = Array.prototype.slice.call(document.querySelectorAll('.scene'));
      var wfBars = Array.prototype.slice.call(document.querySelectorAll('.wfBar'));

      function clamp01(x) { return Math.max(0, Math.min(1, x)); }
      function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

      function revealStyle(el, localMs, delayMs, durMs) {
        var p = clamp01((localMs - delayMs) / durMs);
        var e = easeOutCubic(p);
        el.style.opacity = String(e);
        el.style.transform = 'translateY(' + (28 * (1 - e)) + 'px)';
      }

      function chipStyle(el, localMs, delayMs, durMs) {
        var p = clamp01((localMs - delayMs) / durMs);
        var e = easeOutCubic(p);
        el.style.opacity = String(e);
        el.style.transform = 'translateY(' + (20 * (1 - e)) + 'px) scale(' + (0.97 + 0.03 * e) + ')';
      }

      function setTime(ms) {
        ms = Math.max(0, Math.min(TOTAL_MS - 1, ms));
        for (var i = 0; i < scenes.length; i++) {
          var s = scenes[i];
          var start = Number(s.getAttribute('data-start'));
          var end = Number(s.getAttribute('data-end'));
          var FADE = 260;
          var active = ms >= start - FADE && ms < end;
          if (!active) { s.style.opacity = '0'; continue; }
          var local = ms - start;
          var fadeIn = clamp01(local / FADE);
          var fadeOut = clamp01((end - ms) / FADE);
          s.style.opacity = String(Math.min(fadeIn, fadeOut === 0 ? 1 : fadeOut, 1));
          if (ms < start) s.style.opacity = String(clamp01((ms - (start - FADE)) / FADE));

          var scene = s.getAttribute('data-scene');
          if (scene === 'hook') {
            revealStyle(s.querySelector('[data-el="hookLine"]'), local, 0, 500)
            for (var c = 0; c < 4; c++) {
              var el = s.querySelector('[data-el="chaos' + c + '"]');
              if (el) revealStyle(el, local, 550 + c * 260, 480)
            }
          } else if (scene === 'change') {
            revealStyle(s.querySelector('[data-el="changeLine"]'), local, 120, 600)
          } else if (scene === 'meet') {
            revealStyle(s.querySelector('[data-el="meetLine"]'), local, 0, 500)
            var chips = s.querySelectorAll('.tabChip');
            for (var k = 0; k < chips.length; k++) chipStyle(chips[k], local, 480 + k * 160, 420)
          }
          // 'propertyView' and 'value'/'end' reveal timing are handled
          // via the .reveal default CSS + the block below (propertyView)
          // and the generic loop above (value/end use the same
          // revealStyle pattern via their data-el attributes).
          if (scene === 'value') {
            var valueLines = s.querySelectorAll('.valueLine');
            for (var v = 0; v < valueLines.length; v++) revealStyle(valueLines[v], local, v * 500, 480)
          } else if (scene === 'end') {
            revealStyle(s.querySelector('[data-el="endWordmark"]'), local, 0, 500)
            revealStyle(s.querySelector('[data-el="endTagline"]'), local, 380, 500)
            revealStyle(s.querySelector('[data-el="endUrl"]'), local, 720, 500)
          }
        }

        // Property View scene: sweep the tab highlight + swap the caption
        // in lockstep, deterministically, based on elapsed time within
        // that scene.
        var pv = document.querySelector('.scene[data-scene="propertyView"]');
        if (pv) {
          var pvStart = Number(pv.getAttribute('data-start'));
          var pvEnd = Number(pv.getAttribute('data-end'));
          var pvLocal = ms - pvStart;
          var tabs = ${JSON.stringify(REEL_SCENES.find((s) => s.kind === 'propertyView') && (REEL_SCENES.find((s) => s.kind === 'propertyView') as Extract<Scene, { kind: 'propertyView' }>).tabs)};
          var n = tabs.length;
          var stepDur = (pvEnd - pvStart) / n;
          var idx = Math.max(0, Math.min(n - 1, Math.floor(pvLocal / stepDur)));
          var highlight = pv.querySelector('[data-el="phoneNavHighlight"]');
          if (highlight) highlight.style.transform = 'translateX(' + (idx * 100) + '%)';
          var caption = pv.querySelector('[data-el="phoneCardCaption"]');
          if (caption) {
            caption.textContent = tabs[idx].label + ' — ' + tabs[idx].caption;
            var withinStep = pvLocal - idx * stepDur;
            revealStyle(caption, withinStep, 60, 260)
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
