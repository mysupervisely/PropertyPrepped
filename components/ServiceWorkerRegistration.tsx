'use client'

// PropRoster — PWA/Mobile Installability V1.
//
// Registers public/sw.js — read that file's own top comment first; it
// does nothing but pass every request straight to the network. This
// component is just the registration call, gated to production so local
// development is never affected by a service worker at all.

import { useEffect } from 'react'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failing (unsupported browser, blocked by a
      // privacy setting, etc.) must never be user-visible — the app
      // works identically with or without this worker.
    })
  }, [])

  return null
}
