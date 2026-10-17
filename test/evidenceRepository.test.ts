import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const originalCwd = process.cwd()

async function withTempDb<T>(prefix: string, run: (db: any) => Promise<T>): Promise<T> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  process.chdir(tmp)
  const { openDb } = await import('../lib/persistence')
  const db = await openDb()
  try {
    return await run(db)
  } finally {
    await db.close()
  }
}

afterEach(async () => {
  process.chdir(originalCwd)
  vi.resetModules()
})

const ROADMAP_ID = 960001
const MODULE_ID = 960002

const seededRoadmaps = new Set<any>()

async function seedRoadmapAndUser(db: any, userId: number) {
  if (!seededRoadmaps.has(db)) {
    await db.exec(`
      INSERT INTO roadmaps (id, title) VALUES (${ROADMAP_ID}, 'Roadmap Evidencias');
      INSERT INTO modules (id, roadmap_id, title) VALUES (${MODULE_ID}, ${ROADMAP_ID}, 'Modulo Evidencias');
    `)
    seededRoadmaps.add(db)
  }
  await db.run(
    `INSERT INTO users (id, email, name, role, password_hash, can_view_all_roadmaps, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'user', 'hash', 1, 1, datetime('now'), datetime('now'))`,
    [userId, `evidence-${userId}@example.com`, `Evidence User ${userId}`]
  )
}

describe('evidenceRepository (sqlite backend)', () => {
  it('creates, updates and reviews evidence with status reset on resubmission', async () => {
    await withTempDb('moodle-evidence-', async db => {
      const { getModuleEvidence, saveModuleEvidence, reviewModuleEvidence } = await import('../lib/domains/progress/repositories/evidenceRepository')
      const userId = 800001
      const adminId = 800099
      await seedRoadmapAndUser(db, userId)
      await seedRoadmapAndUser(db, adminId)

      const created = await saveModuleEvidence(db, userId, MODULE_ID, {
        evidenceType: 'github',
        url: 'https://github.com/example/project',
        note: null
      })
      expect(created).toMatchObject({
        user_id: userId,
        module_id: MODULE_ID,
        evidence_type: 'github',
        review_status: 'pendiente'
      })

      const fetched = await getModuleEvidence(db, userId, MODULE_ID)
      expect(fetched).toMatchObject({ id: created.id, review_status: 'pendiente' })

      const reviewed = await reviewModuleEvidence(db, created.id, adminId, {
        reviewStatus: 'requiere_cambios',
        adminComment: 'Falta añadir el README con instrucciones'
      })
      expect(reviewed).toMatchObject({
        review_status: 'requiere_cambios',
        admin_comment: 'Falta añadir el README con instrucciones',
        reviewed_by_user_id: adminId
      })

      const resubmitted = await saveModuleEvidence(db, userId, MODULE_ID, {
        evidenceType: 'github',
        url: 'https://github.com/example/project-v2',
        note: 'README añadido'
      })
      expect(resubmitted.review_status).toBe('pendiente')
      expect(resubmitted.id).toBe(created.id)
    })
  })

  it('deletes evidence and returns the number of removed rows', async () => {
    await withTempDb('moodle-evidence-delete-', async db => {
      const { saveModuleEvidence, deleteModuleEvidence, getModuleEvidence } = await import('../lib/domains/progress/repositories/evidenceRepository')
      const userId = 800002
      await seedRoadmapAndUser(db, userId)

      await saveModuleEvidence(db, userId, MODULE_ID, { evidenceType: 'note', url: null, note: 'listo' })

      const changes = await deleteModuleEvidence(db, userId, MODULE_ID)
      expect(changes).toBe(1)
      expect(await getModuleEvidence(db, userId, MODULE_ID)).toBeNull()

      const secondDelete = await deleteModuleEvidence(db, userId, MODULE_ID)
      expect(secondDelete).toBe(0)
    })
  })

  it('lists evidences joined with user, module and roadmap data with filters', async () => {
    await withTempDb('moodle-evidence-list-', async db => {
      const { saveModuleEvidence, listEvidences } = await import('../lib/domains/progress/repositories/evidenceRepository')
      const userId = 800003
      await seedRoadmapAndUser(db, userId)

      await saveModuleEvidence(db, userId, MODULE_ID, { evidenceType: 'demo', url: 'https://example.com/demo', note: null })

      const all = await listEvidences(db, {})
      expect(all.length).toBeGreaterThanOrEqual(1)
      expect(all[0]).toMatchObject({
        user_id: userId,
        module_id: MODULE_ID,
        roadmap_id: ROADMAP_ID
      })

      const filtered = await listEvidences(db, { userId, status: 'pendiente' })
      expect(filtered).toHaveLength(1)

      const emptyFilter = await listEvidences(db, { status: 'aprobado' })
      expect(emptyFilter.find(row => row.user_id === userId)).toBeUndefined()
    })
  })
})
