import { Selectable, sql } from 'kysely'
import type { DatabaseClient } from './database'
import type { PostgresDb } from './postgresDb'
import { getQueryDatabase, UsersTable } from './kyselyDatabase'

export type UserRow = Omit<Selectable<UsersTable>, 'password_hash'>
export type UserRoadmapAccessRow = { user_id: number; roadmap_id: number }

export class DuplicateEmailError extends Error {
  constructor() {
    super('email already exists')
    this.name = 'DuplicateEmailError'
  }
}

function pool(db: DatabaseClient) {
  return (db as PostgresDb).getPool()
}

const USER_COLUMNS = ['id', 'email', 'name', 'role', 'is_active', 'can_view_all_roadmaps', 'created_at', 'updated_at'] as const

export async function findAllUsers(db: DatabaseClient): Promise<UserRow[]> {
  if (db.backend !== 'postgres') {
    return db.all<UserRow>(
      `SELECT ${USER_COLUMNS.join(', ')} FROM users ORDER BY created_at DESC`
    )
  }

  return getQueryDatabase(pool(db))
    .selectFrom('users')
    .select(USER_COLUMNS)
    .orderBy('created_at', 'desc')
    .execute()
}

export async function findUserById(db: DatabaseClient, id: number): Promise<UserRow | undefined> {
  if (db.backend !== 'postgres') {
    return db.get<UserRow>(
      `SELECT ${USER_COLUMNS.join(', ')} FROM users WHERE id = ?`,
      [id]
    )
  }

  return getQueryDatabase(pool(db))
    .selectFrom('users')
    .select(USER_COLUMNS)
    .where('id', '=', id)
    .executeTakeFirst()
}

export async function findAllUserRoadmapAccess(db: DatabaseClient): Promise<UserRoadmapAccessRow[]> {
  if (db.backend !== 'postgres') {
    return db.all<UserRoadmapAccessRow>(
      'SELECT user_id, roadmap_id FROM user_roadmap_access ORDER BY roadmap_id'
    )
  }

  const rows = await getQueryDatabase(pool(db))
    .selectFrom('user_roadmap_access')
    .select(['user_id', 'roadmap_id'])
    .orderBy('roadmap_id')
    .execute()
  return rows.map(row => ({ user_id: Number(row.user_id), roadmap_id: Number(row.roadmap_id) }))
}

export async function findUserRoadmapAccessIds(db: DatabaseClient, userId: number): Promise<number[]> {
  if (db.backend !== 'postgres') {
    const rows = await db.all<{ roadmap_id: number }>(
      'SELECT roadmap_id FROM user_roadmap_access WHERE user_id = ? ORDER BY roadmap_id',
      [userId]
    )
    return rows.map(row => Number(row.roadmap_id))
  }

  const rows = await getQueryDatabase(pool(db))
    .selectFrom('user_roadmap_access')
    .select('roadmap_id')
    .where('user_id', '=', userId)
    .orderBy('roadmap_id')
    .execute()
  return rows.map(row => Number(row.roadmap_id))
}

export type UserCoreInsert = {
  email: string
  name: string | null
  role: 'admin' | 'user'
  password_hash: string
  created_at: string
  updated_at: string
}

export async function insertUser(db: DatabaseClient, data: UserCoreInsert): Promise<number> {
  try {
    if (db.backend !== 'postgres') {
      const result = await db.run(
        `INSERT INTO users (email, name, role, password_hash, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
        [data.email, data.name, data.role, data.password_hash, data.created_at, data.updated_at]
      )
      return result.lastID as number
    }

    const inserted = await getQueryDatabase(pool(db))
      .insertInto('users')
      .values({
        email: data.email,
        name: data.name,
        role: data.role,
        password_hash: data.password_hash,
        is_active: 1,
        created_at: data.created_at,
        updated_at: data.updated_at
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    return inserted.id
  } catch (error: any) {
    if (error?.code === 'SQLITE_CONSTRAINT' || error?.code === '23505') {
      throw new DuplicateEmailError()
    }
    throw error
  }
}

export async function updateUserActive(db: DatabaseClient, id: number, isActive: boolean, updatedAt: string): Promise<number> {
  if (db.backend !== 'postgres') {
    const result = await db.run('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?', [isActive ? 1 : 0, updatedAt, id])
    return result.changes ?? 0
  }

  const result = await getQueryDatabase(pool(db))
    .updateTable('users')
    .set({ is_active: isActive ? 1 : 0, updated_at: updatedAt })
    .where('id', '=', id)
    .executeTakeFirst()
  return Number(result.numUpdatedRows ?? 0)
}

export async function updateUserPassword(db: DatabaseClient, id: number, passwordHash: string, updatedAt: string): Promise<number> {
  if (db.backend !== 'postgres') {
    const result = await db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [passwordHash, updatedAt, id])
    return result.changes ?? 0
  }

  const result = await getQueryDatabase(pool(db))
    .updateTable('users')
    .set({ password_hash: passwordHash, updated_at: updatedAt })
    .where('id', '=', id)
    .executeTakeFirst()
  return Number(result.numUpdatedRows ?? 0)
}

export async function updateUserRoadmapAccessFlag(db: DatabaseClient, id: number, canViewAllRoadmaps: boolean, updatedAt: string): Promise<number> {
  if (db.backend !== 'postgres') {
    const result = await db.run(
      'UPDATE users SET can_view_all_roadmaps = ?, updated_at = ? WHERE id = ?',
      [canViewAllRoadmaps ? 1 : 0, updatedAt, id]
    )
    return result?.changes ?? 0
  }

  const result = await getQueryDatabase(pool(db))
    .updateTable('users')
    .set({ can_view_all_roadmaps: canViewAllRoadmaps ? 1 : 0, updated_at: updatedAt })
    .where('id', '=', id)
    .executeTakeFirst()
  return Number(result.numUpdatedRows ?? 0)
}

export async function countActiveAdmins(db: DatabaseClient, excludeUserId: number): Promise<number> {
  if (db.backend !== 'postgres') {
    const row = await db.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM users WHERE role = ? AND is_active = 1 AND id != ?',
      ['admin', excludeUserId]
    )
    return Number(row.count)
  }

  const row = await getQueryDatabase(pool(db))
    .selectFrom('users')
    .select(sql<number>`count(*)`.as('count'))
    .where('role', '=', 'admin')
    .where('is_active', '=', 1)
    .where('id', '!=', excludeUserId)
    .executeTakeFirstOrThrow()
  return Number(row.count)
}

export async function deleteSessionsByUserId(db: DatabaseClient, userId: number): Promise<void> {
  if (db.backend !== 'postgres') {
    await db.run('DELETE FROM sessions WHERE user_id = ?', [userId])
    return
  }

  await getQueryDatabase(pool(db))
    .deleteFrom('sessions')
    .where('user_id', '=', userId)
    .execute()
}

export async function deleteUserRoadmapAccess(db: DatabaseClient, userId: number): Promise<void> {
  if (db.backend !== 'postgres') {
    await db.run('DELETE FROM user_roadmap_access WHERE user_id = ?', [userId])
    return
  }

  await getQueryDatabase(pool(db))
    .deleteFrom('user_roadmap_access')
    .where('user_id', '=', userId)
    .execute()
}

export async function insertUserRoadmapAccessMany(db: DatabaseClient, userId: number, roadmapIds: number[], createdAt: string): Promise<void> {
  if (roadmapIds.length === 0) return

  if (db.backend !== 'postgres') {
    for (const roadmapId of roadmapIds) {
      await db.run(
        'INSERT OR IGNORE INTO user_roadmap_access (user_id, roadmap_id, created_at) VALUES (?, ?, ?)',
        [userId, roadmapId, createdAt]
      )
    }
    return
  }

  const kysely = getQueryDatabase(pool(db))
  for (const roadmapId of roadmapIds) {
    await kysely
      .insertInto('user_roadmap_access')
      .values({ user_id: userId, roadmap_id: roadmapId, created_at: createdAt })
      .onConflict(oc => oc.columns(['user_id', 'roadmap_id']).doNothing())
      .execute()
  }
}
