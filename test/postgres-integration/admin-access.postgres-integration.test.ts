import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresDb } from '../../lib/persistence/postgresDb'
import { createServices } from '../../lib/container'

/**
 * Real-Postgres proof that replacing a user's roadmap access is atomic: the
 * admin repositories use Kysely, which must join the unit of work's
 * transaction. Requires TEST_DATABASE_URL/DATABASE_URL pointing at the
 * isolated Docker Postgres (see test/postgres-integration/README.md).
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describeIfPostgres = DATABASE_URL ? describe : describe.skip

const marker = `admin-tx-it-${Date.now()}`

describeIfPostgres('admin service unit of work (real postgres)', () => {
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

  it('replaces a user roadmap access atomically through the admin service (Kysely repositories)', async () => {
    const now = new Date().toISOString()
    const email = `${marker}-user@example.com`
    const adminEmail = `${marker}-admin@example.com`
    const userId = (await db.run(
      `INSERT INTO users (email, name, role, password_hash, can_view_all_roadmaps, created_at, updated_at)
       VALUES (?, 'u', 'user', 'h', 0, ?, ?)`, [email, now, now])).lastID!
    const adminId = (await db.run(
      `INSERT INTO users (email, name, role, password_hash, created_at, updated_at)
       VALUES (?, 'a', 'admin', 'h', ?, ?)`, [adminEmail, now, now])).lastID!
    const roadmapA = (await db.run('INSERT INTO roadmaps (title) VALUES (?)', [`${marker}-access-a`])).lastID!
    const roadmapB = (await db.run('INSERT INTO roadmaps (title) VALUES (?)', [`${marker}-access-b`])).lastID!
    await db.run('INSERT INTO user_roadmap_access (user_id, roadmap_id) VALUES (?, ?)', [userId, roadmapA])

    // Makes the INSERT of the new grants fail after flag update + delete ran.
    await db.exec(`
      CREATE OR REPLACE FUNCTION ${marker.replace(/-/g, '_')}_fail() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'access insert failed'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER ${marker.replace(/-/g, '_')}_trg BEFORE INSERT ON user_roadmap_access
      FOR EACH ROW EXECUTE FUNCTION ${marker.replace(/-/g, '_')}_fail();
    `)
    try {
      await expect(createServices(db).admin.updateUser({ id: adminId }, userId, {
        action: 'set_roadmap_access', can_view_all_roadmaps: false, roadmap_ids: [roadmapB]
      })).rejects.toThrow('access insert failed')
    } finally {
      await db.exec(`DROP TRIGGER ${marker.replace(/-/g, '_')}_trg ON user_roadmap_access`)
      await db.exec(`DROP FUNCTION ${marker.replace(/-/g, '_')}_fail()`)
    }

    const access = await db.all('SELECT roadmap_id FROM user_roadmap_access WHERE user_id = ?', [userId])
    expect(access.map((row: any) => row.roadmap_id)).toEqual([roadmapA])

    // Without the failure the same call replaces the grants.
    const outcome = await createServices(db).admin.updateUser({ id: adminId }, userId, {
      action: 'set_roadmap_access', can_view_all_roadmaps: false, roadmap_ids: [roadmapB]
    })
    expect(outcome).toMatchObject({ status: 'ok', user: { roadmap_access_ids: [roadmapB] } })
  })
})
