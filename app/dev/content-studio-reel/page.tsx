'use client'

// PropRoster Content Studio — Animated Reel Prototype V1.
//
// Internal/dev-only prototype page. Deliberately NOT linked from any
// production navigation (AuthHeader, LandingPage, dashboard nav, etc.)
// and not meant for ordinary users — it exists only to preview the Reel
// composition and to explain how the real MP4 export is produced. There
// is no link anywhere in the app pointing here; it is reached only by
// its direct URL.
//
// This is intentionally minimal — NOT the future "Content Studio" (no
// script editor, no campaign generation, no clip library). It previews
// exactly what scripts/render-reel.mjs renders to video, using the same
// shared lib/content-studio/reel-html.ts document generator, so preview
// and final export can never drift apart.

import { useEffect, useRef, useState } from 'react'
import { buildReelDocument } from '../../../lib/content-studio/reel-html'
import { REEL_FPS, REEL_HEIGHT, REEL_SCENES, REEL_TOTAL_MS, REEL_WIDTH } from '../../../lib/content-studio/reel-content'

export default function ContentStudioReelPrototype() {
  const [doc, setDoc] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    // Built client-side only — this is a prototype/dev tool, no need for
    // it to participate in SSR or static prerendering.
    setDoc(buildReelDocument())
  }, [])

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 80px', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <div style={{ background: '#fff4d6', border: '1px solid #e8c67a', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 24 }}>
        <strong>Internal prototype — not part of the PropRoster product.</strong> Not linked from
        any production navigation. Proof-of-concept for a future PropRoster Content Studio.
      </div>

      <h1 style={{ fontSize: 22, marginBottom: 4 }}>PropRoster Content Studio</h1>
      <p style={{ color: '#666', marginTop: 0 }}>Animated Reel Prototype — V1</p>

      <h2 style={{ fontSize: 16, marginTop: 32 }}>Preview Reel</h2>
      <p style={{ fontSize: 13, color: '#666' }}>
        {REEL_WIDTH}×{REEL_HEIGHT} · {REEL_FPS}fps · {(REEL_TOTAL_MS / 1000).toFixed(1)}s · {REEL_SCENES.length} scenes.
        This preview auto-plays on a real-time loop for convenience — the actual exported MP4 is
        rendered frame-by-frame from this exact same document (see below), not screen-recorded from
        this preview.
      </p>
      <div
        style={{
          width: '100%', maxWidth: 340, aspectRatio: '9 / 16', margin: '0 auto',
          borderRadius: 16, overflow: 'hidden', border: '1px solid #ddd', background: '#0b100d',
        }}
      >
        {doc && (
          <iframe
            ref={iframeRef}
            title="Reel preview"
            srcDoc={doc}
            style={{ width: REEL_WIDTH, height: REEL_HEIGHT, border: 0, transform: `scale(${340 / REEL_WIDTH})`, transformOrigin: 'top left' }}
          />
        )}
      </div>

      <h2 style={{ fontSize: 16, marginTop: 32 }}>Render / Export Reel</h2>
      <p style={{ fontSize: 13, color: '#666' }}>
        A real, downloadable MP4 (H.264, {REEL_WIDTH}×{REEL_HEIGHT}) is produced by an isolated
        Node script — headless Chromium captures this exact document frame-by-frame at a
        deterministic clock, then FFmpeg encodes the frames to video. This requires a real browser
        + FFmpeg on the machine running it, which a browser button click / Netlify function cannot
        do within a request — so V1 exports via a terminal command rather than a live in-page
        button:
      </p>
      <pre style={{ background: '#0b100d', color: '#e7efe9', padding: '14px 16px', borderRadius: 10, fontSize: 12.5, overflowX: 'auto' }}>
{`npm run render:reel`}
      </pre>
      <p style={{ fontSize: 12.5, color: '#888' }}>
        Writes <code>reel-output/propRoster-reel-v1.mp4</code>. See{' '}
        <code>scripts/render-reel.mjs</code> for the render pipeline.
      </p>
    </div>
  )
}
