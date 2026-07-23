import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAdminDashboard } from '../lib/adminDashboard'
import { createRequest, createResponse } from './helpers/api'

describe('admin dashboard metrics', () => {
  it('calculates current completion, adoption and stalled learners', async () => {
    const db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY, email TEXT, name TEXT, role TEXT,
        is_active INTEGER
      );
      CREATE TABLE roadmaps (id INTEGER PRIMARY KEY, title TEXT);
      CREATE TABLE modules (
        id INTEGER PRIMARY KEY, roadmap_id INTEGER, title TEXT, position INTEGER
      );
      CREATE TABLE lessons (id INTEGER PRIMARY KEY, module_id INTEGER, title TEXT);
      CREATE TABLE user_roadmap_progress (
        user_id INTEGER, roadmap_id INTEGER, current_module_id INTEGER,
        last_activity_at TEXT
      );
      CREATE TABLE user_lesson_progress (
        user_id INTEGER, lesson_id INTEGER, completed_at TEXT
      );
      CREATE TABLE user_module_evidences (
        id INTEGER PRIMARY KEY, user_id INTEGER, module_id INTEGER
      );

      INSERT INTO users VALUES
        (1, 'admin@example.com', 'Admin', 'admin', 1),
        (2, 'ada@example.com', 'Ada', 'user', 1),
        (3, 'linus@example.com', 'Linus', 'user', 1);
      INSERT INTO roadmaps VALUES (10, 'DevOps'), (20, 'AWS');
      INSERT INTO modules VALUES
        (100, 10, 'CI/CD', 1),
        (200, 20, 'EC2', 1);
      INSERT INTO lessons VALUES
        (1000, 100, 'Pipeline'),
        (1001, 100, 'Despliegue'),
        (2000, 200, 'Instancia');
      INSERT INTO user_roadmap_progress VALUES
        (2, 10, 100, '2026-07-20T10:00:00.000Z'),
        (3, 10, 100, '2026-06-20T10:00:00.000Z'),
        (2, 20, 200, '2026-06-21T10:00:00.000Z');
      INSERT INTO user_lesson_progress VALUES
        (2, 1000, '2026-07-20T10:00:00.000Z'),
        (2, 1001, '2026-07-20T10:00:00.000Z'),
        (3, 1000, '2026-06-20T10:00:00.000Z'),
        (2, 2000, '2026-06-21T10:00:00.000Z');
      INSERT INTO user_module_evidences VALUES (1, 2, 100);
    `)

    const result = await getAdminDashboard(db as any, {
      now: new Date('2026-07-23T12:00:00.000Z')
    })

    expect(result.overview).toEqual({
      total_users: 2,
      active_users: 1,
      started_roadmaps: 3,
      completed_roadmaps: 2,
      submitted_evidences: 1,
      stalled_users: 1
    })
    expect(result.popular_roadmaps).toEqual([
      expect.objectContaining({
        roadmap_id: 10,
        learners_count: 2,
        active_learners_count: 1,
        completed_learners_count: 1
      }),
      expect.objectContaining({
        roadmap_id: 20,
        learners_count: 1,
        active_learners_count: 0,
        completed_learners_count: 1
      })
    ])
    expect(result.completed_modules[0]).toMatchObject({
      module_id: 100,
      learners_count: 2,
      completed_learners_count: 1
    })
    expect(result.stalled_learners).toEqual([
      expect.objectContaining({
        user_id: 3,
        roadmap_id: 10,
        progress_percentage: 50,
        inactivity_days: 33
      })
    ])

    await db.close()
  })
})

describe('admin dashboard API', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('requires admin access and returns dashboard data', async () => {
    const db = {}
    const data = { overview: { total_users: 2 } }
    vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
    vi.doMock('../lib/auth', () => ({
      requireAdmin: vi.fn().mockResolvedValue({ id: 1, role: 'admin' })
    }))
    vi.doMock('../lib/adminDashboard', () => ({
      getAdminDashboard: vi.fn().mockResolvedValue(data)
    }))
    const handler = (await import('../pages/api/admin/dashboard')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(data)

    const methodRes = createResponse()
    await handler(createRequest({ method: 'POST' }), methodRes)
    expect(methodRes.statusCode).toBe(405)
    expect(methodRes.headers.Allow).toBe('GET')
  })
})
