import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { PostgresDb } from '../../lib/persistence/postgresDb'
import { seedRoadmaps } from '../../lib/persistence/bootstrap/roadmapSeed'
import { seedInitialAdmin } from '../../lib/persistence/bootstrap/adminSeed'

/**
 * Regression test for the first-start seeding race: several processes (here:
 * several independent PostgresDb pools, which is what separate processes are
 * from the database's point of view) bootstrap the same EMPTY database at the
 * same time. The advisory lock in bootstrapLock.ts must make exactly one of
 * them seed the catalog and the admin.
 *
 * Runs in a throwaway DATABASE (the shared test database already contains
 * roadmaps, which would make the seed a no-op) so it needs a local Postgres
 * (docker-compose.test.yml); skipped otherwise.
 */
const BASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const isLocalHost = Boolean(BASE_URL && /^postgres(ql)?:\/\/[^/]*@?(localhost|127\.0\.0\.1)[:/]/.test(BASE_URL))
const describeIfPostgres = isLocalHost ? describe : describe.skip

describeIfPostgres('concurrent catalog seeding (real postgres, throwaway database)', () => {
  const dbName = `seed_race_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const clients: PostgresDb[] = []
  let adminPool: Pool
  let previousEnv: { email?: string; password?: string }

  beforeAll(async () => {
    previousEnv = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }
    process.env.ADMIN_EMAIL = 'race-admin@example.com'
    process.env.ADMIN_PASSWORD = 'ValidAdminPass123!'
    adminPool = new Pool({ connectionString: BASE_URL, max: 1 })
    await adminPool.query(`CREATE DATABASE "${dbName}"`)
  })

  afterAll(async () => {
    await Promise.all(clients.map(client => client.close()))
    await adminPool.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`)
    await adminPool.end()
    if (previousEnv.email === undefined) delete process.env.ADMIN_EMAIL
    else process.env.ADMIN_EMAIL = previousEnv.email
    if (previousEnv.password === undefined) delete process.env.ADMIN_PASSWORD
    else process.env.ADMIN_PASSWORD = previousEnv.password
  })

  it('seeds exactly the catalog once and one admin when 8 bootstraps race', async () => {
    const url = new URL(BASE_URL as string)
    url.pathname = `/${dbName}`

    // Schema first (idempotent CREATE IF NOT EXISTS), then everyone races on the seeds.
    const first = new PostgresDb(url.toString())
    clients.push(first)
    await first.migrate()

    const racers = Array.from({ length: 8 }, () => {
      const client = new PostgresDb(url.toString())
      clients.push(client)
      return client
    })
    await Promise.all(racers.map(async (client) => {
      await seedRoadmaps(client)
      await seedInitialAdmin(client)
    }))

    const roadmaps = await first.get('SELECT COUNT(*) AS count FROM roadmaps')
    const duplicateTitles = await first.all('SELECT title FROM roadmaps GROUP BY title HAVING COUNT(*) > 1')
    const duplicateModules = await first.all(
      'SELECT roadmap_id, position FROM modules GROUP BY roadmap_id, position HAVING COUNT(*) > 1'
    )
    const modules = await first.get('SELECT COUNT(*) AS count FROM modules')
    const admins = await first.get('SELECT COUNT(*) AS count FROM users WHERE email = ?', ['race-admin@example.com'])

    expect(Number(roadmaps.count)).toBe(3)
    expect(duplicateTitles).toEqual([])
    expect(duplicateModules).toEqual([])
    expect(Number(modules.count)).toBe(34)
    expect(Number(admins.count)).toBe(1)
  })
})
