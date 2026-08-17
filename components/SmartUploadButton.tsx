'use client'

// PropRoster — Authenticated Header Simplification: reserves the header's
// top-right primary-action slot for Smart Upload, the single global
// action every authenticated header now points to instead of a row of
// boxed nav buttons.
//
// Smart Upload itself does not exist yet anywhere in this codebase (see
// the completion report for the audit). Per the brief: "do NOT build the
// full Smart Upload system... create only a safe presentation/extension
// point... do not create a misleading button that appears functional but
// does nothing." This button is therefore natively `disabled` (not just
// styled to look disabled) — it can never silently swallow a click — and
// its accessible name says plainly that it isn't live yet. A future Smart
// Upload milestone only has to give it a real onClick and remove
// `disabled`; nothing about the header itself needs to change.

export function SmartUploadButton() {
  return (
    <button
      type="button"
      className="primary smartUploadButton"
      disabled
      aria-label="Smart Upload — coming soon"
      title="Smart Upload — coming soon"
    >
      <span aria-hidden="true">⇧</span>
      <span className="labelFull">Smart Upload</span>
      <span className="labelShort">Upload</span>
    </button>
  )
}
