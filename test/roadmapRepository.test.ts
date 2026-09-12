import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const originalCwd = process.cwd()

afterEach(async () => {
  process.chdir(originalCwd)
  vi.resetModules()
})

describe('findRoadmapById', () => {
  it('reads a roadmap with its category over the SQLite compatibility path', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-roadmap-repo-'))
    process.chdir(tmp)

    const { openDb } = await import('../lib/db')
    const { findRoadmapById } = await import('../lib/roadmapRepository')
    const db = await openDb()

    const roadmap = await db.get<{ id: number }>(
      'SELECT id FROM roadmaps WHERE title = ?',
      ['Roadmap AWS gratuito para cantera junior DevOps']
    )

    const found = await findRoadmapById(db, roadmap.id)

    expect(found).toMatchObject({
      title: 'Roadmap AWS gratuito para cantera junior DevOps',
      category_key: 'cloud-y-devops'
    })

    await db.close()
  })

  it('returns undefined for a roadmap id that does not exist', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-roadmap-repo-missing-'))
    process.chdir(tmp)

    const { openDb } = await import('../lib/db')
    const { findRoadmapById } = await import('../lib/roadmapRepository')
    const db = await openDb()

    const found = await findRoadmapById(db, 999999)

    expect(found).toBeUndefined()

    await db.close()
  })
})

describe('updateRoadmapCore', () => {
  it('updates only the fields present in the patch, leaving the rest untouched', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-roadmap-repo-update-'))
    process.chdir(tmp)

    const { openDb } = await import('../lib/db')
    const { findRoadmapById, updateRoadmapCore } = await import('../lib/roadmapRepository')
    const db = await openDb()

    const before = await db.get<{ id: number; version: string }>(
      'SELECT id, version FROM roadmaps WHERE title = ?',
      ['Roadmap AWS gratuito para cantera junior DevOps']
    )

    const changes = await updateRoadmapCore(db, before.id, {
      title: 'AWS actualizado',
      description: 'Nueva descripcion',
      durationWeeks: { min: 5, max: 7 }
    })

    expect(changes).toBe(1)

    const after = await findRoadmapById(db, before.id)
    expect(after).toMatchObject({
      title: 'AWS actualizado',
      description: 'Nueva descripcion',
      duration_weeks_min: 5,
      duration_weeks_max: 7,
      version: before.version
    })

    await db.close()
  })

  it('returns 0 when the roadmap does not exist', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-roadmap-repo-update-missing-'))
    process.chdir(tmp)

    const { openDb } = await import('../lib/db')
    const { updateRoadmapCore } = await import('../lib/roadmapRepository')
    const db = await openDb()

    const changes = await updateRoadmapCore(db, 999999, {
      title: 'No existe',
      description: null
    })

    expect(changes).toBe(0)

    await db.close()
  })
})
