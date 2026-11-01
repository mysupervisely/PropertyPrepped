export type RecoveryState = 'checking' | 'ready' | 'invalid' | 'unavailable'

/** Observe Supabase recovery without confusing transport failure with an expired link. */
export function watchRecoverySession(
  getSession: () => Promise<{ data: { session: unknown }; error?: unknown }>,
  subscribe: (onRecovery: () => void) => () => void,
  onState: (state: RecoveryState) => void,
): () => void {
  let active = true
  let ready = false
  let invalidTimer: ReturnType<typeof setTimeout> | undefined
  const clearTimers = () => {
    clearTimeout(deadline)
    if (invalidTimer !== undefined) clearTimeout(invalidTimer)
  }
  const deadline = setTimeout(() => {
    if (active && !ready) onState('unavailable')
  }, 10000)
  const recovered = () => {
    if (!active || ready) return
    ready = true
    clearTimers()
    onState('ready')
  }
  const unsubscribe = subscribe(recovered)
  // Invoke in a promise chain so synchronous adapter failures are also handled.
  void Promise.resolve().then(getSession).then(({ data, error }) => {
    if (!active || ready) return
    clearTimeout(deadline)
    if (error) { onState('unavailable'); return }
    if (data.session) { recovered(); return }
    invalidTimer = setTimeout(() => {
      if (active && !ready) onState('invalid')
    }, 2500)
  }).catch(() => {
    if (active && !ready) {
      clearTimers()
      onState('unavailable')
    }
  })
  return () => {
    active = false
    clearTimers()
    unsubscribe()
  }
}
