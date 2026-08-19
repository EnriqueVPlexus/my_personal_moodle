import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { describe, expect, it, vi } from 'vitest'
import { exportPortfolioAsMarkdown, getUserPortfolio } from '../lib/portfolio'
import { createRequest, createResponse } from './helpers/api'

const user = { id: 2, email: 'student@example.com', role: 'user' as const }

async function setupDb() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database })
  await db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, name TEXT, is_active INTEGER DEFAULT 1);
    CREATE TABLE roadmaps (id INTEGER PRIMARY KEY, title TEXT);
    CREATE TABLE modules (id INTEGER PRIMARY KEY, roadmap_id INTEGER, position INTEGER, title TEXT);
    CREATE TABLE user_module_evidences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      module_id INTEGER NOT NULL,
      evidence_type TEXT NOT NULL,
      url TEXT,
      note TEXT,
      review_status TEXT DEFAULT 'pendiente',
      admin_comment TEXT,
      reviewed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO users VALUES (2, 'student@example.com', 'Estudiante Test', 1);
    INSERT INTO roadmaps VALUES (10, 'DevOps Cantera');
    INSERT INTO modules VALUES (21, 10, 1, 'Contenedores con Docker');
    INSERT INTO user_module_evidences (id, user_id, module_id, evidence_type, url, note, review_status, admin_comment)
    VALUES (1, 2, 21, 'github', 'https://github.com/test/docker-demo', 'Docker compose con Nginx', 'aprobado', 'Buen trabajo con los volúmenes');
  `)
  return db
}

describe('portfolio helpers', () => {
  it('fetches user portfolio and generates valid Markdown export', async () => {
    const db = await setupDb()
    const portfolio = await getUserPortfolio(db, 2)

    expect(portfolio).toMatchObject({
      user: { id: 2, email: 'student@example.com', name: 'Estudiante Test' },
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

    const portfolio = await getUserPortfolio(db, 2)
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
    vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
    vi.doMock('../lib/auth', () => ({ requireUser: vi.fn().mockResolvedValue(user) }))

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
    vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
    vi.doMock('../lib/auth', () => ({ requireUser: vi.fn().mockResolvedValue(user) }))

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
