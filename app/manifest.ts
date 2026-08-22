// PropRoster — PWA/Mobile Installability V1.
//
// The Web App Manifest — served at /manifest.webmanifest (Next.js's
// standard convention for an app/manifest.ts file). Referenced from
// app/layout.tsx via `metadata.manifest` (Next.js does NOT auto-link a
// manifest.ts file into <head> just because it exists — the metadata
// object has to point at it explicitly).
//
// icons: 192x192 and 512x512 are the two sizes every installability
// checklist (Chrome/Android, Lighthouse) actually requires. Both are
// marked "any maskable" from the SAME file rather than shipping a
// second, separately-padded maskable variant — the icon art itself
// (public/icons/icon-*.png, derived from the existing PropRoster house+R
// brand mark, see that mark's own upload for the source) already keeps
// its glyph well within a centered safe zone on a full-bleed background,
// so it's already correct whether rendered "as-is" (any) or clipped to
// a circle/squircle by the OS (maskable).
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PropRoster',
    short_name: 'PropRoster',
    description: 'Organize properties, track finances, manage documents and analyze real estate opportunities with PropRoster.',
    start_url: '/',
    // Root scope — every route in the app stays inside the installed
    // app's own window instead of escaping to a normal browser tab,
    // which is what would otherwise reset the app-like experience
    // (Section 6) and could interrupt the signed-in session's continuity
    // (Section 7).
    scope: '/',
    display: 'standalone',
    // A soft, phone-friendly default — not a hard lock (no Screen
    // Orientation API lock is used anywhere in this milestone), just the
    // preferred orientation most browsers honor when the app is
    // launched standalone. Matches how every existing page here is
    // already primarily designed and tested for portrait mobile use.
    orientation: 'portrait-primary',
    background_color: '#f5f7f9', // var(--bg)
    theme_color: '#204b3b', // var(--brand)
    // Each size listed twice (once with no `purpose`, defaulting to
    // "any" per the manifest spec, once as "maskable") rather than the
    // spec's space-separated "any maskable" shorthand — Next's own
    // MetadataRoute.Manifest type only accepts one purpose value per
    // entry. Same two files either way; both purposes are valid for
    // this art (full-bleed background, glyph within a centered safe
    // zone), so nothing is duplicated except the manifest entry itself.
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
