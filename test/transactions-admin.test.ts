import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { openSqliteDb } from '../lib/persistence'
import type { DatabaseClient } from '../lib/persistence'
import { createServices } from '../lib/container'

let db: DatabaseClient

beforeEach(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moodle-use-case-tx-'))
  db = await openSqliteDb(path.join(tmp, 'test.db'))
})

afterEach(async () => {
  await db.close()
})

async function count(table: string) {
  return Number((await db.get(`SELECT COUNT(*) AS count FROM ${table}`)).count)
}

async function insertUser(role = 'user', canViewAll = 0) {
  const now = new Date().toISOString()
  const result = await db.run(
    `INSERT INTO users (email, name, role, password_hash, is_active, can_view_all_roadmaps, created_at, updated_at)
     VALUES (?, 'n', ?, 'hash', 1, ?, ?, ?)`,
    [`${role}-${Math.random()}@example.com`, role, canViewAll, now, now]
  )
  return Number(result.lastID)
}

async function insertRoadmap(title: string) {
  const result = await db.run('INSERT INTO roadmaps (title) VALUES (?)', [title])
  return Number(result.lastID)
}

describe('SQLite: admin use cases are atomic', () => {
  it('replacing a user roadmap access leaves the previous access untouched when an insert fails', async () => {
    const userId = await insertUser('user', 0)
    const roadmapA = await insertRoadmap('A')
    const roadmapB = await insertRoadmap('B')
    await db.run('INSERT INTO user_roadmap_access (user_id, roadmap_id) VALUES (?, ?)', [userId, roadmapA])
    await db.exec(`
      CREATE TRIGGER fail_access_insert BEFORE INSERT ON user_roadmap_access
      BEGIN SELECT RAISE(ABORT, 'access insert failed'); END
    `)

    const adminId = await insertUser('admin', 1)
    await expect(createServices(db).admin.updateUser({ id: adminId }, userId, {
      action: 'set_roadmap_access', can_view_all_roadmaps: false, roadmap_ids: [roadmapB]
    })).rejects.toThrow('access insert failed')

    expect((await db.all('SELECT roadmap_id FROM user_roadmap_access WHERE user_id = ?', [userId]))
      .map((row: any) => row.roadmap_id)).toEqual([roadmapA])
    expect((await db.get('SELECT can_view_all_roadmaps AS flag FROM users WHERE id = ?', [userId])).flag).toBe(0)
  })

  it('replacing access to "all roadmaps" flips the flag together with clearing the grants', async () => {
    const userId = await insertUser('user', 0)
    const roadmapA = await insertRoadmap('A')
    await db.run('INSERT INTO user_roadmap_access (user_id, roadmap_id) VALUES (?, ?)', [userId, roadmapA])
    const adminId = await insertUser('admin', 1)

    const outcome = await createServices(db).admin.updateUser({ id: adminId }, userId, {
      action: 'set_roadmap_access', can_view_all_roadmaps: true
    })

    expect(outcome).toMatchObject({ status: 'ok' })
    expect(await count('user_roadmap_access')).toBe(0)
    expect((await db.get('SELECT can_view_all_roadmaps AS flag FROM users WHERE id = ?', [userId])).flag).toBe(1)
  })

  it('deactivating a user does not stay deactivated if revoking their sessions fails', async () => {
    const userId = await insertUser('user', 1)
    const adminId = await insertUser('admin', 1)
    const now = new Date().toISOString()
    await db.run(
      'INSERT INTO sessions (user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
      [userId, 'token', now, now, now]
    )
    await db.exec(`
      CREATE TRIGGER fail_session_delete BEFORE DELETE ON sessions
      BEGIN SELECT RAISE(ABORT, 'session delete failed'); END
    `)

    await expect(createServices(db).admin.updateUser({ id: adminId }, userId, { action: 'set_active', is_active: false }))
      .rejects.toThrow('session delete failed')

    expect((await db.get('SELECT is_active FROM users WHERE id = ?', [userId])).is_active).toBe(1)
    expect(await count('sessions')).toBe(1)
  })
})
