import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const originalCwd = process.cwd()

afterEach(async () => {
  process.chdir(originalCwd)
  vi.resetModules()
})

async function setupTempDb(prefix: string) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  process.chdir(tmp)
  const { openDb } = await import('../lib/db')
  return openDb()
}

describe('module repository', () => {
  it('lists modules for a roadmap ordered by position, reads by id and inserts new modules', async () => {
    const db = await setupTempDb('moodle-module-repo-')
    const repo = await import('../lib/moduleRepository')

    const roadmap = await db.get<{ id: number }>(
      'SELECT id FROM roadmaps WHERE title = ?',
      ['Roadmap AWS gratuito para cantera junior DevOps']
    )

    const modules = await repo.findModulesByRoadmapId(db, roadmap.id)
    expect(modules.length).toBe(11)
    expect(modules[0].roadmap_id).toBe(roadmap.id)

    const first = await repo.findModuleById(db, modules[0].id)
    expect(first?.title).toBe(modules[0].title)

    const newId = await repo.insertModule(db, {
      roadmap_id: roadmap.id,
      title: 'Nuevo modulo',
      level: 'beginner',
      duration: '2 semanas',
      duration_weeks_min: 2,
      duration_weeks_max: 2
    })
    const inserted = await repo.findModuleById(db, newId)
    expect(inserted).toMatchObject({
      roadmap_id: roadmap.id,
      title: 'Nuevo modulo',
      level: 'beginner',
      duration_weeks_min: 2,
      duration_weeks_max: 2
    })

    await db.close()
  })

  it('updates only the provided fields and reports zero changes for a missing module', async () => {
    const db = await setupTempDb('moodle-module-repo-update-')
    const repo = await import('../lib/moduleRepository')

    const moduleRow = await db.get<{ id: number; level: string | null }>(
      'SELECT id, level FROM modules ORDER BY id LIMIT 1'
    )

    const changes = await repo.updateModuleCore(db, moduleRow.id, {
      title: 'Modulo actualizado',
      durationWeeks: { min: 3, max: 4 }
    })
    expect(changes).toBe(1)

    const updated = await repo.findModuleById(db, moduleRow.id)
    expect(updated).toMatchObject({
      title: 'Modulo actualizado',
      level: moduleRow.level,
      duration_weeks_min: 3,
      duration_weeks_max: 4
    })

    const missing = await repo.updateModuleCore(db, 999999, { title: 'No existe' })
    expect(missing).toBe(0)

    await db.close()
  })

  it('deletes a module and reports zero changes for a missing module', async () => {
    const db = await setupTempDb('moodle-module-repo-delete-')
    const repo = await import('../lib/moduleRepository')

    const moduleRow = await db.get<{ id: number }>('SELECT id FROM modules ORDER BY id LIMIT 1')

    const changes = await repo.deleteModule(db, moduleRow.id)
    expect(changes).toBe(1)
    expect(await repo.findModuleById(db, moduleRow.id)).toBeUndefined()
    expect(await repo.deleteModule(db, moduleRow.id)).toBe(0)

    await db.close()
  })
})
