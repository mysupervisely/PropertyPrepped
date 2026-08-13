# hero-property.jpg

The signed-out landing page's (`/`) hero background. Referenced via CSS
`background-image` in `app/globals.css`'s `.landingHeroBg` rule, layered
over a warm gradient fallback — if this file is ever removed, the page
still renders correctly (just the gradient, no broken-image state).

Current file: a warm, dusk-lit, contemporary single-family home — no
people, no identifiable street address, optimized to ~220KB (resized to
1536px wide, progressive JPEG, quality 78 via `sharp`) from a larger
source. If you replace it, keep it in the same rough size/quality range
(a multi-megabyte unoptimized image will hurt page load) and keep the
filename `hero-property.jpg`, or update the path in
`.landingHeroBg` if you use a different filename/format.
