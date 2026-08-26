// PropRoster Content Studio — Animated Marketing Reel Prototype
// V1.1 — Visual Refinement Pass
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
// animation library was installed for this, in V1 or this V1.1 pass:
// everything here is plain CSS transforms/opacity driven by small
// interpolation helpers.
//
// V1.1 additions over V1 (see the completion report for the full list):
//   - word-by-word text reveals (splitWords) instead of whole-line fades
//   - a bigger, content-rich "hero" phone card in the propertyView scene
//   - a 3x2 "meet" tab grid (matching production's real mobile tab
//     layout) instead of 2x3
//   - a subtle, deterministic ambient background spotlight drift
//   - a subtle per-scene settle-in scale on the centered content column
//   - a 2x2, gently rotated "chaos" grid instead of a vertical list

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

// Splits a line into per-word <span class="word"> wrappers so the JS
// clock can stagger each word's reveal individually — the "premium SaaS
// launch video" text-animation pattern, rather than one block fading in
// at once. Each word is escaped individually (no HTML-sensitive
// characters appear in any Reel copy, but this keeps the function safe
// regardless).
function splitWords(text: string): string {
  return text
    .split(' ')
    .map((w) => `<span class="word">${esc(w)}</span>`)
    .join(' ')
}

function tabChip(tab: FeatureTab, index: number): string {
  return `<div class="tabChip" data-i="${index}"><span class="tabChipLabel">${esc(tab.label)}</span><span class="tabChipCaption">${esc(tab.caption)}</span></div>`
}

function tagPill(tag: string): string {
  return `<span class="tagPill">${esc(tag)}</span>`
}

function sceneMarkup(scene: Scene, index: number): string {
  const start = sceneStartMs(scene.id)
  const end = start + scene.durationMs
  const wrap = (inner: string) => `<section class="scene" data-scene="${scene.id}" data-start="${start}" data-end="${end}" style="z-index:${index};"><div class="centerCol" data-el="centerCol">${inner}</div></section>`

  switch (scene.kind) {
    case 'hook':
      return wrap(`
          <p class="hookLine" data-el="hookLine">${splitWords(scene.line)}</p>
          <div class="chaosGrid">
            ${scene.chaos.map((c, i) => `<div class="chaosItem" data-el="chaos${i}" data-rot="${[-3, 2, -2, 3][i % 4]}">${esc(c)}</div>`).join('')}
          </div>`)
    case 'change':
      return wrap(`
          <p class="changeLine" data-el="changeLine">${splitWords(scene.line)}</p>`)
    case 'meet':
      return wrap(`
          <p class="meetLine" data-el="meetLine">${splitWords(scene.line)}</p>
          <div class="tabGrid">
            ${scene.tabs.map((t, i) => tabChip(t, i)).join('')}
          </div>`)
    case 'propertyView':
      return wrap(`
          <div class="heroLabel" data-el="heroLabel">PROPROSTER</div>
          <div class="phoneCard">
            <div class="phoneCardNav">
              ${scene.tabs.map((t, i) => `<span class="phoneNavItem" data-i="${i}">${esc(t.label)}</span>`).join('')}
              <div class="phoneNavHighlight" data-el="phoneNavHighlight"></div>
            </div>
            <p class="phoneCardCaption" data-el="phoneCardCaption"></p>
            <div class="phoneCardTags" data-el="phoneCardTags"></div>
          </div>`)
    case 'value':
      return wrap(`
          ${scene.lines.map((l, i) => `<p class="valueLine" data-el="value${i}">${splitWords(l)}</p>`).join('')}`)
    case 'end':
      return wrap(`
          <p class="endWordmark reveal" data-el="endWordmark"><span class="wProp">Prop</span><span class="wRoster">Roster</span></p>
          <p class="endTagline" data-el="endTagline">${splitWords(scene.tagline)}</p>
          <p class="endUrl reveal" data-el="endUrl">${esc(scene.url)}</p>`)
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
    .scene {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      opacity: 0; pointer-events: none;
      /* Safe area: keep all copy within a centered column clear of the
         top status/caption zone and the bottom Reel-controls/caption zone
         social apps draw over vertical video (Step 9, V1 + reconfirmed
         in V1.1). */
      padding: 300px 92px 360px;
    }
    .centerCol { width: 100%; max-width: 880px; text-align: center; transform: scale(1); }
    .reveal { opacity: 0; transform: translateY(28px); will-change: transform, opacity; }
    .word { display: inline-block; opacity: 0; transform: translateY(20px); will-change: transform, opacity; }

    .hookLine { font-size: 60px; font-weight: 750; line-height: 1.22; margin: 0 0 72px; letter-spacing: -0.5px; }
    .chaosGrid {
      display: grid; grid-template-columns: repeat(2, 1fr); gap: 22px;
      max-width: 600px; margin: 0 auto;
    }
    .chaosItem {
      font-size: 30px; font-weight: 650; color: ${BRAND.muted};
      border: 1px solid rgba(143,161,152,0.32); border-radius: 14px;
      padding: 20px 18px; background: rgba(255,255,255,0.025);
      opacity: 0;
    }

    .changeLine { font-size: 64px; font-weight: 750; line-height: 1.24; letter-spacing: -0.5px; }

    .meetLine { font-size: 66px; font-weight: 800; margin: 0 0 56px; letter-spacing: -0.5px; }
    .tabGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .tabChip {
      display: flex; flex-direction: column; gap: 8px; text-align: left;
      border: 1px solid rgba(47,122,92,0.45); border-radius: 16px;
      background: rgba(47,122,92,0.08); padding: 18px 16px;
      opacity: 0; transform: translateY(20px) scale(0.97);
    }
    .tabChipLabel { font-size: 22px; font-weight: 750; color: ${BRAND.ink}; }
    .tabChipCaption { font-size: 14px; line-height: 1.35; color: ${BRAND.muted}; }

    .heroLabel {
      font-size: 15px; font-weight: 800; letter-spacing: 4px; color: ${BRAND.green};
      margin: 0 0 22px; opacity: 0;
    }
    .phoneCard {
      width: 680px; margin: 0 auto; border-radius: 30px;
      border: 1px solid rgba(255,255,255,0.14);
      background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015));
      padding: 30px 26px 42px; position: relative; overflow: hidden;
      box-shadow: 0 40px 100px -40px rgba(47,122,92,0.35);
    }
    .phoneCardNav { position: relative; display: flex; justify-content: space-between; padding-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.12); }
    .phoneNavItem { font-size: 17px; font-weight: 700; color: ${BRAND.muted}; z-index: 1; position: relative; transition: none; }
    .phoneNavHighlight {
      position: absolute; bottom: -1px; height: 3px; width: 16.66%;
      background: ${BRAND.green}; left: 0; border-radius: 3px;
    }
    .phoneCardCaption { font-size: 30px; font-weight: 700; margin: 36px 0 0; min-height: 42px; text-align: left; opacity: 0; }
    .phoneCardTags { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; min-height: 40px; }
    .tagPill {
      font-size: 16px; font-weight: 650; color: ${BRAND.ink};
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14);
      border-radius: 999px; padding: 8px 16px; opacity: 0; transform: translateY(10px);
    }

    .valueLine { font-size: 54px; font-weight: 750; line-height: 1.32; margin: 0 0 20px; letter-spacing: -0.5px; }

    .endWordmark { font-size: 78px; font-weight: 800; margin: 0 0 30px; letter-spacing: -1px; }
    .wProp { color: ${BRAND.ink}; }
    .wRoster { color: ${BRAND.green}; }
    .endTagline { font-size: 30px; font-weight: 600; color: ${BRAND.muted}; margin: 0 0 44px; max-width: 680px; margin-left: auto; margin-right: auto; line-height: 1.35; }
    .endUrl { font-size: 36px; font-weight: 750; color: ${BRAND.green}; letter-spacing: 0.5px; }

    .waveform {
      position: absolute; left: 0; right: 0; bottom: 240px;
      height: 84px; display: flex; align-items: flex-end; justify-content: center; gap: 6px;
      opacity: 0.3; pointer-events: none;
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
      // left-to-right rather than appearing as one block — the
      // "premium SaaS launch video" text-animation pattern.
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

      function cardStyle(el, localMs, delayMs, durMs, rotateDeg) {
        if (!el) return;
        var p = clamp01((localMs - delayMs) / durMs);
        var e = easeOutCubic(p);
        el.style.opacity = String(e);
        var rot = rotateDeg ? (rotateDeg * e) : 0;
        el.style.transform = 'translateY(' + (18 * (1 - e)) + 'px) scale(' + (0.97 + 0.03 * e) + ') rotate(' + rot + 'deg)';
      }

      function pillStyle(el, localMs, delayMs, durMs) {
        if (!el) return;
        var p = clamp01((localMs - delayMs) / durMs);
        var e = easeOutCubic(p);
        el.style.opacity = String(e);
        el.style.transform = 'translateY(' + (10 * (1 - e)) + 'px)';
      }

      // Subtle settle-in scale on the whole centered content column —
      // starts a touch large, eases down to 1 over the scene's first
      // 900ms. Independent of the word-level reveals; a small amount of
      // "Ken Burns"-style motion reads as intentional, not busy.
      function settleScale(container, localMs) {
        if (!container) return;
        var p = clamp01(localMs / 900);
        var e = easeOutCubic(p);
        var scale = 1.035 - 0.035 * e;
        container.style.transform = 'scale(' + scale.toFixed(4) + ')';
      }

      var propertyViewTabs = ${JSON.stringify((REEL_SCENES.find((s) => s.kind === 'propertyView') as Extract<Scene, { kind: 'propertyView' }>).tabs)};

      function setTime(ms) {
        ms = Math.max(0, Math.min(TOTAL_MS - 1, ms));

        // Ambient background spotlight: a slow, fully deterministic drift
        // (function of ms only) so the dark background never feels
        // static, without ever being loud or distracting.
        var spotX = 50 + 6 * Math.sin(ms / 5200);
        var spotY = 8 + 5 * Math.cos(ms / 6100);
        stageEl.style.setProperty('--spot-x', spotX.toFixed(2) + '%');
        stageEl.style.setProperty('--spot-y', spotY.toFixed(2) + '%');

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

          settleScale(s.querySelector('[data-el="centerCol"]'), local);

          var scene = s.getAttribute('data-scene');
          if (scene === 'hook') {
            revealWords(s.querySelector('[data-el="hookLine"]'), local, 0, 55, 460)
            for (var c = 0; c < 4; c++) {
              var chaosEl = s.querySelector('[data-el="chaos' + c + '"]');
              if (chaosEl) cardStyle(chaosEl, local, 520 + c * 190, 460, Number(chaosEl.getAttribute('data-rot')))
            }
          } else if (scene === 'change') {
            revealWords(s.querySelector('[data-el="changeLine"]'), local, 100, 55, 520)
          } else if (scene === 'meet') {
            revealWords(s.querySelector('[data-el="meetLine"]'), local, 0, 55, 460)
            var chips = s.querySelectorAll('.tabChip');
            for (var k = 0; k < chips.length; k++) cardStyle(chips[k], local, 460 + k * 130, 400, 0)
          } else if (scene === 'value') {
            var valueLines = s.querySelectorAll('.valueLine');
            for (var v = 0; v < valueLines.length; v++) revealWords(valueLines[v], local, v * 480, 45, 440)
          } else if (scene === 'end') {
            revealStyle(s.querySelector('[data-el="endWordmark"]'), local, 0, 520)
            revealWords(s.querySelector('[data-el="endTagline"]'), local, 400, 45, 440)
            revealStyle(s.querySelector('[data-el="endUrl"]'), local, 900, 520)
          }
        }

        // Property View scene — the product's hero moment: sweep the tab
        // highlight, swap the caption, and reveal that tab's real content
        // pills, all in lockstep, deterministically, based on elapsed
        // time within the scene.
        var pv = document.querySelector('.scene[data-scene="propertyView"]');
        if (pv) {
          var pvStart = Number(pv.getAttribute('data-start'));
          var pvEnd = Number(pv.getAttribute('data-end'));
          var pvLocal = ms - pvStart;
          revealStyle(pv.querySelector('[data-el="heroLabel"]'), pvLocal, 0, 400)
          var n = propertyViewTabs.length;
          var stepDur = (pvEnd - pvStart) / n;
          var idx = Math.max(0, Math.min(n - 1, Math.floor(pvLocal / stepDur)));
          var withinStep = pvLocal - idx * stepDur;
          var highlight = pv.querySelector('[data-el="phoneNavHighlight"]');
          if (highlight) highlight.style.transform = 'translateX(' + (idx * 100) + '%)';
          var caption = pv.querySelector('[data-el="phoneCardCaption"]');
          if (caption) {
            caption.textContent = propertyViewTabs[idx].label;
            revealStyle(caption, withinStep, 80, 260)
          }
          var tagsEl = pv.querySelector('[data-el="phoneCardTags"]');
          if (tagsEl) {
            var tags = propertyViewTabs[idx].tags;
            var wantHtml = tags.map(function (t) { return '<span class="tagPill">' + t + '</span>'; }).join('');
            if (tagsEl.getAttribute('data-tab-idx') !== String(idx)) {
              tagsEl.innerHTML = wantHtml;
              tagsEl.setAttribute('data-tab-idx', String(idx));
            }
            var pills = tagsEl.querySelectorAll('.tagPill');
            for (var pIdx = 0; pIdx < pills.length; pIdx++) pillStyle(pills[pIdx], withinStep, 160 + pIdx * 90, 320)
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
