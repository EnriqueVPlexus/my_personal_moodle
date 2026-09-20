import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
const connectMock = vi.fn()
const endMock = vi.fn()

vi.mock('pg', () => {
  class FakePool {
    query = queryMock
    connect = connectMock
    end = endMock
  }
  return { Pool: FakePool }
})

const roadmapRow = {
  id: 7,
  title: 'IA para DevOps',
  description: 'Ruta aplicada',
  duration: '8 semanas',
  duration_weeks_min: 8,
  duration_weeks_max: 10,
  objectives: '["Aprender IA", "Automatizar"]',
  methodology: '["Práctica guiada"]',
  evaluation_weights: '{"Quizzes": "30%", "Evidencias": "70%"}',
  version: 'v1.0.0',
  published_at: '2026-01-01T00:00:00.000Z',
  category_label: 'Cloud y DevOps'
}

const moduleRow = {
  id: 15,
  roadmap_id: 7,
  position: 1,
  title: 'Observabilidad de agentes',
  level: 'intermediate',
  duration: '2 semanas',
  duration_weeks_min: 2,
  duration_weeks_max: 2,
  objective: 'Objetivo del módulo',
  contents: '["Evaluación de prompts", "Métricas"]',
  importance: 'Importante para producción',
  official_resources: '[{"label":"Doc oficial","url":"https://example.com"}]',
  support_videos: '[]',
  practical_activity: '["Crear dashboard"]',
  deliverable_evidence: '["Link a GitHub"]',
  evaluation: 'Evaluación continua',
  quiz_bank: '[]'
}

describe('exportRoadmapAsJson (postgres backend)', () => {
  beforeEach(() => {
    vi.resetModules()
    queryMock.mockReset()
    connectMock.mockReset()
    endMock.mockReset()
  })

  it('translates the SQLite-only COLLATE NOCASE ordering into lower() for the topics query', async () => {
    const { PostgresDb } = await import('../lib/postgresDb')
    const { exportRoadmapAsJson } = await import('../lib/roadmapImport')

    let sawTopicsQuery = false
    queryMock.mockImplementation(async (sql: string) => {
      if (/FROM roadmaps/i.test(sql)) return { rows: [roadmapRow], rowCount: 1 }
      if (/FROM topics/i.test(sql)) {
        sawTopicsQuery = true
        expect(sql).toContain('ORDER BY lower(topics.label), topics.key')
        expect(sql).not.toContain('COLLATE NOCASE')
        return { rows: [{ label: 'AWS' }, { label: 'DevOps' }], rowCount: 2 }
      }
      if (/FROM modules/i.test(sql)) return { rows: [moduleRow], rowCount: 1 }
      throw new Error(`Unexpected query: ${sql}`)
    })

    const db = new PostgresDb('postgres://fake')
    const exported = await exportRoadmapAsJson(db, 7)

    expect(sawTopicsQuery).toBe(true)
    expect(exported).toMatchObject({
      title: 'IA para DevOps',
      category: 'Cloud y DevOps',
      topics: ['AWS', 'DevOps']
    })
    expect(exported?.modules).toHaveLength(1)
    expect(exported?.modules[0]).toMatchObject({
      position: 1,
      title: 'Observabilidad de agentes',
      quiz: []
    })
  })

  it('reads back a populated quiz_bank column', async () => {
    const { PostgresDb } = await import('../lib/postgresDb')
    const { exportRoadmapAsJson } = await import('../lib/roadmapImport')
    const quiz = [{ question: '¿Q?', answer: 'A', options: ['A', 'B'], explanation: null, type: 'multiple_choice' }]

    queryMock.mockImplementation(async (sql: string) => {
      if (/FROM roadmaps/i.test(sql)) return { rows: [roadmapRow], rowCount: 1 }
      if (/FROM topics/i.test(sql)) return { rows: [], rowCount: 0 }
      if (/FROM modules/i.test(sql)) return { rows: [{ ...moduleRow, quiz_bank: JSON.stringify(quiz) }], rowCount: 1 }
      throw new Error(`Unexpected query: ${sql}`)
    })

    const db = new PostgresDb('postgres://fake')
    const exported = await exportRoadmapAsJson(db, 7)

    expect(exported?.modules[0].quiz).toEqual(quiz)
  })

  it('returns null when the roadmap does not exist', async () => {
    const { PostgresDb } = await import('../lib/postgresDb')
    const { exportRoadmapAsJson } = await import('../lib/roadmapImport')

    queryMock.mockImplementation(async (sql: string) => {
      if (/FROM roadmaps/i.test(sql)) return { rows: [], rowCount: 0 }
      throw new Error(`Unexpected query: ${sql}`)
    })

    const db = new PostgresDb('postgres://fake')
    const exported = await exportRoadmapAsJson(db, 999)

    expect(exported).toBeNull()
  })
})
