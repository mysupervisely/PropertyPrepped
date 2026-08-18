// PropRoster — Milestone 15: Global Search V1, query-building primitives.
//
// V1 is deterministic, database-backed search — no AI call, no vector/
// semantic search, no external search infrastructure. Reuses Postgres
// `ilike` (case-insensitive, partial match) through the SAME RLS-scoped
// Supabase client every other page already uses; no new SQL, index, or
// RPC. Multi-word queries ("roof invoice") are handled in two passes:
// (1) a server-side `ilike` OR-filter across every searched column for
// EVERY word narrows the candidate set without downloading the owner's
// whole table, then (2) matchesAllWords() below re-checks, in JS, that
// every word actually appears SOMEWHERE in that row — giving correct
// "all words present, any order, any column" matching without a
// tsvector/full-text index.

/** Lowercase, whitespace-split, de-duplicated search words. Empty for a blank/whitespace-only query. */
export function normalizeSearchWords(query: string): string[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return Array.from(new Set(words))
}

/** Escapes ilike's own wildcard characters so a query containing `%` or `_` is matched literally, never as an unintended wildcard. */
export function escapeIlikePattern(word: string): string {
  return word.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** Wraps an already-escaped word for a `%word%` contains-match. */
export function ilikePattern(word: string): string {
  return `%${escapeIlikePattern(word)}%`
}

/**
 * Builds a PostgREST `.or(...)` filter string: every (column, word) pair
 * as `column.ilike.%word%`, OR'd together. This is the broad, server-side
 * candidate-narrowing pass — "does ANY word appear in ANY of these
 * columns" — cheap for Postgres to evaluate with a normal index-free
 * table scan at small-to-medium landlord-portfolio scale, and bounded by
 * the caller's own `.limit(...)`. Never returns an empty string for a
 * non-empty word list, so callers can always call `.or(filter)` safely.
 */
export function buildOrFilter(columns: string[], words: string[]): string {
  return columns.flatMap((col) => words.map((w) => `${col}.ilike.${ilikePattern(w)}`)).join(',')
}

/** True when every word appears (case-insensitively, substring match) somewhere across the given text fields — the final, precise multi-word AND check applied to the server's already-narrowed candidate rows. */
export function matchesAllWords(words: string[], haystackParts: (string | null | undefined)[]): boolean {
  if (!words.length) return false
  const haystack = haystackParts.filter((p): p is string => Boolean(p)).join(' ').toLowerCase()
  if (!haystack) return false
  return words.every((w) => haystack.includes(w.toLowerCase()))
}
