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

const moduleFixture = {
  id: 4,
  roadmap_id: 7,
  title: 'EC2',
  contents: '["AMI","Security groups"]',
  official_resources: '[{"label":"Amazon EC2","url":"https://aws.amazon.com/ec2/"}]',
  practical_activity: '["Crear instancia"]',
  deliverable_evidence: '["Captura de la instancia"]',
  evaluation: 'Quiz sobre EC2',
  quiz_pass_percentage: 70,
  quiz_max_attempts: null as number | null,
  quiz_cooldown_minutes: null as number | null
}

describe('quizRepository (postgres backend)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('saveModuleQuizAttempt', () => {
    it('inserts the graded attempt via the Kysely query builder', async () => {
      const { saveModuleQuizAttempt } = await import('../lib/domains/progress/repositories/quizRepository')

      const { pool, client } = createFakePool(async (sql, params) => {
        expect(sql).toContain('insert into "user_quiz_attempts"')
        expect(params).toContain(2)
        expect(params).toContain(7)
        expect(params).toContain(4)
        return { command: 'INSERT', rowCount: 1, rows: [] }
      })

      const attempt = await saveModuleQuizAttempt(fakeDb(pool), 2, moduleFixture, {
        'module-content': 0
      })

      expect(attempt).toMatchObject({ max_score: expect.any(Number), score: expect.any(Number) })
      expect(pool.connect).toHaveBeenCalled()
      expect(client.release).toHaveBeenCalled()
    })
  })

  describe('getModuleQuizSummary', () => {
    it('reports null average/best when there are no attempts', async () => {
      const { getModuleQuizSummary } = await import('../lib/domains/progress/repositories/quizRepository')
      const { pool } = createFakePool(async sql => {
        expect(sql).not.toContain('datetime(')
        if (/count\(\*\) as attempts_count/i.test(sql)) {
          return { command: 'SELECT', rowCount: 1, rows: [{ attempts_count: '0', average_score_percentage: null, best_score_percentage: null }] }
        }
        return { command: 'SELECT', rowCount: 0, rows: [] }
      })

      const summary = await getModuleQuizSummary(fakeDb(pool), 2, 4)

      expect(summary).toMatchObject({
        attempts_count: 0,
        average_score_percentage: null,
        best_score_percentage: null,
        latest_attempt: null
      })
    })

    it('aggregates attempts and orders the latest by submitted_at without datetime()', async () => {
      const { getModuleQuizSummary } = await import('../lib/domains/progress/repositories/quizRepository')
      const { pool } = createFakePool(async sql => {
        expect(sql).not.toContain('datetime(')
        if (/count\(\*\) as attempts_count/i.test(sql)) {
          return {
            command: 'SELECT',
            rowCount: 1,
            rows: [{ attempts_count: '2', average_score_percentage: 66.6, best_score_percentage: 100 }]
          }
        }
        expect(sql).toContain('ORDER BY submitted_at DESC, id DESC')
        return {
          command: 'SELECT',
          rowCount: 1,
          rows: [{ score: 2, max_score: 3, submitted_at: '2026-07-12T08:00:00.000Z' }]
        }
      })

      const summary = await getModuleQuizSummary(fakeDb(pool), 2, 4)

      expect(summary).toMatchObject({
        attempts_count: 2,
        average_score_percentage: 67,
        best_score_percentage: 100,
        latest_attempt: {
          score: 2,
          max_score: 3,
          percentage: 67
        }
      })
    })
  })

  describe('checkAttemptEligibility', () => {
    it('blocks once the attempt count reaches the configured max', async () => {
      const { checkAttemptEligibility } = await import('../lib/domains/progress/repositories/quizRepository')
      const { pool } = createFakePool(async () => ({
        command: 'SELECT',
        rowCount: 1,
        rows: [{ cnt: '1' }]
      }))

      const result = await checkAttemptEligibility(fakeDb(pool), 2, { ...moduleFixture, quiz_max_attempts: 1 })

      expect(result).toMatchObject({ allowed: false, remaining_attempts: 0 })
    })

    it('computes a cooldown window from the last failed attempt without datetime()', async () => {
      const { checkAttemptEligibility } = await import('../lib/domains/progress/repositories/quizRepository')
      const { pool } = createFakePool(async sql => {
        expect(sql).not.toContain('datetime(')
        if (/select count\(\*\) as cnt/i.test(sql)) {
          return { command: 'SELECT', rowCount: 1, rows: [{ cnt: '1' }] }
        }
        expect(sql).toContain('ORDER BY submitted_at DESC, id DESC')
        return {
          command: 'SELECT',
          rowCount: 1,
          rows: [{ submitted_at: new Date().toISOString(), score: 0, max_score: 3 }]
        }
      })

      const result = await checkAttemptEligibility(fakeDb(pool), 2, { ...moduleFixture, quiz_cooldown_minutes: 30 })

      expect(result.allowed).toBe(false)
      expect(result.cooldown_ends_at).not.toBeNull()
    })
  })
})
