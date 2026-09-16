import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toSafeErrorMessage, SESSION_EXPIRED_MESSAGE } from './user-facing-errors'

// Launch Essentials V1 — this helper exists specifically because the
// milestone's own audit found ~44 places across the app where a raw
// Postgres/Supabase/storage error string (table names, RLS policy text,
// constraint names) was shown directly to a landlord. These tests assert
// the actual categories that audit found, not arbitrary strings, and
// confirm the real error is still logged (developer visibility is
// preserved, never silently dropped).

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('toSafeErrorMessage — never exposes raw backend detail', () => {
  it('maps a row-level-security violation (the exact example from this milestone\'s brief) to the caller\'s fallback, not the raw policy text', () => {
    const raw = new Error('new row violates row-level security policy for table "property_documents"')
    const result = toSafeErrorMessage(raw, "We couldn't save that document. Please try again.")
    expect(result).toBe("We couldn't save that document. Please try again.")
    expect(result).not.toContain('property_documents')
    expect(result).not.toContain('row-level security')
  })

  it('maps a foreign-key constraint violation to the fallback, never the constraint/table name', () => {
    const raw = new Error('update or delete on table "properties" violates foreign key constraint "financial_transactions_property_id_fkey"')
    const result = toSafeErrorMessage(raw, 'Unable to delete this property.')
    expect(result).toBe('Unable to delete this property.')
    expect(result).not.toContain('financial_transactions_property_id_fkey')
  })

  it('maps a duplicate-key/unique-constraint violation to a safe, specific message', () => {
    const raw = new Error('duplicate key value violates unique constraint "property_tax_records_property_id_tax_year_key"')
    expect(toSafeErrorMessage(raw)).toBe('That already exists. Please check and try again.')
  })

  it('maps a JWT/session error to the shared SESSION_EXPIRED_MESSAGE, regardless of the fallback passed in', () => {
    expect(toSafeErrorMessage(new Error('JWT expired'), 'Unable to load data.')).toBe(SESSION_EXPIRED_MESSAGE)
    expect(toSafeErrorMessage(new Error('invalid_grant: refresh_token not found'), 'X')).toBe(SESSION_EXPIRED_MESSAGE)
  })

  it('maps a network failure to a network-specific message, never confusing it with a session expiration', () => {
    const result = toSafeErrorMessage(new Error('Failed to fetch'), 'Unable to load data.')
    expect(result).toBe('A network problem occurred. Please check your connection and try again.')
    expect(result).not.toBe(SESSION_EXPIRED_MESSAGE)
  })

  it('falls back to the caller-supplied safe copy for an unrecognized error, never a generic default that hides a useful, already-safe fallback', () => {
    expect(toSafeErrorMessage(new Error('some future Supabase error shape'), 'Unable to save this expense.')).toBe('Unable to save this expense.')
  })

  it('falls back to the generic message when no fallback is supplied and the error is unrecognized', () => {
    expect(toSafeErrorMessage(new Error('totally novel error'))).toBe('Something went wrong. Please try again.')
  })

  it('accepts a plain string error (e.g. an already-extracted .message) the same way as an Error object', () => {
    expect(toSafeErrorMessage('duplicate key value violates unique constraint "x"')).toBe('That already exists. Please check and try again.')
  })

  it('never throws for null/undefined and returns the fallback', () => {
    expect(toSafeErrorMessage(null, 'Safe fallback')).toBe('Safe fallback')
    expect(toSafeErrorMessage(undefined, 'Safe fallback')).toBe('Safe fallback')
  })

  it('always logs the real error for developer/operator visibility — it is never silently dropped', () => {
    const raw = new Error('new row violates row-level security policy for table "property_documents"')
    toSafeErrorMessage(raw, 'safe')
    expect(console.error).toHaveBeenCalledWith(raw)
  })
})
