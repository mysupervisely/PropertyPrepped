/** Client-side feedback only. Supabase remains responsible for authentication. */
export function authFormError(email: string, password?: string): string | null {
  if (!email.trim()) return 'Enter your email address.'
  if (!/^[^\s@]+@[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.'
  if (password !== undefined && password.length < 6) return 'Enter a password with at least 6 characters.'
  return null
}

/** Share one synchronous lock across sign-in, sign-up, and reset requests. */
export async function runAuthSubmission(
  lock: { current: boolean },
  setBusy: (busy: boolean) => void,
  task: () => Promise<void>,
  onError: (error: unknown) => void,
): Promise<void> {
  if (lock.current) return
  lock.current = true
  setBusy(true)
  try {
    await task()
  } catch (error) {
    onError(error)
  } finally {
    lock.current = false
    setBusy(false)
  }
}
