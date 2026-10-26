# PropRoster Minimalist Design Foundation V2

Status: Design specification for review, not approval to merge or deploy.
Target: Existing draft PR #91, branch `claude/design-foundation-v1-desktop-workspace`.
Owner: ChatGPT design direction, product-owner final approval.

## Approved direction
Minimalist, clean, professional, app-ready. Predominantly white surfaces with subtle dividers and restrained use of the existing green brand accent. No stacked cards, thick panel borders, oversized pills, decorative gradients, heavy shadows, oversized headings, or redundant controls.

## Existing code observations
PR #91 already provides functional two-column desktop workspaces with responsive mobile overlays. Preserve this behavior and the underlying Tenant Connect and Maintenance business logic. Existing CSS uses green outlined selected rows, bordered white panel wrappers, and nested detail cards that make the result visually busy. Simplify these before adding anything new.

## Tenant Connect
Desktop >=1024px: 320-360px compact conversation list beside a flexible thread pane. Conversations should read as rows separated by subtle hairlines, with tenant name, timestamp, property, short preview, and understated unread state. Use a thin green selected-row accent, not a thick border or full green block. Message area has compact header, readable thread, and modest composer. Preserve search, Messages/Tenants tabs, photo attachment, sending, unread logic, and maintenance context links.

Mobile <1024px: one-column compact list and existing tap-to-open conversation flow. Keep accessible controls and back navigation. Do not force a two-column desktop layout on mobile.

## Maintenance
Desktop >=1024px: compact issue rows in the left rail and selected case in the flexible right pane. Row hierarchy: issue, property, status, with secondary information visually quiet. Remove row-by-row outlined cards and redundant status decorations. In detail pane show title/status, meaningful request context, and one prominent next action; preserve availability, provider, scheduling, escalation, PropCrew, and advanced actions through sensible progressive disclosure. Never conceal urgent or safety-critical messaging.

Mobile <1024px: simple request list with existing detail overlay, appropriately sized tap targets, and no horizontal overflow.

## Layout and tokens
Reuse current semantic tokens in `app/globals.css` including `--brand`, `--surface`, `--line`, `--text`, `--muted`, and type/spacing tokens. Prefer flat regions and fine separators over nested rounded panels. Fill the available desktop width without unnecessarily wide text lines. Use a quiet, unboxed empty state. Do not introduce a new global sidebar or alter the site-wide navigation in this milestone.

## Future app readiness
Build consistent responsive interactions, clear mobile navigation and reusable presentational components. Do not introduce React Native, Capacitor, a native shell, or a new backend in this phase.

## Engineering constraints
No database migration, production data modification, auth/RLS/query rewrite, notification changes, Stripe changes, or unrelated redesign. Reuse the existing `threadBody()`, `MaintenanceCaseDetail` panel variant and real workflow controls. Avoid fabricated UI actions or mock data in production.

## Review process
1. Review visual references with the product owner before implementing styling.
2. Apply approved visual changes on PR #91 only.
3. Capture actual screenshots at 375, 768, 1024 and 1440px, including selected conversation and selected request.
4. Run typecheck, focused/full tests and build.
5. Keep PR #91 draft, unmerged and not deployed to production until explicit approval.
