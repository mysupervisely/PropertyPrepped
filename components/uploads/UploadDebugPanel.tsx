'use client'

// PropRoster — Upload Reliability Audit: temporary, removable
// on-screen debug panel (Section 11 of the brief — the product owner
// is testing from an iPhone with no Safari Web Inspector access).
//
// Shows only the safe UploadDebugState fields — never bytes, URLs,
// tokens, or a full filename. Intentionally plain/unstyled-ish (a
// small bordered box) so it reads as an obvious, temporary debug
// affordance, not a permanent piece of UI. Delete this component and
// its call sites once root causes are confirmed fixed on a real
// device — every call site below is a single, easily-removable line.

import type { UploadDebugState } from '../../lib/uploads/diagnostics'

function statusText(status: 'pending' | 'success' | 'failed' | 'skipped', error?: string): string {
  if (status === 'pending') return 'Pending…'
  if (status === 'success') return 'Success'
  if (status === 'skipped') return 'Skipped'
  return error ? `Failed — ${error}` : 'Failed'
}

export function UploadDebugPanel({ state }: { state: UploadDebugState }) {
  return (
    <div className="uploadDebugPanel">
      <p className="uploadDebugTitle">Upload debug (temporary)</p>
      <dl>
        <dt>File received</dt><dd>{state.fileReceived ? 'Yes' : 'No'}</dd>
        <dt>Extension</dt><dd>{state.extension}</dd>
        <dt>Type</dt><dd>{state.reportedMime}</dd>
        <dt>Validation</dt><dd>{state.validation === 'pending' ? 'Pending…' : state.validation === 'accepted' ? 'Accepted' : `Rejected — ${state.validationReason || 'unknown reason'}`}</dd>
        {/* V1.2 — the actual bytes read via arrayBuffer(), not just the
            picker's reported .size. A nonzero size with 0 bytes here is
            the exact signature of the confirmed iOS "No content
            provided" root cause (lib/uploads/durable-file.ts). */}
        {state.originalSize !== undefined && <><dt>Original size</dt><dd>{state.originalSize} bytes</dd></>}
        {state.originalByteLength !== undefined && <><dt>Original bytes read</dt><dd>{state.originalByteLength}</dd></>}
        {state.normalizedSize !== undefined && <><dt>Normalized size</dt><dd>{state.normalizedSize} bytes</dd></>}
        {state.normalizedByteLength !== undefined && <><dt>Normalized bytes read</dt><dd>{state.normalizedByteLength}</dd></>}
        {state.payloadError && <><dt>Payload read error</dt><dd>{state.payloadError}</dd></>}
        <dt>Storage upload</dt><dd>{statusText(state.storageUpload, state.storageError)}</dd>
        <dt>Database record</dt><dd>{statusText(state.databaseRecord, state.databaseError)}</dd>
        <dt>Render URL</dt><dd>{statusText(state.renderUrl, state.renderError)}</dd>
      </dl>
    </div>
  )
}
