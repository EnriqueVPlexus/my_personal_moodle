import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresDb } from '../../lib/postgresDb'
import {
  validateRoadmapImport,
  persistRoadmapImport,
  exportRoadmapAsJson,
  RoadmapImportConflictError
} from '../../lib/roadmapImport'

/**
 * Verifies lib/roadmapImport.ts against real Postgres (backlog.md: "Tests de
 * integracion contra PostgreSQL real" - dominio importacion). This is the
 * one domain with a real multi-table transaction (BEGIN/COMMIT/ROLLBACK via
 * db.exec, raw SQL, not Kysely), which a mocked pg pool cannot prove: a mock
 * can only assert that ROLLBACK was *called*, never that it actually leaves
 * the real database clean. This forces a genuine mid-transaction constraint
 * violation (a NOT NULL module title, bypassing the JS-level validation) so
 * the module INSERT fails after the roadmap row has already been inserted in
 * the same transaction, then asserts nothing was left behind.
 *
 * Requires DATABASE_URL (or TEST_DATABASE_URL, which takes precedence and
 * should point at the isolated local Docker Postgres from
 * docker-compose.test.yml - see test/postgres-integration/README.md).
 * Skipped entirely otherwise so `vitest run` stays green without one.
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describeIfPostgres = DATABASE_URL ? describe : describe.skip

const baseInput = {
  title: '',
  description: 'Ruta de prueba de integracion',
  duration: '2 semanas',
  category: 'Cloud',
  topics: ['AWS', 'Terraform'],
  objectives: ['Desplegar infraestructura'],
  methodology: ['Practica guiada'],
  evaluation_weights: { Practica: '100%' },
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
    evaluation: 'Revision',
    quiz: [{
      question: 'Que servicio gestiona identidades?',
      answer: 'IAM',
      options: ['IAM', 'S3', 'EC2'],
      explanation: 'IAM gestiona identidades y permisos.'
    }]
  }]
}

describeIfPostgres('roadmapImport transaction (real postgres)', () => {
  let db: PostgresDb
  const marker = `pg-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`

  beforeAll(async () => {
    db = new PostgresDb(DATABASE_URL as string)
    await db.migrate()
  })

  afterAll(async () => {
    await db.run('DELETE FROM roadmaps WHERE title LIKE ?', [`${marker}%`])
    await db.close()
  })

  it('persists a create then update round trip and exports it back as JSON', async () => {
    const title = `${marker}-happy-path`
    const validation = validateRoadmapImport({ ...baseInput, title })
    expect(validation.valid).toBe(true)

    const created = await persistRoadmapImport(db, validation.roadmap!, 'create')
    expect(created.created_modules).toBe(1)
    expect(created.updated_modules).toBe(0)

    const exported = await exportRoadmapAsJson(db, created.roadmap_id)
    expect(exported?.title).toBe(title)
    expect(exported?.modules).toHaveLength(1)
    expect(exported?.modules[0].title).toBe('Fundamentos')
    expect(exported?.topics.sort()).toEqual(['AWS', 'Terraform'].sort())

    const updatedInput = {
      ...baseInput,
      title,
      description: 'Descripcion actualizada',
      modules: [{ ...baseInput.modules[0], title: 'Fundamentos actualizados' }]
    }
    const updateValidation = validateRoadmapImport(updatedInput)
    const updated = await persistRoadmapImport(db, updateValidation.roadmap!, 'update')
    expect(updated.roadmap_id).toBe(created.roadmap_id)
    expect(updated.updated_modules).toBe(1)
    expect(updated.created_modules).toBe(0)

    const reExported = await exportRoadmapAsJson(db, created.roadmap_id)
    expect(reExported?.description).toBe('Descripcion actualizada')
    expect(reExported?.modules[0].title).toBe('Fundamentos actualizados')
  })

  it('rejects creating over an existing title without touching the database (conflict path)', async () => {
    const title = `${marker}-conflict`
    const validation = validateRoadmapImport({ ...baseInput, title })
    await persistRoadmapImport(db, validation.roadmap!, 'create')

    await expect(persistRoadmapImport(db, validation.roadmap!, 'create'))
      .rejects.toBeInstanceOf(RoadmapImportConflictError)

    const rows = await db.all('SELECT id FROM roadmaps WHERE title = ?', [title])
    expect(rows).toHaveLength(1)
  })

  it('ROLLBACK actually leaves the real database clean after a genuine mid-transaction constraint violation', async () => {
    const title = `${marker}-rollback`
    const validation = validateRoadmapImport({ ...baseInput, title })
    const roadmap = validation.roadmap!
    // Bypass JS-level validation (which would normally reject an empty
    // title) to force the real NOT NULL constraint on modules.title to fail
    // *after* the roadmap row has already been inserted inside the same
    // transaction, proving the whole transaction (including the earlier
    // roadmap INSERT) is actually rolled back on real Postgres.
    const brokenRoadmap = {
      ...roadmap,
      modules: [{ ...roadmap.modules[0], title: null as unknown as string }]
    }

    await expect(persistRoadmapImport(db, brokenRoadmap, 'create')).rejects.toThrow()

    const roadmapRows = await db.all('SELECT id FROM roadmaps WHERE title = ?', [title])
    expect(roadmapRows).toHaveLength(0)

    const moduleRows = await db.all('SELECT id FROM modules WHERE title IS NULL')
    expect(moduleRows).toHaveLength(0)
  })
})
