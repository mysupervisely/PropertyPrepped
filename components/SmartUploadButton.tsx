'use client'

// PropRoster — Smart Upload Foundation: the header's top-right primary
// action. Was a natively `disabled` "coming soon" placeholder (see git
// history) — now opens the real workflow (components/SmartUpload/
// SmartUploadModal.tsx), owned by components/AuthHeader.tsx so every
// authenticated page gets it identically, with no per-page wiring.
//
// Phase E1.1: the visible label is now width-aware — "+ Upload" on
// mobile (a full "+ Smart Upload" was part of why the mobile header
// needed two rows), "+ Smart Upload" on desktop, where the row has
// room to spare. Two real text nodes, CSS-toggled by the same mobile
// breakpoint the bottom nav itself uses (no JS viewport detection) —
// the button's own aria-label stays "Smart Upload" either way, so its
// accessible name never changes with viewport. Presentation only:
// same onClick, same modal, same upload workflow, untouched.
export function SmartUploadButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="primary smartUploadButton" onClick={onClick} aria-label="Smart Upload">
      <span aria-hidden="true">+</span>
      <span className="smartUploadLabelFull">Smart Upload</span>
      <span className="smartUploadLabelShort">Upload</span>
    </button>
  )
}
