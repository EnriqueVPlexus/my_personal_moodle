import { Selectable, sql, Updateable } from 'kysely'
import type { DatabaseClient } from './database'
import type { PostgresDb } from './postgresDb'
import { getQueryDatabase, ModulesTable } from './kyselyDatabase'

export type ModuleRow = Selectable<ModulesTable>

function pool(db: DatabaseClient) {
  return (db as PostgresDb).getPool()
}

export async function findModulesByRoadmapId(db: DatabaseClient, roadmapId: number | string): Promise<ModuleRow[]> {
  if (db.backend !== 'postgres') {
    return db.all<ModuleRow>(
      'SELECT * FROM modules WHERE roadmap_id = ? ORDER BY COALESCE(position, id), id',
      [roadmapId]
    )
  }

  return getQueryDatabase(pool(db))
    .selectFrom('modules')
    .selectAll()
    .where('roadmap_id', '=', Number(roadmapId))
    .orderBy(sql`coalesce(position, id)`)
    .orderBy('id')
    .execute()
}

export async function findModulesByRoadmapIds(db: DatabaseClient, roadmapIds: Array<number | string>): Promise<ModuleRow[]> {
  if (roadmapIds.length === 0) return []

  if (db.backend !== 'postgres') {
    return db.all<ModuleRow>(
      `SELECT * FROM modules WHERE roadmap_id IN (${roadmapIds.map(() => '?').join(', ')}) ORDER BY id DESC`,
      roadmapIds
    )
  }

  return getQueryDatabase(pool(db))
    .selectFrom('modules')
    .selectAll()
    .where('roadmap_id', 'in', roadmapIds.map(Number))
    .orderBy('id', 'desc')
    .execute()
}

export async function findAllModules(db: DatabaseClient): Promise<ModuleRow[]> {
  if (db.backend !== 'postgres') {
    return db.all<ModuleRow>('SELECT * FROM modules ORDER BY id DESC')
  }

  return getQueryDatabase(pool(db))
    .selectFrom('modules')
    .selectAll()
    .orderBy('id', 'desc')
    .execute()
}

export async function findModuleById(db: DatabaseClient, id: number | string): Promise<ModuleRow | undefined> {
  if (db.backend !== 'postgres') {
    return db.get<ModuleRow>('SELECT * FROM modules WHERE id = ?', [id])
  }

  return getQueryDatabase(pool(db))
    .selectFrom('modules')
    .selectAll()
    .where('id', '=', Number(id))
    .executeTakeFirst()
}

export type ModuleCoreInsert = {
  roadmap_id: number
  title: string
  level: string | null
  duration: string | null
  duration_weeks_min: number | null
  duration_weeks_max: number | null
}

const SQLITE_INSERT_MODULE = `
  INSERT INTO modules (roadmap_id, title, level, duration, duration_weeks_min, duration_weeks_max)
  VALUES (?, ?, ?, ?, ?, ?)
`

export async function insertModule(db: DatabaseClient, data: ModuleCoreInsert): Promise<number> {
  if (db.backend !== 'postgres') {
    const result = await db.run(SQLITE_INSERT_MODULE, [
      data.roadmap_id,
      data.title,
      data.level,
      data.duration,
      data.duration_weeks_min,
      data.duration_weeks_max
    ])
    return result.lastID as number
  }

  const inserted = await getQueryDatabase(pool(db))
    .insertInto('modules')
    .values(data)
    .returning('id')
    .executeTakeFirstOrThrow()
  return inserted.id
}

export type ModuleCoreUpdate = {
  title: string
  level?: string | null
  duration?: string | null
  durationWeeks?: { min: number | null; max: number | null }
}

const SQLITE_UPDATE_MODULE_CORE = `
  UPDATE modules SET title = ?,
    level = CASE WHEN ? = 1 THEN ? ELSE level END,
    duration = CASE WHEN ? = 1 THEN ? ELSE duration END,
    duration_weeks_min = CASE WHEN ? = 1 THEN ? ELSE duration_weeks_min END,
    duration_weeks_max = CASE WHEN ? = 1 THEN ? ELSE duration_weeks_max END
  WHERE id = ?
`

export async function updateModuleCore(db: DatabaseClient, id: number | string, patch: ModuleCoreUpdate): Promise<number> {
  const hasLevel = patch.level !== undefined
  const hasDuration = patch.duration !== undefined
  const hasDurationWeeks = patch.durationWeeks !== undefined

  if (db.backend !== 'postgres') {
    const result = await db.run(SQLITE_UPDATE_MODULE_CORE, [
      patch.title,
      hasLevel ? 1 : 0,
      patch.level ?? null,
      hasDuration ? 1 : 0,
      patch.duration ?? null,
      hasDurationWeeks ? 1 : 0,
      patch.durationWeeks?.min ?? null,
      hasDurationWeeks ? 1 : 0,
      patch.durationWeeks?.max ?? null,
      id
    ])
    return result.changes ?? 0
  }

  const values: Updateable<ModulesTable> = { title: patch.title }
  if (hasLevel) values.level = patch.level ?? null
  if (hasDuration) values.duration = patch.duration ?? null
  if (hasDurationWeeks) {
    values.duration_weeks_min = patch.durationWeeks?.min ?? null
    values.duration_weeks_max = patch.durationWeeks?.max ?? null
  }

  const result = await getQueryDatabase(pool(db))
    .updateTable('modules')
    .set(values)
    .where('id', '=', Number(id))
    .executeTakeFirst()

  return Number(result.numUpdatedRows ?? 0)
}

export async function deleteModule(db: DatabaseClient, id: number | string): Promise<number> {
  if (db.backend !== 'postgres') {
    const result = await db.run('DELETE FROM modules WHERE id = ?', [id])
    return result.changes ?? 0
  }

  const result = await getQueryDatabase(pool(db))
    .deleteFrom('modules')
    .where('id', '=', Number(id))
    .executeTakeFirst()

  return Number(result.numDeletedRows ?? 0)
}
