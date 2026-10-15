import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostgresDb } from '../lib/persistence/postgresDb'

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

const evidenceRow = {
  id: 3,
  user_id: 2,
  module_id: 7,
  evidence_type: 'github',
  url: 'https://github.com/example/project',
  note: null,
  review_status: 'pendiente',
  admin_comment: null,
  reviewed_at: null,
  reviewed_by_user_id: null,
  created_at: '2026-07-20T10:00:00.000Z',
  updated_at: '2026-07-20T10:00:00.000Z'
}

describe('evidenceRepository (postgres backend)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('getModuleEvidence', () => {
    it('selects the evidence via the Kysely query builder', async () => {
      const { getModuleEvidence } = await import('../lib/evidenceRepository')
      const { pool, client } = createFakePool(async sql => {
        expect(sql).toContain('select')
        expect(sql).toContain('"user_module_evidences"')
        return { command: 'SELECT', rowCount: 1, rows: [evidenceRow] }
      })

      const result = await getModuleEvidence(fakeDb(pool), 2, 7)

      expect(result).toMatchObject({ id: 3, review_status: 'pendiente' })
      expect(pool.connect).toHaveBeenCalled()
      expect(client.release).toHaveBeenCalled()
    })
  })

  describe('saveModuleEvidence', () => {
    it('upserts via onConflict().doUpdateSet() and re-reads the row', async () => {
      const { saveModuleEvidence } = await import('../lib/evidenceRepository')
      let insertSeen = false
      const { pool } = createFakePool(async sql => {
        if (/insert into "user_module_evidences"/i.test(sql)) {
          insertSeen = true
          expect(sql).toContain('on conflict')
          expect(sql).toContain('do update set')
          return { command: 'INSERT', rowCount: 1, rows: [] }
        }
        return { command: 'SELECT', rowCount: 1, rows: [evidenceRow] }
      })

      const result = await saveModuleEvidence(fakeDb(pool), 2, 7, {
        evidenceType: 'github',
        url: 'https://github.com/example/project',
        note: null
      })

      expect(insertSeen).toBe(true)
      expect(result).toMatchObject({ id: 3, review_status: 'pendiente' })
    })
  })

  describe('reviewModuleEvidence', () => {
    it('updates the review fields and returns the refreshed row', async () => {
      const { reviewModuleEvidence } = await import('../lib/evidenceRepository')
      const reviewed = { ...evidenceRow, review_status: 'aprobado', admin_comment: 'Bien hecho', reviewed_by_user_id: 1 }
      let updateSeen = false
      const { pool } = createFakePool(async sql => {
        if (/^update "user_module_evidences"/i.test(sql)) {
          updateSeen = true
          return { command: 'UPDATE', rowCount: 1, rows: [] }
        }
        return { command: 'SELECT', rowCount: 1, rows: [reviewed] }
      })

      const result = await reviewModuleEvidence(fakeDb(pool), 3, 1, {
        reviewStatus: 'aprobado',
        adminComment: 'Bien hecho'
      })

      expect(updateSeen).toBe(true)
      expect(result).toMatchObject({ review_status: 'aprobado', admin_comment: 'Bien hecho', reviewed_by_user_id: 1 })
    })
  })

  describe('listEvidences', () => {
    it('builds joins and applies filters conditionally', async () => {
      const { listEvidences } = await import('../lib/evidenceRepository')
      const listedRow = {
        ...evidenceRow,
        user_email: 'user@example.com',
        user_name: 'User',
        module_title: 'Modulo',
        module_position: 1,
        roadmap_id: 4,
        roadmap_title: 'Roadmap'
      }
      const { pool } = createFakePool(async sql => {
        expect(sql).toContain('inner join "users"')
        expect(sql).toContain('inner join "modules"')
        expect(sql).toContain('inner join "roadmaps"')
        expect(sql).toContain('where')
        return { command: 'SELECT', rowCount: 1, rows: [listedRow] }
      })

      const rows = await listEvidences(fakeDb(pool), { userId: 2, status: 'pendiente' })

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ user_id: 2, roadmap_id: 4 })
    })

    it('omits the WHERE clause when no filters are given', async () => {
      const { listEvidences } = await import('../lib/evidenceRepository')
      const { pool } = createFakePool(async sql => {
        expect(sql).not.toContain('where')
        return { command: 'SELECT', rowCount: 0, rows: [] }
      })

      const rows = await listEvidences(fakeDb(pool), {})
      expect(rows).toEqual([])
    })
  })
})
