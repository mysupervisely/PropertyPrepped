// Present existing analysis text as readable points without adding AI claims.
export function summaryPoints(text: string): string[] {
  return text.split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/u)
    .map(point => point.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean)
}
