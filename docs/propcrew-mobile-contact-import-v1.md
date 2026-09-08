# PropCrew — Mobile Contact Import V1

Improves how a landlord adds someone they already know to PropCrew from
their phone, especially on iPhone. **Zero schema changes** — every write
this milestone adds is either an existing `property_contacts` insert
(already there) or an existing `property_contact_links` insert (already
there, from the M11/Part-10 many-to-many model). PropCrew stays "the
people you trust for each property" — never a marketplace, never a
provider network, never shared with anyone else.

## Audit findings (before any code was written)

- `property_contacts` is one row per provider; `property_contact_links`
  (a join table, unique on `(contact_id, property_id)`) is how one
  provider already legally serves more than one property. Both existed
  before this milestone — no schema change was needed or made.
- A prior milestone ("Property Profile / PropCrew UX Improvement") had
  already implemented and shipped `isContactPickerSupported()`
  (`lib/propcrew/contact-picker.ts`) and a "Choose from Contacts" flow in
  `components/PropCrewPanel.tsx`, gated on the real W3C Contact Picker
  API (`navigator.contacts.select` + `window.ContactsManager`).
- Re-confirming that audit directly: the Contact Picker API is
  implemented **only** by Chromium on Android. No browser on iOS has
  ever implemented it — Safari, Chrome for iOS, Firefox for iOS, Edge
  for iOS all run on WebKit, and WebKit has never shipped this API.
  Installed-as-PWA (Add to Home Screen) does not change this: it is
  still WebKit under the hood, so the feature-detection result is
  identical whether the site is opened in Safari or from the Home
  Screen.
- Before this milestone, an unsupported browser (iOS Safari included)
  skipped the chooser entirely and went straight to the manual form —
  never a broken/dead button, but also no acknowledgment that a faster
  path exists on other devices, and no fallback beyond typing everything
  by hand.
- No `.vcf`/vCard import existed anywhere in the codebase before this
  milestone.
- No duplicate-avoidance existed: adding a contact who was already in
  PropCrew (for a different property) required either re-typing their
  details as a second `property_contacts` row, or manually opening that
  existing contact's Edit form and checking one more property box.

## What this milestone adds

### 1. iPhone/unsupported-browser fallback: `.vcf` (vCard) import

Investigated whether a safe, browser-compatible way exists to improve
iPhone contact import without a native PropRoster app. Rejected: broad
address-book access, undocumented/private APIs, scraping, and bulk
upload — none are necessary or acceptable per this milestone's own
privacy requirements. What **is** safe and already works on iOS Safari
today: a user-selected file.

The real flow: in iOS Contacts, tap a contact → Share Contact → Save to
Files (or AirDrop/Mail to self) → in PropRoster, tap "Import a contact
card" → the OS's own file picker (Files/iCloud Drive/Recents) → the one
file just saved. Two explicit user actions, both fully user-controlled;
PropRoster only ever reads the bytes of the one file picked, entirely
client-side (`file.text()` + `lib/propcrew/vcard.ts`'s pure parser),
never uploaded anywhere.

`lib/propcrew/vcard.ts` is a small, dependency-free RFC 6350 parser
handling exactly the four fields PropCrew ever prefills — name (FN, or
Family/Given from N), every TEL, every EMAIL, and ORG (organization) —
plus line unfolding and basic value unescaping. A file with **more than
one** vCard is refused (`multiple_cards`) rather than silently importing
just the first, so an accidental "export all contacts" file can never
partially leak into an import. A file with no vCard at all, or a single
card with no usable fields, is refused too (`no_card` / `empty_card`),
each with its own honest, specific error message.

This judged "reasonably intuitive": two standard iOS interactions
(Share → Save to Files, then a file picker), not a one-tap native
picker, but a real improvement over typing every field by hand — and
small/safe enough (~150 lines, zero dependencies, fully unit-tested) to
be worth the two extra steps.

The chooser (`+ Add to PropCrew`) is now **always shown**, on every
browser — previously it was skipped entirely when the native picker was
unsupported. It now offers exactly one working import option (native
picker on Chromium/Android, vCard import everywhere else) plus
**Enter Manually**, with a one-line, honest explanation on browsers
without the native picker ("This browser can't open your contacts
directly…"). There is still never a dead/disabled option — every
browser now genuinely has at least one working import path.

### 2. Deterministic duplicate-avoidance (never fuzzy, never AI)

`lib/propcrew/dedupe.ts`'s `findExactContactMatch()` normalizes phone
(strip formatting, drop a leading US country-code `1`) and email
(trim, lowercase) and looks for an **exact** match against the
landlord's existing PropCrew contacts. When creating a new contact
(never on an edit), if the draft's phone or email exactly matches an
existing contact, a confirmation offers "Use existing contact" (links
the existing `property_contacts` row to whatever new properties the
draft selected, via `property_contact_links` — no new row, no edit to
the existing contact's own fields) or "Create new anyway" (the explicit
override, for the rare case of two real people sharing a phone/email).
Records are never merged automatically.

### 3. "Link Existing Contact" — reuse across properties

A landlord no longer has to re-enter "ABC Air Conditioning" from scratch
for every property. A new, separate entry point (next to, not crowding,
"+ Add to PropCrew") lists every existing PropCrew contact **not**
already associated with the current property, with a search box and a
one-tap "Link" per row. This writes only a `property_contact_links` row
— the existing contact's own fields, history, and notes are untouched.
Only rendered when scoped to one property (`scopePropertyId`) and at
least one linkable contact exists; never on the unscoped, portfolio-wide
directory, where there is no single "this property" to link to.

## Maintenance integration (verified, not redesigned)

`lib/maintenance/command-center.ts`'s `relevantContactsForProperty()`
already unions a property's primary `property_contacts.property_id`
with every `property_contact_links` row for that property — unchanged
by this milestone. `app/page.tsx` already refetches `contacts`/
`contactLinks` via `onChanged={() => void loadPortfolio()}`, wired to
`PropCrewPanel`. Both new write paths (`useDedupeMatch()`,
`linkExistingContact()`) call `onChanged?.()` exactly like the existing
`save()`/`remove()` do — so a newly created, linked, or reused PropCrew
contact is assignable from Property Maintenance → Active Request →
Manage → Assigned PropCrew contact immediately, no sign-out or manual
refresh required. No message is ever sent to a provider by any of this
milestone's code — assignment still only records the landlord's own
decision.

## Explicitly deferred

- A native PropRoster iOS/Android app (the only way to get a true
  one-tap contact picker on iPhone) — out of scope for this milestone
  and this repo.
- Any Tenant Connect M4/M5, provider outreach, scheduling, quotes,
  marketplace/discovery/ratings/payments — untouched, not started.
