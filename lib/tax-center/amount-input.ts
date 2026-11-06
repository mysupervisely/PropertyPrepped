/** Parse only for calculations and saving. Keep the user's original text while typing. */
export function parseTaxAmount(raw: string): number | null {
  const text = raw.trim().replace(/^\$\s*/, '')
  if (!text) return null
  if (!/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)$/.test(text)) return Number.NaN
  const amount = Number(text.replace(/,/g, ''))
  return Number.isFinite(amount) ? amount : Number.NaN
}
