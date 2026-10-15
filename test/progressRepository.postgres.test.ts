import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostgresDb } from '../lib/persistence/postgresDb'

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

describe('progressRepository (postgres backend)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('listUserRoadmapProgress', () => {
    it('runs the CTE + window function query through Kysely and maps rows', async () => {
      const { listUserRoadmapProgress } = await import('../lib/domains/progress/repositories/progressRepository')

      const recentActivity = new Date().toISOString()
      const { pool, client } = createFakePool(async (sql, params) => {
        expect(sql).toContain('WITH next_lessons AS')
        expect(sql).toContain('ROW_NUMBER() OVER')
        expect(sql).toContain('PARTITION BY modules.roadmap_id')
        expect(sql).toContain('ORDER BY user_roadmap_progress.last_activity_at DESC')
        // Postgres timestamps are native TIMESTAMPTZ, so no datetime() wrapper
        // should survive the SQLite -> Postgres translation.
        expect(sql).not.toContain('datetime(')
        expect(params).toContain(42)
        return {
          command: 'SELECT',
          rowCount: 1,
          rows: [
            {
              roadmap_id: 7,
              title: 'Roadmap Test',
              description: 'desc',
              duration: '8 semanas',
              started_at: '2026-07-01T09:00:00.000Z',
              last_activity_at: recentActivity,
              completed_at: null,
              completed_lessons_count: 1,
              time_spent_seconds: 600,
              current_module_id: 15,
              current_module_title: 'Observabilidad',
              current_lesson_id: 42,
              current_lesson_title: 'Evaluacion',
              next_module_id: 15,
              next_module_title: 'Observabilidad',
              next_lesson_id: 43,
              next_lesson_title: 'Alertas',
              quiz_attempts_count: 2,
              average_quiz_percentage: 67.4,
              best_quiz_percentage: 80,
              last_quiz_percentage: 60,
              total_modules: 2,
              total_lessons: 4
            }
          ]
        }
      })

      const result = await listUserRoadmapProgress(fakeDb(pool), 42)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        roadmap_id: 7,
        status: 'in_progress',
        progress_percentage: 25,
        next_href: '/modules/15',
        next_step_label: 'Continuar con Alertas',
        quiz_attempts_count: 2,
        average_quiz_percentage: 67,
        best_quiz_percentage: 80,
        last_quiz_percentage: 60
      })
      expect(pool.connect).toHaveBeenCalled()
      expect(client.release).toHaveBeenCalled()
    })

    it('returns an empty array when the user has no roadmap progress', async () => {
      const { listUserRoadmapProgress } = await import('../lib/domains/progress/repositories/progressRepository')
      const { pool } = createFakePool(async () => ({ command: 'SELECT', rowCount: 0, rows: [] }))

      const result = await listUserRoadmapProgress(fakeDb(pool), 1)

      expect(result).toEqual([])
    })
  })

  describe('touchRoadmapProgress', () => {
    it('upserts via ON CONFLICT ... DO UPDATE SET with EXCLUDED references', async () => {
      const { touchRoadmapProgress } = await import('../lib/domains/progress/repositories/progressRepository')

      const calls: string[] = []
      const { pool, client } = createFakePool(async sql => {
        calls.push(sql)
        if (/^\s*select/i.test(sql)) {
          return { command: 'SELECT', rowCount: 0, rows: [] }
        }
        expect(sql).toContain('ON CONFLICT (user_id, roadmap_id) DO UPDATE SET')
        expect(sql).toContain('excluded.current_module_id')
        expect(sql).toContain('COALESCE(user_roadmap_progress.started_at, excluded.started_at)')
        return { command: 'INSERT', rowCount: 1, rows: [] }
      })

      await touchRoadmapProgress(fakeDb(pool), { userId: 1, roadmapId: 2, moduleId: 10, lessonId: 100 })

      expect(calls.some(sql => /insert into user_roadmap_progress/i.test(sql))).toBe(true)
      expect(client.query).toHaveBeenCalled()
    })
  })

  describe('setLessonProgress', () => {
    it('upserts the lesson row with the time_spent_seconds accumulator and refreshes roadmap progress', async () => {
      const { setLessonProgress } = await import('../lib/domains/progress/repositories/progressRepository')

      const rows: Record<string, any> = {
        lesson_id: 100,
        title: 'Introduccion',
        module_id: 10,
        roadmap_id: 2
      }

      const { pool } = createFakePool(async (sql, params) => {
        if (/select lessons\.id/i.test(sql)) {
          return { command: 'SELECT', rowCount: 1, rows: [rows] }
        }
        if (/insert into user_lesson_progress/i.test(sql)) {
          expect(sql).toContain('ON CONFLICT (user_id, lesson_id) DO UPDATE SET')
          expect(sql).toContain('time_spent_seconds = user_lesson_progress.time_spent_seconds + excluded.time_spent_seconds')
          expect(sql).toContain('CASE')
          return { command: 'INSERT', rowCount: 1, rows: [] }
        }
        if (/^\s*select \* from user_lesson_progress/i.test(sql)) {
          return {
            command: 'SELECT',
            rowCount: 1,
            rows: [{
              started_at: '2026-07-01T09:00:00.000Z',
              completed_at: '2026-07-01T09:10:00.000Z',
              time_spent_seconds: 600
            }]
          }
        }
        if (/from user_lesson_progress/i.test(sql) && /inner join lessons/i.test(sql)) {
          return { command: 'SELECT', rowCount: 1, rows: [{ time_spent_seconds: 600, completed_lessons_count: 1, completed_at: null }] }
        }
        if (/select count\(\*\) as count/i.test(sql)) {
          return { command: 'SELECT', rowCount: 1, rows: [{ count: 3 }] }
        }
        if (/select \* from user_roadmap_progress/i.test(sql)) {
          return { command: 'SELECT', rowCount: 0, rows: [] }
        }
        if (/insert into user_roadmap_progress/i.test(sql)) {
          return { command: 'INSERT', rowCount: 1, rows: [] }
        }
        return { command: 'SELECT', rowCount: 0, rows: [] }
      })

      const result = await setLessonProgress(fakeDb(pool), { userId: 1, lessonId: 100, completed: true, timeSpentSeconds: 300 })

      expect(result).toMatchObject({
        lesson_id: 100,
        module_id: 10,
        roadmap_id: 2,
        time_spent_seconds: 600
      })
    })

    it('returns null when the lesson does not exist', async () => {
      const { setLessonProgress } = await import('../lib/domains/progress/repositories/progressRepository')
      const { pool } = createFakePool(async () => ({ command: 'SELECT', rowCount: 0, rows: [] }))

      const result = await setLessonProgress(fakeDb(pool), { userId: 1, lessonId: 999, completed: true })

      expect(result).toBeNull()
    })
  })

  describe('getRoadmapDetailProgress', () => {
    it('builds module/lesson breakdown via the Kysely query builder', async () => {
      const { getRoadmapDetailProgress } = await import('../lib/domains/progress/repositories/progressRepository')
      const recentActivity = new Date().toISOString()

      const { pool, client } = createFakePool(async sql => {
        if (/left join "modules" as "current_module"/i.test(sql)) {
          return {
            command: 'SELECT',
            rowCount: 1,
            rows: [{
              roadmap_id: 7,
              started_at: '2026-07-01T09:00:00.000Z',
              last_activity_at: recentActivity,
              completed_at: null,
              current_module_id: 15,
              current_lesson_id: 42,
              current_module_title: 'Observabilidad',
              current_lesson_title: 'Evaluacion'
            }]
          }
        }
        if (/group by/i.test(sql)) {
          expect(sql).toContain('select "modules"."id"')
          return {
            command: 'SELECT',
            rowCount: 1,
            rows: [{
              module_id: 15,
              title: 'Observabilidad',
              position: 1,
              total_lessons: '2',
              completed_lessons_count: '1',
              last_activity_at: recentActivity
            }]
          }
        }
        return {
          command: 'SELECT',
          rowCount: 2,
          rows: [
            { lesson_id: 42, lesson_title: 'Evaluacion', module_id: 15, module_title: 'Observabilidad', completed: 1, time_spent_seconds: 1200 },
            { lesson_id: 43, lesson_title: 'Alertas', module_id: 15, module_title: 'Observabilidad', completed: 0, time_spent_seconds: 0 }
          ]
        }
      })

      const result = await getRoadmapDetailProgress(fakeDb(pool), 2, 7)

      expect(result).toMatchObject({
        roadmap_id: 7,
        completed_lessons_count: 1,
        total_lessons: 2,
        progress_percentage: 50,
        status: 'in_progress',
        time_spent_seconds: 1200
      })
      expect(pool.connect).toHaveBeenCalled()
      expect(client.release).toHaveBeenCalled()
    })
  })
})
