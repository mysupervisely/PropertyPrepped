// Mobile Preview harness — Part 2 of the mobile visual-QA milestone.
//
// WHY THIS EXISTS: the sandbox this work was built in cannot reach a
// real Supabase backend (see mobile-preview/README.md), so the actual
// authenticated dashboard/property/maintenance/etc. screens could not
// be visually verified. This route renders the SAME design system —
// the real app/globals.css classes, the real MobileBottomNav and
// Wordmark components — arranged to match the real app's layouts, but
// populated entirely with fictional fixture data (app/preview/_lib/fixtures.ts)
// instead of live Supabase queries. It exists purely so the mobile
// experience can be looked at and screenshotted; it is not a second
// product surface, has no forms that write anywhere, and makes no
// Supabase or API calls of any kind — grep this directory for
// "supabase" or "fetch(" and there is nothing to find.
//
// WHY IT CANNOT REACH PRODUCTION — two independent gates, both must
// pass, checked server-side before anything under app/preview/ renders:
//
// 1. Not a production build/deploy. Two different signals feed this,
//    because "production" means something different locally vs. on
//    Netlify:
//      - On Netlify, every deploy context (production, deploy-preview,
//        branch-deploy) runs `next build` with NODE_ENV forced to
//        'production' — that variable alone can't tell them apart.
//        Netlify separately and automatically injects CONTEXT
//        ('production' | 'deploy-preview' | 'branch-deploy' | 'dev'),
//        which DOES tell them apart, and is what decides this on
//        Netlify.
//      - Anywhere else (this sandbox, a developer's own machine —
//        CONTEXT is simply unset there), NODE_ENV is the real signal:
//        `next build` sets it to 'production', `next dev` doesn't.
//    Verified empirically, not just argued: ran `npm run build && npm
//    run start` in this sandbox (no CONTEXT, NODE_ENV=production) and
//    confirmed GET /preview returns 404 with zero fixture content.
// 2. process.env.PREVIEW_MODE === '1' — a plain server-only env var
//    (deliberately NOT NEXT_PUBLIC_-prefixed, so it is never bundled
//    to the client) that must ALSO be set. proproster.com's production
//    context does not set this variable, and nothing in this codebase
//    sets it automatically. Where it IS set on Netlify, it's scoped
//    narrowly to the 'branch-deploy' context only (Team → Site
//    configuration → Environment variables) — never 'production',
//    never 'all'.
//
// Neither gate touches lib/supabase.ts, real authentication, or RLS —
// this route doesn't call any of them, so there is nothing there to
// bypass or weaken.

import { notFound } from 'next/navigation'

const netlifyContext = process.env.CONTEXT
const isProductionBuild = netlifyContext ? netlifyContext === 'production' : process.env.NODE_ENV === 'production'
const previewAllowed = !isProductionBuild && process.env.PREVIEW_MODE === '1'

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  if (!previewAllowed) {
    notFound()
  }

  return (
    <div className="previewRoot">
      <div className="previewBanner">
        PREVIEW MODE — fictional fixture data, not connected to any real account or database
      </div>
      {children}
    </div>
  )
}
