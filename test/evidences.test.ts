import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getModuleEvidence,
  reviewModuleEvidence,
  saveModuleEvidence,
  validateEvidenceInput
} from '../lib/evidences'
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
    expect(validateEvidenceInput({ evidence_type: 'file', note: 'x' })).toEqual({ error: 'invalid evidence type' })
    expect(validateEvidenceInput({ evidence_type: 'demo', url: 'javascript:alert(1)' })).toEqual({
      error: 'url must use http or https'
    })
    expect(validateEvidenceInput({ evidence_type: 'note', note: '   ' })).toEqual({ error: 'url or note required' })
  })

  it('creates, updates and reviews evidence with status reset on resubmission', async () => {
    const db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE user_module_evidences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        module_id INTEGER NOT NULL,
        evidence_type TEXT NOT NULL,
        url TEXT,
        note TEXT,
        review_status TEXT NOT NULL DEFAULT 'pendiente',
        admin_comment TEXT,
        reviewed_at TEXT,
        reviewed_by_user_id INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (user_id, module_id)
      )
    `)

    const created = await saveModuleEvidence(db, 2, 7, {
      evidenceType: 'github',
      url: 'https://github.com/example/project',
      note: null
    })
    expect(created).toMatchObject({ user_id: 2, module_id: 7, evidence_type: 'github', review_status: 'pendiente' })

    const reviewed = await reviewModuleEvidence(db, created.id, 1, {
      reviewStatus: 'requiere_cambios',
      adminComment: 'Falta añadir el README con instrucciones'
    })
    expect(reviewed).toMatchObject({
      review_status: 'requiere_cambios',
      admin_comment: 'Falta añadir el README con instrucciones',
      reviewed_by_user_id: 1
    })

    const resubmitted = await saveModuleEvidence(db, 2, 7, {
      evidenceType: 'github',
      url: 'https://github.com/example/project-v2',
      note: 'README añadido'
    })
    expect(resubmitted.review_status).toBe('pendiente')

    await db.close()
  })
})

describe('evidence API handlers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  async function mockModuleApi(db: any) {
    vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
    vi.doMock('../lib/auth', () => ({
      getRoadmapReadScope: vi.fn().mockResolvedValue({ user, allRoadmaps: true, roadmapIds: [] }),
      requireUser: vi.fn().mockResolvedValue(user),
      requireAdmin: vi.fn().mockResolvedValue(admin),
      scopeAllowsRoadmap: vi.fn().mockReturnValue(true)
    }))
    vi.doMock('../lib/progress', () => ({ touchRoadmapProgress: vi.fn().mockResolvedValue(undefined) }))
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
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT(user_id, module_id) DO UPDATE'),
      [2, 7, 'github', evidence.url, null, expect.any(String), expect.any(String)]
    )
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
