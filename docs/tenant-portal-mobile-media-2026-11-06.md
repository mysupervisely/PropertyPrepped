# Tenant portal mobile and media update

- Tenant navigation uses boxed horizontal tabs. The rental details wrap inside a bordered card.
- Request maintenance and Contact landlord are visible above the tabs.
- Maintenance reuses GuidedIntake and the existing tenant_requests-to-maintenance_requests trigger. It does not create duplicate cases or dispatch providers automatically.
- Contact landlord writes a General conversation and messages into the existing Tenant Connect inbox. Refresh loads replies. The UI reports saved messages, not guaranteed email or SMS delivery.
- Images and short MP4/MOV/WebM videos are supported, up to 15 MB per file. Guided intake supports up to 5 attachments. Tenant and landlord threads render videos with native controls.
- Media upload and attachment-record errors are reported separately from successful message/request creation so users are not encouraged to duplicate a submitted request.
- The existing tenant-connect-attachments bucket remains private, at the same 15 MB limit and with the same conversation-membership policies. Only allowed media types were expanded. No public provider access was introduced.

Validation: production build and 169 focused checks passed before publication. A rolled-back database test using fictional owner, tenant, and unrelated accounts confirmed that the tenant can create a conversation, message, and video attachment record, the landlord can read them, and the unrelated account sees neither. No fictional records were retained. Live bucket configuration was read back after the update. Physical iPhone camera/video playback and actual notification inbox delivery still require device testing.
