import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresDb } from '../../lib/persistence/postgresDb'
import { createServices } from '../../lib/container'

/**
 * Real-Postgres proof that DELETE of a roadmap reports whether a row was
 * removed (affected-row count), so the API can answer 204 vs 200 + message.
 * Requires TEST_DATABASE_URL/DATABASE_URL pointing at the isolated Docker
 * Postgres (see test/postgres-integration/README.md).
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describeIfPostgres = DATABASE_URL ? describe : describe.skip

const marker = `roadmap-delete-it-${Date.now()}`

describeIfPostgres('roadmap deletion (real postgres)', () => {
  let db: PostgresDb

  beforeAll(async () => {
    db = new PostgresDb(DATABASE_URL!)
    await db.migrate()
  })

  afterAll(async () => {
    await db.run('DELETE FROM roadmaps WHERE title LIKE ?', [`${marker}%`])
    await db.close()
  })

  it('reports deleted=true once and deleted=false afterwards', async () => {
    const id = (await db.run('INSERT INTO roadmaps (title) VALUES (?)', [`${marker}-a`])).lastID!
    const { content } = createServices(db)

    expect(await content.deleteRoadmap(id)).toEqual({ deleted: true, title: `${marker}-a` })
    expect(await content.deleteRoadmap(id)).toEqual({ deleted: false, title: null })
  })
})
