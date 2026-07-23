import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getModuleEvidence,
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

  it('creates and updates one evidence per user and module', async () => {
    const db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE user_module_evidences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        module_id INTEGER NOT NULL,
        evidence_type TEXT NOT NULL,
        url TEXT,
        note TEXT,
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
    const updated = await saveModuleEvidence(db, 2, 7, {
      evidenceType: 'demo',
      url: 'https://example.com/demo',
      note: 'Disponible temporalmente'
    })
    const count = await db.get('SELECT COUNT(*) AS count FROM user_module_evidences')

    expect(created).toMatchObject({ user_id: 2, module_id: 7, evidence_type: 'github' })
    expect(updated).toMatchObject({
      id: created.id,
      evidence_type: 'demo',
      url: 'https://example.com/demo',
      note: 'Disponible temporalmente'
    })
    expect(count.count).toBe(1)
    expect(await getModuleEvidence(db, 99, 7)).toBeNull()
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

  it('rejects invalid evidence and hides inaccessible modules', async () => {
    const db = {
      get: vi.fn().mockResolvedValue({ id: 7, roadmap_id: 4 }),
      run: vi.fn()
    }
    await mockModuleApi(db)
    const auth = await import('../lib/auth')
    vi.mocked(auth.scopeAllowsRoadmap).mockReturnValueOnce(false)
    const handler = (await import('../pages/api/evidences/modules/[id]')).default

    const hiddenRes = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '7' } }), hiddenRes)
    expect(hiddenRes.statusCode).toBe(404)

    const invalidRes = createResponse()
    await handler(createRequest({
      method: 'PUT',
      query: { id: '7' },
      body: { evidence_type: 'github', url: 'not-a-url' }
    }), invalidRes)
    expect(invalidRes.statusCode).toBe(400)
    expect(db.run).not.toHaveBeenCalled()
  })

  it('lists evidence context for admins', async () => {
    const rows = [{ id: 4, user_email: 'user@example.com', module_title: 'CI/CD', roadmap_title: 'DevOps' }]
    const db = { all: vi.fn().mockResolvedValue(rows) }
    vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
    vi.doMock('../lib/auth', () => ({ requireAdmin: vi.fn().mockResolvedValue(admin) }))
    const handler = (await import('../pages/api/evidences/index')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: {} }), res)

    expect(res.body).toEqual(rows)
    expect(db.all).toHaveBeenCalledWith(expect.stringContaining('INNER JOIN roadmaps'), [])
  })
})
