'use client'

// PropRoster Content Studio — Feature Reel #2: Property Overview.
//
// Internal/dev-only prototype page, mirroring the original Reel's own
// preview page (app/dev/content-studio-reel/page.tsx) but for this
// second, independent Reel — a NEW file, so the original Reel's preview
// page is never touched. Deliberately NOT linked from any production
// navigation and not meant for ordinary users — it exists only to
// preview this Reel's composition and explain how the real MP4 export
// is produced. There is no link anywhere in the app pointing here; it
// is reached only by its direct URL.

import { useEffect, useState } from 'react'
import { buildReel2Document } from '../../../lib/content-studio/property-overview/html'
import { REEL2_FPS, REEL2_HEIGHT, REEL2_SCENES, REEL2_TOTAL_MS, REEL2_WIDTH } from '../../../lib/content-studio/property-overview/content'

export default function ContentStudioReelPropertyOverviewPrototype() {
  const [doc, setDoc] = useState<string | null>(null)

  useEffect(() => {
    // Built client-side only — this is a prototype/dev tool, no need for
    // it to participate in SSR or static prerendering.
    setDoc(buildReel2Document())
  }, [])

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 80px', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <div style={{ background: '#fff4d6', border: '1px solid #e8c67a', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 24 }}>
        <strong>Internal prototype — not part of the PropRoster product.</strong> Not linked from
        any production navigation. Feature Reel #2 — Property Overview only (no Rent, PropCrew,
        Tax, Documents, or Search screenshots — those are reserved for future posts).
      </div>

      <h1 style={{ fontSize: 22, marginBottom: 4 }}>PropRoster Content Studio</h1>
      <p style={{ color: '#666', marginTop: 0 }}>Feature Reel #2 — Property Overview</p>

      <h2 style={{ fontSize: 16, marginTop: 32 }}>Preview Reel</h2>
      <p style={{ fontSize: 13, color: '#666' }}>
        {REEL2_WIDTH}×{REEL2_HEIGHT} · {REEL2_FPS}fps · {(REEL2_TOTAL_MS / 1000).toFixed(1)}s · {REEL2_SCENES.length} scenes.
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
            style={{ width: REEL2_WIDTH, height: REEL2_HEIGHT, border: 0, transform: `scale(${340 / REEL2_WIDTH})`, transformOrigin: 'top left' }}
          />
        )}
      </div>

      <h2 style={{ fontSize: 16, marginTop: 32 }}>Render / Export Reel</h2>
      <p style={{ fontSize: 13, color: '#666' }}>
        Built on the same shared, deterministic Chromium+FFmpeg render pipeline as the original
        Reel (scripts/render-reel.mjs), pointed at this Reel&rsquo;s own document builder:
      </p>
      <pre style={{ background: '#0a0f0c', color: '#e7efe9', padding: '14px 16px', borderRadius: 10, fontSize: 12.5, overflowX: 'auto' }}>
{`npm run render:reel2`}
      </pre>
      <p style={{ fontSize: 12.5, color: '#888' }}>
        Writes <code>reel-output/propertyOverview-reel-v1.mp4</code>. See{' '}
        <code>lib/content-studio/property-overview/</code> for this Reel&rsquo;s content/render
        modules and <code>lib/content-studio/reel-engine.ts</code> for the shared engine both
        Reels build on.
      </p>
    </div>
  )
}
