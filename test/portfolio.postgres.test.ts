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

const activeUser = { id: 2, name: 'Estudiante Test', email: 'student@example.com' }

function evidenceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    user_id: 2,
    module_id: 21,
    evidence_type: 'github',
    url: 'https://github.com/example/project',
    note: null,
    review_status: 'aprobado',
    admin_comment: 'Buen trabajo',
    reviewed_at: null,
    reviewed_by_user_id: null,
    created_at: '2026-07-20T10:00:00.000Z',
    updated_at: '2026-07-20T10:00:00.000Z',
    user_email: 'student@example.com',
    user_name: 'Estudiante Test',
    module_title: 'Contenedores con Docker',
    module_position: 1,
    roadmap_id: 10,
    roadmap_title: 'DevOps Cantera',
    ...overrides
  }
}

describe('getUserPortfolio (postgres backend)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('groups evidence across multiple roadmaps and modules', async () => {
    const { getUserPortfolio } = await import('../lib/portfolio')

    const rows = [
      evidenceRow({ id: 1, roadmap_id: 10, roadmap_title: 'DevOps Cantera', module_id: 21, module_position: 1, module_title: 'Contenedores con Docker' }),
      evidenceRow({
        id: 2,
        roadmap_id: 20,
        roadmap_title: 'Backend Cantera',
        module_id: 31,
        module_position: 2,
        module_title: 'APIs REST',
        review_status: 'pendiente',
        evidence_type: 'demo',
        url: 'https://example.com/demo'
      })
    ]

    const { pool } = createFakePool(async sql => {
      if (/from "users"/i.test(sql)) {
        return { command: 'SELECT', rowCount: 1, rows: [activeUser] }
      }
      expect(sql).toContain('inner join "modules"')
      expect(sql).toContain('inner join "roadmaps"')
      return { command: 'SELECT', rowCount: rows.length, rows }
    })

    const portfolio = await getUserPortfolio(fakeDb(pool), 2)

    expect(portfolio).not.toBeNull()
    expect(portfolio!.total_evidences).toBe(2)
    expect(portfolio!.approved_evidences).toBe(1)
    expect(portfolio!.roadmaps).toHaveLength(2)
    // sorted alphabetically by roadmap title: "Backend Cantera" before "DevOps Cantera"
    expect(portfolio!.roadmaps[0].title).toBe('Backend Cantera')
    expect(portfolio!.roadmaps[0].items[0]).toMatchObject({
      module_title: 'APIs REST',
      evidence_type: 'demo',
      review_status: 'pendiente'
    })
    expect(portfolio!.roadmaps[1].title).toBe('DevOps Cantera')
    expect(portfolio!.roadmaps[1].items[0]).toMatchObject({
      module_title: 'Contenedores con Docker',
      evidence_type: 'github',
      review_status: 'aprobado'
    })
  })

  it('returns an empty portfolio structure when the user has no evidence', async () => {
    const { getUserPortfolio } = await import('../lib/portfolio')

    const { pool } = createFakePool(async sql => {
      if (/from "users"/i.test(sql)) {
        return { command: 'SELECT', rowCount: 1, rows: [activeUser] }
      }
      return { command: 'SELECT', rowCount: 0, rows: [] }
    })

    const portfolio = await getUserPortfolio(fakeDb(pool), 2)

    expect(portfolio).not.toBeNull()
    expect(portfolio!.total_evidences).toBe(0)
    expect(portfolio!.approved_evidences).toBe(0)
    expect(portfolio!.roadmaps).toHaveLength(0)
  })

  it('returns null when the user does not exist or is inactive', async () => {
    const { getUserPortfolio } = await import('../lib/portfolio')

    const { pool } = createFakePool(async sql => {
      expect(sql).toContain('from "users"')
      return { command: 'SELECT', rowCount: 0, rows: [] }
    })

    const portfolio = await getUserPortfolio(fakeDb(pool), 999)

    expect(portfolio).toBeNull()
  })
})
