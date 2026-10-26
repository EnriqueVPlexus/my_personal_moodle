import { describe, expect, it } from 'vitest'
import { assertNoPlaceholderSecrets } from '../lib/domains/auth/secrets'

const REAL = 'f3a9c1d27b8e4a60915d2c7e8b4f1a3d6e9c0b5a7d2f4e8c1b3a6d9e0f2c4b7a'

describe('assertNoPlaceholderSecrets', () => {
  it('throws in production with a placeholder pepper, naming the variable', () => {
    expect(() =>
      assertNoPlaceholderSecrets({ NODE_ENV: 'production', AUTH_PASSWORD_PEPPER: 'change-me-random-pepper' })
    ).toThrow(/AUTH_PASSWORD_PEPPER.*openssl rand -hex 32/)
  })

  it('throws in production with a placeholder setup token without leaking the value', () => {
    try {
      assertNoPlaceholderSecrets({ NODE_ENV: 'production', AUTH_SETUP_TOKEN: 'change-me-setup-token' })
      throw new Error('should have thrown')
    } catch (error) {
      expect((error as Error).message).toMatch(/AUTH_SETUP_TOKEN/)
      expect((error as Error).message).not.toContain('change-me-setup-token')
    }
  })

  it('accepts real values in production', () => {
    expect(() =>
      assertNoPlaceholderSecrets({ NODE_ENV: 'production', AUTH_PASSWORD_PEPPER: REAL, AUTH_SETUP_TOKEN: REAL })
    ).not.toThrow()
  })

  it('accepts placeholders outside production', () => {
    expect(() =>
      assertNoPlaceholderSecrets({ NODE_ENV: 'development', AUTH_PASSWORD_PEPPER: 'change-me-x', AUTH_SETUP_TOKEN: 'change-me-y' })
    ).not.toThrow()
    expect(() => assertNoPlaceholderSecrets({ AUTH_PASSWORD_PEPPER: 'change-me-x' })).not.toThrow()
  })

  it('accepts unset or empty secrets in production', () => {
    expect(() => assertNoPlaceholderSecrets({ NODE_ENV: 'production', AUTH_PASSWORD_PEPPER: REAL })).not.toThrow()
    expect(() => assertNoPlaceholderSecrets({ NODE_ENV: 'production', AUTH_SETUP_TOKEN: '' })).not.toThrow()
  })
})
