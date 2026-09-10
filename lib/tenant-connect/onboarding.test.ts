import { describe, expect, it } from 'vitest'
import { postSignupRedirectPath, INTENDED_ROLE_STORAGE_KEY } from './onboarding'

describe('postSignupRedirectPath', () => {
  it('sends an "I manage properties" signup to the landlord dashboard', () => {
    expect(postSignupRedirectPath('owner')).toBe('/')
  })

  it('sends an "I\'m a tenant" signup to the tenant portal', () => {
    expect(postSignupRedirectPath('tenant')).toBe('/tenant')
  })
})

describe('INTENDED_ROLE_STORAGE_KEY', () => {
  it('is a stable, non-empty key', () => {
    expect(INTENDED_ROLE_STORAGE_KEY.length).toBeGreaterThan(0)
  })
})
