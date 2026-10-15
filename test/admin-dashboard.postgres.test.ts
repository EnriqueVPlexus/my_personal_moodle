import { describe, expect, it, vi } from 'vitest'
import type { PostgresDb } from '../lib/postgresDb'
import { getAdminDashboard } from '../lib/adminDashboard'

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

const overviewRow = {
  total_users: 2,
  active_users: 1,
  started_roadmaps: 3,
  completed_roadmaps: 2,
  submitted_evidences: 1,
  stalled_users: 1
}

const popularRoadmapRow = {
  roadmap_id: 10,
  title: 'DevOps',
  learners_count: 2,
  active_learners_count: 1,
  completed_learners_count: 1
}

const completedModuleRow = {
  module_id: 100,
  title: 'CI/CD',
  roadmap_id: 10,
  roadmap_title: 'DevOps',
  total_lessons: 2,
  learners_count: 2,
  completed_learners_count: 1
}

const stalledLearnerRow = {
  user_id: 3,
  email: 'linus@example.com',
  name: 'Linus',
  roadmap_id: 10,
  roadmap_title: 'DevOps',
  current_module_title: 'CI/CD',
  completed_lessons_count: 1,
  total_lessons: 2,
  progress_percentage: 50,
  last_activity_at: '2026-06-20T10:00:00.000Z',
  inactivity_days: 33
}

describe('getAdminDashboard (postgres backend)', () => {
  it('runs the four raw-sql aggregate queries and normalizes the rows', async () => {
    const seenSql: string[] = []
    const { pool } = createFakePool(async sql => {
      seenSql.push(sql)

      if (/select\s+\(select count\(\*\) from users/i.test(sql)) {
        return { command: 'SELECT', rowCount: 1, rows: [overviewRow] }
      }
      if (/from roadmaps/i.test(sql) && /learner_progress/i.test(sql)) {
        return { command: 'SELECT', rowCount: 1, rows: [popularRoadmapRow] }
      }
      if (/with module_progress as/i.test(sql)) {
        return { command: 'SELECT', rowCount: 1, rows: [completedModuleRow] }
      }
      if (/inactivity_days/i.test(sql)) {
        return { command: 'SELECT', rowCount: 1, rows: [stalledLearnerRow] }
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    const result = await getAdminDashboard(fakeDb(pool), {
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
      expect.objectContaining({ roadmap_id: 10, learners_count: 2, active_learners_count: 1, completed_learners_count: 1 })
    ])
    expect(result.completed_modules).toEqual([
      expect.objectContaining({ module_id: 100, roadmap_id: 10, learners_count: 2, completed_learners_count: 1 })
    ])
    expect(result.stalled_learners).toEqual([
      expect.objectContaining({ user_id: 3, roadmap_id: 10, progress_percentage: 50, inactivity_days: 33 })
    ])

    // `julianday(...)` is the only SQLite-only construct these queries use;
    // `is_active = 1` is intentionally NOT rewritten to `= true`, because
    // `is_active` is an INTEGER column (not boolean) in both the SQLite and
    // Postgres schemas (see lib/postgresDb.ts) and `is_active = 1` is the
    // established idiom already used verbatim against Postgres elsewhere
    // (lib/userRepository.ts, lib/auth.ts).
    expect(seenSql).toHaveLength(4)
    for (const sql of seenSql) {
      expect(sql).not.toContain('julianday(')
    }

    const overviewSql = seenSql.find(sql => /select\s+\(select count\(\*\) from users/i.test(sql))!
    expect(overviewSql).toMatch(/with learner_progress as/i)
    expect(overviewSql).toContain('is_active = 1')

    const popularRoadmapsSql = seenSql.find(sql => /from roadmaps/i.test(sql) && /learner_progress/i.test(sql))!
    expect(popularRoadmapsSql).toMatch(/with learner_progress as/i)
    expect(popularRoadmapsSql).toMatch(/having/i)

    const completedModulesSql = seenSql.find(sql => /with module_progress as/i.test(sql))!
    expect(completedModulesSql).toContain('module_totals')
    expect(completedModulesSql).toMatch(/having/i)

    const stalledLearnersSql = seenSql.find(sql => /inactivity_days/i.test(sql))!
    expect(stalledLearnersSql).toMatch(/with learner_progress as/i)
    expect(stalledLearnersSql).toMatch(/extract\(epoch from/i)
    expect(stalledLearnersSql).toContain('is_active = 1')

    expect(pool.connect).toHaveBeenCalled()
  })
})
