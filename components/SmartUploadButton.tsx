'use client'

// PropRoster — Smart Upload Foundation: the header's top-right primary
// action. Was a natively `disabled` "coming soon" placeholder (see git
// history) — now opens the real workflow (components/SmartUpload/
// SmartUploadModal.tsx), owned by components/AuthHeader.tsx so every
// authenticated page gets it identically, with no per-page wiring.

export function SmartUploadButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="primary smartUploadButton" onClick={onClick} aria-label="Smart Upload">
      <span aria-hidden="true">⇧</span>
      <span className="labelFull">Smart Upload</span>
      <span className="labelShort">Upload</span>
    </button>
  )
}
