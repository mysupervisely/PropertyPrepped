import type { Metadata, Viewport } from 'next'
import './globals.css'
import { GoogleAnalytics } from '../components/GoogleAnalytics'
import { ServiceWorkerRegistration } from '../components/ServiceWorkerRegistration'
import { InstallPrompt } from '../components/InstallPrompt'

// PWA/Mobile Installability V1 additions below — everything else in
// this metadata object is unchanged.
export const metadata: Metadata = {
  title: 'PropRoster | Real Estate Portfolio Management & Investment Tools',
  description: 'Organize properties, track finances, manage documents and analyze real estate opportunities with PropRoster.',
  // Points at app/manifest.ts (served at /manifest.webmanifest) — Next.js
  // does not auto-link a manifest.ts file into <head> just because it
  // exists; this is what actually renders <link rel="manifest" ...>.
  manifest: '/manifest.webmanifest',
  // Apple's own home-screen metadata (Section 4) — apple-touch-icon
  // itself is picked up automatically from app/apple-icon.png (Next.js's
  // file-convention icon system), so it isn't repeated here.
  appleWebApp: {
    capable: true,
    title: 'PropRoster',
    // 'default' keeps a normal opaque status bar rather than drawing
    // content underneath it (which 'black-translucent' would do) — the
    // conservative choice for a V1 that isn't redesigning anything
    // (Section 9); the home-indicator/notch safe areas are still
    // handled below via viewport-fit=cover + env(safe-area-inset-*).
    statusBarStyle: 'default',
  },
  other: {
    // Next's typed `appleWebApp.capable` only renders the modern generic
    // `mobile-web-app-capable` tag. The legacy Apple-specific tag below
    // is what iOS Safari has recognized for standalone/home-screen mode
    // since iOS 1.1.3, well before Safari read the Web App Manifest's
    // own `display` field for this — since iPhone is this milestone's
    // primary manual-test target, both are included rather than relying
    // on newer iOS versions' manifest support alone.
    'apple-mobile-web-app-capable': 'yes',
  },
}

// Section 4/10: viewport-fit=cover lets the app draw edge-to-edge on
// notch/home-indicator devices when launched standalone (part of
// "feels like an app," Section 6) — width/initialScale are repeated
// here unchanged from Next's own defaults specifically so adding this
// export doesn't silently drop them (Section 9: preserve existing
// responsive behavior). The corresponding env(safe-area-inset-*) padding
// that keeps content clear of the notch/home indicator lives in
// app/globals.css's `body` rule.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#204b3b', // var(--brand)
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
      {/* Global GA4 site tag (components/GoogleAnalytics.tsx) — loaded
          once here so every route gets it, matching next/script's own
          documented "Application Scripts" pattern for a root-layout
          third-party script. */}
      <GoogleAnalytics />
      {/* PWA/Mobile Installability V1 — both render nothing visible by
          default; see each component's own top comment. */}
      <ServiceWorkerRegistration />
      <InstallPrompt />
    </html>
  )
}
