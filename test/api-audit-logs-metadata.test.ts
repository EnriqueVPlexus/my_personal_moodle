import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest, createResponse } from './helpers/api'

const admin = { id: 1, email: 'admin@example.com', role: 'admin' as const }
const user = { id: 2, email: 'user@example.com', role: 'user' as const }

function denyAdmin(res: any) {
  res.status(403).json({ error: 'admin role required' })
  return null
}

async function mockAuditLogsApi(db: any, options: { admin?: any } = {}) {
  vi.resetModules()
  vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
  vi.doMock('../lib/auth', () => ({
    requireAdmin: vi.fn((_req: any, res: any) => {
      if (options.admin === null) return denyAdmin(res)
      return options.admin ?? admin
    })
  }))
}

async function mockRoadmapExportApi(
  db: any,
  options: { scope?: any; scopeAllows?: boolean; exportData?: any } = {}
) {
  vi.resetModules()
  vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
  vi.doMock('../lib/auth', () => ({
    getRoadmapReadScope: vi.fn((_req: any, res: any) => {
      if (options.scope === null) {
        res.status(401).json({ error: 'authentication required' })
        return null
      }
      return options.scope ?? { user: null, allRoadmaps: true, roadmapIds: [] }
    }),
    scopeAllowsRoadmap: vi.fn().mockReturnValue(options.scopeAllows ?? true)
  }))
  vi.doMock('../lib/roadmapImport', () => ({
    exportRoadmapAsJson: vi.fn().mockResolvedValue(
      options.exportData === undefined ? { title: 'Roadmap de prueba' } : options.exportData
    )
  }))
}

async function mockMetadataApi(db: any, options: { scope?: any; userProgress?: any[] } = {}) {
  vi.resetModules()
  vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
  vi.doMock('../lib/auth', () => ({
    getRoadmapReadScope: vi.fn().mockResolvedValue(
      options.scope ?? { user: null, allRoadmaps: true, roadmapIds: [] }
    )
  }))
  vi.doMock('../lib/progress', () => ({
    listUserRoadmapProgress: vi.fn().mockResolvedValue(options.userProgress ?? [])
  }))
}

describe('GET /api/audit-logs', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('rejects non-GET methods', async () => {
    const db = { all: vi.fn() }
    await mockAuditLogsApi(db)
    const handler = (await import('../pages/api/audit-logs/index')).default

    const res = createResponse()
    await handler(createRequest({ method: 'POST' }), res)

    expect(res.statusCode).toBe(405)
    expect(db.all).not.toHaveBeenCalled()
  })

  it('blocks non-admin users', async () => {
    const db = { all: vi.fn() }
    await mockAuditLogsApi(db, { admin: null })
    const handler = (await import('../pages/api/audit-logs/index')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET' }), res)

    expect(res.statusCode).toBe(403)
    expect(db.all).not.toHaveBeenCalled()
  })
})

describe('GET /api/roadmaps/[id]/export', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('rejects non-GET methods', async () => {
    const db = {}
    await mockRoadmapExportApi(db)
    const handler = (await import('../pages/api/roadmaps/[id]/export')).default

    const res = createResponse()
    await handler(createRequest({ method: 'POST', query: { id: '7' } }), res)

    expect(res.statusCode).toBe(405)
  })

  it('stops when the roadmap scope is unavailable', async () => {
    const db = {}
    await mockRoadmapExportApi(db, { scope: null })
    const handler = (await import('../pages/api/roadmaps/[id]/export')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '7' } }), res)

    expect(res.statusCode).toBe(401)
  })

  it('rejects a non-numeric roadmap id', async () => {
    const db = {}
    await mockRoadmapExportApi(db)
    const handler = (await import('../pages/api/roadmaps/[id]/export')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: 'abc' } }), res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'ID de roadmap no válido' })
  })

  it('rejects a non-positive roadmap id', async () => {
    const db = {}
    await mockRoadmapExportApi(db)
    const handler = (await import('../pages/api/roadmaps/[id]/export')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '0' } }), res)

    expect(res.statusCode).toBe(400)
  })

  it('returns 403 when the scope forbids the roadmap', async () => {
    const db = {}
    await mockRoadmapExportApi(db, { scopeAllows: false })
    const handler = (await import('../pages/api/roadmaps/[id]/export')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '7' } }), res)

    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: 'Acceso denegado a este roadmap' })
  })

  it('returns 404 when the roadmap does not exist', async () => {
    const db = {}
    await mockRoadmapExportApi(db, { exportData: null })
    const handler = (await import('../pages/api/roadmaps/[id]/export')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '7' } }), res)

    expect(res.statusCode).toBe(404)
    expect(res.body).toEqual({ error: 'Roadmap no encontrado' })
  })
})

describe('GET /api/roadmaps/metadata', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('rejects non-GET methods', async () => {
    const db = { all: vi.fn(), get: vi.fn() }
    await mockMetadataApi(db)
    const handler = (await import('../pages/api/roadmaps/metadata')).default

    const res = createResponse()
    await handler(createRequest({ method: 'POST' }), res)

    expect(res.statusCode).toBe(405)
    expect(db.all).not.toHaveBeenCalled()
  })

  it('computes progress-status roadmap counts for authenticated users with full access', async () => {
    const db = {
      all: vi.fn()
        .mockResolvedValueOnce([{ key: 'cloud', label: 'Cloud', roadmap_count: 3 }])
        .mockResolvedValueOnce([{ key: 'aws', label: 'AWS', roadmap_count: 2 }])
        .mockResolvedValueOnce([{ key: 'beginner', roadmap_count: 2 }]),
      get: vi.fn()
        .mockResolvedValueOnce({
          min_weeks: 2,
          max_weeks: 10,
          total_count: 3,
          up_to_4_count: 1,
          from_5_to_12_count: 2,
          over_12_count: 0
        })
        .mockResolvedValueOnce({ count: 1 })
    }
    await mockMetadataApi(db, {
      scope: { user, allRoadmaps: true, roadmapIds: [] },
      userProgress: [
        { roadmap_id: 1, status: 'completed' },
        { roadmap_id: 2, status: 'in_progress' },
        { roadmap_id: 3, status: 'in_progress' }
      ]
    })
    const handler = (await import('../pages/api/roadmaps/metadata')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET' }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.progress_statuses).toEqual(expect.arrayContaining([
      { key: 'completed', label: 'Completados', roadmap_count: 1 },
      { key: 'in_progress', label: 'En curso', roadmap_count: 2 },
      { key: 'not_started', label: 'Sin empezar', roadmap_count: 0 }
    ]))
  })

  it('filters catalog facets and user progress by a restricted roadmap access scope', async () => {
    const db = {
      all: vi.fn()
        .mockResolvedValueOnce([{ key: 'cloud', label: 'Cloud', roadmap_count: 1 }])
        .mockResolvedValueOnce([{ key: 'aws', label: 'AWS', roadmap_count: 1 }])
        .mockResolvedValueOnce([{ key: 'beginner', roadmap_count: 1 }]),
      get: vi.fn()
        .mockResolvedValueOnce({
          min_weeks: 2,
          max_weeks: 4,
          total_count: 1,
          up_to_4_count: 1,
          from_5_to_12_count: 0,
          over_12_count: 0
        })
        .mockResolvedValueOnce({ count: 0 })
    }
    await mockMetadataApi(db, {
      scope: { user, allRoadmaps: false, roadmapIds: [5] },
      userProgress: [
        { roadmap_id: 5, status: 'completed' },
        { roadmap_id: 9, status: 'in_progress' }
      ]
    })
    const handler = (await import('../pages/api/roadmaps/metadata')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET' }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.progress_statuses).toEqual(expect.arrayContaining([
      { key: 'completed', label: 'Completados', roadmap_count: 1 },
      { key: 'in_progress', label: 'En curso', roadmap_count: 0 },
      { key: 'not_started', label: 'Sin empezar', roadmap_count: 0 }
    ]))
    const [categoriesSql, categoriesParams] = db.all.mock.calls[0]
    expect(categoriesSql).toContain('WHERE roadmaps.id IN')
    expect(categoriesParams).toEqual([5])
  })
})
