import fs from 'fs'
import os from 'os'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openSqliteDb } from '../lib/db'
import { createRequest, createResponse } from './helpers/api'
import type { DatabaseClient } from '../lib/database'

const admin = { id: 1, email: 'admin@example.com', role: 'admin' as const }
const roadmap = { title: 'Ruta importada', category: 'Cloud', topics: ['AWS'], modules: [{ title: 'Inicio' }] }

async function apiDb(): Promise<DatabaseClient> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-roadmap-import-api-'))
  return openSqliteDb(path.join(tmp, 'test.db'))
}

async function loadHandler(db: any, allowed: any = admin) {
  vi.resetModules()
  vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
  vi.doMock('../lib/auth', () => ({ requireAdmin: vi.fn().mockResolvedValue(allowed) }))
  vi.doMock('../lib/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
  return (await import('../pages/api/roadmaps/import')).default
}

describe('roadmap import API', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('only accepts POST from admins', async () => {
    const db = await apiDb()
    const handler = await loadHandler(db)
    const methodRes = createResponse()
    await handler(createRequest({ method: 'GET' }), methodRes)
    expect(methodRes.statusCode).toBe(405)
    expect(methodRes.headers.Allow).toBe('POST')

    const deniedHandler = await loadHandler(db, null)
    const deniedRes = createResponse()
    await deniedHandler(createRequest({ method: 'POST', body: { roadmap } }), deniedRes)
    expect(deniedRes.body).toBeUndefined()
    await db.close()
  })

  it('previews, creates and then updates a valid roadmap', async () => {
    const db = await apiDb()
    const handler = await loadHandler(db)

    const previewRes = createResponse()
    await handler(createRequest({ method: 'POST', body: { action: 'preview', roadmap } }), previewRes)
    expect(previewRes.statusCode).toBe(200)
    expect(previewRes.body).toMatchObject({ roadmap: { title: 'Ruta importada' }, existing: null })

    const createRes = createResponse()
    await handler(createRequest({ method: 'POST', body: { action: 'publish', strategy: 'create', roadmap } }), createRes)
    expect(createRes.statusCode).toBe(201)
    expect(createRes.body).toMatchObject({ roadmap_id: 1, created_modules: 1 })

    const existingPreview = createResponse()
    await handler(createRequest({ method: 'POST', body: { action: 'preview', roadmap } }), existingPreview)
    expect(existingPreview.body.existing).toEqual({ id: 1, title: 'Ruta importada' })

    const updateRes = createResponse()
    await handler(createRequest({ method: 'POST', body: { action: 'publish', strategy: 'update', roadmap } }), updateRes)
    expect(updateRes.statusCode).toBe(200)
    expect(updateRes.body.updated_modules).toBe(1)
    await db.close()
  })

  it('returns actionable validation, action, strategy and conflict errors', async () => {
    const db = await apiDb()
    const handler = await loadHandler(db)

    const invalidRes = createResponse()
    await handler(createRequest({ method: 'POST', body: { action: 'preview', roadmap: {} } }), invalidRes)
    expect(invalidRes.statusCode).toBe(400)
    expect(invalidRes.body.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'title' })]))

    for (const [body, error] of [
      [{ action: 'wrong', roadmap }, 'Acción de importación no válida.'],
      [{ action: 'publish', strategy: 'replace', roadmap }, 'La estrategia debe ser create o update.']
    ] as const) {
      const res = createResponse()
      await handler(createRequest({ method: 'POST', body }), res)
      expect(res.body.error).toBe(error)
    }

    const conflictRes = createResponse()
    await handler(createRequest({ method: 'POST', body: { action: 'publish', strategy: 'update', roadmap } }), conflictRes)
    expect(conflictRes.statusCode).toBe(409)
    expect(conflictRes.body.code).toBe('not_found')

    const tooLargeRes = createResponse()
    await handler(createRequest({ method: 'POST', body: { roadmap: { title: 'x'.repeat(1024 * 1024 + 1) } } }), tooLargeRes)
    expect(tooLargeRes.statusCode).toBe(413)
    await db.close()
  })
})
