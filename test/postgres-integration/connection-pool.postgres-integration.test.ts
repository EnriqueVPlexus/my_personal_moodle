import { afterAll, describe, expect, it } from 'vitest'
import type { PostgresDb } from '../../lib/postgresDb'

/**
 * Proves backlog.md's "Gestion de conexiones y transacciones" fix:
 * openDb() used to build a brand-new PostgresDb (and therefore a brand-new
 * pg Pool with its own `max: 5` connections) on EVERY call, since nothing
 * cached the instance. Every pages/api/** handler calling openDb() per
 * request would spin up a fresh Pool per HTTP request, with nothing ever
 * closing it.
 *
 * This test calls openDb() many times (including concurrently) within one
 * process and asserts every call returns the SAME underlying pg Pool
 * (identity check via getPool()), and that the pool's client counts stay
 * bounded instead of growing per call.
 *
 * Requires DATABASE_URL (or TEST_DATABASE_URL, which takes precedence and
 * should point at the isolated local Docker Postgres from
 * docker-compose.test.yml — see test/postgres-integration/README.md).
 * Skipped entirely otherwise so `vitest run` stays green without one.
 *
 * Closes the cached pool in afterAll: Vitest isolates modules per test file,
 * so the openDb() singleton only lives in this file's module registry and
 * would otherwise keep its idle connections open until the worker exits.
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describeIfPostgres = DATABASE_URL ? describe : describe.skip

// openDb() (lib/db.ts) reads process.env.DATABASE_URL directly, not
// TEST_DATABASE_URL. Force it to the resolved value so this test exercises
// the isolated local Postgres when TEST_DATABASE_URL is set, instead of
// silently falling through to SQLite.
if (DATABASE_URL) {
  process.env.DATABASE_URL = DATABASE_URL
}

describeIfPostgres('openDb() caches a single PostgresDb/Pool per process', () => {
  afterAll(async () => {
    await ((await openDb()) as unknown as PostgresDb).close()
  })

  it('returns the same underlying Pool across many sequential calls', async () => {
    const { openDb } = await import('../../lib/db')

    const first = (await openDb()) as unknown as PostgresDb
    const firstPool = first.getPool()

    for (let i = 0; i < 20; i++) {
      const db = (await openDb()) as unknown as PostgresDb
      expect(db.getPool()).toBe(firstPool)
    }
  })

  it('returns the same underlying Pool across many concurrent calls', async () => {
    const { openDb } = await import('../../lib/db')

    const results = await Promise.all(
      Array.from({ length: 20 }, () => openDb())
    )

    const pools = results.map((db) => (db as unknown as PostgresDb).getPool())
    const firstPool = pools[0]
    for (const pool of pools) {
      expect(pool).toBe(firstPool)
    }
  })

  it('does not grow the pool client count unboundedly across repeated calls', async () => {
    const { openDb } = await import('../../lib/db')

    const before = ((await openDb()) as unknown as PostgresDb).getPool()
    const beforeTotal = before.totalCount

    await Promise.all(Array.from({ length: 20 }, () => openDb()))

    const after = ((await openDb()) as unknown as PostgresDb).getPool()

    expect(after).toBe(before)
    // The pool is capped at `max: 5` (see lib/postgresDb.ts); repeated
    // openDb() calls must reuse existing clients, never create new pools,
    // so totalCount must stay within the pool's own configured max and must
    // not have grown per openDb() call (20 calls, cap is 5).
    expect(after.totalCount).toBeLessThanOrEqual(5)
    expect(after.totalCount).toBeGreaterThanOrEqual(beforeTotal)
  })
})
