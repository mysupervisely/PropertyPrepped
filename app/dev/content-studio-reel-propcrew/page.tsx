'use client'

// PropRoster Content Studio — Feature Reel #3: PropCrew.
//
// Internal/dev-only prototype page, mirroring the other two Reels' own
// preview pages (app/dev/content-studio-reel/page.tsx,
// app/dev/content-studio-reel-property-overview/page.tsx) but for this
// third, independent Reel — a NEW file, so neither of the other two
// Reels' preview pages is touched. Deliberately NOT linked from any
// production navigation. There is no link anywhere in the app pointing
// here; it is reached only by its direct URL.

import { useEffect, useState } from 'react'
import { buildReel3Document } from '../../../lib/content-studio/propcrew-reel/html'
import { REEL3_FPS, REEL3_HEIGHT, REEL3_SCENES, REEL3_TOTAL_MS, REEL3_WIDTH } from '../../../lib/content-studio/propcrew-reel/content'

export default function ContentStudioReelPropCrewPrototype() {
  const [doc, setDoc] = useState<string | null>(null)

  useEffect(() => {
    // Built client-side only — this is a prototype/dev tool, no need for
    // it to participate in SSR or static prerendering.
    setDoc(buildReel3Document())
  }, [])

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 80px', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <div style={{ background: '#fff4d6', border: '1px solid #e8c67a', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 24 }}>
        <strong>Internal prototype — not part of the PropRoster product.</strong> Not linked from
        any production navigation. Feature Reel #3 — PropCrew only. A short landlord story leading
        into the PropCrew reveal, using the one real, supplied PropCrew screenshot (5645 North
        Eagle Highway) with contact phone/email visually masked in this presentation layer only.
      </div>

      <h1 style={{ fontSize: 22, marginBottom: 4 }}>PropRoster Content Studio</h1>
      <p style={{ color: '#666', marginTop: 0 }}>Feature Reel #3 — PropCrew</p>

      <h2 style={{ fontSize: 16, marginTop: 32 }}>Preview Reel</h2>
      <p style={{ fontSize: 13, color: '#666' }}>
        {REEL3_WIDTH}×{REEL3_HEIGHT} · {REEL3_FPS}fps · {(REEL3_TOTAL_MS / 1000).toFixed(1)}s · {REEL3_SCENES.length} scenes.
        This preview auto-plays on a real-time loop for convenience — the actual exported MP4 is
        rendered frame-by-frame from this exact same document (see below), not screen-recorded from
        this preview.
      </p>
      <div
        style={{
          width: '100%', maxWidth: 340, aspectRatio: '9 / 16', margin: '0 auto',
          borderRadius: 16, overflow: 'hidden', border: '1px solid #ddd', background: '#0a0f0c',
        }}
      >
        {doc && (
          <iframe
            title="Reel preview"
            srcDoc={doc}
            style={{ width: REEL3_WIDTH, height: REEL3_HEIGHT, border: 0, transform: `scale(${340 / REEL3_WIDTH})`, transformOrigin: 'top left' }}
          />
        )}
      </div>

      <h2 style={{ fontSize: 16, marginTop: 32 }}>Render / Export Reel</h2>
      <p style={{ fontSize: 13, color: '#666' }}>
        Built on the same shared, deterministic Chromium+FFmpeg render pipeline as the other two
        Reels (scripts/render-reel.mjs), pointed at this Reel&rsquo;s own document builder:
      </p>
      <pre style={{ background: '#0a0f0c', color: '#e7efe9', padding: '14px 16px', borderRadius: 10, fontSize: 12.5, overflowX: 'auto' }}>
{`npm run render:reel3`}
      </pre>
      <p style={{ fontSize: 12.5, color: '#888' }}>
        Writes <code>reel-output/propcrew-reel-v1.mp4</code>. See{' '}
        <code>lib/content-studio/propcrew-reel/</code> for this Reel&rsquo;s content/render modules
        and <code>lib/content-studio/reel-engine.ts</code> for the shared engine all three Reels
        build on.
      </p>
    </div>
  )
}
