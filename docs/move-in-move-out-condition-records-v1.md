# Move-in and move-out condition records: proposed V1

Status: scoped, not implemented. Requested after the property-chart experiment was removed.

## Purpose and location

Property -> Rent -> Condition records. Record a property's condition before a tenant moves in, then document it again after that same tenancy ends. This is a focused inspection feature, separate from a full tenant-turnover or deposit-accounting workflow.

## Existing foundation

- `public.property_photos` and the private `property-photos` bucket store ordinary images attached to a property. These records have no lease, room, inspection stage, or capture-date fields. They are not a condition-comparison workflow.
- Leases and tenant-property access already have lease identifiers. Preserve that boundary so a new tenant cannot see a prior tenant's private inspection media.
- The current property-image upload path is image-oriented. Video uploads and playback need their own verified validation, storage limits, and private-access implementation. Do not imply they work through the existing photo picker.

## Initial workflow

1. Choose the property and lease. Create a Move-in or Move-out inspection with an inspection date and the inspecting person's name.
2. Add rooms or areas: exterior, living room, kitchen, bedrooms, bathrooms, and custom areas.
3. Record condition notes and pre-existing defects. Attach multiple photos and videos to the relevant room or item, such as bedroom blinds.
4. Save a draft, resume later, then finalize a dated inspection. Preserve the original media and finalized record; later corrections must be identifiable amendments, not silent replacements.
5. Pair move-out with the move-in baseline for the same property and lease. Show room-by-room before/after media, notes, and dates side by side.
6. Export a report with notes, photo references and capture/upload information, with original videos available through an authenticated download. Avoid permanent public media URLs.

For an upcoming tenancy without a lease record, a draft may remain unassigned to a tenant. Require an explicit lease link before finalizing the tenancy-specific baseline. Historical inspections must remain available when a lease ends.

## Data and access requirements

- Inspection: property, owner, lease, stage, inspected-at date, inspector, draft/final status, finalized-at date and optional baseline inspection ID.
- Room/item: inspection, descriptive name, condition and notes.
- Media: inspection and room/item references, private storage path, original filename, detected media type, byte size, uploaded-at timestamp, optional claimed captured-at date, and any amendment history.
- Keep upload time separate from inspection date and camera metadata. Imported capture dates are not independently verified timestamps.
- Reuse ownership and lease-access checks at the database and storage layers. Initial V1 is landlord-only; tenant submission or acknowledgement is a separately tested extension.
- Audit image/video MIME support, file limits, mobile camera behavior, interruption recovery and playback before selecting implementation limits. Make failures visible and preserve draft notes when uploads fail. Do not publish a successful inspection with silently missing files.
- Keep condition media separate from cover/listing photos. Do not automatically turn inspection media into marketing photos or tenant-visible attachments.
- Account for inspection retention and export when designing property/lease deletion. Existing photo rows cascade with property deletion; inspection retention must be an explicit product decision rather than an accidental inherited behavior.

## Review boundaries

Comparison records support the landlord's review; they do not automatically establish responsibility or charge a security deposit. No automatic damage assessment, deduction, deposit withholding or claim of legally conclusive evidence in V1. Deposit notices, deadlines, ordinary wear and tear and jurisdiction-specific requirements belong in a separate reviewed deposit workflow.

## Delivery checkpoints

- Schema and private storage policies, with property/lease isolation and safe retention behavior verified.
- Landlord draft inspections, room/item notes, photo and video upload, private viewing and finalization.
- Same-lease move-in/move-out comparison and export.
- Mobile capture and interrupted upload tests, cross-owner/cross-tenancy access tests, finalized-record amendment checks, video playback and export checks.

Broader turnover planning, cleaning/repair coordination, AI suggestions, tenant acknowledgements and deposit accounting remain outside this first phase.
