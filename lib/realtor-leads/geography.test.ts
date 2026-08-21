import { describe, expect, it } from 'vitest'
import { classifyGeography, parseAddressParts } from './geography'

describe('parseAddressParts', () => {
  it('parses a full "street, City, ST ZIP" address', () => {
    expect(parseAddressParts('123 Main St, Tampa, FL 33602')).toEqual({ city: 'Tampa', state: 'FL', zip: '33602' })
  })

  it('parses a city/state with no ZIP', () => {
    expect(parseAddressParts('123 Main St, Clearwater, FL')).toEqual({ city: 'Clearwater', state: 'FL', zip: null })
  })

  it('handles a ZIP+4', () => {
    const result = parseAddressParts('123 Main St, Tampa, FL 33602-1234')
    expect(result.zip).toBe('33602')
  })

  it('returns all-null for an empty/unparseable string', () => {
    expect(parseAddressParts('')).toEqual({ city: null, state: null, zip: null })
    expect(parseAddressParts('123 Main St')).toEqual({ city: null, state: null, zip: null })
  })

  it('never fabricates a state for a non-US-state 2-letter fragment', () => {
    const result = parseAddressParts('123 Main St, Someplace, XX 00000')
    expect(result.state).toBeNull()
  })
})

describe('classifyGeography — Tampa Bay Area', () => {
  it('matches a recognized Tampa Bay city (case-insensitive)', () => {
    expect(classifyGeography('123 Main St, Tampa, FL 33602')).toBe('Tampa Bay Area')
    expect(classifyGeography('456 Oak Ave, st. petersburg, FL 33701')).toBe('Tampa Bay Area')
    expect(classifyGeography('789 Elm Dr, CLEARWATER, FL 33755')).toBe('Tampa Bay Area')
  })

  it('matches via a recognized Tampa Bay ZIP prefix even when the city was not recognized', () => {
    expect(classifyGeography('123 Main St, Somewhere Unlisted, FL 33612')).toBe('Tampa Bay Area')
  })

  it('matches suburbs across the Tampa Bay MSA counties', () => {
    expect(classifyGeography('1 Test Rd, Brandon, FL 33511')).toBe('Tampa Bay Area')
    expect(classifyGeography('1 Test Rd, Wesley Chapel, FL 33544')).toBe('Tampa Bay Area')
    expect(classifyGeography('1 Test Rd, New Port Richey, FL 34652')).toBe('Tampa Bay Area')
  })
})

describe('classifyGeography — Outside Tampa Bay Area', () => {
  it('a confidently-parsed non-Florida state is "Outside", not a guess', () => {
    expect(classifyGeography('1 Test Rd, Austin, TX 78701')).toBe('Outside Tampa Bay Area')
  })

  it('a Florida city that is NOT a recognized Tampa Bay city is "Outside" — being in FL never alone implies Tampa Bay', () => {
    expect(classifyGeography('1 Test Rd, Miami, FL 33101')).toBe('Outside Tampa Bay Area')
    expect(classifyGeography('1 Test Rd, Orlando, FL 32801')).toBe('Outside Tampa Bay Area')
  })
})

describe('classifyGeography — Unknown', () => {
  it('is Unknown for an empty address', () => {
    expect(classifyGeography('')).toBe('Unknown')
  })

  it('is Unknown when no state/city/ZIP can be confidently parsed', () => {
    expect(classifyGeography('123 Main Street')).toBe('Unknown')
  })

  it('never guesses "Tampa Bay Area" purely from the state being Florida', () => {
    // A bare "FL" with an unrecognized city/ZIP must resolve Outside, never Tampa Bay Area.
    const result = classifyGeography('1 Test Rd, Somewhere Else, FL 32099')
    expect(result).not.toBe('Tampa Bay Area')
  })
})
