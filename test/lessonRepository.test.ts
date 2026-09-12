import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const originalCwd = process.cwd()

afterEach(async () => {
  process.chdir(originalCwd)
  vi.resetModules()
})

async function setupTempDb(prefix: string) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  process.chdir(tmp)
  const { openDb } = await import('../lib/db')
  return openDb()
}

describe('lesson repository', () => {
  it('lists lessons for a module, reads by id with roadmap id, and inserts new lessons', async () => {
    const db = await setupTempDb('moodle-lesson-repo-')
    const repo = await import('../lib/lessonRepository')

    const moduleRow = await db.get<{ id: number; roadmap_id: number }>(
      'SELECT id, roadmap_id FROM modules ORDER BY id LIMIT 1'
    )
    const seededLessonId = await repo.insertLesson(db, { module_id: moduleRow.id, title: 'Leccion existente' })

    const lessons = await repo.findLessonsByModuleId(db, moduleRow.id)
    expect(lessons.map(lesson => lesson.id)).toContain(seededLessonId)

    const withRoadmapId = await repo.findLessonWithRoadmapId(db, seededLessonId)
    expect(withRoadmapId).toMatchObject({
      id: seededLessonId,
      roadmap_id: moduleRow.roadmap_id
    })

    const newId = await repo.insertLesson(db, { module_id: moduleRow.id, title: 'Nueva leccion' })
    const inserted = await repo.findLessonById(db, newId)
    expect(inserted).toMatchObject({
      module_id: moduleRow.id,
      title: 'Nueva leccion',
      completed: 0
    })

    await db.close()
  })

  it('updates and deletes a lesson, returning zero changes when missing', async () => {
    const db = await setupTempDb('moodle-lesson-repo-write-')
    const repo = await import('../lib/lessonRepository')

    const moduleRow = await db.get<{ id: number }>('SELECT id FROM modules ORDER BY id LIMIT 1')
    const lessonId = await repo.insertLesson(db, { module_id: moduleRow.id, title: 'Leccion original' })

    const changes = await repo.updateLesson(db, lessonId, { title: 'Actualizada', completed: true })
    expect(changes).toBe(1)
    expect(await repo.findLessonById(db, lessonId)).toMatchObject({ title: 'Actualizada', completed: 1 })
    expect(await repo.updateLesson(db, 999999, { title: 'No existe', completed: false })).toBe(0)

    const deleted = await repo.deleteLesson(db, lessonId)
    expect(deleted).toBe(1)
    expect(await repo.findLessonById(db, lessonId)).toBeUndefined()
    expect(await repo.deleteLesson(db, lessonId)).toBe(0)

    await db.close()
  })
})
