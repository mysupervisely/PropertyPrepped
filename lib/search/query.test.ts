import { describe, expect, it } from 'vitest'
import { buildOrFilter, escapeIlikePattern, ilikePattern, matchesAllWords, normalizeSearchWords } from './query'

describe('normalizeSearchWords', () => {
  it('lowercases and splits on whitespace', () => {
    expect(normalizeSearchWords('Roof Invoice')).toEqual(['roof', 'invoice'])
  })

  it('collapses repeated whitespace and trims', () => {
    expect(normalizeSearchWords('  roof    invoice  ')).toEqual(['roof', 'invoice'])
  })

  it('de-duplicates repeated words', () => {
    expect(normalizeSearchWords('roof roof invoice')).toEqual(['roof', 'invoice'])
  })

  it('returns an empty array for a blank query', () => {
    expect(normalizeSearchWords('   ')).toEqual([])
    expect(normalizeSearchWords('')).toEqual([])
  })
})

describe('escapeIlikePattern / ilikePattern', () => {
  it('escapes ilike wildcard characters so they are matched literally', () => {
    expect(escapeIlikePattern('50%_off')).toBe('50\\%\\_off')
  })

  it('wraps an escaped word for a contains-match', () => {
    expect(ilikePattern('roof')).toBe('%roof%')
    expect(ilikePattern('50%')).toBe('%50\\%%')
  })
})

describe('buildOrFilter', () => {
  it('produces a column.ilike.%word% pair for every column/word combination, OR-joined', () => {
    const filter = buildOrFilter(['name', 'category'], ['roof', 'invoice'])
    expect(filter).toBe('name.ilike.%roof%,name.ilike.%invoice%,category.ilike.%roof%,category.ilike.%invoice%')
  })

  it('returns an empty string for no columns', () => {
    expect(buildOrFilter([], ['roof'])).toBe('')
  })
})

describe('matchesAllWords', () => {
  it('matches when a single word appears in one of the fields', () => {
    expect(matchesAllWords(['roof'], ['Roof Replacement Invoice.pdf', 'Maintenance'])).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(matchesAllWords(['ROOF'], ['roof replacement'])).toBe(true)
  })

  it('requires every word to be present somewhere, in any field, any order', () => {
    expect(matchesAllWords(['roof', 'invoice'], ['Invoice for roof repair', 'Maintenance'])).toBe(true)
  })

  it('does not match when only some words are present', () => {
    expect(matchesAllWords(['roof', 'invoice'], ['Roof repair', 'Maintenance'])).toBe(false)
  })

  it('is a substring match — a word need not be a whole token', () => {
    expect(matchesAllWords(['air'], ['ABC Air Conditioning'])).toBe(true)
  })

  it('never matches an empty word list', () => {
    expect(matchesAllWords([], ['Roof Replacement Invoice.pdf'])).toBe(false)
  })

  it('never matches when every haystack field is null/empty', () => {
    expect(matchesAllWords(['roof'], [null, undefined, ''])).toBe(false)
  })

  it('ignores null/undefined fields when checking the remaining ones', () => {
    expect(matchesAllWords(['roof'], [null, 'Roof Replacement', undefined])).toBe(true)
  })
})
