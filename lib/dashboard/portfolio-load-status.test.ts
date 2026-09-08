import { describe, expect, it } from 'vitest'
import { friendlyPortfolioLoadMessage } from './portfolio-load-status'

describe('friendlyPortfolioLoadMessage', () => {
  it('is a short, non-technical, always-the-same message', () => {
    const message = friendlyPortfolioLoadMessage()
    expect(typeof message).toBe('string')
    expect(message.length).toBeGreaterThan(0)
    expect(message).toBe(friendlyPortfolioLoadMessage())
  })

  it('never mentions JWT or any other technical/backend term, per this milestone\'s own "do not expose JWT issued at future as the primary explanation" instruction', () => {
    const message = friendlyPortfolioLoadMessage().toLowerCase()
    for (const technicalTerm of ['jwt', 'token', 'postgrest', 'gotrue', 'supabase', 'clock skew', 'iat', '401', '403']) {
      expect(message).not.toContain(technicalTerm)
    }
  })

  it('reassures the user their data is not actually lost — the whole point of this fix', () => {
    expect(friendlyPortfolioLoadMessage()).toMatch(/properties are still there/i)
  })
})
