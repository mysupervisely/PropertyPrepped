'use client'

// PropRoster — Smart Upload Foundation: the header's top-right primary
// action. Was a natively `disabled` "coming soon" placeholder (see git
// history) — now opens the real workflow (components/SmartUpload/
// SmartUploadModal.tsx), owned by components/AuthHeader.tsx so every
// authenticated page gets it identically, with no per-page wiring.

// Always reads "+ Smart Upload" — every width, including mobile. Not
// shortened to just "Upload"; see globals.css's @media (max-width: 430px)
// block for how it stays comfortable at narrow widths instead (smaller
// font/padding, never a truncated label).
export function SmartUploadButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="primary smartUploadButton" onClick={onClick} aria-label="Smart Upload">
      <span aria-hidden="true">+</span>
      <span>Smart Upload</span>
    </button>
  )
}
