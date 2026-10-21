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

const questions = [
  { id: 'bank-0', type: 'multiple_choice' as const, prompt: 'Q?', options: ['A', 'B'], correct_option_index: 0, explanation: 'why' }
]

const row = {
  id: 's1',
  user_id: 2,
  module_id: 4,
  questions: JSON.stringify(questions),
  created_at: new Date('2026-03-01T10:00:00.000Z'),
  expires_at: new Date('2026-03-02T10:00:00.000Z'),
  submitted_at: null
}

describe('quizSessionRepository (postgres backend)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('finds the active session with a Kysely query and normalizes the timestamps', async () => {
    const { findActiveQuizSession } = await import('../lib/domains/progress/repositories/quizSessionRepository')
    const { pool, client } = createFakePool(async (sql, params) => {
      expect(sql).toContain('from "quiz_attempt_sessions"')
      expect(sql).toContain('"submitted_at" is null')
      expect(sql).toContain('"expires_at" >')
      expect(sql).not.toContain('datetime(')
      expect(params).toEqual(expect.arrayContaining([2, 4, '2026-03-01T12:00:00.000Z']))
      return { command: 'SELECT', rowCount: 1, rows: [row] }
    })

    const session = await findActiveQuizSession(fakeDb(pool), 2, 4, '2026-03-01T12:00:00.000Z')

    expect(session).toEqual({
      id: 's1', user_id: 2, module_id: 4, questions,
      created_at: '2026-03-01T10:00:00.000Z', expires_at: '2026-03-02T10:00:00.000Z', submitted_at: null
    })
    expect(client.release).toHaveBeenCalled()
  })

  it('returns null when there is no session', async () => {
    const { findActiveQuizSession, findQuizSessionById } = await import('../lib/domains/progress/repositories/quizSessionRepository')
    const { pool } = createFakePool(async () => ({ command: 'SELECT', rowCount: 0, rows: [] }))

    expect(await findActiveQuizSession(fakeDb(pool), 2, 4, '2026-03-01T12:00:00.000Z')).toBeNull()
    expect(await findQuizSessionById(fakeDb(pool), 'nope')).toBeNull()
  })

  it('finds a session by id, including its submission time', async () => {
    const { findQuizSessionById } = await import('../lib/domains/progress/repositories/quizSessionRepository')
    const { pool } = createFakePool(async (sql, params) => {
      expect(sql).toContain('from "quiz_attempt_sessions" where "id" = $1')
      expect(params).toEqual(['s1'])
      return { command: 'SELECT', rowCount: 1, rows: [{ ...row, submitted_at: new Date('2026-03-01T11:00:00.000Z') }] }
    })

    expect((await findQuizSessionById(fakeDb(pool), 's1'))?.submitted_at).toBe('2026-03-01T11:00:00.000Z')
  })

  it('inserts the session with the questions snapshot as JSON text', async () => {
    const { createQuizSession } = await import('../lib/domains/progress/repositories/quizSessionRepository')
    const { pool } = createFakePool(async (sql, params) => {
      expect(sql).toContain('insert into "quiz_attempt_sessions"')
      expect(params).toContain(JSON.stringify(questions))
      expect(params).toContain('s1')
      return { command: 'INSERT', rowCount: 1, rows: [] }
    })

    const created = await createQuizSession(fakeDb(pool), {
      id: 's1', userId: 2, moduleId: 4, questions,
      createdAt: '2026-03-01T10:00:00.000Z', expiresAt: '2026-03-02T10:00:00.000Z'
    })

    expect(created).toMatchObject({ id: 's1', user_id: 2, module_id: 4, questions, submitted_at: null })
  })

  it('marks a session submitted with a conditional update and reports whether it changed', async () => {
    const { markQuizSessionSubmitted } = await import('../lib/domains/progress/repositories/quizSessionRepository')
    let rowCount = 1
    const { pool } = createFakePool(async sql => {
      expect(sql).toContain('update "quiz_attempt_sessions" set "submitted_at"')
      expect(sql).toContain('"submitted_at" is null')
      return { command: 'UPDATE', rowCount, rows: [] }
    })

    expect(await markQuizSessionSubmitted(fakeDb(pool), 's1', '2026-03-01T11:00:00.000Z')).toBe(true)
    rowCount = 0
    expect(await markQuizSessionSubmitted(fakeDb(pool), 's1', '2026-03-01T11:00:00.000Z')).toBe(false)
  })
})
