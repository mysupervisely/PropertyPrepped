'use client'

// PropRoster — Google Analytics 4 (GA4) global site tag.
//
// Loaded once from the root layout (app/layout.tsx) so every route gets
// it for free, the same way AuthHeader/AuthNavMenu are the one shared
// mechanism for navigation rather than each page wiring its own copy.
// This is the ONLY place gtag.js is loaded anywhere in the codebase
// (confirmed before writing this — no prior Google tag existed), so
// there is no duplicate-tag risk.
//
// Two things follow Google's own current gtag.js installation snippet
// exactly (script tag + inline dataLayer/gtag bootstrap, "config"
// called once on load):
//   - GoogleTagScript: the external https://www.googletagmanager.com/gtag/js
//     loader, via next/script's default "afterInteractive" strategy —
//     Next.js's own documented "Application Scripts" pattern for a
//     third-party script that should load on every route
//     (node_modules/next/dist/docs/01-app/02-guides/scripts.md).
//   - The inline bootstrap script that defines window.dataLayer/gtag and
//     fires the initial `gtag('config', ...)` call.
//
// Client-side navigation: the Next.js App Router never does a full page
// reload between routes, so gtag's own initial `config` call — which
// only runs once, on first script load — would otherwise be the only
// pageview GA4 ever sees. usePathname() is used (not useSearchParams(),
// which would force this component's page into a Suspense boundary and
// risk de-opting every currently-static page in the app to client-side
// rendering — see Next.js docs) to re-fire `gtag('config', ...)` with
// the new page_path on every route change, so subsequent client-side
// navigations are tracked as real GA4 pageviews too.
//
// The measurement ID is a public GA4 identifier, not a secret — Google
// documents it as safe to ship client-side (it appears in the rendered
// HTML of every GA4-tracked site). No env var indirection needed.

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

const GA_MEASUREMENT_ID = 'G-GHBYB28H50'

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag: (...args: unknown[]) => void
  }
}

export function GoogleAnalytics() {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
    // Every client-side route change after the initial load re-reports
    // the new path as its own pageview — see top comment.
    window.gtag('config', GA_MEASUREMENT_ID, { page_path: pathname })
  }, [pathname])

  return (
    <>
      <Script strategy="afterInteractive" src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){ window.dataLayer.push(arguments); }
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}');
        `}
      </Script>
    </>
  )
}
