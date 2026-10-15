import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validateEvidenceInput } from '../lib/evidences'
import { createRequest, createResponse } from './helpers/api'

const user = { id: 2, email: 'user@example.com', role: 'user' as const }
const admin = { id: 1, email: 'admin@example.com', role: 'admin' as const }

describe('evidence helpers', () => {
  it('validates supported evidence types, links and notes', () => {
    expect(validateEvidenceInput({
      evidence_type: 'github',
      url: 'https://github.com/example/project',
      note: 'Pipeline reproducible'
    })).toEqual({
      value: {
        evidenceType: 'github',
        url: 'https://github.com/example/project',
        note: 'Pipeline reproducible'
      }
    })
    expect(validateEvidenceInput({ evidence_type: 'file', note: 'x' })).toEqual({
      error: 'El tipo de evidencia no es válido.',
      field: 'evidence_type'
    })
    expect(validateEvidenceInput({ evidence_type: 'demo', url: 'javascript:alert(1)' })).toEqual({
      error: 'La URL debe usar http o https.',
      field: 'url'
    })
    expect(validateEvidenceInput({ evidence_type: 'note', note: '   ' })).toEqual({ error: 'Indica una URL o una nota.', field: 'url' })
  })
})

describe('evidence API handlers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  async function mockModuleApi(db: any) {
    vi.doMock('../lib/persistence', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
    vi.doMock('../lib/auth', () => ({
      getRoadmapReadScope: vi.fn().mockResolvedValue({ user, allRoadmaps: true, roadmapIds: [] }),
      requireUser: vi.fn().mockResolvedValue(user),
      requireAdmin: vi.fn().mockResolvedValue(admin),
      scopeAllowsRoadmap: vi.fn().mockReturnValue(true)
    }))
    vi.doMock('../lib/progressRepository', () => ({ touchRoadmapProgress: vi.fn().mockResolvedValue(undefined) }))
    vi.doMock('../lib/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
  }

  it('returns and upserts the signed-in user evidence', async () => {
    const evidence = {
      id: 3,
      user_id: 2,
      module_id: 7,
      evidence_type: 'github',
      url: 'https://github.com/example/project',
      note: null,
      review_status: 'pendiente',
      created_at: '2026-07-20T10:00:00.000Z',
      updated_at: '2026-07-20T10:00:00.000Z'
    }
    const db = {
      get: vi.fn()
        .mockResolvedValueOnce({ id: 7, roadmap_id: 4 })
        .mockResolvedValueOnce(evidence)
        .mockResolvedValueOnce({ id: 7, roadmap_id: 4 })
        .mockResolvedValueOnce(evidence),
      run: vi.fn().mockResolvedValue({ changes: 1 })
    }
    await mockModuleApi(db)
    const handler = (await import('../pages/api/evidences/modules/[id]')).default

    const getRes = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '7' } }), getRes)
    expect(getRes.body.evidence).toEqual(evidence)

    const putRes = createResponse()
    await handler(createRequest({
      method: 'PUT',
      query: { id: '7' },
      body: { evidence_type: 'github', url: evidence.url }
    }), putRes)
    expect(putRes.statusCode).toBe(200)
    expect(putRes.body.evidence).toEqual(evidence)
    expect(db.run).toHaveBeenCalled()
  })

  it('allows admins to review evidences via PUT /api/evidences/[id]/review', async () => {
    const db = {
      run: vi.fn().mockResolvedValue({ changes: 1 }),
      get: vi.fn().mockResolvedValue({
        id: 5,
        review_status: 'aprobado',
        admin_comment: 'Excelente trabajo'
      })
    }
    await mockModuleApi(db)
    const handler = (await import('../pages/api/evidences/[id]/review')).default

    const res = createResponse()
    await handler(createRequest({
      method: 'PUT',
      query: { id: '5' },
      body: { review_status: 'aprobado', admin_comment: 'Excelente trabajo' }
    }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.review_status).toBe('aprobado')
  })
})
