import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresDb } from '../../lib/persistence/postgresDb'
import { createQuizSessionRepository } from '../../lib/domains/progress/repositories/quizSessionRepository'
import { insertModuleQuizAttempt } from '../../lib/domains/progress/repositories/quizRepository'
import type { ModuleQuizSource } from '../../lib/domains/content/quizzes'

/**
 * Verifies lib/domains/progress/repositories/quizSessionRepository.ts against
 * real Postgres: TIMESTAMPTZ comparisons for expiry, the conditional
 * "mark submitted" update (double-submit protection, also across a real
 * transaction) and ON DELETE CASCADE from users and modules.
 *
 * Requires DATABASE_URL (or TEST_DATABASE_URL, which takes precedence and
 * should point at the isolated local Docker Postgres from
 * docker-compose.test.yml - see test/postgres-integration/README.md).
 * Skipped entirely otherwise so `vitest run` stays green without one.
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describeIfPostgres = DATABASE_URL ? describe : describe.skip

describeIfPostgres('quizSessionRepository (real postgres)', () => {
  let db: PostgresDb
  let userId: number
  let otherUserId: number
  let roadmapId: number
  let moduleId: number
  const marker = `pg-integration-qs-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const id = (suffix: string) => `${marker}-${suffix}`

  const questions = [
    { id: 'bank-2', type: 'multiple_choice' as const, prompt: 'Q?', options: ['A', 'B'], correct_option_index: 1, explanation: 'why' }
  ]
  const NOW = '2026-03-01T10:00:00.000Z'
  const LATER = '2026-03-02T10:00:00.000Z'

  function newSession(suffix: string, over: Record<string, unknown> = {}) {
    return { id: id(suffix), userId, moduleId, questions, createdAt: NOW, expiresAt: LATER, ...over }
  }

  beforeAll(async () => {
    db = new PostgresDb(DATABASE_URL as string)
    await db.migrate()

    const insertUser = async (suffix: string) => (await db.run(
      'INSERT INTO users (email, name, role, password_hash, is_active) VALUES (?, ?, ?, ?, ?)',
      [`${marker}-${suffix}@example.com`, `${marker}-${suffix}`, 'user', 'not-a-real-hash', 1]
    )).lastID as number
    userId = await insertUser('a')
    otherUserId = await insertUser('b')
    roadmapId = (await db.run('INSERT INTO roadmaps (title, version) VALUES (?, ?)', [`${marker}-roadmap`, 'v1.0.0'])).lastID as number
    moduleId = (await db.run('INSERT INTO modules (roadmap_id, position, title) VALUES (?, ?, ?)', [roadmapId, 0, `${marker}-module`])).lastID as number
  })

  afterAll(async () => {
    if (roadmapId) await db.run('DELETE FROM roadmaps WHERE id = ?', [roadmapId])
    for (const uid of [userId, otherUserId]) if (uid) await db.run('DELETE FROM users WHERE id = ?', [uid])
    await db.close()
  })

  it('round-trips a session and finds the latest open one per user and module', async () => {
    const repo = createQuizSessionRepository(db)
    await repo.create(newSession('old', { createdAt: '2026-03-01T09:00:00.000Z' }))
    const created = await repo.create(newSession('new', { createdAt: '2026-03-01T09:30:00.000Z' }))
    await repo.create(newSession('other-user', { userId: otherUserId }))

    expect(await repo.findById(id('new'))).toEqual(created)
    expect((await repo.findActive(userId, moduleId, NOW))?.id).toBe(id('new'))
    expect((await repo.findActive(otherUserId, moduleId, NOW))?.id).toBe(id('other-user'))
  })

  it('ignores expired and submitted sessions', async () => {
    const repo = createQuizSessionRepository(db)
    await db.run('DELETE FROM quiz_attempt_sessions WHERE user_id = ?', [otherUserId])
    await repo.create(newSession('short', { userId: otherUserId, expiresAt: '2026-03-01T10:30:00.000Z' }))

    expect((await repo.findActive(otherUserId, moduleId, NOW))?.id).toBe(id('short'))
    expect(await repo.findActive(otherUserId, moduleId, '2026-03-01T11:00:00.000Z')).toBeNull()

    expect(await repo.markSubmitted(id('short'), NOW)).toBe(true)
    expect(await repo.findActive(otherUserId, moduleId, NOW)).toBeNull()
  })

  it('lets only one of several concurrent submits win and rolls back the loser', async () => {
    const repo = createQuizSessionRepository(db)
    await repo.create(newSession('race'))
    const source = { id: moduleId, roadmap_id: roadmapId } as unknown as ModuleQuizSource
    const grade = { score: 1, max_score: 1, percentage: 100, passed: true, feedback: [] }

    const submit = () => db.transaction(async tx => {
      if (!(await createQuizSessionRepository(tx).markSubmitted(id('race'), NOW))) return false
      await insertModuleQuizAttempt(tx, userId, source, { 'bank-2': 1 }, grade, id('race'))
      return true
    })
    const results = await Promise.all([submit(), submit(), submit()])

    expect(results.filter(Boolean)).toHaveLength(1)
    const stored = await db.all('SELECT answers FROM user_quiz_attempts WHERE user_id = ? AND module_id = ?', [userId, moduleId])
    expect(stored.filter(r => JSON.parse(r.answers).attempt_id === id('race'))).toHaveLength(1)
  })

  it('cascades when the user or the module is deleted', async () => {
    const repo = createQuizSessionRepository(db)
    const tmpUser = (await db.run(
      'INSERT INTO users (email, name, role, password_hash, is_active) VALUES (?, ?, ?, ?, ?)',
      [`${marker}-tmp@example.com`, `${marker}-tmp`, 'user', 'x', 1]
    )).lastID as number
    const tmpModule = (await db.run('INSERT INTO modules (roadmap_id, position, title) VALUES (?, ?, ?)', [roadmapId, 1, `${marker}-tmp`])).lastID as number
    await repo.create(newSession('by-user', { userId: tmpUser }))
    await repo.create(newSession('by-module', { moduleId: tmpModule }))

    await db.run('DELETE FROM users WHERE id = ?', [tmpUser])
    await db.run('DELETE FROM modules WHERE id = ?', [tmpModule])

    expect(await repo.findById(id('by-user'))).toBeNull()
    expect(await repo.findById(id('by-module'))).toBeNull()
  })
})
