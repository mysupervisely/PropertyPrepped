import type { TenantMediaLink } from '../../lib/tenant-connect/media'
export function TenantMediaPreview({ media }: {media:TenantMediaLink}) {
  return media.mimeType?.startsWith('video/')
    ? <div className="tenantMediaVideo"><video controls playsInline preload="metadata" src={media.url} /><a href={media.url} target="_blank" rel="noreferrer">Open video</a></div>
    : <a href={media.url} target="_blank" rel="noreferrer"><img src={media.url} alt="Attached photo" /></a>
}
