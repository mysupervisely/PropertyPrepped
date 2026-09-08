# Netlify Deploy Preview Environment Debug

Investigation into why PR #55's Netlify Deploy Preview shows the app's
"Connect Supabase" fallback screen even though the Netlify UI showed
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` configured
for every deploy context, and a cache-free rebuild at the latest commit
didn't fix it.

## Root cause (confirmed, not guessed)

**There are two separate Netlify sites/projects connected to this
GitHub repository, under the same team, and only one of them has any
environment variables configured at all.**

| | Site name | Site ID | Primary URL | Env vars configured |
|---|---|---|---|---|
| **Serves production** | `sensational-platypus-3da0b7` | `e803632d-8684-4d4d-94d4-67b22b77869a` | `https://proproster.com` (custom domain) | Fully configured — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and every other secret (Stripe, Anthropic, Resend, etc.), across `production`/`deploy-preview`/`branch-deploy`/`dev`/`dev-server` contexts as applicable. |
| **Generates PR previews** | `propprepped` | `76bb2bb2-d190-443f-8dfe-6c6671b46211` | `http://propprepped.netlify.app` | **Zero environment variables of any kind.** Confirmed via a direct read of this site's env var list — the response was an empty array. |

Both sites are on the same Netlify team (`mysupervisely` / "Supervisely",
team id `6a30c2e1c58ac487ea8dc866`). PR #55's "Deploy Preview for
propprepped ready!" comment, and the
`deploy-preview-55--propprepped.netlify.app` URL, both confirm the
preview was built and served by the `propprepped` site — the one with
no environment variables configured — not by the
`sensational-platypus-3da0b7` site that actually serves
`proproster.com` and that the product owner almost certainly checked
in the Netlify UI when verifying "all deploy contexts have the value."

This fully explains every observed symptom:
- The build **succeeds** — `next build` doesn't require these env vars
  to complete; `isSupabaseConfigured` (see below) simply evaluates to
  `false` and the app renders its own graceful fallback instead of
  crashing.
- **"Retry without cache with latest branch commit" didn't help** —
  there is no cache issue. The `propprepped` site's build environment
  is genuinely empty; rebuilding it, with or without cache, produces
  the exact same (empty) environment every time.
- The Netlify UI verification was **real and accurate** — for the site
  it was checked on. It just wasn't the site generating the preview.

## Section 1: how the app detects Supabase config

`lib/supabase.ts` (a plain module, imported by `app/page.tsx`, a
`'use client'` component):

```ts
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
export const isSupabaseConfigured = Boolean(url && key)
export const supabase: SupabaseClient | null = isSupabaseConfigured ? createClient(url!, key!, {...}) : null
```

`app/page.tsx` line ~1750: `if (!isSupabaseConfigured) { ...renders the
"Connect Supabase" screen... }`.

**This is read at BUILD time, not runtime.** Because
`NEXT_PUBLIC_*`-prefixed variables are inlined by Next.js's build-time
static replacement (the standard Next.js env-var mechanism — this repo
has no custom webpack/env-loading override; see Section 2), whatever
value (or `undefined`) exists in the environment `next build` runs in
gets baked directly into the client JavaScript bundle. A missing env
var at build time can never be fixed by anything that happens after
the build — not a cache-free retry, not a runtime env var added
later — only a rebuild with the variable actually present at build
time. `lib/supabase-server.ts` reads the same two vars server-side, on
every server component/route render (genuinely runtime there), but the
fallback screen itself is driven by the client-side module above.

No server components, route handlers, middleware, or Netlify Functions
gate on these two vars in a way that would explain the symptom
differently — the single, exact condition is `lib/supabase.ts`'s
`isSupabaseConfigured`, consumed by `app/page.tsx`.

## Section 2: Next.js env handling

- No `next.config.js`/`.ts`/`.mjs` exists in this repo at all — default
  Next.js configuration, no custom env loading, no webpack override,
  no runtime config indirection.
- No hardcoded `NODE_ENV` branching around Supabase config exists
  anywhere in the codebase.
- `.env.example` documents `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` as
  "(required)" — consistent with the fallback screen's own message.
- Nothing in the repo distinguishes preview vs. production env
  loading — that responsibility is entirely Netlify's (injecting
  whichever site's configured variables into the build), which is
  exactly where this investigation found the actual gap.

## Section 3: Netlify config files

**None exist in this repository.** No `netlify.toml` at the root or
anywhere else, no `netlify/*.toml`, no committed Netlify plugin
config. This means every Netlify-side setting — build command, publish
directory, environment variables, and framework detection — lives
purely in each site's own Netlify dashboard configuration, entirely
independent of anything in this repo. There is no repo-side
`[context.deploy-preview]` override clearing env vars, changing the
build command, or pointing preview builds at a different directory —
the absence of any such file rules that hypothesis out conclusively,
not just by assumption.

## Section 4: project/site ID mismatch — CONFIRMED

Two Netlify sites exist under the same team, found via a direct
Netlify API query (not assumed from screenshots alone):

- `propprepped` (site id `76bb2bb2-d190-443f-8dfe-6c6671b46211`) — 0
  environment variables configured, of any kind, in any context.
- `sensational-platypus-3da0b7` (site id
  `e803632d-8684-4d4d-94d4-67b22b77869a`) — fully configured, and its
  primary URL is the production custom domain `proproster.com`.

No `.netlify/state.json`, no `NETLIFY_SITE_ID` reference, and no other
Netlify-linkage metadata exists anywhere in this repository or this
workspace — confirming both site linkages were configured entirely on
the Netlify account side (e.g., two separate "Import from Git"
connections to the same GitHub repo), not through any repo file.

## Section 5: GitHub/Netlify integration target

PR #55's own deploy-preview comment ("Deploy Preview for `propprepped`
ready!") and its preview URL
(`deploy-preview-55--propprepped.netlify.app`) both confirm: **GitHub
PR previews for this repository are wired to the `propprepped` site**,
the one with zero environment variables — not to
`sensational-platypus-3da0b7`, the site that actually serves
production traffic at `proproster.com`. Both sites are genuinely
connected to the same GitHub repository; this was not disproven, it
was directly confirmed as the actual configuration.

## Section 6: safe diagnostic added

New temporary route: `GET /api/diagnostics/deploy-env` — visitable
directly in a browser on any deploy (preview or production), no CLI or
dashboard access needed. Returns only:

```json
{
  "SUPABASE_URL_PRESENT": true,
  "SUPABASE_ANON_KEY_PRESENT": true,
  "NETLIFY_CONTEXT": "deploy-preview",
  "BRANCH": "claude/upload-reliability-real-device-diagnostics",
  "COMMIT_REF": "9037618934d6",
  "DEPLOY_ID": "...",
  "SITE_URL": "...",
  "DEPLOY_PRIME_URL": "..."
}
```

Never returns the actual URL/key value or any other secret — booleans
and Netlify's own documented, non-secret deployment metadata
(`CONTEXT`/`BRANCH`/`COMMIT_REF`/`DEPLOY_ID`/`URL`/`DEPLOY_PRIME_URL`)
only. `force-dynamic` so it always reflects the actual running deploy,
never a cached/static response. **Delete this route once the site
mismatch is resolved and this kind of self-check is no longer needed.**

Expected output on the current (broken) `propprepped` preview:
`SUPABASE_URL_PRESENT: false`, `SUPABASE_ANON_KEY_PRESENT: false`.
Expected on production (`proproster.com`) or a preview correctly built
by `sensational-platypus-3da0b7`: both `true`.

## Section 7: build-log/context variables

Netlify's own documented build+runtime environment variables
(https://docs.netlify.com/configure-builds/environment-variables/) —
`CONTEXT` (`production`/`deploy-preview`/`branch-deploy`/`dev`),
`BRANCH`, `COMMIT_REF`, `DEPLOY_ID`, `URL`, `DEPLOY_PRIME_URL` — are
exactly what the new diagnostic route surfaces. No undocumented
assumption was made about their availability; they are Netlify's
standard, documented set, present in both the build and (for
Next.js-on-Netlify) the function runtime.

## Manual Netlify steps required to fix (not performed by this branch)

This is an account-configuration fix, not a code fix — nothing in this
repo can resolve it, and per this milestone's own instructions, no
Netlify setting was changed from this branch. To fix:

1. In the Netlify dashboard, confirm which site GitHub's PR-preview
   integration is actually attached to for this repository (currently:
   `propprepped`).
2. Either (a) copy `sensational-platypus-3da0b7`'s environment
   variables into `propprepped` (all contexts that need them, at
   minimum `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
   for Deploy Previews to work at all — but `propprepped` currently
   has none of the OTHER vars either, e.g. no `ANTHROPIC_API_KEY`,
   meaning Document Intelligence/Stripe/etc. would also silently be
   "not configured" on every preview built there until fixed), or (b)
   change which Netlify site GitHub's PR-preview deploys are attached
   to, pointing PR previews at `sensational-platypus-3da0b7` instead
   (its own branch-deploy URL is `main--sensational-platypus-3da0b7.
   netlify.app`, suggesting it's already capable of building
   non-production branches).
3. Re-trigger a preview build for PR #55 (a new commit, or "Retry" as
   before) — this time on the corrected site — and confirm
   `/api/diagnostics/deploy-env` reports `true`/`true` before doing any
   further app-level testing.

## Whether fixing this should allow PR #55 real-device testing

Yes — this is the sole blocker found. Once the preview is generated by
a site with the Supabase env vars actually present, the app's own
"Connect Supabase" fallback goes away and the actual Upload Reliability
functionality in PR #55 becomes testable on a real device.

## Risk to production

None. Production (`proproster.com` / `sensational-platypus-3da0b7`) was
not touched, queried destructively, or reconfigured — its environment
variables were only read, never written. No Netlify setting was
changed anywhere by this investigation.
