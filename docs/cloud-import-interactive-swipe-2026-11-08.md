# Cloud file import, visible public records and interactive back swipe

PublicPropertyRecords is now a standalone visible Overview card immediately after Property Snapshot. It is not nested in Property information. The Find local records link is always visible, while explanatory content remains collapsible. All-state directory access still does not import appraisals or change saved values.

IOSBackSwipe now transforms the current main surface in step with a left-edge swipe. Short/reversed/vertical/multi-touch/cancelled gestures return it to zero. Completed gestures animate offscreen, then use the existing history.back/popstate checks. Open overlays and form controls remain excluded. Reduced-motion disables settling animation. It reveals a simple Back cue, not a snapshot of the previous screen. This is a web-delivered fallback for existing TestFlight binaries, not WKWebView native interactive navigation. Real iPhone gesture feel still needs acceptance testing.

CloudFileImport is available in normal Documents upload, the Photos library and Smart Upload. It opens the device file-provider picker, not Google Picker OAuth. On iPhone users must install/sign into Drive and enable it in Files > Browse > More > Edit. On computers, use Drive for desktop or download selected files first. Google-native Docs/Sheets must be exported. Smart Upload supports PDF/JPEG/PNG/WebP; ordinary documents and property photos retain their existing validation and size limits.

File bytes begin reading synchronously before picker reset, using the existing durable-file logic. Existing owner-scoped storage and review flows are reused. Only selected files are copied; no Drive tokens are stored, no files are changed in Drive, no folders are synced, and no public Drive URL fetcher is added. Direct Google Picker / folder sync remains a separate OAuth integration requiring a configured Google Cloud app.

Verified against Apple Support article 102238 and Google Picker web integration / Drive API scope documentation. Focused upload, Smart Upload and gesture tests plus production build are run. Real cloud-provider selection and physical iPhone interaction are not exercised by unit tests.
