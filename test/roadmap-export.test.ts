import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it, vi } from 'vitest'
import { exportRoadmapAsJson, validateRoadmapImport } from '../lib/roadmapImport'
import { openSqliteDb } from '../lib/persistence'
import { createRequest, createResponse } from './helpers/api'
import type { DatabaseClient } from '../lib/persistence/database'

async function setupDb(): Promise<DatabaseClient> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-roadmap-export-'))
  const db = await openSqliteDb(path.join(tmp, 'test.db'))

  await db.exec(`
    INSERT INTO roadmap_categories (id, key, label) VALUES (1, 'cloud-y-devops', 'Cloud y DevOps');
    INSERT INTO topics (id, key, label) VALUES (1, 'aws', 'AWS'), (2, 'devops', 'DevOps');

    INSERT INTO roadmaps (id, title, description, duration, duration_weeks_min, duration_weeks_max, objectives, methodology, evaluation_weights, category_id, version, published_at) VALUES (
      7,
      'IA para DevOps',
      'Ruta aplicada',
      '8 semanas',
      8, 10,
      '["Aprender IA", "Automatizar"]',
      '["Práctica guiada"]',
      '{"Quizzes": "30%", "Evidencias": "70%"}',
      1, 'v1.0.0', '2026-01-01T00:00:00.000Z'
    );

    INSERT INTO roadmap_topics (roadmap_id, topic_id) VALUES (7, 1), (7, 2);

    INSERT INTO modules (id, roadmap_id, position, title, level, duration, duration_weeks_min, duration_weeks_max, objective, contents, importance, official_resources, support_videos, practical_activity, deliverable_evidence, evaluation) VALUES (
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
    vi.doMock('../lib/persistence', () => ({ openDb: vi.fn().mockResolvedValue(db) }))
    vi.doMock('../lib/http/auth', () => ({
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
