import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest, createResponse } from './helpers/api'

const user = { id: 2, email: 'ada@example.com', name: 'Ada', role: 'user' as const }

const rows = [
  {
    attempt_id: 11, roadmap_id: 1, roadmap_title: 'DevOps', module_id: 4, module_title: 'Docker',
    quiz_scope: 'module', score: 2, max_score: 4, percentage: 50, submitted_at: '2026-10-20T10:00:00.000Z'
  }
]

async function mockApi(options: { user?: any } = {}) {
  vi.resetModules()
  const listForUser = vi.fn().mockResolvedValue(rows)
  vi.doMock('../lib/persistence', () => ({ openDb: vi.fn().mockResolvedValue({}) }))
  vi.doMock('../lib/http/auth', () => ({
    requireUser: vi.fn((_req: any, res: any) => {
      if (options.user === null) {
        res.status(401).json({ error: 'Debes iniciar sesión.' })
        return null
      }
      return options.user ?? user
    })
  }))
  vi.doMock('../lib/domains/progress/repositories/quizRepository', async importOriginal => {
    const actual = await importOriginal<typeof import('../lib/domains/progress/repositories/quizRepository')>()
    return { ...actual, createQuizAttemptRepository: () => ({ listForUser }) }
  })
  const handler = (await import('../pages/api/progress/quiz-attempts/export')).default
  return { handler, listForUser }
}

describe('GET /api/progress/quiz-attempts/export', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects non-GET methods', async () => {
    const { handler } = await mockApi()
    const res = createResponse()
    await handler(createRequest({ method: 'POST' }), res)
    expect(res.statusCode).toBe(405)
  })

  it('requires an authenticated user', async () => {
    const { handler, listForUser } = await mockApi({ user: null })
    const res = createResponse()
    await handler(createRequest({ method: 'GET' }), res)
    expect(res.statusCode).toBe(401)
    expect(listForUser).not.toHaveBeenCalled()
  })

  it('rejects an unknown format with a Spanish 400', async () => {
    const { handler, listForUser } = await mockApi()
    const res = createResponse()
    await handler(createRequest({ query: { format: 'xml' } }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('El formato debe ser «json» o «csv».')
    expect(listForUser).not.toHaveBeenCalled()
  })

  it('returns JSON by default, only for the session user and ignoring any user_id', async () => {
    const { handler, listForUser } = await mockApi()
    const res = createResponse()
    await handler(createRequest({ query: { user_id: '99' } }), res)

    expect(res.statusCode).toBe(200)
    expect(listForUser).toHaveBeenCalledWith(2)
    expect(res.headers['Content-Type']).toBe('application/json; charset=utf-8')
    expect(res.headers['Content-Disposition']).toMatch(/^attachment; filename="quiz-results-\d{4}-\d{2}-\d{2}\.json"$/)
    expect(res.body).toMatchObject({
      user: { email: 'ada@example.com', name: 'Ada' },
      total_attempts: 1,
      attempts: rows
    })
    expect(JSON.stringify(res.body)).not.toContain('answers')
  })

  it('returns CSV when asked and treats an empty format as JSON', async () => {
    const { handler } = await mockApi()
    const csvRes = createResponse()
    await handler(createRequest({ query: { format: 'csv' } }), csvRes)
    expect(csvRes.statusCode).toBe(200)
    expect(csvRes.headers['Content-Type']).toBe('text/csv; charset=utf-8')
    expect(csvRes.headers['Content-Disposition']).toMatch(/filename="quiz-results-\d{4}-\d{2}-\d{2}\.csv"/)
    expect(String(csvRes.body)).toContain('ada@example.com,Ada,11,1,DevOps,4,Docker,module,2,4,50,2026-10-20T10:00:00.000Z')

    const emptyRes = createResponse()
    await handler(createRequest({ query: { format: '' } }), emptyRes)
    expect(emptyRes.headers['Content-Type']).toBe('application/json; charset=utf-8')
  })
})
