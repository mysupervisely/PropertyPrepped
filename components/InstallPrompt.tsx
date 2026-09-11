'use client'

// PropRoster — PWA/Mobile Installability V1: lightweight install guidance.
//
// Deliberately NOT a popup/modal/overlay — a small dismissible bar
// pinned near the bottom of the viewport (respecting the home-indicator
// safe area), never blocking content, shown at most until dismissed once
// (persisted in localStorage — it never nags on every visit) and never
// shown at all once the app is already running standalone (installed).
//
// Two platforms, two different mechanisms, because there is no single
// cross-browser "install" API:
//   - iOS Safari has no install prompt at all — the only path is
//     Share -> Add to Home Screen, so this just explains that in words.
//   - Chrome/Android (and other browsers implementing the same event)
//     fire `beforeinstallprompt`; capturing it lets a real "Install"
//     button trigger the browser's own native install UI via
//     deferredPrompt.prompt() — this is the standard, documented pattern
//     for that event, not a custom install flow.
//
// Never blocks sign-in, never appears over the auth screens' primary
// actions, and reads/writes nothing except one localStorage flag.

import { useEffect, useRef, useState } from 'react'

const DISMISS_KEY = 'proproster-install-hint-dismissed'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    // Storage unavailable (private mode, blocked) — fail closed, never show the hint rather than risk re-nagging every load.
    return true
  }
}

export function InstallPrompt() {
  const [visible, setVisible] = useState(false)
  const [iosHint, setIosHint] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const hintRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return

    if (isIOS()) {
      setIosHint(true)
      setVisible(true)
      return
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  // Phase C.2 (real iPhone/Safari collision fix): while visible, mirror
  // MobileBottomNav's own "toggle a body class only while mounted"
  // pattern (hasInstallHint alongside its hasBottomNav) so app/globals.css
  // can reserve real bottom clearance for THIS bar's actual content —
  // never a fixed pixel guess, since Dynamic Type/font-size settings can
  // wrap this text onto a second or third line taller than any constant
  // assumes. Both the class and the measured height are removed the
  // instant the hint is dismissed/hidden, so no clearance lingers behind
  // it (no excessive blank space once it's gone).
  useEffect(() => {
    if (!visible) return
    document.body.classList.add('hasInstallHint')
    const el = hintRef.current
    let observer: ResizeObserver | undefined
    if (el && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        document.documentElement.style.setProperty('--install-hint-height', `${el.getBoundingClientRect().height}px`)
      })
      observer.observe(el)
    }
    return () => {
      document.body.classList.remove('hasInstallHint')
      observer?.disconnect()
      document.documentElement.style.removeProperty('--install-hint-height')
    }
  }, [visible])

  function dismiss() {
    setVisible(false)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Nothing to do — worst case the hint reappears next visit.
    }
  }

  async function handleInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    dismiss()
  }

  if (!visible) return null

  return (
    <div ref={hintRef} className="installHint" role="note">
      {iosHint ? (
        <span>Install PropRoster: tap <strong>Share</strong> → <strong>Add to Home Screen</strong>.</span>
      ) : (
        <span>Install PropRoster for quick, app-like access.</span>
      )}
      {!iosHint && deferredPrompt && (
        <button type="button" onClick={() => void handleInstall()}>Install</button>
      )}
      <button type="button" className="installHintDismiss" aria-label="Dismiss" onClick={dismiss}>×</button>
    </div>
  )
}
