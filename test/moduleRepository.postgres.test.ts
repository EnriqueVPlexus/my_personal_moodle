import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostgresDb } from '../lib/postgresDb'

type QueryHandler = (sql: string, params: unknown[]) => Promise<{ command?: string; rows: unknown[]; rowCount?: number }>

function createFakePool(handler: QueryHandler) {
  const client = {
    query: vi.fn((sql: string, params: unknown[]) => handler(sql, params)),
    release: vi.fn()
  }
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
    end: vi.fn().mockResolvedValue(undefined),
    options: {}
  }
  return { pool, client }
}

function fakeDb(pool: unknown): PostgresDb {
  return { backend: 'postgres', getPool: () => pool } as unknown as PostgresDb
}

const sampleModule = {
  id: 1,
  roadmap_id: 10,
  position: 1,
  title: 'Module 1',
  duration: null,
  duration_weeks_min: null,
  duration_weeks_max: null,
  level: null,
  objective: null,
  contents: null,
  importance: null,
  official_resources: null,
  support_videos: null,
  practical_activity: null,
  deliverable_evidence: null,
  evaluation: null,
  quiz_bank: null,
  quiz_pass_percentage: null,
  quiz_max_attempts: null,
  quiz_cooldown_minutes: null
}

describe('moduleRepository (postgres backend)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('findModulesByRoadmapId selects and orders modules for a single roadmap', async () => {
    const { findModulesByRoadmapId } = await import('../lib/moduleRepository')

    const { pool } = createFakePool(async (sql) => {
      expect(sql).toContain('select')
      expect(sql.toLowerCase()).toContain('coalesce')
      return { command: 'SELECT', rowCount: 1, rows: [sampleModule] }
    })

    const result = await findModulesByRoadmapId(fakeDb(pool), 10)

    expect(result).toEqual([sampleModule])
  })

  it('findModulesByRoadmapIds returns an empty array without querying when given no ids', async () => {
    const { findModulesByRoadmapIds } = await import('../lib/moduleRepository')

    const { pool } = createFakePool(async () => ({ command: 'SELECT', rowCount: 0, rows: [] }))

    const result = await findModulesByRoadmapIds(fakeDb(pool), [])

    expect(result).toEqual([])
    expect(pool.connect).not.toHaveBeenCalled()
  })

  it('findModulesByRoadmapIds selects modules for multiple roadmap ids', async () => {
    const { findModulesByRoadmapIds } = await import('../lib/moduleRepository')

    const { pool } = createFakePool(async (sql, params) => {
      expect(sql).toContain('in')
      expect(params).toEqual([10, 20])
      return { command: 'SELECT', rowCount: 1, rows: [sampleModule] }
    })

    const result = await findModulesByRoadmapIds(fakeDb(pool), [10, 20])

    expect(result).toEqual([sampleModule])
  })

  it('findAllModules selects every module ordered by id desc', async () => {
    const { findAllModules } = await import('../lib/moduleRepository')

    const { pool } = createFakePool(async () => ({ command: 'SELECT', rowCount: 1, rows: [sampleModule] }))

    const result = await findAllModules(fakeDb(pool))

    expect(result).toEqual([sampleModule])
  })

  it('findModuleById selects a single module by id', async () => {
    const { findModuleById } = await import('../lib/moduleRepository')

    const { pool } = createFakePool(async () => ({ command: 'SELECT', rowCount: 1, rows: [sampleModule] }))

    const result = await findModuleById(fakeDb(pool), 1)

    expect(result).toEqual(sampleModule)
  })

  it('insertModule inserts a module and returns the new id', async () => {
    const { insertModule } = await import('../lib/moduleRepository')

    const { pool, client } = createFakePool(async (sql) => {
      expect(sql).toContain('insert into')
      return { command: 'INSERT', rowCount: 1, rows: [{ id: 42 }] }
    })

    const id = await insertModule(fakeDb(pool), {
      roadmap_id: 10,
      title: 'New module',
      level: null,
      duration: null,
      duration_weeks_min: null,
      duration_weeks_max: null
    })

    expect(id).toBe(42)
    expect(client.query).toHaveBeenCalled()
  })

  describe('updateModuleCore', () => {
    it('updates all optional fields when provided', async () => {
      const { updateModuleCore } = await import('../lib/moduleRepository')

      const { pool } = createFakePool(async (sql) => {
        expect(sql).toContain('update "modules"')
        return { command: 'UPDATE', rowCount: 1, rows: [] }
      })

      const changes = await updateModuleCore(fakeDb(pool), 1, {
        title: 'Updated',
        level: 'basic',
        duration: '2 weeks',
        durationWeeks: { min: 1, max: 2 }
      })

      expect(changes).toBe(1)
    })

    it('updates only the title when optional fields are omitted', async () => {
      const { updateModuleCore } = await import('../lib/moduleRepository')

      const { pool } = createFakePool(async (sql) => {
        expect(sql).not.toContain('"level"')
        expect(sql).not.toContain('"duration"')
        return { command: 'UPDATE', rowCount: 0, rows: [] }
      })

      const changes = await updateModuleCore(fakeDb(pool), 1, { title: 'Only title' })

      expect(changes).toBe(0)
    })

    it('sets level, duration and durationWeeks to null when explicitly cleared', async () => {
      const { updateModuleCore } = await import('../lib/moduleRepository')

      const { pool } = createFakePool(async () => ({ command: 'UPDATE', rowCount: 1, rows: [] }))

      const changes = await updateModuleCore(fakeDb(pool), 1, {
        title: 'Title',
        level: null,
        duration: null,
        durationWeeks: { min: null, max: null }
      })

      expect(changes).toBe(1)
    })
  })

  it('deleteModule deletes a module by id', async () => {
    const { deleteModule } = await import('../lib/moduleRepository')

    const { pool } = createFakePool(async (sql) => {
      expect(sql).toContain('delete from "modules"')
      return { command: 'DELETE', rowCount: 1, rows: [] }
    })

    const changes = await deleteModule(fakeDb(pool), 1)

    expect(changes).toBe(1)
  })
})
