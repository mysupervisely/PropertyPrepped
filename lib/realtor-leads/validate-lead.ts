// PropRoster Milestone 21: Realtor Connect V1 — server-side lead
// validation.
//
// Pure, framework-free validation (same "testable core" seam as
// lib/document-intelligence/analyze-request.ts) — the API route
// (app/api/realtor-leads/route.ts) is a thin adapter around this. Never
// trusts the client for anything security-relevant: consent must be
// explicitly true, at least one contact method must be present, and every
// string is trimmed/length-capped before it's ever considered for
// insertion.

import { PREFERRED_CONTACT_METHODS, type PreferredContactMethod } from './types'

export type ValidatedLeadInput = {
  name: string
  email: string | null
  phone: string | null
  preferredContactMethod: PreferredContactMethod
  message: string | null
  propertyAddress: string | null
}

export type ValidateLeadResult =
  | { valid: true; data: ValidatedLeadInput }
  | { valid: false; error: string }

const MAX_NAME_LEN = 120
const MAX_EMAIL_LEN = 254
const MAX_PHONE_LEN = 30
const MAX_MESSAGE_LEN = 2000
const MAX_ADDRESS_LEN = 300

// Deliberately permissive (format sanity, not strict RFC validation) —
// this is a lead-intake form, not an auth flow; the goal is catching
// obvious typos/garbage, not rejecting real addresses.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Accepts common US formatting (digits, spaces, dashes, parens, a
// leading +) with 7-15 digits — wide enough for real numbers, narrow
// enough to reject obvious garbage.
const PHONE_DIGITS_PATTERN = /^[\d\s\-().+]{7,20}$/

function trimmedOrNull(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, maxLen)
  return trimmed || null
}

/**
 * Validates a raw, untyped request payload into a safe ValidatedLeadInput.
 * Requires: a non-empty name, a valid explicit `consent === true`, at
 * least one of email/phone in a plausible format, and a recognized
 * preferred contact method. Every other field is optional.
 */
export function validateLeadInput(payload: unknown): ValidateLeadResult {
  if (!payload || typeof payload !== 'object') return { valid: false, error: 'Missing request body.' }
  const p = payload as Record<string, unknown>

  const name = trimmedOrNull(p.name, MAX_NAME_LEN)
  if (!name) return { valid: false, error: 'Please enter your name.' }

  if (p.consent !== true) return { valid: false, error: 'Please confirm you agree to be contacted.' }

  const emailRaw = trimmedOrNull(p.email, MAX_EMAIL_LEN)
  const email = emailRaw && EMAIL_PATTERN.test(emailRaw) ? emailRaw : null
  if (emailRaw && !email) return { valid: false, error: 'Please enter a valid email address.' }

  const phoneRaw = trimmedOrNull(p.phone, MAX_PHONE_LEN)
  const phone = phoneRaw && PHONE_DIGITS_PATTERN.test(phoneRaw) ? phoneRaw : null
  if (phoneRaw && !phone) return { valid: false, error: 'Please enter a valid phone number.' }

  if (!email && !phone) return { valid: false, error: 'Please provide an email or phone number.' }

  const preferredContactMethod = p.preferredContactMethod
  if (typeof preferredContactMethod !== 'string' || !PREFERRED_CONTACT_METHODS.includes(preferredContactMethod as PreferredContactMethod)) {
    return { valid: false, error: 'Please choose a preferred contact method.' }
  }

  const message = trimmedOrNull(p.message, MAX_MESSAGE_LEN)
  const propertyAddress = trimmedOrNull(p.propertyAddress, MAX_ADDRESS_LEN)

  return {
    valid: true,
    data: {
      name,
      email,
      phone,
      preferredContactMethod: preferredContactMethod as PreferredContactMethod,
      message,
      propertyAddress,
    },
  }
}
