'use client'

import { beginReadingFileBytes } from '../../lib/uploads/durable-file'

// Uses the OS file provider picker. No Google OAuth connection, Drive
// crawling, URL fetching, background sync, or whole-account permissions.
export function CloudFileImport({ onFiles, disabled = false, photos = false, smart = false }: { onFiles: (files: FileList, bytes: Promise<ArrayBuffer>[]) => void; disabled?: boolean; photos?: boolean; smart?: boolean }) {
  return <details className="cloudFileImport">
    <summary>Google Drive / cloud files</summary>
    <p>Import {photos ? 'photos' : 'documents'} you select from Google Drive, iCloud Drive, Dropbox or your device.</p>
    <p><strong>iPhone / iPad:</strong> Choose files, then Browse → Google Drive. If Drive is missing, install and sign in to the Drive app, then enable it in Files → Browse → More → Edit.</p>
    <p><strong>Computer:</strong> Choose files from your Google Drive desktop folder, or download them from Drive first. {smart ? 'Export Google Docs or Sheets as PDF for Smart Upload. PDF, JPEG, PNG and WebP are supported.' : 'Export Google Docs or Sheets as PDF or Excel before importing.'}</p>
    <label className="secondary cloudFilePicker">Choose {photos ? 'photos' : 'files'}<input aria-label={photos ? 'Choose property photos from cloud files' : 'Choose documents from cloud files'} type="file" accept={smart ? 'application/pdf,image/jpeg,image/png,image/webp' : undefined} multiple disabled={disabled} onChange={event => {
      const files = event.currentTarget.files
      if (files?.length) {
        // Anchor provider file reads before resetting the picker, matching
        // the existing iPhone durable-file upload pipeline.
        const bytes = Array.from(files).map(beginReadingFileBytes)
        onFiles(files, bytes)
      }
      event.currentTarget.value = ''
    }} /></label>
    <small>Selected files are copied into PropRoster. Your Drive originals stay in place. This does not sync folders.</small>
  </details>
}
