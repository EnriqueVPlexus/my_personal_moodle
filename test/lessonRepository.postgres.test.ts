import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostgresDb } from '../lib/postgresDb'

type QueryHandler = (sql: string, params: unknown[]) => Promise<{ command?: string; rows: unknown[]; rowCount?: number }>

function createFakePool(handler: QueryHandler) {
  const client = {
    query: vi.fn((sql: string, params: unknown[]) => handler(sql, params)),
    release: vi.fn()
  }
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
    end: vi.fn().mockResolvedValue(undefined),
    options: {}
  }
  return { pool, client }
}

function fakeDb(pool: unknown): PostgresDb {
  return { backend: 'postgres', getPool: () => pool } as unknown as PostgresDb
}

const sampleLesson = { id: 1, module_id: 5, title: 'Lesson 1', completed: 0 }

describe('lessonRepository (postgres backend)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('findLessonsByModuleId selects lessons for a module ordered by id', async () => {
    const { findLessonsByModuleId } = await import('../lib/lessonRepository')

    const { pool } = createFakePool(async (sql) => {
      expect(sql).toContain('select')
      return { command: 'SELECT', rowCount: 1, rows: [sampleLesson] }
    })

    const result = await findLessonsByModuleId(fakeDb(pool), 5)

    expect(result).toEqual([sampleLesson])
  })

  it('findLessonById selects a single lesson by id', async () => {
    const { findLessonById } = await import('../lib/lessonRepository')

    const { pool } = createFakePool(async () => ({ command: 'SELECT', rowCount: 1, rows: [sampleLesson] }))

    const result = await findLessonById(fakeDb(pool), 1)

    expect(result).toEqual(sampleLesson)
  })

  it('findLessonWithRoadmapId joins modules to include roadmap_id', async () => {
    const { findLessonWithRoadmapId } = await import('../lib/lessonRepository')

    const { pool } = createFakePool(async (sql) => {
      expect(sql).toContain('inner join')
      return {
        command: 'SELECT',
        rowCount: 1,
        rows: [{ id: 1, module_id: 5, title: 'Lesson 1', completed: 0, roadmap_id: 10 }]
      }
    })

    const result = await findLessonWithRoadmapId(fakeDb(pool), 1)

    expect(result).toEqual({ id: 1, module_id: 5, title: 'Lesson 1', completed: 0, roadmap_id: 10 })
  })

  it('findLessonWithRoadmapId returns undefined when nothing matches', async () => {
    const { findLessonWithRoadmapId } = await import('../lib/lessonRepository')

    const { pool } = createFakePool(async () => ({ command: 'SELECT', rowCount: 0, rows: [] }))

    const result = await findLessonWithRoadmapId(fakeDb(pool), 999)

    expect(result).toBeUndefined()
  })

  it('insertLesson inserts a lesson and returns the new id', async () => {
    const { insertLesson } = await import('../lib/lessonRepository')

    const { pool, client } = createFakePool(async (sql) => {
      expect(sql).toContain('insert into')
      return { command: 'INSERT', rowCount: 1, rows: [{ id: 99 }] }
    })

    const id = await insertLesson(fakeDb(pool), { module_id: 5, title: 'New lesson' })

    expect(id).toBe(99)
    expect(client.query).toHaveBeenCalled()
  })

  it('updateLesson updates the lesson title and completion state', async () => {
    const { updateLesson } = await import('../lib/lessonRepository')

    const { pool } = createFakePool(async (sql) => {
      expect(sql).toContain('update "lessons"')
      return { command: 'UPDATE', rowCount: 1, rows: [] }
    })

    const changes = await updateLesson(fakeDb(pool), 1, { title: 'Updated', completed: true })

    expect(changes).toBe(1)
  })

  it('updateLesson marks the lesson as not completed', async () => {
    const { updateLesson } = await import('../lib/lessonRepository')

    const { pool } = createFakePool(async (sql, params) => {
      expect(params).toContain(0)
      return { command: 'UPDATE', rowCount: 1, rows: [] }
    })

    const changes = await updateLesson(fakeDb(pool), 1, { title: 'Updated', completed: false })

    expect(changes).toBe(1)
  })

  it('deleteLesson deletes a lesson by id', async () => {
    const { deleteLesson } = await import('../lib/lessonRepository')

    const { pool } = createFakePool(async (sql) => {
      expect(sql).toContain('delete from "lessons"')
      return { command: 'DELETE', rowCount: 1, rows: [] }
    })

    const changes = await deleteLesson(fakeDb(pool), 1)

    expect(changes).toBe(1)
  })
})
