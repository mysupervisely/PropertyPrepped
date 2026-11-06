import { beginReadingFileBytes } from '../uploads/durable-file'

/** FileList is live: copy it and start byte reads before clearing the picker. */
export function capturePhotoPicker(input: { files: ArrayLike<File> | null; value: string }) {
  const files = Array.from(input.files || [])
  const bytesPromises = files.map(beginReadingFileBytes)
  input.value = ''
  return { files, bytesPromises }
}
