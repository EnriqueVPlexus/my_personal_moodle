import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest, createResponse } from './helpers/api'

const admin = { id: 1, email: 'admin@example.com', role: 'admin' as const }

async function mockApi(db: any, options: { admin?: any; read?: boolean } = {}) {
  vi.resetModules()
  vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
  vi.doMock('../lib/auth', () => ({
    requireAdmin: vi.fn().mockResolvedValue(options.admin === undefined ? admin : options.admin),
    getRoadmapReadScope: vi.fn((_req: any, res: any) => {
      if (options.read === false) {
        res.status(401).json({ error: 'authentication required' })
        return null
      }
      return { user: null, allRoadmaps: true, roadmapIds: [] }
    }),
    requireReadAccess: vi.fn().mockResolvedValue(options.read !== false),
    scopeAllowsRoadmap: vi.fn((scope: any, roadmapId: any) => (
      scope.allRoadmaps || scope.roadmapIds.includes(Number(Array.isArray(roadmapId) ? roadmapId[0] : roadmapId))
    ))
  }))
  vi.doMock('../lib/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
}

describe('content API handlers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('lists and creates roadmaps with audit', async () => {
    const db = {
      all: vi.fn().mockResolvedValue([{ id: 1, title: 'AWS' }]),
      run: vi.fn().mockResolvedValue({ lastID: 2 }),
      get: vi.fn().mockResolvedValue({ id: 2, title: 'New' })
    }
    await mockApi(db)
    const handler = (await import('../pages/api/roadmaps/index')).default

    const getRes = createResponse()
    await handler(createRequest({ method: 'GET' }), getRes)
    expect(getRes.body).toEqual([{ id: 1, title: 'AWS' }])

    const postRes = createResponse()
    await handler(createRequest({ method: 'POST', body: { title: 'New', description: 'Desc' } }), postRes)
    expect(postRes.statusCode).toBe(201)
    expect(db.run).toHaveBeenCalledWith('INSERT INTO roadmaps (title, description) VALUES (?, ?)', ['New', 'Desc'])
  })

  it('reads, updates and deletes a roadmap', async () => {
    const db = {
      get: vi.fn()
        .mockResolvedValueOnce({ id: 1, title: 'AWS' })
        .mockResolvedValueOnce({ id: 1, title: 'AWS Updated' })
        .mockResolvedValueOnce({ title: 'AWS Updated' }),
      all: vi.fn().mockResolvedValue([{ id: 1, title: 'EC2' }]),
      run: vi.fn()
    }
    await mockApi(db)
    const handler = (await import('../pages/api/roadmaps/[id]')).default

    const getRes = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '1' } }), getRes)
    expect(getRes.body.modules).toEqual([{ id: 1, title: 'EC2' }])

    const putRes = createResponse()
    await handler(createRequest({ method: 'PUT', query: { id: '1' }, body: { title: 'AWS Updated' } }), putRes)
    expect(putRes.body.title).toBe('AWS Updated')

    const deleteRes = createResponse()
    await handler(createRequest({ method: 'DELETE', query: { id: '1' } }), deleteRes)
    expect(deleteRes.statusCode).toBe(204)
  })

  it('lists and creates modules', async () => {
    const db = {
      all: vi.fn().mockResolvedValue([{ id: 1, title: 'EC2' }]),
      run: vi.fn().mockResolvedValue({ lastID: 1 }),
      get: vi.fn().mockResolvedValue({ id: 1, title: 'EC2' })
    }
    await mockApi(db)
    const handler = (await import('../pages/api/modules/index')).default

    const getRes = createResponse()
    await handler(createRequest({ method: 'GET', query: { roadmap_id: '1' } }), getRes)
    expect(getRes.body).toEqual([{ id: 1, title: 'EC2' }])

    const postRes = createResponse()
    await handler(createRequest({ method: 'POST', body: { title: 'IAM', roadmap_id: 1 } }), postRes)
    expect(postRes.statusCode).toBe(201)
  })

  it('reads, updates and deletes modules', async () => {
    const db = {
      get: vi.fn()
        .mockResolvedValueOnce({ id: 1, title: 'EC2' })
        .mockResolvedValueOnce({ id: 1, title: 'EC2 Updated' })
        .mockResolvedValueOnce({ title: 'EC2 Updated', roadmap_id: 1 }),
      all: vi.fn().mockResolvedValue([{ id: 1, title: 'Lesson' }]),
      run: vi.fn()
    }
    await mockApi(db)
    const handler = (await import('../pages/api/modules/[id]')).default

    const getRes = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '1' } }), getRes)
    expect(getRes.body.lessons).toEqual([{ id: 1, title: 'Lesson' }])

    const putRes = createResponse()
    await handler(createRequest({ method: 'PUT', query: { id: '1' }, body: { title: 'EC2 Updated' } }), putRes)
    expect(putRes.body.title).toBe('EC2 Updated')

    const deleteRes = createResponse()
    await handler(createRequest({ method: 'DELETE', query: { id: '1' } }), deleteRes)
    expect(deleteRes.statusCode).toBe(204)
  })

  it('lists and creates lessons', async () => {
    const db = {
      all: vi.fn().mockResolvedValue([{ id: 1, title: 'SSH' }]),
      run: vi.fn().mockResolvedValue({ lastID: 1 }),
      get: vi.fn().mockResolvedValue({ id: 1, title: 'SSH' })
    }
    await mockApi(db)
    const handler = (await import('../pages/api/lessons/index')).default

    const badRes = createResponse()
    await handler(createRequest({ method: 'GET' }), badRes)
    expect(badRes.statusCode).toBe(400)

    const getRes = createResponse()
    await handler(createRequest({ method: 'GET', query: { module_id: '1' } }), getRes)
    expect(getRes.body).toEqual([{ id: 1, title: 'SSH' }])

    const postRes = createResponse()
    await handler(createRequest({ method: 'POST', body: { title: 'SSH', module_id: 1 } }), postRes)
    expect(postRes.statusCode).toBe(201)
  })

  it('reads, updates and deletes lessons', async () => {
    const db = {
      get: vi.fn()
        .mockResolvedValueOnce({ id: 1, title: 'SSH' })
        .mockResolvedValueOnce({ id: 1, title: 'SSH', completed: 1 })
        .mockResolvedValueOnce({ title: 'SSH', module_id: 1 }),
      run: vi.fn()
    }
    await mockApi(db)
    const handler = (await import('../pages/api/lessons/[id]')).default

    const getRes = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '1' } }), getRes)
    expect(getRes.body.title).toBe('SSH')

    const putRes = createResponse()
    await handler(createRequest({ method: 'PUT', query: { id: '1' }, body: { title: 'SSH', completed: true } }), putRes)
    expect(putRes.body.completed).toBe(1)

    const deleteRes = createResponse()
    await handler(createRequest({ method: 'DELETE', query: { id: '1' } }), deleteRes)
    expect(deleteRes.statusCode).toBe(204)
  })

  it('returns audit logs to admins', async () => {
    const db = {
      all: vi.fn().mockResolvedValue([{ id: 1, action: 'user.create' }])
    }
    await mockApi(db)
    const handler = (await import('../pages/api/audit-logs/index')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET' }), res)
    expect(res.body).toEqual([{ id: 1, action: 'user.create' }])
  })
})
