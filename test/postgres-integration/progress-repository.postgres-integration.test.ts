import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresDb } from '../../lib/persistence/postgresDb'
import {
  touchRoadmapProgress,
  setLessonProgress,
  listUserRoadmapProgress,
  getRoadmapDetailProgress
} from '../../lib/domains/progress/repositories/progressRepository'

/**
 * Verifies lib/progressRepository.ts against real Postgres (backlog.md:
 * "Tests de integracion contra PostgreSQL real" - dominio progreso). This is
 * the highest-risk repository per README_PROJECT.md: listUserRoadmapProgress
 * uses a CTE with ROW_NUMBER() OVER (PARTITION BY ...) plus correlated scalar
 * subqueries, and touchRoadmapProgress/setLessonProgress use
 * ON CONFLICT ... DO UPDATE SET col = EXCLUDED.col upserts with
 * self-referential COALESCE/accumulator logic, all translated by hand via
 * Kysely's `sql` tag rather than the query builder. A mocked pg pool could
 * never validate that the CTE/window function actually partitions/orders
 * correctly with real data, so this uses two roadmaps with multiple modules
 * and lessons each.
 *
 * Requires DATABASE_URL (or TEST_DATABASE_URL, which takes precedence and
 * should point at the isolated local Docker Postgres from
 * docker-compose.test.yml - see test/postgres-integration/README.md).
 * Skipped entirely otherwise so `vitest run` stays green without one.
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describeIfPostgres = DATABASE_URL ? describe : describe.skip

describeIfPostgres('progressRepository (real postgres)', () => {
  let db: PostgresDb
  let userId: number
  let roadmapAId: number
  let roadmapBId: number
  let moduleA1Id: number
  let moduleA2Id: number
  let lessonA1aId: number
  let lessonA1bId: number
  let lessonA2aId: number
  let moduleB1Id: number
  let lessonB1aId: number

  const marker = `pg-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`

  beforeAll(async () => {
    db = new PostgresDb(DATABASE_URL as string)
    await db.migrate()

    userId = (await db.run(
      'INSERT INTO users (email, name, role, password_hash, is_active) VALUES (?, ?, ?, ?, ?)',
      [`${marker}@example.com`, marker, 'user', 'not-a-real-hash', 1]
    )).lastID as number

    roadmapAId = (await db.run('INSERT INTO roadmaps (title, version) VALUES (?, ?)', [`${marker}-A`, 'v1.0.0'])).lastID as number
    roadmapBId = (await db.run('INSERT INTO roadmaps (title, version) VALUES (?, ?)', [`${marker}-B`, 'v1.0.0'])).lastID as number

    moduleA1Id = (await db.run('INSERT INTO modules (roadmap_id, position, title) VALUES (?, ?, ?)', [roadmapAId, 0, `${marker}-A1`])).lastID as number
    moduleA2Id = (await db.run('INSERT INTO modules (roadmap_id, position, title) VALUES (?, ?, ?)', [roadmapAId, 1, `${marker}-A2`])).lastID as number
    moduleB1Id = (await db.run('INSERT INTO modules (roadmap_id, position, title) VALUES (?, ?, ?)', [roadmapBId, 0, `${marker}-B1`])).lastID as number

    lessonA1aId = (await db.run('INSERT INTO lessons (module_id, title) VALUES (?, ?)', [moduleA1Id, `${marker}-A1a`])).lastID as number
    lessonA1bId = (await db.run('INSERT INTO lessons (module_id, title) VALUES (?, ?)', [moduleA1Id, `${marker}-A1b`])).lastID as number
    lessonA2aId = (await db.run('INSERT INTO lessons (module_id, title) VALUES (?, ?)', [moduleA2Id, `${marker}-A2a`])).lastID as number
    lessonB1aId = (await db.run('INSERT INTO lessons (module_id, title) VALUES (?, ?)', [moduleB1Id, `${marker}-B1a`])).lastID as number
  })

  afterAll(async () => {
    if (roadmapAId) await db.run('DELETE FROM roadmaps WHERE id = ?', [roadmapAId])
    if (roadmapBId) await db.run('DELETE FROM roadmaps WHERE id = ?', [roadmapBId])
    if (userId) await db.run('DELETE FROM users WHERE id = ?', [userId])
    await db.close()
  })

  it('touchRoadmapProgress upserts and preserves started_at via COALESCE on repeated calls', async () => {
    await touchRoadmapProgress(db, { userId, roadmapId: roadmapAId, moduleId: moduleA1Id, lessonId: lessonA1aId })
    const first = await db.get<{ started_at: string }>('SELECT started_at FROM user_roadmap_progress WHERE user_id = ? AND roadmap_id = ?', [userId, roadmapAId])
    expect(first?.started_at).toBeTruthy()

    await new Promise(resolve => setTimeout(resolve, 5))
    await touchRoadmapProgress(db, { userId, roadmapId: roadmapAId, moduleId: moduleA2Id })
    const second = await db.get<{ started_at: string; current_module_id: number }>('SELECT started_at, current_module_id FROM user_roadmap_progress WHERE user_id = ? AND roadmap_id = ?', [userId, roadmapAId])

    expect(new Date(second?.started_at as any).getTime()).toBe(new Date(first?.started_at as any).getTime())
    expect(Number(second?.current_module_id)).toBe(moduleA2Id)
  })

  it('setLessonProgress completes a lesson and accumulates time_spent_seconds across calls', async () => {
    const result1 = await setLessonProgress(db, { userId, lessonId: lessonA1aId, completed: true, timeSpentSeconds: 120 })
    expect(result1?.completed).toBe(1)
    expect(result1?.time_spent_seconds).toBe(120)

    const result2 = await setLessonProgress(db, { userId, lessonId: lessonA1aId, completed: true, timeSpentSeconds: 60 })
    expect(result2?.time_spent_seconds).toBe(180)
    // completed_at must not move once first set (COALESCE keeps original completion time)
    expect(new Date(result2?.completed_at as any).getTime()).toBe(new Date(result1?.completed_at as any).getTime())

    await setLessonProgress(db, { userId, lessonId: lessonA1bId, completed: true, timeSpentSeconds: 30 })
  })

  it('listUserRoadmapProgress: the CTE window function partitions/orders correctly across multiple roadmaps', async () => {
    // Roadmap A: lesson A1a and A1b completed, A2a pending -> next lesson must be A2a (module A2)
    // Roadmap B: nothing completed -> next lesson must be B1a (module B1)
    await touchRoadmapProgress(db, { userId, roadmapId: roadmapBId, moduleId: moduleB1Id })

    const rows = await listUserRoadmapProgress(db, userId)
    const rowA = rows.find(r => r.roadmap_id === roadmapAId)
    const rowB = rows.find(r => r.roadmap_id === roadmapBId)

    expect(rowA).toBeDefined()
    expect(rowB).toBeDefined()

    expect(rowA?.total_lessons).toBe(3)
    expect(rowA?.completed_lessons_count).toBe(2)
    // next pending lesson across the whole roadmap, correctly attributed to module A2
    expect(rowA?.next_step_label).toContain('A2a')
    expect(rowB?.total_lessons).toBe(1)
    expect(rowB?.completed_lessons_count).toBe(0)
  })

  it('getRoadmapDetailProgress aggregates per-module status without CTE/window functions', async () => {
    const detail = await getRoadmapDetailProgress(db, userId, roadmapAId)

    expect(detail.total_lessons).toBe(3)
    expect(detail.completed_lessons_count).toBe(2)
    const moduleA1 = detail.modules.find(m => m.module_id === moduleA1Id)
    const moduleA2 = detail.modules.find(m => m.module_id === moduleA2Id)
    expect(moduleA1?.status).toBe('completed')
    expect(moduleA2?.status).not.toBe('completed')
  })
})
