// PropRoster — PropCrew Mobile Cleanup V1: presentation-only phone
// formatting for PropCrew contact cards. Never touches stored data —
// property_contacts.phone stays exactly as entered in the database and
// in the edit form; this only decides how a clearly-recognizable US
// 10-digit number is DISPLAYED on the read-only card. Any other shape
// (a different digit count, an extension, letters, an already-
// international number PropCrew doesn't otherwise validate) is
// returned completely unchanged — this deliberately does not attempt
// to be a general phone-number library, only the common "someone typed
// 10 raw digits" case real-device review flagged (e.g. "3214371496").

/**
 * (321) 437-1496 for a clearly-recognizable US number — exactly 10
 * digits, or 11 digits with a leading US country code '1' (rendered as
 * "+1 (321) 437-1496"). Every other shape is returned as-is, untouched,
 * so this never mangles an international number, an extension, or
 * anything else this app doesn't already validate as a plain US number.
 */
export function formatPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const hasCountryCode = digits.length === 11 && digits.startsWith('1')
  const core = hasCountryCode ? digits.slice(1) : digits
  if (core.length !== 10) return phone
  const formatted = `(${core.slice(0, 3)}) ${core.slice(3, 6)}-${core.slice(6)}`
  return hasCountryCode ? `+1 ${formatted}` : formatted
}
