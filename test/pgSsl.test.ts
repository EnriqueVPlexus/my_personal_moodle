import { describe, expect, it } from 'vitest'
import { resolvePgSsl } from '../lib/persistence/pgSsl'

const REMOTE = 'postgresql://u:p@db.example.supabase.co:5432/postgres'
const LOCAL = 'postgresql://u:p@localhost:5432/app'
const SERVICE = 'postgresql://u:p@db:5432/app'

describe('resolvePgSsl', () => {
  it('keeps the legacy host-based behaviour when DATABASE_SSL is unset', () => {
    expect(resolvePgSsl(LOCAL, undefined)).toBe(false)
    expect(resolvePgSsl('postgresql://u:p@127.0.0.1:5432/app', '')).toBe(false)
    expect(resolvePgSsl(REMOTE, undefined)).toEqual({ rejectUnauthorized: false })
    expect(resolvePgSsl(SERVICE, undefined)).toEqual({ rejectUnauthorized: false })
  })

  it('disables SSL explicitly for any host', () => {
    for (const value of ['false', 'disable', '0', 'off', 'no', ' FALSE ']) {
      expect(resolvePgSsl(SERVICE, value)).toBe(false)
    }
  })

  it('forces SSL explicitly, even for localhost', () => {
    for (const value of ['true', 'require', '1', 'on', 'yes']) {
      expect(resolvePgSsl(LOCAL, value)).toEqual({ rejectUnauthorized: false })
    }
  })

  it('ignores unknown values and falls back to host detection', () => {
    expect(resolvePgSsl(LOCAL, 'maybe')).toBe(false)
    expect(resolvePgSsl(REMOTE, 'maybe')).toEqual({ rejectUnauthorized: false })
  })

  it('reads DATABASE_SSL from the environment by default', () => {
    const previous = process.env.DATABASE_SSL
    process.env.DATABASE_SSL = 'false'
    try {
      expect(resolvePgSsl(REMOTE)).toBe(false)
    } finally {
      if (previous === undefined) delete process.env.DATABASE_SSL
      else process.env.DATABASE_SSL = previous
    }
  })
})
