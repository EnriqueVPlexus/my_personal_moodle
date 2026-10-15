import { describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { exportPortfolioAsMarkdown, getUserPortfolio } from '../lib/portfolio'
import { openSqliteDb } from '../lib/persistence'
import { createRequest, createResponse } from './helpers/api'
import type { DatabaseClient } from '../lib/persistence/database'

const user = { id: 970002, email: 'student@example.com', role: 'user' as const }

async function setupDb(): Promise<DatabaseClient> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-portfolio-'))
  const db = await openSqliteDb(path.join(tmp, 'test.db'))

  await db.exec(`
    INSERT INTO roadmaps (id, title) VALUES (970010, 'DevOps Cantera');
    INSERT INTO modules (id, roadmap_id, position, title) VALUES (970021, 970010, 1, 'Contenedores con Docker');
  `)
  await db.run(
    `INSERT INTO users (id, email, name, role, password_hash, can_view_all_roadmaps, is_active, created_at, updated_at)
     VALUES (970002, 'student@example.com', 'Estudiante Test', 'user', 'hash', 1, 1, datetime('now'), datetime('now'))`
  )
  await db.run(
    `INSERT INTO user_module_evidences (user_id, module_id, evidence_type, url, note, review_status, admin_comment, created_at, updated_at)
     VALUES (970002, 970021, 'github', 'https://github.com/test/docker-demo', 'Docker compose con Nginx', 'aprobado', 'Buen trabajo con los volúmenes', datetime('now'), datetime('now'))`
  )

  return db
}

describe('portfolio helpers', () => {
  it('fetches user portfolio and generates valid Markdown export', async () => {
    const db = await setupDb()
    const portfolio = await getUserPortfolio(db, 970002)

    expect(portfolio).toMatchObject({
      user: { id: 970002, email: 'student@example.com', name: 'Estudiante Test' },
      total_evidences: 1,
      approved_evidences: 1
    })
    expect(portfolio?.roadmaps).toHaveLength(1)
    expect(portfolio?.roadmaps[0].title).toBe('DevOps Cantera')
    expect(portfolio?.roadmaps[0].items[0]).toMatchObject({
      module_title: 'Contenedores con Docker',
      evidence_type: 'github',
      url: 'https://github.com/test/docker-demo',
      review_status: 'aprobado'
    })

    const markdown = exportPortfolioAsMarkdown(portfolio!)
    expect(markdown).toContain('# Portfolio de Evidencias - Estudiante Test')
    expect(markdown).toContain('## DevOps Cantera')
    expect(markdown).toContain('### Módulo 1: Contenedores con Docker')
    expect(markdown).toContain('https://github.com/test/docker-demo')
    expect(markdown).toContain('Aprobado ✓')

    await db.close()
  })

  it('returns empty portfolio structure when user has no evidences', async () => {
    const db = await setupDb()
    await db.run('DELETE FROM user_module_evidences')

    const portfolio = await getUserPortfolio(db, 970002)
    expect(portfolio?.total_evidences).toBe(0)
    expect(portfolio?.roadmaps).toHaveLength(0)

    const markdown = exportPortfolioAsMarkdown(portfolio!)
    expect(markdown).toContain('Aún no se han registrado entregables')

    await db.close()
  })
})

describe('portfolio API handlers', () => {
  it('serves JSON portfolio via GET /api/portfolio', async () => {
    const db = await setupDb()
    vi.resetModules()
    vi.doMock('../lib/persistence', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
    vi.doMock('../lib/http/auth', () => ({ requireUser: vi.fn().mockResolvedValue(user) }))

    const handler = (await import('../pages/api/portfolio/index')).default
    const res = createResponse()
    await handler(createRequest({ method: 'GET' }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.user.email).toBe('student@example.com')
    expect(res.body.total_evidences).toBe(1)

    await db.close()
  })

  it('serves Markdown file export via GET /api/portfolio/export', async () => {
    const db = await setupDb()
    vi.resetModules()
    vi.doMock('../lib/persistence', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
    vi.doMock('../lib/http/auth', () => ({ requireUser: vi.fn().mockResolvedValue(user) }))

    const handler = (await import('../pages/api/portfolio/export')).default
    const res = createResponse()
    await handler(createRequest({ method: 'GET' }), res)

    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toContain('text/markdown')
    expect(res.headers['Content-Disposition']).toContain('filename="portfolio-estudiante-test.md"')
    expect(res.body).toContain('# Portfolio de Evidencias - Estudiante Test')

    await db.close()
  })
})
