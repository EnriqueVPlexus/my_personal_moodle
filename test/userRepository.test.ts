import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const originalCwd = process.cwd()

afterEach(async () => {
  process.chdir(originalCwd)
  vi.resetModules()
})

async function setupDb() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-user-repo-'))
  process.chdir(tmp)
  const { openDb } = await import('../lib/db')
  return openDb()
}

async function insertTestUser(db: any, overrides: Partial<{
  email: string
  name: string | null
  role: string
  password_hash: string
  is_active: number
  can_view_all_roadmaps: number
}> = {}) {
  const now = new Date().toISOString()
  const values = {
    email: 'user@example.com',
    name: 'Test User',
    role: 'user',
    password_hash: 'hash',
    is_active: 1,
    can_view_all_roadmaps: 1,
    ...overrides
  }
  const result = await db.run(
    `INSERT INTO users (email, name, role, password_hash, is_active, can_view_all_roadmaps, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [values.email, values.name, values.role, values.password_hash, values.is_active, values.can_view_all_roadmaps, now, now]
  )
  return result.lastID as number
}

describe('userRepository (SQLite backend)', () => {
  it('findAllUsers lists users ordered by created_at desc', async () => {
    const db = await setupDb()
    const { findAllUsers } = await import('../lib/userRepository')

    const firstId = await insertTestUser(db, { email: 'first@example.com' })
    await new Promise(resolve => setTimeout(resolve, 5))
    const secondId = await insertTestUser(db, { email: 'second@example.com' })

    const users = await findAllUsers(db)

    expect(users.map(u => u.id)).toEqual([secondId, firstId])
    expect(users[0]).not.toHaveProperty('password_hash')

    await db.close()
  })

  it('findUserById returns undefined for a missing user', async () => {
    const db = await setupDb()
    const { findUserById } = await import('../lib/userRepository')

    expect(await findUserById(db, 999999)).toBeUndefined()

    await db.close()
  })

  it('insertUser creates a user and rejects duplicate emails', async () => {
    const db = await setupDb()
    const { insertUser, findUserById, DuplicateEmailError } = await import('../lib/userRepository')

    const now = new Date().toISOString()
    const id = await insertUser(db, {
      email: 'dup@example.com',
      name: 'Dup User',
      role: 'user',
      password_hash: 'hash',
      created_at: now,
      updated_at: now
    })

    const created = await findUserById(db, id)
    expect(created).toMatchObject({ email: 'dup@example.com', role: 'user', is_active: 1 })

    await expect(insertUser(db, {
      email: 'dup@example.com',
      name: null,
      role: 'user',
      password_hash: 'hash2',
      created_at: now,
      updated_at: now
    })).rejects.toBeInstanceOf(DuplicateEmailError)

    await db.close()
  })

  it('updateUserActive toggles is_active and reports changed rows', async () => {
    const db = await setupDb()
    const { updateUserActive, findUserById } = await import('../lib/userRepository')

    const id = await insertTestUser(db)
    const changes = await updateUserActive(db, id, false, new Date().toISOString())
    expect(changes).toBe(1)

    const updated = await findUserById(db, id)
    expect(updated?.is_active).toBe(0)

    const missingChanges = await updateUserActive(db, 999999, false, new Date().toISOString())
    expect(missingChanges).toBe(0)

    await db.close()
  })

  it('updateUserPassword updates the password hash', async () => {
    const db = await setupDb()
    const { updateUserPassword } = await import('../lib/userRepository')

    const id = await insertTestUser(db)
    const changes = await updateUserPassword(db, id, 'new-hash', new Date().toISOString())
    expect(changes).toBe(1)

    const row = await db.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [id])
    expect(row.password_hash).toBe('new-hash')

    await db.close()
  })

  it('updateUserRoadmapAccessFlag updates can_view_all_roadmaps', async () => {
    const db = await setupDb()
    const { updateUserRoadmapAccessFlag, findUserById } = await import('../lib/userRepository')

    const id = await insertTestUser(db, { can_view_all_roadmaps: 1 })
    await updateUserRoadmapAccessFlag(db, id, false, new Date().toISOString())

    const updated = await findUserById(db, id)
    expect(updated?.can_view_all_roadmaps).toBe(0)

    await db.close()
  })

  it('countActiveAdmins excludes the given user and inactive admins', async () => {
    const db = await setupDb()
    const { countActiveAdmins } = await import('../lib/userRepository')

    const admin1 = await insertTestUser(db, { email: 'admin1@example.com', role: 'admin', is_active: 1 })
    await insertTestUser(db, { email: 'admin2@example.com', role: 'admin', is_active: 1 })
    await insertTestUser(db, { email: 'admin3-inactive@example.com', role: 'admin', is_active: 0 })

    const count = await countActiveAdmins(db, admin1)
    expect(count).toBe(1)

    await db.close()
  })

  it('deleteSessionsByUserId removes all sessions for that user', async () => {
    const db = await setupDb()
    const { deleteSessionsByUserId } = await import('../lib/userRepository')

    const userId = await insertTestUser(db)
    const now = new Date().toISOString()
    await db.run(
      'INSERT INTO sessions (user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
      [userId, 'tokenhash', now, now, now]
    )

    await deleteSessionsByUserId(db, userId)

    const remaining = await db.all('SELECT * FROM sessions WHERE user_id = ?', [userId])
    expect(remaining).toHaveLength(0)

    await db.close()
  })

  it('insertUserRoadmapAccessMany and findUserRoadmapAccessIds round-trip, deleteUserRoadmapAccess clears them', async () => {
    const db = await setupDb()
    const {
      insertUserRoadmapAccessMany,
      findUserRoadmapAccessIds,
      findAllUserRoadmapAccess,
      deleteUserRoadmapAccess
    } = await import('../lib/userRepository')

    const userId = await insertTestUser(db)
    const roadmap = await db.get<{ id: number }>('SELECT id FROM roadmaps LIMIT 1')

    await insertUserRoadmapAccessMany(db, userId, [roadmap.id], new Date().toISOString())
    // inserting again must not throw thanks to INSERT OR IGNORE / ON CONFLICT DO NOTHING
    await insertUserRoadmapAccessMany(db, userId, [roadmap.id], new Date().toISOString())

    const ids = await findUserRoadmapAccessIds(db, userId)
    expect(ids).toEqual([roadmap.id])

    const all = await findAllUserRoadmapAccess(db)
    expect(all).toEqual(expect.arrayContaining([{ user_id: userId, roadmap_id: roadmap.id }]))

    await deleteUserRoadmapAccess(db, userId)
    expect(await findUserRoadmapAccessIds(db, userId)).toEqual([])

    await db.close()
  })

  it('insertUserRoadmapAccessMany is a no-op for an empty list', async () => {
    const db = await setupDb()
    const { insertUserRoadmapAccessMany, findUserRoadmapAccessIds } = await import('../lib/userRepository')

    const userId = await insertTestUser(db)
    await insertUserRoadmapAccessMany(db, userId, [], new Date().toISOString())

    expect(await findUserRoadmapAccessIds(db, userId)).toEqual([])

    await db.close()
  })
})
