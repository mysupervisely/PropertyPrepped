// Launch Essentials V1 — a single place to turn a raw Supabase/Postgres/
// storage error into language safe to show a landlord, without hiding the
// real error from whoever is debugging (it's always logged first).
//
// This intentionally does NOT try to cover every possible backend string.
// It recognizes the categories of raw text this codebase's own audit found
// (RLS/policy violations, constraint violations, storage failures, auth/
// session failures, network failures) and falls back to one generic,
// still-useful message for anything else — never a table name, column
// name, policy name, bucket name, stack trace, or raw provider response.

export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.'

const GENERIC_FALLBACK = 'Something went wrong. Please try again.'

function rawMessageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return ''
}

/**
 * Logs the real error (for developer/operator visibility) and returns a
 * safe, user-facing message. `fallback` is used for anything not matched
 * by a known category, so each call site can keep its own specific,
 * already-safe copy (e.g. "We couldn't save this property.") instead of
 * the generic default.
 */
export function toSafeErrorMessage(error: unknown, fallback: string = GENERIC_FALLBACK): string {
  console.error(error)
  const raw = rawMessageOf(error).toLowerCase()
  if (!raw) return fallback

  if (/jwt|refresh_token|invalid_grant|not authenticated|session.*missing|auth session missing/.test(raw)) {
    return SESSION_EXPIRED_MESSAGE
  }
  if (/row-level security|violates.*policy|permission denied|not authorized/.test(raw)) {
    return fallback
  }
  if (/duplicate key|unique constraint/.test(raw)) {
    return 'That already exists. Please check and try again.'
  }
  if (/foreign key constraint|violates.*constraint/.test(raw)) {
    return fallback
  }
  if (/failed to fetch|networkerror|network request failed|econnrefused|enotfound|timed out|timeout/.test(raw)) {
    return 'A network problem occurred. Please check your connection and try again.'
  }
  return fallback
}
