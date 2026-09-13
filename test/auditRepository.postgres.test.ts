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

describe('auditRepository (postgres backend)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('insertAuditLog inserts a new audit log entry', async () => {
    const { insertAuditLog } = await import('../lib/auditRepository')

    const { pool, client } = createFakePool(async (sql) => {
      expect(sql).toContain('insert into "audit_logs"')
      return { command: 'INSERT', rowCount: 1, rows: [] }
    })

    await insertAuditLog(fakeDb(pool), {
      actor_user_id: 1,
      actor_email: 'a@b.com',
      action: 'roadmap.update',
      entity_type: 'roadmap',
      entity_id: '5',
      details: null,
      ip_address: '127.0.0.1',
      user_agent: 'vitest',
      created_at: '2024-01-01T00:00:00.000Z'
    })

    expect(client.query).toHaveBeenCalled()
  })

  it('listAuditLogs selects and orders audit logs with a limit', async () => {
    const { listAuditLogs } = await import('../lib/auditRepository')

    const sampleRow = {
      id: 1,
      actor_user_id: 1,
      actor_email: 'a@b.com',
      action: 'roadmap.update',
      entity_type: 'roadmap',
      entity_id: '5',
      details: null,
      ip_address: '127.0.0.1',
      user_agent: 'vitest',
      created_at: '2024-01-01T00:00:00.000Z'
    }

    const { pool } = createFakePool(async (sql) => {
      expect(sql).toContain('select')
      expect(sql).toContain('order by')
      expect(sql).toContain('limit')
      return { command: 'SELECT', rowCount: 1, rows: [sampleRow] }
    })

    const rows = await listAuditLogs(fakeDb(pool), 50)

    expect(rows).toEqual([sampleRow])
  })

  it('listAuditLogs defaults the limit to 200 when not provided', async () => {
    const { listAuditLogs } = await import('../lib/auditRepository')

    const { pool } = createFakePool(async (sql, params) => {
      expect(params[params.length - 1]).toBe(200)
      return { command: 'SELECT', rowCount: 0, rows: [] }
    })

    const rows = await listAuditLogs(fakeDb(pool))

    expect(rows).toEqual([])
  })
})
