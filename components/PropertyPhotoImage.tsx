'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { createPhotoUrlLease, PHOTO_URL_LIFETIME_SECONDS, PHOTO_URL_REFRESH_MS } from '../lib/property-photos/url-lease'

export function PropertyPhotoImage({ storagePath, initialUrl, alt }: { storagePath?: string | null; initialUrl?: string; alt: string }) {
  const [url, setUrl] = useState(initialUrl)
  const leaseRef = useRef<ReturnType<typeof createPhotoUrlLease> | null>(null)

  useEffect(() => {
    setUrl(initialUrl)
    if (!storagePath || !supabase) return
    const client = supabase
    const lease = createPhotoUrlLease({
      sign: async () => {
        const { data, error } = await client.storage.from('property-photos').createSignedUrl(storagePath, PHOTO_URL_LIFETIME_SECONDS)
        if (error) throw error
        return data?.signedUrl
      },
      show: setUrl,
    })
    leaseRef.current = lease
    void lease.renew()
    const resume = () => { if (document.visibilityState === 'visible') void lease.resume() }
    const timer = window.setInterval(resume, PHOTO_URL_REFRESH_MS)
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('online', resume)
    return () => {
      lease.dispose()
      leaseRef.current = null
      window.clearInterval(timer)
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('online', resume)
    }
  }, [storagePath, initialUrl])

  if (!url) return <span className="propertyPhotoUnavailable" role="img" aria-label={`${alt}: photo unavailable`}>Photo unavailable</span>
  return <img src={url} alt={alt} onLoad={() => leaseRef.current?.imageLoaded()} onError={() => {
    if (leaseRef.current) void leaseRef.current.imageError()
    else setUrl(undefined)
  }} />
}
