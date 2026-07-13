import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { describe, expect, it, vi } from 'vitest'
import {
  getRoadmapDetailProgress,
  listUserRoadmapProgress,
  setLessonProgress,
  touchRoadmapProgress
} from '../lib/progress'

describe('progress helpers', () => {
  it('builds roadmap summaries with next step and completion status', async () => {
    const recentActivity = new Date().toISOString()
    const pausedActivity = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
    const db = {
      all: vi.fn().mockResolvedValue([
        {
          roadmap_id: 7,
          title: 'IA para DevOps',
          description: 'Ruta aplicada',
          duration: '8 semanas',
          started_at: '2026-07-01T09:00:00.000Z',
          last_activity_at: recentActivity,
          completed_at: null,
          completed_lessons_count: 3,
          time_spent_seconds: 4500,
          current_module_id: 15,
          current_module_title: 'Observabilidad',
          current_lesson_id: 42,
          current_lesson_title: 'Evaluacion de prompts',
          next_module_id: 15,
          next_module_title: 'Observabilidad',
          next_lesson_id: 43,
          next_lesson_title: 'Alertas',
          total_modules: 5,
          total_lessons: 8
        },
        {
          roadmap_id: 10,
          title: 'Kubernetes',
          description: 'Cluster path',
          duration: '4 semanas',
          started_at: pausedActivity,
          last_activity_at: pausedActivity,
          completed_at: null,
          completed_lessons_count: 1,
          time_spent_seconds: 600,
          current_module_id: 30,
          current_module_title: 'Pods',
          current_lesson_id: null,
          current_lesson_title: null,
          total_modules: 2,
          total_lessons: 6,
          quiz_attempts_count: 2,
          average_quiz_percentage: 67.4,
          best_quiz_percentage: 80,
          last_quiz_percentage: 60
        },
        {
          roadmap_id: 8,
          title: 'AWS',
          description: 'Cloud path',
          duration: '6 meses',
          started_at: '2026-07-02T09:00:00.000Z',
          last_activity_at: recentActivity,
          completed_at: '2026-07-07T10:00:00.000Z',
          completed_lessons_count: 4,
          time_spent_seconds: 7200,
          current_module_id: 20,
          current_module_title: 'EC2',
          current_lesson_id: 80,
          current_lesson_title: 'Cierre',
          total_modules: 2,
          total_lessons: 4
        },
        {
          roadmap_id: 9,
          title: 'Linux',
          description: null,
          duration: null,
          started_at: '2026-07-03T09:00:00.000Z',
          last_activity_at: pausedActivity,
          completed_at: null,
          completed_lessons_count: 0,
          time_spent_seconds: 0,
          current_module_id: null,
          current_module_title: null,
          current_lesson_id: null,
          current_lesson_title: null,
          total_modules: 3,
          total_lessons: 6
        }
      ])
    }

    const result = await listUserRoadmapProgress(db as any, 2)

    expect(db.all).toHaveBeenCalledOnce()
    expect(result).toHaveLength(4)
    expect(result[0]).toMatchObject({
      roadmap_id: 7,
      status: 'in_progress',
      progress_percentage: 38,
      next_href: '/modules/15',
      next_step_label: 'Continuar con Alertas',
      quiz_attempts_count: 0
    })
    expect(result[1]).toMatchObject({
      roadmap_id: 10,
      status: 'paused',
      progress_percentage: 17,
      next_href: '/modules/30',
      next_step_label: 'Continuar con Pods',
      quiz_attempts_count: 2,
      average_quiz_percentage: 67,
      best_quiz_percentage: 80,
      last_quiz_percentage: 60
    })
    expect(result[2]).toMatchObject({
      roadmap_id: 8,
      status: 'completed',
      progress_percentage: 100,
      next_href: '/roadmaps/8',
      next_step_label: 'Volver al roadmap'
    })
    expect(result[3]).toMatchObject({
      roadmap_id: 9,
      status: 'started',
      progress_percentage: 0,
      next_href: '/roadmaps/9',
      next_step_label: 'Retomar roadmap'
    })
  })

  it('builds detailed roadmap progress grouped by module', async () => {
    const db = {
      get: vi.fn().mockResolvedValue({
        roadmap_id: 7,
        started_at: '2026-07-01T09:00:00.000Z',
        last_activity_at: '2026-07-06T08:30:00.000Z',
        completed_at: null,
        current_module_id: 15,
        current_module_title: 'Observabilidad',
        current_lesson_id: 42,
        current_lesson_title: 'Evaluacion de prompts'
      }),
      all: vi.fn()
        .mockResolvedValueOnce([
          {
            module_id: 15,
            title: 'Observabilidad',
            position: 1,
            total_lessons: 2,
            completed_lessons_count: 1,
            last_activity_at: '2026-07-06T08:30:00.000Z'
          },
          {
            module_id: 16,
            title: 'CI/CD',
            position: 2,
            total_lessons: 1,
            completed_lessons_count: 0,
            last_activity_at: null
          }
        ])
        .mockResolvedValueOnce([
          {
            lesson_id: 42,
            lesson_title: 'Evaluacion de prompts',
            module_id: 15,
            completed: 1,
            time_spent_seconds: 1200
          },
          {
            lesson_id: 43,
            lesson_title: 'Alertas',
            module_id: 15,
            completed: 0,
            time_spent_seconds: 0
          },
          {
            lesson_id: 44,
            lesson_title: 'Pipeline',
            module_id: 16,
            completed: 0,
            time_spent_seconds: 0
          }
        ])
    }

    const result = await getRoadmapDetailProgress(db as any, 2, 7)

    expect(result).toMatchObject({
      roadmap_id: 7,
      completed_lessons_count: 1,
      total_lessons: 3,
      progress_percentage: 33,
      status: 'in_progress',
      next_href: '/modules/15',
      next_step_label: 'Continuar con Alertas',
      time_spent_seconds: 1200
    })
    expect(result.modules).toEqual([
      expect.objectContaining({
        module_id: 15,
        status: 'in_progress',
        progress_percentage: 50,
        next_lesson_title: 'Alertas'
      }),
      expect.objectContaining({
        module_id: 16,
        status: 'not_started',
        progress_percentage: 0,
        next_lesson_title: 'Pipeline'
      })
    ])
  })

  it('derives fresh summaries, resumes the first pending lesson and reopens stale completion', async () => {
    const db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE roadmaps (id INTEGER PRIMARY KEY, title TEXT, description TEXT, duration TEXT);
      CREATE TABLE modules (id INTEGER PRIMARY KEY, roadmap_id INTEGER, title TEXT, position INTEGER);
      CREATE TABLE lessons (id INTEGER PRIMARY KEY, module_id INTEGER, title TEXT);
      CREATE TABLE user_lesson_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, lesson_id INTEGER,
        started_at TEXT, last_activity_at TEXT, completed_at TEXT,
        time_spent_seconds INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT,
        UNIQUE(user_id, lesson_id)
      );
      CREATE TABLE user_roadmap_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, roadmap_id INTEGER,
        current_module_id INTEGER, current_lesson_id INTEGER, started_at TEXT,
        last_activity_at TEXT, completed_at TEXT, completed_lessons_count INTEGER DEFAULT 0,
        time_spent_seconds INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT,
        UNIQUE(user_id, roadmap_id)
      );
      CREATE TABLE user_quiz_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, roadmap_id INTEGER,
        score REAL, max_score REAL, submitted_at TEXT
      );
      INSERT INTO roadmaps VALUES (1, 'AWS', 'Ruta cloud', '8 semanas');
      INSERT INTO modules VALUES (10, 1, 'Fundamentos', 1);
      INSERT INTO modules VALUES (11, 1, 'Operaciones', 2);
      INSERT INTO lessons VALUES (100, 10, 'Introduccion');
      INSERT INTO lessons VALUES (101, 10, 'Practica');
      INSERT INTO lessons VALUES (102, 11, 'Observabilidad');
      INSERT INTO user_lesson_progress (
        user_id, lesson_id, started_at, last_activity_at, completed_at,
        time_spent_seconds, created_at, updated_at
      ) VALUES (2, 100, '2026-07-01', '2026-07-01', '2026-07-01', 120, '2026-07-01', '2026-07-01');
      INSERT INTO user_roadmap_progress (
        user_id, roadmap_id, current_module_id, current_lesson_id, started_at,
        last_activity_at, completed_at, completed_lessons_count, time_spent_seconds,
        created_at, updated_at
      ) VALUES (2, 1, 10, 100, '2026-07-01', '2026-07-01', '2026-07-01', 99, 9999, '2026-07-01', '2026-07-01');
    `)

    const [summary] = await listUserRoadmapProgress(db as any, 2)

    expect(summary).toMatchObject({
      completed_lessons_count: 1,
      total_lessons: 3,
      time_spent_seconds: 120,
      progress_percentage: 33,
      status: 'in_progress',
      completed_at: null,
      next_href: '/modules/10',
      next_step_label: 'Continuar con Practica',
      average_quiz_percentage: null,
      best_quiz_percentage: null,
      last_quiz_percentage: null
    })

    await db.close()
  })

  it('caps study increments, preserves first completion and supports reopening', async () => {
    const db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE modules (id INTEGER PRIMARY KEY, roadmap_id INTEGER, title TEXT);
      CREATE TABLE lessons (id INTEGER PRIMARY KEY, module_id INTEGER, title TEXT);
      CREATE TABLE user_lesson_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, lesson_id INTEGER,
        started_at TEXT, last_activity_at TEXT, completed_at TEXT,
        time_spent_seconds INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT,
        UNIQUE(user_id, lesson_id)
      );
      CREATE TABLE user_roadmap_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, roadmap_id INTEGER,
        current_module_id INTEGER, current_lesson_id INTEGER, started_at TEXT,
        last_activity_at TEXT, completed_at TEXT, completed_lessons_count INTEGER DEFAULT 0,
        time_spent_seconds INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT,
        UNIQUE(user_id, roadmap_id)
      );
      INSERT INTO modules VALUES (10, 1, 'Fundamentos');
      INSERT INTO lessons VALUES (100, 10, 'Introduccion');
    `)

    const first = await setLessonProgress(db as any, {
      userId: 2,
      lessonId: 100,
      completed: true,
      timeSpentSeconds: 99_999
    })
    const second = await setLessonProgress(db as any, {
      userId: 2,
      lessonId: 100,
      completed: true,
      timeSpentSeconds: 60
    })

    expect(first?.time_spent_seconds).toBe(1800)
    expect(second?.time_spent_seconds).toBe(1860)
    expect(second?.completed_at).toBe(first?.completed_at)

    const reopened = await setLessonProgress(db as any, {
      userId: 2,
      lessonId: 100,
      completed: false,
      timeSpentSeconds: 0
    })
    const roadmapProgress = await db.get(
      'SELECT completed_at, completed_lessons_count FROM user_roadmap_progress WHERE user_id = 2 AND roadmap_id = 1'
    )

    expect(reopened?.completed_at).toBeNull()
    expect(roadmapProgress).toMatchObject({ completed_at: null, completed_lessons_count: 0 })

    await touchRoadmapProgress(db as any, { userId: 3, roadmapId: 1, moduleId: 10 })
    await touchRoadmapProgress(db as any, { userId: 3, roadmapId: 1, lessonId: 100 })
    const touched = await db.get(
      'SELECT current_module_id, current_lesson_id FROM user_roadmap_progress WHERE user_id = 3 AND roadmap_id = 1'
    )
    expect(touched).toEqual({ current_module_id: 10, current_lesson_id: 100 })

    await db.close()
  })
})
