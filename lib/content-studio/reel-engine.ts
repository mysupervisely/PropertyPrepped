// PropRoster Content Studio — shared reel-rendering engine.
//
// Extracted so a second (and future) independent Reel definition can
// reuse the original Reel's proven, deterministic crossfade/reveal/
// ambient-background machinery — including the V1.3 fix for the
// one-frame crossfade-opacity bug — without re-deriving it and risking
// reintroducing that class of bug, and without duplicating the whole
// rendering engine per Reel.
//
// IMPORTANT: the original, approved Reel (lib/content-studio/
// reel-content.ts / reel-html.ts, driven by scripts/render-reel.mjs)
// does NOT import this file and is completely untouched by its
// existence — it keeps its own inline copies of this logic exactly as
// approved. This module exists purely for new reels (starting with
// lib/content-studio/property-overview/) to build on, so the original
// Reel carries zero risk from future reels' changes.
//
// Structured as inline JS *source text* (not real importable runtime
// functions) because this code runs inside the rendered HTML document's
// own <script> tag in headless Chromium — the document must stay a
// single self-contained file with zero external requests, so "reusing"
// this module means concatenating its source text into the page at
// build time (in Node), not a browser-side ES module graph.

export type EngineBrand = { bg: string; bgAlt: string; ink: string; green: string }

export function engineBaseCss(brand: EngineBrand): string {
  return `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: ${brand.bg}; overflow: hidden; }
    .scene { position: absolute; inset: 0; opacity: 0; pointer-events: none; }
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
    .waveform {
      position: absolute; left: 0; right: 0; bottom: 240px; z-index: 2;
      height: 84px; display: flex; align-items: flex-end; justify-content: center; gap: 6px;
      opacity: 0.28; pointer-events: none;
    }
    .wfBar { width: 8px; border-radius: 4px; background: ${brand.green}; height: 10px; }
  `
}

export function waveformBarsMarkup(bars = 28): string {
  let out = ''
  for (let i = 0; i < bars; i++) out += `<div class="wfBar" data-i="${i}"></div>`
  return out
}

export function engineStageBackground(brand: EngineBrand): string {
  return `radial-gradient(120% 90% at var(--spot-x, 50%) var(--spot-y, 0%), ${brand.bgAlt} 0%, ${brand.bg} 62%)`
}

// The shared per-frame engine, as inline JS source text. `perSceneJs` is
// a string of JS that runs INSIDE the per-scene loop, with `s` (the
// .scene element), `kind` (its data-kind), `local` (elapsed ms since
// the scene's own start — negative during the pre-roll crossfade),
// `start`/`end` already in scope; it should dispatch on `kind` to
// animate that scene's reel-specific content.
export function engineScript(opts: { totalMs: number; fps: number; perSceneJs: string; stageId?: string }): string {
  const stageId = opts.stageId || 'stage'
  return `
    (function () {
      var TOTAL_MS = ${opts.totalMs};
      var scenes = Array.prototype.slice.call(document.querySelectorAll('.scene'));
      var wfBars = Array.prototype.slice.call(document.querySelectorAll('.wfBar'));
      var stageEl = document.getElementById('${stageId}');

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

      // Subtle settle-in scale on the whole centered content column.
      function settleScale(container, localMs) {
        if (!container) return;
        var p = clamp01(localMs / 700);
        var e = easeOutCubic(p);
        var scale = 1.03 - 0.03 * e;
        container.style.transform = 'scale(' + scale.toFixed(4) + ')';
      }

      // Slow, deterministic "Ken Burns" zoom (+ an optional very subtle
      // continuous pan) — a pure function of elapsed time within the
      // scene only (clamped to [0,1] progress), so it is exactly
      // reproducible frame-by-frame, never resets mid-scene, and has no
      // discontinuity at either end. Pan defaults to 0 for callers that
      // only want a zoom.
      function kenBurns(img, localMs, durationMs, fromScale, toScale, fromXPct, toXPct, fromYPct, toYPct) {
        if (!img) return;
        fromXPct = fromXPct || 0; toXPct = toXPct || 0; fromYPct = fromYPct || 0; toYPct = toYPct || 0;
        var p = clamp01(localMs / durationMs);
        var scale = fromScale + (toScale - fromScale) * p;
        var x = fromXPct + (toXPct - fromXPct) * p;
        var y = fromYPct + (toYPct - fromYPct) * p;
        img.style.transform = 'translate(' + x.toFixed(3) + '%, ' + y.toFixed(3) + '%) scale(' + scale.toFixed(4) + ')';
      }

      // Piecewise-linear interpolation across an array of keyframe
      // objects (sorted ascending by .t) — ONE continuous formula, no
      // per-segment resets: clamps to the first keyframe's values before
      // it and the last keyframe's values after it, and linearly
      // interpolates every named numeric field between the two
      // bracketing keyframes otherwise. Because consecutive segments
      // share their boundary keyframe's exact values, the result is
      // continuous across the whole range by construction — there is no
      // seam where a "next segment" could start from a different value
      // than the "previous segment" ended on.
      function lerpKeyframes(keyframes, t, fields) {
        if (t <= keyframes[0].t) return keyframes[0];
        var last = keyframes[keyframes.length - 1];
        if (t >= last.t) return last;
        for (var i = 0; i < keyframes.length - 1; i++) {
          var a = keyframes[i], b = keyframes[i + 1];
          if (t >= a.t && t <= b.t) {
            var p = (t - a.t) / (b.t - a.t);
            var out = {};
            for (var f = 0; f < fields.length; f++) {
              var key = fields[f];
              out[key] = a[key] + (b[key] - a[key]) * p;
            }
            return out;
          }
        }
        return last;
      }

      function setTime(ms) {
        ms = Math.max(0, Math.min(TOTAL_MS - 1, ms));

        // Ambient background spotlight: a slow, fully deterministic
        // drift so the dark background never feels static.
        var spotX = 50 + 6 * Math.sin(ms / 5200);
        var spotY = 8 + 5 * Math.cos(ms / 6100);
        stageEl.style.setProperty('--spot-x', spotX.toFixed(2) + '%');
        stageEl.style.setProperty('--spot-y', spotY.toFixed(2) + '%');

        for (var i = 0; i < scenes.length; i++) {
          var s = scenes[i];
          var start = Number(s.getAttribute('data-start'));
          var end = Number(s.getAttribute('data-end'));
          // Single continuous crossfade curve across the whole active
          // window [start-FADE, end] — see reel-html.ts's V1.3 comment
          // for the full history of the one-frame flash-to-black bug
          // this formula fixes. fadeIn ramps 0->1 over
          // [start-FADE, start] (reaching exactly 1 AT start, no gap);
          // fadeOut ramps 1->0 over [end-FADE, end] (reaching exactly 0
          // AT end, since scene durations are exact multiples of the
          // frame step) — one unbranched min(fadeIn, fadeOut), no
          // competing formulas, inclusive "ms <= end" upper bound.
          var FADE = 220;
          var active = ms >= start - FADE && ms <= end;
          if (!active) { s.style.opacity = '0'; continue; }
          var local = ms - start;
          var fadeIn = clamp01((ms - (start - FADE)) / FADE);
          var fadeOut = clamp01((end - ms) / FADE);
          s.style.opacity = String(Math.min(fadeIn, fadeOut));

          settleScale(s.querySelector('[data-el="centerCol"]'), local);

          var kind = s.getAttribute('data-kind');
          ${opts.perSceneJs}
        }

        // Restrained animated waveform, deterministic function of time —
        // not random per frame, so re-rendering a frame is reproducible.
        for (var b = 0; b < wfBars.length; b++) {
          var phase = b * 0.35;
          var h = 10 + 34 * (0.5 + 0.5 * Math.sin(ms / 420 + phase));
          wfBars[b].style.height = h.toFixed(1) + 'px';
        }
      }

      window.__REEL__ = { setTime: setTime, totalMs: TOTAL_MS, fps: ${opts.fps} };

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
}
