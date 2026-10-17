import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openSqliteDb } from '../lib/persistence'
import type { DatabaseClient } from '../lib/persistence/database'
import { createRequest, createResponse } from './helpers/api'

/**
 * Security regression: the quiz answers (`quiz_bank`, `correct_option_index`)
 * must never reach an API response, for anonymous readers, learners and
 * admins alike. The only intended exception is the admin-only roadmap export
 * (a backup that round-trips quizzes), which is covered at the end.
 */

const QUIZ_BANK = JSON.stringify([
  { question: '¿Capital de Francia?', answer: 'París', options: ['París', 'Roma'], explanation: 'Es París' },
  { question: '¿2 + 2?', answer: '4', options: ['3', '4', '5'], explanation: 'Suma' }
])
const FORBIDDEN = ['quiz_bank', 'correct_option_index', '"answer"']

type Role = 'admin' | 'user' | null
const admin = { id: 1, email: 'admin@example.com', name: 'Admin', role: 'admin' as const }
const learner = { id: 2, email: 'ana@example.com', name: 'Ana', role: 'user' as const }

let db: DatabaseClient
let role: Role = null

async function seed() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-quiz-leak-'))
  db = await openSqliteDb(path.join(tmp, 'test.db'))
  await db.exec(`
    INSERT INTO users (id, email, name, role, password_hash, created_at, updated_at)
    VALUES (1, 'admin@example.com', 'Admin', 'admin', 'x', '2026-01-01', '2026-01-01'),
           (2, 'ana@example.com', 'Ana', 'user', 'x', '2026-01-01', '2026-01-01');
    INSERT INTO roadmaps (id, title, version, published_at) VALUES (1, 'AWS', 'v1.0.0', '2026-01-01T00:00:00.000Z');
  `)
  await db.run(
    `INSERT INTO modules (id, roadmap_id, position, title, level, quiz_bank) VALUES (3, 1, 1, 'Redes', 'beginner', ?)`,
    [QUIZ_BANK]
  )
  await db.exec(`INSERT INTO lessons (id, module_id, title) VALUES (7, 3, 'Subnets');`)
}

beforeEach(async () => {
  role = null
  vi.resetModules()
  await seed()
  vi.doMock('../lib/persistence', () => ({ openDb: vi.fn(async () => db) }))
  vi.doMock('../lib/http/audit', () => ({ writeAuditLog: vi.fn(async () => undefined) }))
  vi.doMock('../lib/http/auth', () => {
    const user = () => (role === 'admin' ? admin : role === 'user' ? learner : null)
    const deny = (res: any, status: number) => {
      res.status(status).json({ error: 'denied' })
      return null
    }
    return {
      getRoadmapReadScope: vi.fn(async () => ({ user: user(), allRoadmaps: true, roadmapIds: [] })),
      getUserFromRequest: vi.fn(async () => user()),
      requireReadAccess: vi.fn(async () => true),
      requireUser: vi.fn(async (_req: unknown, res: any) => user() ?? deny(res, 401)),
      requireAdmin: vi.fn(async (_req: unknown, res: any) =>
        role === 'admin' ? admin : deny(res, role ? 403 : 401))
    }
  })
})

afterEach(async () => {
  await db.close()
  vi.doUnmock('../lib/persistence')
  vi.doUnmock('../lib/http/auth')
  vi.doUnmock('../lib/http/audit')
})

async function call(modulePath: string, req: Record<string, unknown>) {
  const handler = (await import(modulePath)).default
  const res = createResponse()
  await handler(createRequest(req), res)
  return res
}

function expectNoAnswers(res: any, status: number) {
  expect(res.statusCode).toBe(status)
  const text = JSON.stringify(res.body ?? '')
  for (const marker of FORBIDDEN) expect(text, `response leaks ${marker}`).not.toContain(marker)
}

describe.each<[string, Role]>([
  ['an anonymous reader', null],
  ['a learner', 'user'],
  ['an admin', 'admin']
])('quiz answers never leave the API for %s', (_label, who) => {
  beforeEach(() => { role = who })

  it('GET /api/modules', async () => {
    const res = await call('../pages/api/modules/index', { method: 'GET' })
    expectNoAnswers(res, 200)
    expect(res.body).toHaveLength(1)
  })

  it('GET /api/modules?roadmap_id', async () => {
    const res = await call('../pages/api/modules/index', { method: 'GET', query: { roadmap_id: '1' } })
    expectNoAnswers(res, 200)
    expect(res.body[0]).toMatchObject({ id: 3, title: 'Redes' })
  })

  it('GET /api/modules/{id} (keeps the public quiz without answers)', async () => {
    const res = await call('../pages/api/modules/[id]', { method: 'GET', query: { id: '3' } })
    expectNoAnswers(res, 200)
    expect(res.body.quiz.questions).toHaveLength(2)
    expect(res.body.quiz.questions[0]).not.toHaveProperty('correct_option_index')
  })

  it('GET /api/roadmaps/{id}', async () => {
    const res = await call('../pages/api/roadmaps/[id]', { method: 'GET', query: { id: '1' } })
    expectNoAnswers(res, 200)
    expect(res.body.modules).toHaveLength(1)
  })

  it('GET /api/quizzes/modules/{id}', async () => {
    const res = await call('../pages/api/quizzes/modules/[id]', { method: 'GET', query: { id: '3' } })
    expectNoAnswers(res, 200)
    expect(res.body.quiz.questions).toHaveLength(2)
  })
})

describe('quiz answers on admin writes', () => {
  beforeEach(() => { role = 'admin' })

  it('POST /api/modules does not echo quiz_bank', async () => {
    const res = await call('../pages/api/modules/index', {
      method: 'POST',
      body: { title: 'Nuevo', roadmap_id: 1, level: 'beginner' }
    })
    expectNoAnswers(res, 201)
  })

  it('PUT /api/modules/{id} does not echo quiz_bank', async () => {
    const res = await call('../pages/api/modules/[id]', {
      method: 'PUT',
      query: { id: '3' },
      body: { title: 'Redes 2' }
    })
    expectNoAnswers(res, 200)
    expect(res.body.title).toBe('Redes 2')
    // The stored answers are untouched by the update.
    expect((await db.get('SELECT quiz_bank FROM modules WHERE id = 3')).quiz_bank).toBe(QUIZ_BANK)
  })
})

describe('GET /api/roadmaps/{id}/export (admin backup, keeps the quizzes)', () => {
  it('is admin-only', async () => {
    for (const who of [null, 'user'] as Role[]) {
      role = who
      const res = await call('../pages/api/roadmaps/[id]/export', { method: 'GET', query: { id: '1' } })
      expect(res.statusCode).toBe(who ? 403 : 401)
      expect(JSON.stringify(res.body)).not.toContain('París')
    }
  })

  it('still round-trips the quiz for an admin', async () => {
    role = 'admin'
    const res = await call('../pages/api/roadmaps/[id]/export', { method: 'GET', query: { id: '1' } })
    expect(res.statusCode).toBe(200)
    expect(res.body.modules[0].quiz).toHaveLength(2)
    expect(res.body.modules[0].quiz[0].answer).toBe('París')
  })
})
