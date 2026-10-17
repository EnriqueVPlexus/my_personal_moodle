import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresDb } from '../../lib/persistence/postgresDb'
import { getAdminDashboard } from '../../lib/domains/admin/repositories/dashboardRepository'

/**
 * Verifies the SQLite -> Postgres translation of `inactivity_days`
 * (backlog.md: "verificar el calculo de inactivity_days en admin dashboard
 * ... contra casos de borde con fracciones de dia cerca de un limite")
 * against a real Postgres instance instead of a mocked pool.
 *
 * Requires DATABASE_URL (or TEST_DATABASE_URL, which takes precedence and
 * should point at the isolated local Docker Postgres from
 * docker-compose.test.yml - see test/postgres-integration/README.md).
 * Skipped entirely otherwise so `vitest run` stays green without one.
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describeIfPostgres = DATABASE_URL ? describe : describe.skip

describeIfPostgres('inactivity_days FLOOR/EXTRACT translation (real postgres)', () => {
  let db: PostgresDb

  beforeAll(async () => {
    db = new PostgresDb(DATABASE_URL as string)
    await db.migrate()
  })

  afterAll(async () => {
    await db.close()
  })

  const now = new Date('2026-01-15T12:00:00.000Z')

  const cases: Array<{ label: string; secondsAgo: number; expectedDays: number }> = [
    { label: 'exactly 14 days', secondsAgo: 14 * 86400, expectedDays: 14 },
    { label: '14 days + 12h', secondsAgo: 14 * 86400 + 43200, expectedDays: 14 },
    { label: '1s short of 15 days', secondsAgo: 15 * 86400 - 1, expectedDays: 14 },
    { label: 'exactly 15 days', secondsAgo: 15 * 86400, expectedDays: 15 },
    { label: '1s past 15 days', secondsAgo: 15 * 86400 + 1, expectedDays: 15 },
    { label: '1s short of 31 days', secondsAgo: 31 * 86400 - 1, expectedDays: 30 },
    { label: '1s short of 1 day', secondsAgo: 86400 - 1, expectedDays: 0 }
  ]

  it.each(cases)('$label -> $expectedDays', async ({ secondsAgo, expectedDays }) => {
    const lastActivityAt = new Date(now.getTime() - secondsAgo * 1000).toISOString()

    const row = await db.get<{ inactivity_days: number }>(
      'SELECT FLOOR(EXTRACT(EPOCH FROM (?::timestamptz - ?::timestamptz)) / 86400)::INTEGER AS inactivity_days',
      [now.toISOString(), lastActivityAt]
    )

    expect(Number(row.inactivity_days)).toBe(expectedDays)
  })
})

describeIfPostgres('getAdminDashboard stalled_learners (real postgres, end-to-end)', () => {
  let db: PostgresDb
  let userId: number
  let roadmapId: number

  const marker = `pg-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const testEmail = `${marker}@example.com`
  const now = new Date('2026-01-15T12:00:00.000Z')
  const inactivityDays = 9999

  beforeAll(async () => {
    db = new PostgresDb(DATABASE_URL as string)
    await db.migrate()

    roadmapId = (await db.run(
      'INSERT INTO roadmaps (title, version) VALUES (?, ?)',
      [marker, 'v1.0.0']
    )).lastID as number

    const moduleId = (await db.run(
      'INSERT INTO modules (roadmap_id, title) VALUES (?, ?)',
      [roadmapId, `${marker}-module`]
    )).lastID as number

    await db.run('INSERT INTO lessons (module_id, title) VALUES (?, ?)', [moduleId, `${marker}-lesson`])

    userId = (await db.run(
      'INSERT INTO users (email, name, role, password_hash, is_active) VALUES (?, ?, ?, ?, ?)',
      [testEmail, marker, 'user', 'not-a-real-hash', 1]
    )).lastID as number

    const lastActivityAt = new Date(now.getTime() - inactivityDays * 86400 * 1000).toISOString()
    await db.run(
      `INSERT INTO user_roadmap_progress
         (user_id, roadmap_id, current_module_id, last_activity_at, completed_lessons_count)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, roadmapId, moduleId, lastActivityAt, 0]
    )
  })

  afterAll(async () => {
    if (userId) await db.run('DELETE FROM users WHERE id = ?', [userId])
    if (roadmapId) await db.run('DELETE FROM roadmaps WHERE id = ?', [roadmapId])
    await db.close()
  })

  it('reports the exact inactivity_days for a fully-isolated stalled learner', async () => {
    const dashboard = await getAdminDashboard(db, { now })
    const learner = dashboard.stalled_learners.find(row => row.email === testEmail)

    expect(learner).toBeDefined()
    expect(learner?.inactivity_days).toBe(inactivityDays)
  })
})
