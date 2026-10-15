import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const originalCwd = process.cwd()

async function withTempDb<T>(prefix: string, run: (db: any, openDb: any) => Promise<T>): Promise<T> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  process.chdir(tmp)
  const { openDb } = await import('../lib/persistence')
  const db = await openDb()
  try {
    return await run(db, openDb)
  } finally {
    await db.close()
  }
}

afterEach(async () => {
  process.chdir(originalCwd)
  vi.resetModules()
})

describe('progressRepository (sqlite backend)', () => {
  it('builds roadmap summaries with next step and completion status', async () => {
    await withTempDb('moodle-progress-summary-', async db => {
      const { listUserRoadmapProgress, touchRoadmapProgress, setLessonProgress } = await import('../lib/progressRepository')

      await db.exec(`
        INSERT INTO roadmaps (id, title, description, duration) VALUES (9500, 'Roadmap Summary', 'Ruta test', '8 semanas');
        INSERT INTO modules (id, roadmap_id, title, position) VALUES (9510, 9500, 'Fundamentos', 1);
        INSERT INTO lessons (id, module_id, title) VALUES (9600, 9510, 'Introduccion');
        INSERT INTO lessons (id, module_id, title) VALUES (9601, 9510, 'Practica');
      `)

      const userId = 999001
      await db.run(
        `INSERT INTO users (id, email, name, role, password_hash, can_view_all_roadmaps, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 'user', 'hash', 1, 1, datetime('now'), datetime('now'))`,
        [userId, 'progress-summary@example.com', 'Progress Summary']
      )

      await setLessonProgress(db, { userId, lessonId: 9600, completed: true, timeSpentSeconds: 120 })
      await touchRoadmapProgress(db, { userId, roadmapId: 9500, moduleId: 9510 })

      const result = await listUserRoadmapProgress(db, userId)
      const summary = result.find(item => item.roadmap_id === 9500)

      expect(summary).toBeDefined()
      expect(summary).toMatchObject({
        roadmap_id: 9500,
        completed_lessons_count: 1,
        time_spent_seconds: 120,
        status: 'in_progress',
        next_href: '/modules/9510',
        next_step_label: 'Continuar con Practica'
      })
    })
  })

  it('derives fresh summaries, resumes the first pending lesson and reopens stale completion', async () => {
    await withTempDb('moodle-progress-fresh-', async db => {
      const { listUserRoadmapProgress } = await import('../lib/progressRepository')

      await db.exec(`
        INSERT INTO roadmaps (id, title, description, duration) VALUES (9001, 'Roadmap Test', 'Ruta test', '8 semanas');
        INSERT INTO modules (id, roadmap_id, title, position) VALUES (9010, 9001, 'Fundamentos', 1);
        INSERT INTO modules (id, roadmap_id, title, position) VALUES (9011, 9001, 'Operaciones', 2);
        INSERT INTO lessons (id, module_id, title) VALUES (9100, 9010, 'Introduccion');
        INSERT INTO lessons (id, module_id, title) VALUES (9101, 9010, 'Practica');
        INSERT INTO lessons (id, module_id, title) VALUES (9102, 9011, 'Observabilidad');
      `)

      const userId = 999002
      await db.run(
        `INSERT INTO users (id, email, name, role, password_hash, can_view_all_roadmaps, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 'user', 'hash', 1, 1, datetime('now'), datetime('now'))`,
        [userId, 'progress-fresh@example.com', 'Progress Fresh']
      )
      await db.run(
        `INSERT INTO user_lesson_progress (
          user_id, lesson_id, started_at, last_activity_at, completed_at,
          time_spent_seconds, created_at, updated_at
        ) VALUES (?, 9100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 120, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [userId]
      )
      await db.run(
        `INSERT INTO user_roadmap_progress (
          user_id, roadmap_id, current_module_id, current_lesson_id, started_at,
          last_activity_at, completed_at, completed_lessons_count, time_spent_seconds,
          created_at, updated_at
        ) VALUES (?, 9001, 9010, 9100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 99, 9999, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [userId]
      )

      const [summary] = await listUserRoadmapProgress(db, userId)

      expect(summary).toMatchObject({
        roadmap_id: 9001,
        completed_lessons_count: 1,
        total_lessons: 3,
        time_spent_seconds: 120,
        progress_percentage: 33,
        status: 'in_progress',
        completed_at: null,
        next_href: '/modules/9010',
        next_step_label: 'Continuar con Practica',
        average_quiz_percentage: null,
        best_quiz_percentage: null,
        last_quiz_percentage: null
      })
    })
  })

  it('caps study increments, preserves first completion and supports reopening', async () => {
    await withTempDb('moodle-progress-cap-', async db => {
      const { setLessonProgress, touchRoadmapProgress } = await import('../lib/progressRepository')

      await db.exec(`
        INSERT INTO roadmaps (id, title) VALUES (9002, 'Roadmap Cap');
        INSERT INTO modules (id, roadmap_id, title) VALUES (9020, 9002, 'Fundamentos');
        INSERT INTO lessons (id, module_id, title) VALUES (9200, 9020, 'Introduccion');
      `)
      const userId = 999003
      const otherUserId = 999004
      await db.run(
        `INSERT INTO users (id, email, name, role, password_hash, can_view_all_roadmaps, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 'user', 'hash', 1, 1, datetime('now'), datetime('now'))`,
        [userId, 'progress-cap@example.com', 'Progress Cap']
      )
      await db.run(
        `INSERT INTO users (id, email, name, role, password_hash, can_view_all_roadmaps, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 'user', 'hash', 1, 1, datetime('now'), datetime('now'))`,
        [otherUserId, 'progress-cap-2@example.com', 'Progress Cap 2']
      )

      const first = await setLessonProgress(db, {
        userId,
        lessonId: 9200,
        completed: true,
        timeSpentSeconds: 99_999
      })
      const second = await setLessonProgress(db, {
        userId,
        lessonId: 9200,
        completed: true,
        timeSpentSeconds: 60
      })

      expect(first?.time_spent_seconds).toBe(1800)
      expect(second?.time_spent_seconds).toBe(1860)
      expect(second?.completed_at).toBe(first?.completed_at)

      const reopened = await setLessonProgress(db, {
        userId,
        lessonId: 9200,
        completed: false,
        timeSpentSeconds: 0
      })
      const roadmapProgress = await db.get(
        'SELECT completed_at, completed_lessons_count FROM user_roadmap_progress WHERE user_id = ? AND roadmap_id = 9002',
        [userId]
      )

      expect(reopened?.completed_at).toBeNull()
      expect(roadmapProgress).toMatchObject({ completed_at: null, completed_lessons_count: 0 })

      await touchRoadmapProgress(db, { userId: otherUserId, roadmapId: 9002, moduleId: 9020 })
      await touchRoadmapProgress(db, { userId: otherUserId, roadmapId: 9002, lessonId: 9200 })
      const touched = await db.get(
        'SELECT current_module_id, current_lesson_id FROM user_roadmap_progress WHERE user_id = ? AND roadmap_id = 9002',
        [otherUserId]
      )
      expect(touched).toMatchObject({ current_module_id: 9020, current_lesson_id: 9200 })
    })
  })

  it('builds detailed roadmap progress grouped by module', async () => {
    await withTempDb('moodle-progress-detail-', async db => {
      const { getRoadmapDetailProgress, setLessonProgress, touchRoadmapProgress } = await import('../lib/progressRepository')

      await db.exec(`
        INSERT INTO roadmaps (id, title) VALUES (9003, 'Roadmap Detail');
        INSERT INTO modules (id, roadmap_id, title, position) VALUES (9030, 9003, 'Observabilidad', 1);
        INSERT INTO modules (id, roadmap_id, title, position) VALUES (9031, 9003, 'CI/CD', 2);
        INSERT INTO lessons (id, module_id, title) VALUES (9300, 9030, 'Evaluacion de prompts');
        INSERT INTO lessons (id, module_id, title) VALUES (9301, 9030, 'Alertas');
        INSERT INTO lessons (id, module_id, title) VALUES (9302, 9031, 'Pipeline');
      `)
      const userId = 999005
      await db.run(
        `INSERT INTO users (id, email, name, role, password_hash, can_view_all_roadmaps, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 'user', 'hash', 1, 1, datetime('now'), datetime('now'))`,
        [userId, 'progress-detail@example.com', 'Progress Detail']
      )

      await setLessonProgress(db, { userId, lessonId: 9300, completed: true, timeSpentSeconds: 1200 })
      await touchRoadmapProgress(db, { userId, roadmapId: 9003, moduleId: 9030, lessonId: 9300 })

      const result = await getRoadmapDetailProgress(db, userId, 9003)

      expect(result).toMatchObject({
        roadmap_id: 9003,
        completed_lessons_count: 1,
        total_lessons: 3,
        progress_percentage: 33,
        status: 'in_progress',
        next_href: '/modules/9030',
        next_step_label: 'Continuar con Alertas',
        time_spent_seconds: 1200
      })
      expect(result.modules).toEqual([
        expect.objectContaining({
          module_id: 9030,
          status: 'in_progress',
          progress_percentage: 50,
          next_lesson_title: 'Alertas'
        }),
        expect.objectContaining({
          module_id: 9031,
          status: 'not_started',
          progress_percentage: 0,
          next_lesson_title: 'Pipeline'
        })
      ])
    })
  })
})
