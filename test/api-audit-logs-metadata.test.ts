import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest, createResponse } from './helpers/api'

const admin = { id: 1, email: 'admin@example.com', role: 'admin' as const }
const user = { id: 2, email: 'user@example.com', role: 'user' as const }

function denyAdmin(res: any) {
  res.status(403).json({ error: 'Necesitas permisos de administrador.' })
  return null
}

async function mockAuditLogsApi(db: any, options: { admin?: any } = {}) {
  vi.resetModules()
  vi.doMock('../lib/persistence', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
  vi.doMock('../lib/http/auth', () => ({
    requireAdmin: vi.fn((_req: any, res: any) => {
      if (options.admin === null) return denyAdmin(res)
      return options.admin ?? admin
    })
  }))
}

async function mockRoadmapExportApi(
  db: any,
  options: { admin?: any; exportData?: any } = {}
) {
  vi.resetModules()
  vi.doMock('../lib/persistence', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
  vi.doMock('../lib/http/auth', () => ({
    requireAdmin: vi.fn((_req: any, res: any) => {
      if (options.admin === null) return denyAdmin(res)
      return options.admin ?? admin
    })
  }))
  vi.doMock('../lib/domains/content/repositories/importRepository', () => ({
    createImportRepository: () => ({
      exportRoadmap: vi.fn().mockResolvedValue(
        options.exportData === undefined ? { title: 'Roadmap de prueba' } : options.exportData
      )
    })
  }))
}

async function mockMetadataApi(db: any, options: { scope?: any; userProgress?: any[] } = {}) {
  vi.resetModules()
  vi.doMock('../lib/persistence', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
  vi.doMock('../lib/http/auth', () => ({
    getRoadmapReadScope: vi.fn().mockResolvedValue(
      options.scope ?? { user: null, allRoadmaps: true, roadmapIds: [] }
    )
  }))
  vi.doMock('../lib/domains/progress/repositories/progressRepository', () => ({
    createProgressRepository: () => ({
      listUserRoadmapProgress: vi.fn().mockResolvedValue(options.userProgress ?? [])
    })
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

  it('stops when the caller is not an admin', async () => {
    const db = {}
    await mockRoadmapExportApi(db, { admin: null })
    const handler = (await import('../pages/api/roadmaps/[id]/export')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '7' } }), res)

    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: 'Necesitas permisos de administrador.' })
  })

  it('rejects a non-numeric roadmap id', async () => {
    const db = {}
    await mockRoadmapExportApi(db)
    const handler = (await import('../pages/api/roadmaps/[id]/export')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: 'abc' } }), res)

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('El campo «id» debe ser un número entero positivo.')
  })

  it('rejects a non-positive roadmap id', async () => {
    const db = {}
    await mockRoadmapExportApi(db)
    const handler = (await import('../pages/api/roadmaps/[id]/export')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '0' } }), res)

    expect(res.statusCode).toBe(400)
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

  it('recomputes filtered facet counts when search or filter query parameters are provided', async () => {
    const db = {
      all: vi.fn().mockResolvedValueOnce([
        {
          id: 1,
          title: 'De 0 a 100 en AWS en 14 días',
          duration_weeks_min: 1.5,
          duration_weeks_max: 4,
          category_key: 'aws',
          category_label: 'AWS',
          topics_metadata: 'aws\u001fAWS',
          module_levels: 'beginner',
          module_count: 1,
          module_search_text: ''
        },
        {
          id: 2,
          title: 'Roadmap de ejemplo',
          duration_weeks_min: 2,
          duration_weeks_max: 2,
          category_key: 'desarrollo',
          category_label: 'Desarrollo',
          topics_metadata: 'testing\u001fTesting',
          module_levels: 'beginner',
          module_count: 1,
          module_search_text: ''
        }
      ]),
      get: vi.fn()
    }
    await mockMetadataApi(db, { scope: { user: null, allRoadmaps: true, roadmapIds: [] } })
    const handler = (await import('../pages/api/roadmaps/metadata')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { q: 'AWS', duration: 'up-to-4' } }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.duration_ranges.find((item: any) => item.key === 'up-to-4')?.roadmap_count).toBe(1)
    expect(res.body.categories).toEqual([
      { key: 'aws', label: 'AWS', roadmap_count: 1 },
      { key: 'desarrollo', label: 'Desarrollo', roadmap_count: 0 }
    ])
  })

  it('rejects metadata queries whose search term exceeds the maximum length', async () => {
    const db = { all: vi.fn(), get: vi.fn() }
    await mockMetadataApi(db)
    const handler = (await import('../pages/api/roadmaps/metadata')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { q: 'a'.repeat(101) } }), res)

    expect(res.statusCode).toBe(400)
    expect(db.all).not.toHaveBeenCalled()
  })
})
