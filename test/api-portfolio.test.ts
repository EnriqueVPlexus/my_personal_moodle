import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest, createResponse } from './helpers/api'

const user = { id: 2, email: 'user@example.com', name: 'User Test', role: 'user' as const }

async function mockPortfolioApi(options: { user?: any; portfolio?: any } = {}) {
  vi.resetModules()
  vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue({}) }))
  vi.doMock('../lib/auth', () => ({
    requireUser: vi.fn((_req: any, res: any) => {
      if (options.user === null) {
        res.status(401).json({ error: 'authentication required' })
        return null
      }
      return options.user ?? user
    })
  }))
  vi.doMock('../lib/portfolio', () => ({
    getUserPortfolio: vi.fn().mockResolvedValue(
      options.portfolio === undefined
        ? { user, total_evidences: 0, approved_evidences: 0, roadmaps: [] }
        : options.portfolio
    ),
    exportPortfolioAsMarkdown: vi.fn().mockReturnValue('# Portfolio de Evidencias - User Test')
  }))
}

describe('GET /api/portfolio', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('rejects non-GET methods', async () => {
    await mockPortfolioApi()
    const handler = (await import('../pages/api/portfolio/index')).default

    const res = createResponse()
    await handler(createRequest({ method: 'POST' }), res)

    expect(res.statusCode).toBe(405)
  })

  it('requires an authenticated user', async () => {
    await mockPortfolioApi({ user: null })
    const handler = (await import('../pages/api/portfolio/index')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET' }), res)

    expect(res.statusCode).toBe(401)
  })

  it('returns 404 when the portfolio user cannot be found', async () => {
    await mockPortfolioApi({ portfolio: null })
    const handler = (await import('../pages/api/portfolio/index')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET' }), res)

    expect(res.statusCode).toBe(404)
    expect(res.body).toEqual({ error: 'Usuario no encontrado' })
  })
})

describe('GET /api/portfolio/export', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('rejects non-GET methods', async () => {
    await mockPortfolioApi()
    const handler = (await import('../pages/api/portfolio/export')).default

    const res = createResponse()
    await handler(createRequest({ method: 'POST' }), res)

    expect(res.statusCode).toBe(405)
  })

  it('requires an authenticated user', async () => {
    await mockPortfolioApi({ user: null })
    const handler = (await import('../pages/api/portfolio/export')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET' }), res)

    expect(res.statusCode).toBe(401)
  })

  it('returns 404 when exporting a missing portfolio user', async () => {
    await mockPortfolioApi({ portfolio: null })
    const handler = (await import('../pages/api/portfolio/export')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET' }), res)

    expect(res.statusCode).toBe(404)
    expect(res.body).toEqual({ error: 'Usuario no encontrado' })
  })
})
