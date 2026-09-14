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

describe('userRepository (postgres backend)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('findAllUsers selects the projected columns ordered by created_at desc', async () => {
    const { findAllUsers } = await import('../lib/userRepository')

    const { pool } = createFakePool(async sql => {
      expect(sql).toContain('select')
      expect(sql).not.toContain('password_hash')
      expect(sql).toContain('order by')
      return {
        command: 'SELECT',
        rowCount: 1,
        rows: [{ id: 1, email: 'a@b.com', name: null, role: 'admin', is_active: 1, can_view_all_roadmaps: 1, created_at: '2024-01-01', updated_at: '2024-01-01' }]
      }
    })

    const users = await findAllUsers(fakeDb(pool))
    expect(users).toHaveLength(1)
    expect(users[0]).not.toHaveProperty('password_hash')
  })

  it('findUserById returns undefined when no row matches', async () => {
    const { findUserById } = await import('../lib/userRepository')
    const { pool } = createFakePool(async () => ({ command: 'SELECT', rowCount: 0, rows: [] }))

    expect(await findUserById(fakeDb(pool), 999)).toBeUndefined()
  })

  it('findAllUserRoadmapAccess and findUserRoadmapAccessIds read from user_roadmap_access', async () => {
    const { findAllUserRoadmapAccess, findUserRoadmapAccessIds } = await import('../lib/userRepository')

    const { pool: poolAll } = createFakePool(async () => ({
      command: 'SELECT',
      rowCount: 2,
      rows: [{ user_id: 1, roadmap_id: 2 }, { user_id: 1, roadmap_id: 3 }]
    }))
    expect(await findAllUserRoadmapAccess(fakeDb(poolAll))).toEqual([
      { user_id: 1, roadmap_id: 2 },
      { user_id: 1, roadmap_id: 3 }
    ])

    const { pool: poolIds } = createFakePool(async () => ({
      command: 'SELECT',
      rowCount: 2,
      rows: [{ roadmap_id: 2 }, { roadmap_id: 3 }]
    }))
    expect(await findUserRoadmapAccessIds(fakeDb(poolIds), 1)).toEqual([2, 3])
  })

  it('insertUser inserts and returns the new id', async () => {
    const { insertUser } = await import('../lib/userRepository')

    const { pool, client } = createFakePool(async sql => {
      expect(sql).toContain('insert into "users"')
      return { command: 'INSERT', rowCount: 1, rows: [{ id: 42 }] }
    })

    const now = new Date().toISOString()
    const id = await insertUser(fakeDb(pool), {
      email: 'new@example.com',
      name: 'New User',
      role: 'user',
      password_hash: 'hash',
      created_at: now,
      updated_at: now
    })

    expect(id).toBe(42)
    expect(client.query).toHaveBeenCalled()
  })

  it('insertUser throws DuplicateEmailError on a unique_violation (23505)', async () => {
    const { insertUser, DuplicateEmailError } = await import('../lib/userRepository')

    const { pool } = createFakePool(async () => {
      throw Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' })
    })

    const now = new Date().toISOString()
    await expect(insertUser(fakeDb(pool), {
      email: 'dup@example.com',
      name: null,
      role: 'user',
      password_hash: 'hash',
      created_at: now,
      updated_at: now
    })).rejects.toBeInstanceOf(DuplicateEmailError)
  })

  it('insertUser rethrows unrelated errors', async () => {
    const { insertUser } = await import('../lib/userRepository')

    const { pool } = createFakePool(async () => {
      throw new Error('connection reset')
    })

    const now = new Date().toISOString()
    await expect(insertUser(fakeDb(pool), {
      email: 'x@example.com',
      name: null,
      role: 'user',
      password_hash: 'hash',
      created_at: now,
      updated_at: now
    })).rejects.toThrow('connection reset')
  })

  it('updateUserActive, updateUserPassword and updateUserRoadmapAccessFlag report affected rows', async () => {
    const { updateUserActive, updateUserPassword, updateUserRoadmapAccessFlag } = await import('../lib/userRepository')

    const { pool: poolActive } = createFakePool(async sql => {
      expect(sql).toContain('update "users"')
      return { command: 'UPDATE', rowCount: 1, rows: [] }
    })
    expect(await updateUserActive(fakeDb(poolActive), 1, false, new Date().toISOString())).toBe(1)

    const { pool: poolPassword } = createFakePool(async () => ({ command: 'UPDATE', rowCount: 1, rows: [] }))
    expect(await updateUserPassword(fakeDb(poolPassword), 1, 'new-hash', new Date().toISOString())).toBe(1)

    const { pool: poolFlag } = createFakePool(async () => ({ command: 'UPDATE', rowCount: 0, rows: [] }))
    expect(await updateUserRoadmapAccessFlag(fakeDb(poolFlag), 999, true, new Date().toISOString())).toBe(0)
  })

  it('countActiveAdmins counts matching rows', async () => {
    const { countActiveAdmins } = await import('../lib/userRepository')

    const { pool } = createFakePool(async sql => {
      expect(sql).toContain('count(*)')
      return { command: 'SELECT', rowCount: 1, rows: [{ count: '2' }] }
    })

    expect(await countActiveAdmins(fakeDb(pool), 1)).toBe(2)
  })

  it('deleteSessionsByUserId and deleteUserRoadmapAccess issue delete statements', async () => {
    const { deleteSessionsByUserId, deleteUserRoadmapAccess } = await import('../lib/userRepository')

    const { pool: poolSessions, client: clientSessions } = createFakePool(async sql => {
      expect(sql).toContain('delete from "sessions"')
      return { command: 'DELETE', rowCount: 1, rows: [] }
    })
    await deleteSessionsByUserId(fakeDb(poolSessions), 1)
    expect(clientSessions.query).toHaveBeenCalled()

    const { pool: poolAccess, client: clientAccess } = createFakePool(async sql => {
      expect(sql).toContain('delete from "user_roadmap_access"')
      return { command: 'DELETE', rowCount: 1, rows: [] }
    })
    await deleteUserRoadmapAccess(fakeDb(poolAccess), 1)
    expect(clientAccess.query).toHaveBeenCalled()
  })

  it('insertUserRoadmapAccessMany inserts one row per roadmap id with ON CONFLICT DO NOTHING', async () => {
    const { insertUserRoadmapAccessMany } = await import('../lib/userRepository')

    const calls: string[] = []
    const { pool, client } = createFakePool(async sql => {
      calls.push(sql)
      return { command: 'INSERT', rowCount: 1, rows: [] }
    })

    await insertUserRoadmapAccessMany(fakeDb(pool), 1, [2, 3], new Date().toISOString())

    expect(client.query).toHaveBeenCalledTimes(2)
    expect(calls[0]).toContain('insert into "user_roadmap_access"')
    expect(calls[0].toLowerCase()).toContain('conflict')
  })

  it('insertUserRoadmapAccessMany is a no-op for an empty list', async () => {
    const { insertUserRoadmapAccessMany } = await import('../lib/userRepository')

    const { pool, client } = createFakePool(async () => ({ command: 'INSERT', rowCount: 0, rows: [] }))

    await insertUserRoadmapAccessMany(fakeDb(pool), 1, [], new Date().toISOString())

    expect(client.query).not.toHaveBeenCalled()
  })
})
