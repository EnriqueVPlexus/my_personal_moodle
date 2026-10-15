import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresDb } from '../../lib/postgresDb'
import {
  findExistingRoadmapIds,
  findRoadmapById,
  updateRoadmapCore
} from '../../lib/roadmapRepository'
import {
  findModulesByRoadmapId,
  findModulesByRoadmapIds,
  findAllModules,
  findModuleById,
  insertModule,
  updateModuleCore,
  deleteModule
} from '../../lib/moduleRepository'
import {
  findLessonsByModuleId,
  findLessonById,
  findLessonWithRoadmapId,
  insertLesson,
  updateLesson,
  deleteLesson
} from '../../lib/lessonRepository'

/**
 * CRUD/list round-trip for roadmapRepository, moduleRepository and
 * lessonRepository against a real Postgres instance (backlog.md: "Tests de
 * integracion contra PostgreSQL real" - dominio contenido). These three
 * repositories were migrated to Kysely for the Postgres branch but only ever
 * exercised against a mocked `pg` pool; this proves the actual generated SQL
 * (query builder + `sql` tag helpers) runs against real Postgres.
 *
 * Requires DATABASE_URL (or TEST_DATABASE_URL, which takes precedence and
 * should point at the isolated local Docker Postgres from
 * docker-compose.test.yml - see test/postgres-integration/README.md).
 * Skipped entirely otherwise so `vitest run` stays green without one.
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describeIfPostgres = DATABASE_URL ? describe : describe.skip

describeIfPostgres('roadmap/module/lesson repositories (real postgres)', () => {
  let db: PostgresDb
  let roadmapId: number
  let otherRoadmapId: number
  let moduleId: number
  let lessonId: number

  const marker = `pg-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`

  beforeAll(async () => {
    db = new PostgresDb(DATABASE_URL as string)
    await db.migrate()

    roadmapId = (await db.run(
      'INSERT INTO roadmaps (title, version) VALUES (?, ?)',
      [`${marker}-roadmap`, 'v1.0.0']
    )).lastID as number

    otherRoadmapId = (await db.run(
      'INSERT INTO roadmaps (title, version) VALUES (?, ?)',
      [`${marker}-other-roadmap`, 'v1.0.0']
    )).lastID as number
  })

  afterAll(async () => {
    if (roadmapId) await db.run('DELETE FROM roadmaps WHERE id = ?', [roadmapId])
    if (otherRoadmapId) await db.run('DELETE FROM roadmaps WHERE id = ?', [otherRoadmapId])
    await db.close()
  })

  it('findExistingRoadmapIds filters to ids that really exist', async () => {
    const ids = await findExistingRoadmapIds(db, [roadmapId, otherRoadmapId, 999_999_999])
    expect(ids.sort()).toEqual([roadmapId, otherRoadmapId].sort())
  })

  it('findRoadmapById joins roadmap_categories and updateRoadmapCore partially updates fields', async () => {
    const before = await findRoadmapById(db, roadmapId)
    expect(before?.title).toBe(`${marker}-roadmap`)
    expect(before?.category_label).toBeNull()

    const changes = await updateRoadmapCore(db, roadmapId, {
      title: `${marker}-roadmap-updated`,
      description: 'updated description',
      duration: '4 semanas'
    })
    expect(changes).toBe(1)

    const after = await findRoadmapById(db, roadmapId)
    expect(after?.title).toBe(`${marker}-roadmap-updated`)
    expect(after?.description).toBe('updated description')
    expect(after?.duration).toBe('4 semanas')
    // version was not part of the patch: must stay untouched
    expect(after?.version).toBe('v1.0.0')
  })

  it('insertModule / findModuleById / updateModuleCore / listing helpers round-trip through Kysely', async () => {
    moduleId = await insertModule(db, {
      roadmap_id: roadmapId,
      title: `${marker}-module`,
      level: 'beginner',
      duration: '1 semana',
      duration_weeks_min: 1,
      duration_weeks_max: 1
    })
    expect(moduleId).toBeGreaterThan(0)

    const found = await findModuleById(db, moduleId)
    expect(found?.title).toBe(`${marker}-module`)
    expect(found?.level).toBe('beginner')

    const byRoadmap = await findModulesByRoadmapId(db, roadmapId)
    expect(byRoadmap.map(m => m.id)).toContain(moduleId)

    const byRoadmapIds = await findModulesByRoadmapIds(db, [roadmapId, otherRoadmapId])
    expect(byRoadmapIds.map(m => m.id)).toContain(moduleId)

    const all = await findAllModules(db)
    expect(all.map(m => m.id)).toContain(moduleId)

    const updated = await updateModuleCore(db, moduleId, {
      title: `${marker}-module-updated`,
      level: 'advanced'
    })
    expect(updated).toBe(1)

    const afterUpdate = await findModuleById(db, moduleId)
    expect(afterUpdate?.title).toBe(`${marker}-module-updated`)
    expect(afterUpdate?.level).toBe('advanced')
    // duration untouched by partial update
    expect(afterUpdate?.duration).toBe('1 semana')
  })

  it('insertLesson / findLessonWithRoadmapId (inner join) / updateLesson / deleteLesson round-trip', async () => {
    lessonId = await insertLesson(db, { module_id: moduleId, title: `${marker}-lesson` })
    expect(lessonId).toBeGreaterThan(0)

    const found = await findLessonById(db, lessonId)
    expect(found?.title).toBe(`${marker}-lesson`)
    expect(found?.completed).toBe(0)

    const withRoadmap = await findLessonWithRoadmapId(db, lessonId)
    expect(withRoadmap?.roadmap_id).toBe(roadmapId)

    const byModule = await findLessonsByModuleId(db, moduleId)
    expect(byModule.map(l => l.id)).toContain(lessonId)

    const updatedCount = await updateLesson(db, lessonId, { title: `${marker}-lesson-updated`, completed: true })
    expect(updatedCount).toBe(1)

    const afterUpdate = await findLessonById(db, lessonId)
    expect(afterUpdate?.title).toBe(`${marker}-lesson-updated`)
    expect(afterUpdate?.completed).toBe(1)

    const deletedCount = await deleteLesson(db, lessonId)
    expect(deletedCount).toBe(1)
    expect(await findLessonById(db, lessonId)).toBeUndefined()
  })

  it('deleteModule removes the module (and cascades any remaining lessons)', async () => {
    const deletedCount = await deleteModule(db, moduleId)
    expect(deletedCount).toBe(1)
    expect(await findModuleById(db, moduleId)).toBeUndefined()
  })
})
