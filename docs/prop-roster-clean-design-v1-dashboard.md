# PropRoster Clean Design V1 - Approved Dashboard Visual Direction

Status: Product owner approved visual direction on 2026-10-26.
Implementation branch: `design/apple-clean-dashboard-v1`.
Reference: approved ChatGPT-generated mobile dashboard mockup in the design conversation. The mockup is illustrative, not an accurate source of property names, photos, rents, dates or user information.

## Design language
- Inspired by Apple's clarity, not a copy of Apple UI.
- Predominantly white, subtle neutral surfaces, restrained PropRoster green, clean typography, precision alignment, generous but efficient spacing.
- Avoid dashboard-in-dashboard nested cards, multiple shaded metric tiles, thick borders, prominent decorative badges, excess copy, shadows and clutter.
- Maintain accessible contrast, focus states, mobile touch targets and existing app branding.
- Reuse existing design tokens and data. Do not hardcode illustrative data from mockup.

## Mobile dashboard hierarchy
1. Compact PropRoster wordmark/header with discreet notifications and profile. Preserve access to existing search and Upload via real navigation/action patterns, not by removing features.
2. One greeting line and concise contextual subtitle.
3. Portfolio metrics in a SINGLE light summary surface, four concise metrics with subtle dividers, not four individual colored cards. Use actual portfolio value, monthly rent, property count and attention counts. At 375px ensure no clipped values; responsive 2x2 if four-across would harm legibility.
4. Quick Actions in a quiet row of four existing user-customizable actions, preserving actual configuration behavior and entitlements. Compact icons and captions.
5. My Properties with actual photos, address/location, accurate status and meaningful rental/lease information where available. Simple rows or low-chrome cards, not giant photo-only cards. Keep Add Property visible.
6. Existing navigation must remain fully functional. The reference image shows a five-item bottom bar, but current production intentionally removed redundant mobile bottom navigation in Mobile V2. DO NOT reintroduce a bottom bar without a separate explicit product decision. Prefer the current accessible navigation, styled consistently.

## Desktop
Adapt the same content hierarchy, not a stretched phone screen. A compact summary row, sensible quick actions, and an efficient property list/grid with strong photography and whitespace. Preserve existing workflows.

## Data and interaction integrity
- No fictional properties, prices, lease dates, user photos, occupancy statuses or fabricated app metrics in production.
- Do not remove global search, notifications, Upload, customizable Quick Actions, add-property, or existing property actions. Rearrange with accessible disclosure if needed.
- Preserve authentication, Supabase/RLS, business logic, payment/entitlement logic and notifications.
- No schema migrations, backend rewrites, or production deploys in this design milestone.

## Implementation plan
1. Audit actual dashboard component boundaries, CSS and existing responsive states.
2. Implement the mobile-first approved visual direction on this isolated branch.
3. Verify at 375, 768, 1024, 1440px and with long addresses, empty states, 0/missing values, multiple properties, notifications, and Quick Actions customization.
4. Run typecheck, tests and production build.
5. Open a draft PR for screenshots and design review. No merge or production deploy without explicit approval.

## Visual acceptance criteria
A calm white interface; clean compact header; single portfolio summary surface; unobtrusive Quick Actions; tidy property rows with images; no duplicated mobile navigation; no information fabricated from the mockup; no lost actions.
