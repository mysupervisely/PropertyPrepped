# Move-in and move-out condition records: V1

Status: implemented for review on `ios-readiness-v1`. M36 has been applied to the connected PropertyPrepped database. The feature is available in the review preview. No production frontend release or live device/Storage smoke test has been completed.

## Purpose and location

Property -> Rent -> Move-in / Move-out. Record a property's condition before a tenant moves in, then document it again after that same tenancy ends. This is a focused inspection feature, separate from a full tenant-turnover or deposit-accounting workflow.

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

## Move-in and move-out checklists

Include two separate recommended templates under the property's Rent condition-records workspace. They are practical starting points, editable per property and tenancy, not a representation that all local rental requirements are satisfied.

### Move-in template

Before arrival:
- Confirm the tenant, lease, move-in date and walkthrough appointment.
- Confirm the lease is signed and record the status of agreed rent/deposit payments. A checked task does not create a financial transaction or mark rent paid.
- Confirm utility arrangements and the tenant's contact details.
- Review outstanding cleaning or repair issues and record any unresolved items.

At the walkthrough:
- Check locks, keys, access devices, alarms, appliances and visible plumbing for issues.
- Complete the room-by-room condition checklist, including walls, floors, doors, windows, blinds, fixtures and appliances.
- Capture baseline photos and videos, including pre-existing wear or damage and identifying notes.
- Record available meter readings and inventories of keys, remotes and included items.
- Review property access, maintenance reporting and relevant property instructions with the tenant.

After the walkthrough:
- Verify every intended upload completed and is viewable.
- Finalize the move-in report and retain a shareable/exportable copy.
- Record keys/access handover and any agreed follow-up items.

### Move-out template

Before departure:
- Confirm the move-out date, walkthrough and access-return arrangements.
- Review the same tenancy's move-in report and identify baseline photos/videos to compare.
- Confirm utility arrangements and collect a forwarding contact/address when appropriate.

At the walkthrough:
- Complete the same room/item list used for move-in.
- Capture new room-by-room photos and videos before cleaning or repairs alter the condition being documented.
- Compare relevant items with the baseline, noting observed changes without automatically assigning responsibility.
- Record available meter readings, included-item inventory and returned/missing keys or access devices.
- Record proposed cleaning/repair follow-ups and attach supporting notes or estimates when available.

After the walkthrough:
- Verify uploads, finalize the move-out report and retain/export the comparison.
- Review the tenant's recorded rent balance separately from the inspection.
- Review deposit disposition and any required notices through the appropriate human-reviewed process. No automatic deductions or default legal deadlines in this checklist.
- Record completion of access handover and any remaining owner follow-ups.

### Checklist behavior

- Each lease gets independent move-in and move-out instances, copied from the template when created. Never reuse the prior tenant's completion state.
- Show clear progress, such as `7 of 12 completed`, plus incomplete tasks. Completed tasks remain visible with a checkmark and crossed-out label; allow filtering without removing the records.
- Support custom tasks, notes, optional target dates and a Not applicable status. Exclude Not applicable tasks from the progress denominator. Show a neutral state when no applicable tasks remain, rather than dividing by zero or inventing a completion percentage.
- Save changes as the landlord works; show save failures and retain unsaved edits. Reopening a task must be explicit. Store completion time and actor, and preserve changes to finalized records as amendments.
- Link photo/video and report tasks to their relevant room or inspection. Do not silently check off a media task merely because a file was selected; its upload and reference must be saved successfully.
- Keep checklist completion distinct from lease signing, payment confirmation, media completeness and inspection finalization. Completing a checkbox does not mutate those systems.
- Template edits affect new checklists by default. Existing and finalized checklists keep their original task wording and completion history.
- Optional target dates are organization aids only. Do not send tenants messages or schedule external notifications automatically in V1.

## Data and access requirements

- Inspection: property, owner, lease, stage, inspected-at date, inspector, draft/final status, finalized-at date and optional baseline inspection ID.
- Checklist/task: property, owner, lease, stage, template version, task wording, sort order, status, notes, optional target date, completed-at time, completed-by actor and inspection/room linkage where relevant.
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
- Independent move-in/move-out checklist instances, progress, custom tasks, save recovery and retained completion history.
- Same-lease move-in/move-out comparison and export.
- Mobile capture and interrupted upload tests, cross-owner/cross-tenancy access tests, finalized-record amendment checks, video playback and export checks.

Broader turnover planning, cleaning/repair coordination, AI suggestions, tenant acknowledgements and deposit accounting remain outside this first phase.

## Implementation and activation

Run `supabase/milestone-36-condition-records.sql` in the existing project's Supabase SQL Editor as the database owner. It depends on the existing `properties` and `leases` schema, `auth.users`, and Supabase Storage. The script is transactional and can be rerun. It creates three new tables, ownership policies, inspection/media guards and a private `condition-record-media` bucket. It adds composite indexes and foreign keys to preserve property/lease ownership. The migration was applied through the connected Supabase project after confirming the three inspection tables were absent. The Data API schema cache was refreshed.

The fresh-install schema also contains M36. Existing installations should use the standalone migration. The panel displays a setup-needed message if its tables are absent, without substituting temporary browser storage.

The bucket permits JPEG, PNG, WebP, HEIC/HEIF photos up to 20 MB and MP4, QuickTime/MOV and WebM video up to 50 MB. File selection is limited to ten files / 100 MB per batch. Device codec support varies: unsupported previews retain the original download. No video transcoding is provided.

Upload references are reserved before bytes are sent; failed or uncertain uploads remain pending for explicit Check upload or Remove. Storage bytes are never overwritten. Removal is reserved persistently before the Storage API call; pending removals prevent finalization even across interrupted requests. Finalization checks actual stored file size/type metadata and requires one verified file per applicable room, resolved checklist tasks, an inspector and a lease. Notes and dates use Save draft; checkbox and N/A changes save immediately. Concurrent edits use record versions and report conflicts without automatically retrying stale writes.

Finalized records are read-only. Corrections create amendments with reasons, copied room notes, independent checklists and inherited original media. A server audit snapshot records inspection changes and completion actors/times. Final reports freeze the tenant/date/address labels. Condition records prevent destructive property/lease deletion; even saved drafts are retained in this first version. Retention cleanup and account deletion must use a separately reviewed administrator process.

Export downloads printable HTML, with escaped notes, checklist results, before/after references and up to 40 supported photo previews. Open the report in a browser to print or save PDF. Original videos and unsupported photos are downloaded individually through authenticated Storage. There is no bulk ZIP, tenant acknowledgement, signature or tenant sharing in V1.

## Verification and release limits

- PostgreSQL tests execute the migration twice and check ownership, lease matching, immutable finalized records, server-stamped completion history, upload metadata, removal reservations, restrictive Storage policies, amendments and parent retention.
- Model/report and repository tests cover independent checklists, N/A progress, comparison boundaries, report escaping, lost upload responses, optimistic conflicts and removal ordering.
- A local browser harness using fictional records checks create, checkbox/N/A save, custom tasks, room notes, reload/resume, incomplete-finalization blocking and independent move-out checklists. Responsive checks cover 320, 375, 393, 430, 768 and 1024 pixels.
- A live authenticated-role transaction created an inspection, saved a checklist completion, verified the server completion actor and audit history, then confirmed a different owner could not read it. The transaction was rolled back with no inspection or media left behind. All three tables have RLS enabled and the media bucket is private.
- Live Supabase Storage upload, real iPhone camera/video capture, device playback, browser PDF output and multi-session real-network interruption testing remain to be completed. Local mocks and PostgreSQL tests do not replace those checks.

After migration, open Property -> Rent -> Move-in / Move-out. Use a test lease first: save a move-in record, add room photos and a short video, reload and download originals, resolve checklist/rooms, finalize, create a same-lease move-out comparison, export and create an amendment. Verify a second account cannot access these files or records. Do not promote the feature to production until this live smoke test passes.
