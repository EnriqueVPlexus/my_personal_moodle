import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { describe, expect, it, vi } from 'vitest'
import { exportRoadmapAsJson, validateRoadmapImport } from '../lib/roadmapImport'
import { createRequest, createResponse } from './helpers/api'

const admin = { id: 1, email: 'admin@example.com', role: 'admin' as const }

async function setupDb() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database })
  await db.exec(`
    CREATE TABLE roadmaps (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      duration TEXT,
      duration_weeks_min REAL,
      duration_weeks_max REAL,
      objectives TEXT,
      methodology TEXT,
      evaluation_weights TEXT,
      category_id INTEGER
    );
    CREATE TABLE roadmap_categories (id INTEGER PRIMARY KEY, key TEXT, label TEXT);
    CREATE TABLE topics (id INTEGER PRIMARY KEY, key TEXT, label TEXT);
    CREATE TABLE roadmap_topics (roadmap_id INTEGER, topic_id INTEGER);
    CREATE TABLE modules (
      id INTEGER PRIMARY KEY,
      roadmap_id INTEGER NOT NULL,
      position INTEGER,
      title TEXT NOT NULL,
      level TEXT,
      duration TEXT,
      duration_weeks_min REAL,
      duration_weeks_max REAL,
      objective TEXT,
      contents TEXT,
      importance TEXT,
      official_resources TEXT,
      support_videos TEXT,
      practical_activity TEXT,
      deliverable_evidence TEXT,
      evaluation TEXT
    );

    INSERT INTO roadmap_categories VALUES (1, 'cloud-y-devops', 'Cloud y DevOps');
    INSERT INTO topics VALUES (1, 'aws', 'AWS'), (2, 'devops', 'DevOps');

    INSERT INTO roadmaps VALUES (
      7,
      'IA para DevOps',
      'Ruta aplicada',
      '8 semanas',
      8, 10,
      '["Aprender IA", "Automatizar"]',
      '["Práctica guiada"]',
      '{"Quizzes": "30%", "Evidencias": "70%"}',
      1
    );

    INSERT INTO roadmap_topics VALUES (7, 1), (7, 2);

    INSERT INTO modules VALUES (
      15, 7, 1,
      'Observabilidad de agentes',
      'intermediate',
      '2 semanas', 2, 2,
      'Objetivo del módulo',
      '["Evaluación de prompts", "Métricas"]',
      'Importante para producción',
      '[{"label":"Doc oficial","url":"https://example.com"}]',
      '[]',
      '["Crear dashboard"]',
      '["Link a GitHub"]',
      'Evaluación continua'
    );
  `)
  return db
}

describe('roadmap JSON export', () => {
  it('exports an existing roadmap into a valid NormalizedRoadmapImport structure', async () => {
    const db = await setupDb()
    const exported = await exportRoadmapAsJson(db, 7)

    expect(exported).toMatchObject({
      title: 'IA para DevOps',
      description: 'Ruta aplicada',
      duration: '8 semanas',
      category: 'Cloud y DevOps',
      topics: ['AWS', 'DevOps'],
      objectives: ['Aprender IA', 'Automatizar'],
      methodology: ['Práctica guiada'],
      evaluation_weights: { Quizzes: '30%', Evidencias: '70%' }
    })
    expect(exported?.modules).toHaveLength(1)
    expect(exported?.modules[0]).toMatchObject({
      position: 1,
      title: 'Observabilidad de agentes',
      level: 'intermediate',
      contents: ['Evaluación de prompts', 'Métricas'],
      official_resources: [{ label: 'Doc oficial', url: 'https://example.com' }],
      practical_activity: ['Crear dashboard']
    })

    const validation = validateRoadmapImport(exported)
    expect(validation.valid).toBe(true)

    await db.close()
  })

  it('returns null when exporting a non-existent roadmap ID', async () => {
    const db = await setupDb()
    const exported = await exportRoadmapAsJson(db, 999)
    expect(exported).toBeNull()
    await db.close()
  })

  it('serves the exported JSON file via GET /api/roadmaps/[id]/export endpoint', async () => {
    const db = await setupDb()
    vi.resetModules()
    vi.doMock('../lib/db', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
    vi.doMock('../lib/auth', () => ({
      getRoadmapReadScope: vi.fn().mockResolvedValue({ allRoadmaps: true, roadmapIds: [] }),
      scopeAllowsRoadmap: vi.fn().mockReturnValue(true)
    }))

    const handler = (await import('../pages/api/roadmaps/[id]/export')).default

    const res = createResponse()
    await handler(createRequest({ method: 'GET', query: { id: '7' } }), res)

    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toContain('application/json')
    expect(res.headers['Content-Disposition']).toContain('filename="ia-para-devops.json"')

    expect(res.body.title).toBe('IA para DevOps')
    expect(res.body.modules).toHaveLength(1)

    await db.close()
  })
})
