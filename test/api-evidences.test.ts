import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest, createResponse } from './helpers/api'

const admin = { id: 1, email: 'admin@example.com', role: 'admin' as const }
const user = { id: 2, email: 'user@example.com', role: 'user' as const }

function denyAdmin(res: any) {
  res.status(403).json({ error: 'admin role required' })
  return null
}

function denyUser(res: any) {
  res.status(401).json({ error: 'authentication required' })
  return null
}

async function mockIndexApi(db: any, options: { admin?: any } = {}) {
  vi.resetModules()
  vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
  vi.doMock('../lib/auth', () => ({
    requireAdmin: vi.fn((_req: any, res: any) => {
      if (options.admin === null) return denyAdmin(res)
      return options.admin ?? admin
    })
  }))
}

async function mockModuleIdApi(
  db: any,
  options: { scope?: any; user?: any; scopeAllows?: boolean } = {}
) {
  vi.resetModules()
  vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
  vi.doMock('../lib/auth', () => ({
    getRoadmapReadScope: vi.fn((_req: any, res: any) => {
      if (options.scope === null) {
        res.status(401).json({ error: 'authentication required' })
        return null
      }
      return options.scope ?? { user, allRoadmaps: true, roadmapIds: [] }
    }),
    requireUser: vi.fn((_req: any, res: any) => {
      if (options.user === null) return denyUser(res)
      return options.user ?? user
    }),
    scopeAllowsRoadmap: vi.fn().mockReturnValue(options.scopeAllows ?? true)
  }))
  vi.doMock('../lib/progress', () => ({ touchRoadmapProgress: vi.fn().mockResolvedValue(undefined) }))
}

async function mockReviewApi(db: any, options: { admin?: any } = {}) {
  vi.resetModules()
  vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
  vi.doMock('../lib/auth', () => ({
    requireAdmin: vi.fn((_req: any, res: any) => {
      if (options.admin === null) return denyAdmin(res)
      return options.admin ?? admin
    })
  }))
}

describe('GET/POST /api/evidences', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('rejects non-GET methods', async () => {
    const db = { all: vi.fn() }
    await mockIndexApi(db)
    const handler = (await import('../pages/api/evidences/index')).default

    const res = createResponse()
    await handler(createRequest({ method: 'POST' }), res)

    expect(res.statusCode).toBe(405)
    expect(db.all).not.toHaveBeenCalled()
  })

  it('blocks non-admin users', async () => {
    const db = { all: vi.fn() }
    await mockIndexApi(db, { admin: null })
    const handler = (await import('../pages/api/evidences/index')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET' }), res)

    expect(res.statusCode).toBe(403)
    expect(db.all).not.toHaveBeenCalled()
  })

  it('rejects invalid filter ids', async () => {
    const db = { all: vi.fn() }
    await mockIndexApi(db)
    const handler = (await import('../pages/api/evidences/index')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { user_id: 'abc' } }), res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'invalid filter id' })
  })

  it('rejects non-positive filter ids provided as array query values', async () => {
    const db = { all: vi.fn() }
    await mockIndexApi(db)
    const handler = (await import('../pages/api/evidences/index')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { module_id: ['0'] } }), res)

    expect(res.statusCode).toBe(400)
  })

  it('applies user, module, roadmap and status filters together', async () => {
    const db = { all: vi.fn().mockResolvedValue([{ id: 1 }]) }
    await mockIndexApi(db)
    const handler = (await import('../pages/api/evidences/index')).default

    const res = createResponse()
    await handler(createRequest({
      method: 'GET',
      query: { user_id: ['5'], module_id: '6', roadmap_id: '7', status: 'aprobado' }
    }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual([{ id: 1 }])
    const [sql, params] = db.all.mock.calls[0]
    expect(sql).toContain('WHERE e.user_id = ? AND e.module_id = ? AND m.roadmap_id = ? AND COALESCE')
    expect(params).toEqual([5, 6, 7, 'aprobado'])
  })

  it('ignores invalid status values and returns unfiltered results when no filters are given', async () => {
    const db = { all: vi.fn().mockResolvedValue([]) }
    await mockIndexApi(db)
    const handler = (await import('../pages/api/evidences/index')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { status: 'weird' } }), res)

    expect(res.statusCode).toBe(200)
    const [sql, params] = db.all.mock.calls[0]
    expect(sql).not.toContain('WHERE')
    expect(params).toEqual([])
  })
})

describe('/api/evidences/modules/[id]', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('rejects invalid module ids', async () => {
    const db = { get: vi.fn(), run: vi.fn() }
    await mockModuleIdApi(db)
    const handler = (await import('../pages/api/evidences/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: 'abc' } }), res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'invalid module id' })
  })

  it('stops GET reads when the roadmap scope is unavailable', async () => {
    const db = { get: vi.fn(), run: vi.fn() }
    await mockModuleIdApi(db, { scope: null })
    const handler = (await import('../pages/api/evidences/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '7' } }), res)

    expect(res.statusCode).toBe(401)
    expect(db.get).not.toHaveBeenCalled()
  })

  it('requires an authenticated user for GET evidence reads', async () => {
    const db = { get: vi.fn(), run: vi.fn() }
    await mockModuleIdApi(db, { scope: { user: null, allRoadmaps: true, roadmapIds: [] } })
    const handler = (await import('../pages/api/evidences/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '7' } }), res)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'authentication required' })
  })

  it('returns 404 when the module does not exist on GET', async () => {
    const db = { get: vi.fn().mockResolvedValueOnce(null), run: vi.fn() }
    await mockModuleIdApi(db)
    const handler = (await import('../pages/api/evidences/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '7' } }), res)

    expect(res.statusCode).toBe(404)
  })

  it('returns 404 when the scope forbids the module roadmap on GET', async () => {
    const db = { get: vi.fn().mockResolvedValueOnce({ id: 7, roadmap_id: 4 }), run: vi.fn() }
    await mockModuleIdApi(db, { scopeAllows: false })
    const handler = (await import('../pages/api/evidences/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '7' } }), res)

    expect(res.statusCode).toBe(404)
  })

  it('requires an authenticated user for PUT', async () => {
    const db = { get: vi.fn(), run: vi.fn() }
    await mockModuleIdApi(db, { user: null })
    const handler = (await import('../pages/api/evidences/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'PUT', query: { id: '7' }, body: {} }), res)

    expect(res.statusCode).toBe(401)
    expect(db.get).not.toHaveBeenCalled()
  })

  it('returns 404 on PUT when the module does not exist', async () => {
    const db = { get: vi.fn().mockResolvedValueOnce(null), run: vi.fn() }
    await mockModuleIdApi(db)
    const handler = (await import('../pages/api/evidences/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'PUT', query: { id: '7' }, body: {} }), res)

    expect(res.statusCode).toBe(404)
  })

  it('returns 404 on PUT when the roadmap scope is unavailable', async () => {
    const db = { get: vi.fn().mockResolvedValueOnce({ id: 7, roadmap_id: 4 }), run: vi.fn() }
    await mockModuleIdApi(db, { scope: null })
    const handler = (await import('../pages/api/evidences/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'PUT', query: { id: '7' }, body: {} }), res)

    expect(res.statusCode).toBe(404)
  })

  it('returns 404 on PUT when the scope forbids the roadmap', async () => {
    const db = { get: vi.fn().mockResolvedValueOnce({ id: 7, roadmap_id: 4 }), run: vi.fn() }
    await mockModuleIdApi(db, { scopeAllows: false })
    const handler = (await import('../pages/api/evidences/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'PUT', query: { id: '7' }, body: {} }), res)

    expect(res.statusCode).toBe(404)
  })

  it('rejects invalid evidence payloads on PUT', async () => {
    const db = { get: vi.fn().mockResolvedValueOnce({ id: 7, roadmap_id: 4 }), run: vi.fn() }
    await mockModuleIdApi(db)
    const handler = (await import('../pages/api/evidences/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({
      method: 'PUT',
      query: { id: '7' },
      body: { evidence_type: 'invalid' }
    }), res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'invalid evidence type' })
  })

  it('requires an authenticated user for DELETE', async () => {
    const db = { get: vi.fn(), run: vi.fn() }
    await mockModuleIdApi(db, { user: null })
    const handler = (await import('../pages/api/evidences/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'DELETE', query: { id: '7' } }), res)

    expect(res.statusCode).toBe(401)
    expect(db.get).not.toHaveBeenCalled()
  })

  it('returns 404 on DELETE when the module does not exist', async () => {
    const db = { get: vi.fn().mockResolvedValueOnce(null), run: vi.fn() }
    await mockModuleIdApi(db)
    const handler = (await import('../pages/api/evidences/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'DELETE', query: { id: '7' } }), res)

    expect(res.statusCode).toBe(404)
  })

  it('returns 404 on DELETE when the roadmap scope is unavailable', async () => {
    const db = { get: vi.fn().mockResolvedValueOnce({ id: 7, roadmap_id: 4 }), run: vi.fn() }
    await mockModuleIdApi(db, { scope: null })
    const handler = (await import('../pages/api/evidences/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'DELETE', query: { id: '7' } }), res)

    expect(res.statusCode).toBe(404)
    expect(db.run).not.toHaveBeenCalled()
  })

  it('returns 404 on DELETE when the scope forbids the roadmap', async () => {
    const db = { get: vi.fn().mockResolvedValueOnce({ id: 7, roadmap_id: 4 }), run: vi.fn() }
    await mockModuleIdApi(db, { scopeAllows: false })
    const handler = (await import('../pages/api/evidences/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'DELETE', query: { id: '7' } }), res)

    expect(res.statusCode).toBe(404)
    expect(db.run).not.toHaveBeenCalled()
  })

  it('returns 404 on DELETE when no evidence row was removed', async () => {
    const db = {
      get: vi.fn().mockResolvedValueOnce({ id: 7, roadmap_id: 4 }),
      run: vi.fn().mockResolvedValue({ changes: 0 })
    }
    await mockModuleIdApi(db)
    const handler = (await import('../pages/api/evidences/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'DELETE', query: { id: '7' } }), res)

    expect(res.statusCode).toBe(404)
  })

  it('deletes evidence and returns 204', async () => {
    const db = {
      get: vi.fn().mockResolvedValueOnce({ id: 7, roadmap_id: 4 }),
      run: vi.fn().mockResolvedValue({ changes: 1 })
    }
    await mockModuleIdApi(db)
    const handler = (await import('../pages/api/evidences/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'DELETE', query: { id: '7' } }), res)

    expect(res.statusCode).toBe(204)
  })

  it('rejects unsupported methods', async () => {
    const db = { get: vi.fn(), run: vi.fn() }
    await mockModuleIdApi(db)
    const handler = (await import('../pages/api/evidences/modules/[id]')).default

    const res = createResponse()
    await handler(createRequest({ method: 'PATCH', query: { id: '7' } }), res)

    expect(res.statusCode).toBe(405)
  })
})

describe('PUT /api/evidences/[id]/review', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('rejects non-PUT methods', async () => {
    const db = { run: vi.fn(), get: vi.fn() }
    await mockReviewApi(db)
    const handler = (await import('../pages/api/evidences/[id]/review')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '5' } }), res)

    expect(res.statusCode).toBe(405)
  })

  it('blocks non-admin users', async () => {
    const db = { run: vi.fn(), get: vi.fn() }
    await mockReviewApi(db, { admin: null })
    const handler = (await import('../pages/api/evidences/[id]/review')).default

    const res = createResponse()
    await handler(createRequest({
      method: 'PUT',
      query: { id: '5' },
      body: { review_status: 'aprobado' }
    }), res)

    expect(res.statusCode).toBe(403)
    expect(db.run).not.toHaveBeenCalled()
  })

  it('rejects a non-numeric evidence id', async () => {
    const db = { run: vi.fn(), get: vi.fn() }
    await mockReviewApi(db)
    const handler = (await import('../pages/api/evidences/[id]/review')).default

    const res = createResponse()
    await handler(createRequest({
      method: 'PUT',
      query: { id: 'abc' },
      body: { review_status: 'aprobado' }
    }), res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'ID de evidencia no válido' })
  })

  it('rejects a non-positive evidence id', async () => {
    const db = { run: vi.fn(), get: vi.fn() }
    await mockReviewApi(db)
    const handler = (await import('../pages/api/evidences/[id]/review')).default

    const res = createResponse()
    await handler(createRequest({
      method: 'PUT',
      query: { id: '0' },
      body: { review_status: 'aprobado' }
    }), res)

    expect(res.statusCode).toBe(400)
  })

  it('rejects an invalid review status', async () => {
    const db = { run: vi.fn(), get: vi.fn() }
    await mockReviewApi(db)
    const handler = (await import('../pages/api/evidences/[id]/review')).default

    const res = createResponse()
    await handler(createRequest({
      method: 'PUT',
      query: { id: '5' },
      body: { review_status: 'unknown_status' }
    }), res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'Estado de revisión no válido' })
  })

  it('rejects a non-string admin comment', async () => {
    const db = { run: vi.fn(), get: vi.fn() }
    await mockReviewApi(db)
    const handler = (await import('../pages/api/evidences/[id]/review')).default

    const res = createResponse()
    await handler(createRequest({
      method: 'PUT',
      query: { id: '5' },
      body: { review_status: 'aprobado', admin_comment: 12345 }
    }), res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'El comentario del administrador debe ser un texto' })
  })

  it('returns 404 when the evidence to review does not exist', async () => {
    const db = { run: vi.fn().mockResolvedValue({ changes: 0 }), get: vi.fn().mockResolvedValue(undefined) }
    await mockReviewApi(db)
    const handler = (await import('../pages/api/evidences/[id]/review')).default

    const res = createResponse()
    await handler(createRequest({
      method: 'PUT',
      query: { id: '5' },
      body: { review_status: 'aprobado' }
    }), res)

    expect(res.statusCode).toBe(404)
    expect(res.body).toEqual({ error: 'Evidencia no encontrada' })
  })

  it('returns 500 when reviewing the evidence throws', async () => {
    const db = { run: vi.fn().mockRejectedValue(new Error('boom')), get: vi.fn() }
    await mockReviewApi(db)
    const handler = (await import('../pages/api/evidences/[id]/review')).default

    const res = createResponse()
    await handler(createRequest({
      method: 'PUT',
      query: { id: '5' },
      body: { review_status: 'aprobado' }
    }), res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'boom' })
  })
})
