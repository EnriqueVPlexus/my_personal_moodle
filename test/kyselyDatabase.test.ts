import { describe, expect, it } from 'vitest'
import type { Pool } from 'pg'
import { getQueryDatabase } from '../lib/kyselyDatabase'

describe('getQueryDatabase', () => {
  it('caches one Kysely instance per pool', () => {
    const poolA = {} as Pool
    const first = getQueryDatabase(poolA)
    const second = getQueryDatabase(poolA)

    expect(second).toBe(first)
  })

  it('creates independent instances for different pools', () => {
    const poolA = {} as Pool
    const poolB = {} as Pool

    const dbA = getQueryDatabase(poolA)
    const dbB = getQueryDatabase(poolB)

    expect(dbA).not.toBe(dbB)
  })
})
