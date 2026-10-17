import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validateRoadmapImport, RoadmapImportConflictError } from '../lib/roadmapImport'

const queryMock = vi.fn()
const connectMock = vi.fn()
const endMock = vi.fn()

vi.mock('pg', () => {
  class FakePool {
    query = queryMock
    connect = connectMock
    end = endMock
    on = vi.fn()
  }
  return { Pool: FakePool }
})

function fakeClient() {
  return { query: vi.fn(), release: vi.fn() }
}

const validInput = {
  title: 'Plataforma Cloud',
  description: 'Ruta práctica',
  duration: '2 semanas',
  category: 'Cloud',
  topics: ['AWS', 'Terraform'],
  objectives: ['Desplegar infraestructura'],
  methodology: ['Práctica guiada'],
  evaluation_weights: { Práctica: '100%' },
  modules: [{
    position: 0,
    title: 'Fundamentos',
    level: 'beginner',
    duration_weeks: 2,
    objective: 'Comprender la plataforma',
    contents: ['IAM'],
    importance: 'Esencial',
    official_resources: [{ label: 'AWS', url: 'https://aws.amazon.com/' }],
    support_videos: [{ label: 'Curso' }],
    practical_activity: ['Crear una cuenta'],
    deliverable_evidence: ['Captura'],
    evaluation: 'Revisión',
    quiz: [{
      question: '¿Qué servicio gestiona identidades?',
      answer: 'IAM',
      options: ['IAM', 'S3', 'EC2'],
      explanation: 'IAM gestiona identidades y permisos.'
    }]
  }]
}

describe('persistRoadmapImport (postgres backend)', () => {
  beforeEach(() => {
    vi.resetModules()
    queryMock.mockReset()
    connectMock.mockReset()
    endMock.mockReset()
  })

  it('runs the whole multi-table import through the single checked-out transaction client', async () => {
    const { PostgresDb } = await import('../lib/postgresDb')
    const { persistRoadmapImport } = await import('../lib/roadmapImport')

    const client = fakeClient()
    connectMock.mockResolvedValueOnce(client)

    let roadmapId: number | null = null
    client.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/^BEGIN$/i.test(sql)) return { rows: [], rowCount: 0 }
      if (/^COMMIT$/i.test(sql)) return { rows: [], rowCount: 0 }
      if (/SELECT id FROM roadmaps WHERE title/i.test(sql)) return { rows: [], rowCount: 0 }
      if (/INSERT INTO roadmaps/i.test(sql)) {
        roadmapId = 1
        return { rows: [{ id: roadmapId }], rowCount: 1 }
      }
      if (/INSERT INTO roadmap_categories/i.test(sql)) return { rows: [], rowCount: 1 }
      if (/SELECT id FROM roadmap_categories WHERE key/i.test(sql)) return { rows: [{ id: 5 }], rowCount: 1 }
      if (/UPDATE roadmaps SET category_id/i.test(sql)) return { rows: [], rowCount: 1 }
      if (/DELETE FROM roadmap_topics/i.test(sql)) return { rows: [], rowCount: 0 }
      if (/INSERT INTO topics/i.test(sql)) return { rows: [], rowCount: 1 }
      if (/SELECT id FROM topics WHERE key/i.test(sql)) {
        const key = params[0]
        return { rows: [{ id: key === 'aws' ? 10 : 11 }], rowCount: 1 }
      }
      if (/INSERT INTO roadmap_topics/i.test(sql)) {
        expect(sql).toContain('ON CONFLICT DO NOTHING')
        expect(sql).not.toContain('OR IGNORE')
        return { rows: [], rowCount: 1 }
      }
      if (/SELECT id FROM modules WHERE roadmap_id = \$1 AND position/i.test(sql)) return { rows: [], rowCount: 0 }
      if (/SELECT id FROM modules WHERE roadmap_id = \$1 AND title/i.test(sql)) return { rows: [], rowCount: 0 }
      if (/INSERT INTO modules/i.test(sql)) return { rows: [{ id: 100 }], rowCount: 1 }
      throw new Error(`Unexpected query: ${sql}`)
    })

    const db = new PostgresDb('postgres://fake')
    const roadmap = validateRoadmapImport(validInput).roadmap!

    const result = await persistRoadmapImport(db, roadmap, 'create')

    expect(result).toEqual({ roadmap_id: 1, created_modules: 1, updated_modules: 0 })
    // A single checked-out client handled every statement in the transaction.
    expect(connectMock).toHaveBeenCalledTimes(1)
    expect(queryMock).not.toHaveBeenCalled()
    expect(client.release).toHaveBeenCalled()
  })

  it('rolls back the transaction and releases the client when the roadmap already exists', async () => {
    const { PostgresDb } = await import('../lib/postgresDb')
    const { persistRoadmapImport } = await import('../lib/roadmapImport')

    const client = fakeClient()
    connectMock.mockResolvedValueOnce(client)

    client.query.mockImplementation(async (sql: string) => {
      if (/^BEGIN$/i.test(sql)) return { rows: [], rowCount: 0 }
      if (/^ROLLBACK$/i.test(sql)) return { rows: [], rowCount: 0 }
      if (/SELECT id FROM roadmaps WHERE title/i.test(sql)) return { rows: [{ id: 1 }], rowCount: 1 }
      throw new Error(`Unexpected query: ${sql}`)
    })

    const db = new PostgresDb('postgres://fake')
    const roadmap = validateRoadmapImport(validInput).roadmap!

    await expect(persistRoadmapImport(db, roadmap, 'create')).rejects.toMatchObject({
      code: 'already_exists'
    } satisfies Partial<RoadmapImportConflictError>)

    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
    expect(client.release).toHaveBeenCalled()
  })

  it('rolls back and releases the client when a statement fails mid-transaction', async () => {
    const { PostgresDb } = await import('../lib/postgresDb')
    const { persistRoadmapImport } = await import('../lib/roadmapImport')

    const client = fakeClient()
    connectMock.mockResolvedValueOnce(client)

    client.query.mockImplementation(async (sql: string) => {
      if (/^BEGIN$/i.test(sql)) return { rows: [], rowCount: 0 }
      if (/^ROLLBACK$/i.test(sql)) return { rows: [], rowCount: 0 }
      if (/SELECT id FROM roadmaps WHERE title/i.test(sql)) return { rows: [], rowCount: 0 }
      if (/INSERT INTO roadmaps/i.test(sql)) throw new Error('simulated mid-transaction failure')
      throw new Error(`Unexpected query: ${sql}`)
    })

    const db = new PostgresDb('postgres://fake')
    const roadmap = validateRoadmapImport(validInput).roadmap!

    await expect(persistRoadmapImport(db, roadmap, 'create')).rejects.toThrow('simulated mid-transaction failure')

    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
    expect(client.release).toHaveBeenCalled()
  })
})
