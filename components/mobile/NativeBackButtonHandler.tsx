'use client'

// PropRoster Mobile M3 — wires Capacitor's Android hardware/gesture
// back-button event to lib/mobile/backButton.ts's decision logic.
//
// Mounted once, globally, from app/layout.tsx (same pattern as
// ServiceWorkerRegistration/GoogleAnalytics) — renders nothing.
// Feature-detected via isNativeShell(): on an ordinary browser visit
// (the overwhelming majority of traffic to proproster.com, and every
// existing automated test) this never calls App.addListener at all, so
// there is zero behavioral difference for web users. iOS has no
// hardware back button and never fires this event — this component is
// effectively an Android-only concern, but it's safe to mount
// unconditionally on any native platform.

import { useEffect } from 'react'
import { App } from '@capacitor/app'
import { isNativeShell } from '../../lib/mobile/platform'
import { decideBackButtonAction } from '../../lib/mobile/backButton'

export function NativeBackButtonHandler() {
  useEffect(() => {
    if (!isNativeShell()) return

    const listenerPromise = App.addListener('backButton', ({ canGoBack }) => {
      if (decideBackButtonAction(canGoBack) === 'history-back') {
        window.history.back()
      } else {
        // Only reached when there is nowhere left to go back to — the
        // same point at which every standard Android app exits on back
        // press. Never fires mid-navigation.
        void App.exitApp()
      }
    })

    return () => {
      void listenerPromise.then((handle) => handle.remove())
    }
  }, [])

  return null
}
