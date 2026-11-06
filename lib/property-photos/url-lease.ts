export const PHOTO_URL_LIFETIME_SECONDS = 3600
export const PHOTO_URL_REFRESH_MS = 45 * 60 * 1000

// Renew private viewing links, without reloading forms or portfolio data.
export function createPhotoUrlLease({ sign, show, now = Date.now }: {
  sign: () => Promise<string | undefined>
  show: (url: string | undefined) => void
  now?: () => number
}) {
  let disposed = false
  let pending: Promise<void> | undefined
  let renewedAt: number | undefined
  let retried = false

  function renew(): Promise<void> {
    if (disposed) return Promise.resolve()
    if (pending) return pending
    pending = (async () => {
      try {
        const url = await sign()
        if (!disposed) {
          renewedAt = url ? now() : undefined
          show(url)
        }
      } catch {
        if (!disposed) { renewedAt = undefined; show(undefined) }
      }
    })().finally(() => { pending = undefined })
    return pending
  }

  return {
    renew,
    resume() {
      if (renewedAt === undefined || now() - renewedAt >= PHOTO_URL_REFRESH_MS) {
        retried = false
        return renew()
      }
      return Promise.resolve()
    },
    imageError() {
      if (disposed) return Promise.resolve()
      // A permanently unavailable image must not create a request loop.
      if (retried) { show(undefined); return Promise.resolve() }
      retried = true
      return renew()
    },
    imageLoaded() { retried = false },
    dispose() { disposed = true },
  }
}
