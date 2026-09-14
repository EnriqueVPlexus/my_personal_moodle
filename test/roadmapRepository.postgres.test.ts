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

describe('roadmapRepository (postgres backend)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('findRoadmapById', () => {
    it('selects the roadmap joined with its category via Kysely', async () => {
      const { findRoadmapById } = await import('../lib/roadmapRepository')

      const { pool, client } = createFakePool(async (sql) => {
        expect(sql).toContain('select')
        expect(sql).toContain('left join')
        return {
          command: 'SELECT',
          rowCount: 1,
          rows: [
            {
              id: 7,
              title: 'Roadmap Test',
              description: 'desc',
              duration: null,
              objectives: null,
              methodology: null,
              evaluation_weights: null,
              category_id: 3,
              duration_weeks_min: null,
              duration_weeks_max: null,
              version: 'v1.0.0',
              published_at: '2024-01-01',
              category_key: 'cloud',
              category_label: 'Cloud'
            }
          ]
        }
      })

      const result = await findRoadmapById(fakeDb(pool), 7)

      expect(result).toMatchObject({ id: 7, title: 'Roadmap Test', category_key: 'cloud', category_label: 'Cloud' })
      expect(pool.connect).toHaveBeenCalled()
      expect(client.release).toHaveBeenCalled()
    })

    it('returns undefined when no row is found', async () => {
      const { findRoadmapById } = await import('../lib/roadmapRepository')

      const { pool } = createFakePool(async () => ({ command: 'SELECT', rowCount: 0, rows: [] }))

      const result = await findRoadmapById(fakeDb(pool), 999)

      expect(result).toBeUndefined()
    })
  })

  describe('updateRoadmapCore', () => {
    it('updates all optional fields when they are provided', async () => {
      const { updateRoadmapCore } = await import('../lib/roadmapRepository')

      const { pool, client } = createFakePool(async (sql, params) => {
        expect(sql).toContain('update "roadmaps"')
        expect(params).toContain('New title')
        return { command: 'UPDATE', rowCount: 1, rows: [] }
      })

      const changes = await updateRoadmapCore(fakeDb(pool), 5, {
        title: 'New title',
        description: 'New description',
        duration: '4 weeks',
        durationWeeks: { min: 2, max: 6 },
        version: 'v2.0.0',
        publishedAt: '2024-05-01'
      })

      expect(changes).toBe(1)
      expect(client.query).toHaveBeenCalled()
    })

    it('updates only the required fields when optional ones are omitted', async () => {
      const { updateRoadmapCore } = await import('../lib/roadmapRepository')

      const { pool, client } = createFakePool(async (sql, params) => {
        expect(sql).not.toContain('"duration"')
        expect(sql).not.toContain('"version"')
        expect(sql).not.toContain('"published_at"')
        return { command: 'UPDATE', rowCount: 0, rows: [] }
      })

      const changes = await updateRoadmapCore(fakeDb(pool), 5, {
        title: 'Only title',
        description: null
      })

      expect(changes).toBe(0)
      expect(client.query).toHaveBeenCalled()
    })

    it('sets duration and durationWeeks to null when explicitly cleared', async () => {
      const { updateRoadmapCore } = await import('../lib/roadmapRepository')

      const { pool, client } = createFakePool(async () => ({ command: 'UPDATE', rowCount: 1, rows: [] }))

      const changes = await updateRoadmapCore(fakeDb(pool), 5, {
        title: 'Title',
        description: null,
        duration: null,
        durationWeeks: { min: null, max: null }
      })

      expect(changes).toBe(1)
      expect(client.query).toHaveBeenCalled()
    })
  })

  describe('findExistingRoadmapIds', () => {
    it('selects only the matching ids via Kysely', async () => {
      const { findExistingRoadmapIds } = await import('../lib/roadmapRepository')

      const { pool, client } = createFakePool(async sql => {
        expect(sql).toContain('select "id"')
        expect(sql).toContain('in (')
        return { command: 'SELECT', rowCount: 2, rows: [{ id: 1 }, { id: 2 }] }
      })

      const found = await findExistingRoadmapIds(fakeDb(pool), [1, 2, 999])

      expect(found).toEqual([1, 2])
      expect(client.query).toHaveBeenCalled()
    })

    it('returns an empty array without querying for an empty input', async () => {
      const { findExistingRoadmapIds } = await import('../lib/roadmapRepository')
      const { pool, client } = createFakePool(async () => ({ command: 'SELECT', rowCount: 0, rows: [] }))

      const found = await findExistingRoadmapIds(fakeDb(pool), [])

      expect(found).toEqual([])
      expect(client.query).not.toHaveBeenCalled()
    })
  })
})
