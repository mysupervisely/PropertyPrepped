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
// 1. process.env.NODE_ENV !== 'production'. Next.js statically inlines
//    NODE_ENV at build time; `next build` (what Netlify runs) always
//    sets it to 'production'. In that build this condition is the
//    literal value `false`, so `notFound()` unconditionally fires and
//    the Next.js/React compiler treats the rest of this subtree as
//    dead code. This is verified empirically, not just argued: the
//    milestone's validation ran `npm run build && npm run start` (a
//    real production build/serve) and confirmed GET /preview returns
//    404.
// 2. process.env.PREVIEW_MODE === '1' — a plain server-only env var
//    (deliberately NOT NEXT_PUBLIC_-prefixed, so it is never bundled
//    to the client) that must ALSO be set. Netlify's build/runtime
//    environment for proproster.com does not set this variable, and
//    nothing in this codebase sets it automatically — a developer must
//    deliberately export PREVIEW_MODE=1 in their own shell before
//    `npm run dev` to ever see this route, even outside production.
//
// Neither gate touches lib/supabase.ts, real authentication, or RLS —
// this route doesn't call any of them, so there is nothing there to
// bypass or weaken.

import { notFound } from 'next/navigation'

const previewAllowed = process.env.NODE_ENV !== 'production' && process.env.PREVIEW_MODE === '1'

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
