import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresDb } from '../../lib/persistence/postgresDb'
import { getQueryDatabase } from '../../lib/persistence/kyselyDatabase'
import { NestedTransactionError } from '../../lib/persistence/transaction'

/**
 * Proves DatabaseClient.transaction() against real Postgres. Mocks cannot show
 * that Kysely queries (used by most repositories) run on the SAME connection
 * as raw SQL inside the transaction, that a ROLLBACK really leaves no rows, or
 * that the checked-out client goes back to the pool.
 *
 * Requires DATABASE_URL (or TEST_DATABASE_URL, which takes precedence and must
 * point at the isolated Docker Postgres from docker-compose.test.yml, see
 * test/postgres-integration/README.md). Skipped otherwise.
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describeIfPostgres = DATABASE_URL ? describe : describe.skip

const marker = `tx-it-${Date.now()}`

describeIfPostgres('PostgresDb.transaction()', () => {
  let db: PostgresDb

  beforeAll(async () => {
    db = new PostgresDb(DATABASE_URL!)
    await db.migrate()
  })

  afterAll(async () => {
    await db.run('DELETE FROM users WHERE email LIKE ?', [`${marker}%`])
    await db.run('DELETE FROM roadmaps WHERE title LIKE ?', [`${marker}%`])
    await db.close()
  })

  const countRoadmaps = async (suffix: string) =>
    Number((await db.get('SELECT COUNT(*) AS count FROM roadmaps WHERE title = ?', [`${marker}-${suffix}`])).count)

  it('commits raw and Kysely writes made in the same transaction', async () => {
    await db.transaction(async tx => {
      await tx.run('INSERT INTO roadmaps (title) VALUES (?)', [`${marker}-commit-raw`])
      await getQueryDatabase((tx as unknown as PostgresDb).getPool())
        .insertInto('roadmaps')
        .values({ title: `${marker}-commit-kysely`, version: 'v1.0.0', published_at: new Date().toISOString() } as never)
        .execute()
    })

    expect(await countRoadmaps('commit-raw')).toBe(1)
    expect(await countRoadmaps('commit-kysely')).toBe(1)
  })

  it('rolls back Kysely and raw writes together, proving Kysely joins the transaction', async () => {
    const failure = new Error('forced failure')

    await expect(db.transaction(async tx => {
      await getQueryDatabase((tx as unknown as PostgresDb).getPool())
        .insertInto('roadmaps')
        .values({ title: `${marker}-rollback-kysely`, version: 'v1.0.0', published_at: new Date().toISOString() } as never)
        .execute()
      await tx.run('INSERT INTO roadmaps (title) VALUES (?)', [`${marker}-rollback-raw`])

      // Both writes are visible inside the transaction, from either access path.
      const kyselyRow = await getQueryDatabase((tx as unknown as PostgresDb).getPool())
        .selectFrom('roadmaps').select('id').where('title', '=', `${marker}-rollback-raw`).executeTakeFirst()
      expect(kyselyRow).toBeDefined()
      expect(await tx.get('SELECT id FROM roadmaps WHERE title = ?', [`${marker}-rollback-kysely`])).toBeDefined()
      // ...and invisible outside until commit.
      expect(await countRoadmaps('rollback-kysely')).toBe(0)

      throw failure
    })).rejects.toBe(failure)

    expect(await countRoadmaps('rollback-kysely')).toBe(0)
    expect(await countRoadmaps('rollback-raw')).toBe(0)
  })

  it('releases the client after commit, rollback and a failing statement', async () => {
    const pool = db.getPool()
    const baseline = { total: pool.totalCount, idle: pool.idleCount }

    await db.transaction(async tx => { await tx.get('SELECT 1') })
    await expect(db.transaction(async () => { throw new Error('x') })).rejects.toThrow('x')
    await expect(db.transaction(async tx => { await tx.run('INSERT INTO no_such_table (a) VALUES (1)') })).rejects.toThrow()

    // The failed statement aborted the transaction, but the connection is reusable.
    expect(await db.get('SELECT 1 AS one')).toEqual({ one: 1 })
    expect(pool.waitingCount).toBe(0)
    expect(pool.idleCount).toBe(pool.totalCount)
    expect(pool.totalCount).toBeLessThanOrEqual(Math.max(baseline.total, 1) + 1)
  })

  it('does not leak connections across many transactions', async () => {
    const pool = db.getPool()
    for (let i = 0; i < 30; i++) {
      await db.transaction(async tx => { await tx.get('SELECT 1') })
    }
    expect(pool.idleCount).toBe(pool.totalCount)
    expect(pool.totalCount).toBeLessThanOrEqual(5)
  })

  it('keeps concurrent transactions isolated from each other', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) => db.transaction(async tx => {
        await tx.run('INSERT INTO roadmaps (title) VALUES (?)', [`${marker}-concurrent-${index}`])
        await new Promise(resolve => setTimeout(resolve, 10))
        if (index % 2 === 1) throw new Error(`fail ${index}`)
      }))
    )

    expect(results.map(result => result.status)).toEqual(
      Array.from({ length: 8 }, (_, index) => (index % 2 === 1 ? 'rejected' : 'fulfilled'))
    )
    const rows = await db.all('SELECT title FROM roadmaps WHERE title LIKE ? ORDER BY title', [`${marker}-concurrent-%`])
    expect(rows.map((row: any) => row.title)).toEqual(
      [0, 2, 4, 6].map(index => `${marker}-concurrent-${index}`)
    )
  })

  it('rejects nested transactions and rolls the outer one back', async () => {
    await expect(db.transaction(async tx => {
      await tx.run('INSERT INTO roadmaps (title) VALUES (?)', [`${marker}-nested`])
      await tx.transaction(async () => undefined)
    })).rejects.toBeInstanceOf(NestedTransactionError)

    expect(await countRoadmaps('nested')).toBe(0)
  })
})
