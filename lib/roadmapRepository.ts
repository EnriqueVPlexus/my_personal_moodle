import { Selectable, Updateable } from 'kysely'
import type { DatabaseClient } from './database'
import type { PostgresDb } from './postgresDb'
import { getQueryDatabase, RoadmapsTable } from './kyselyDatabase'

export type RoadmapWithCategory = Selectable<RoadmapsTable> & {
  category_key: string | null
  category_label: string | null
}

const SQLITE_ROADMAP_BY_ID = `
  SELECT roadmaps.*, roadmap_categories.key AS category_key,
         roadmap_categories.label AS category_label
  FROM roadmaps
  LEFT JOIN roadmap_categories ON roadmap_categories.id = roadmaps.category_id
  WHERE roadmaps.id = ?
`

export async function findRoadmapById(db: DatabaseClient, id: number): Promise<RoadmapWithCategory | undefined> {
  if (db.backend !== 'postgres') {
    return db.get<RoadmapWithCategory>(SQLITE_ROADMAP_BY_ID, [id])
  }

  const pool = (db as PostgresDb).getPool()
  return getQueryDatabase(pool)
    .selectFrom('roadmaps')
    .leftJoin('roadmap_categories', 'roadmap_categories.id', 'roadmaps.category_id')
    .select([
      'roadmaps.id',
      'roadmaps.title',
      'roadmaps.description',
      'roadmaps.duration',
      'roadmaps.objectives',
      'roadmaps.methodology',
      'roadmaps.evaluation_weights',
      'roadmaps.category_id',
      'roadmaps.duration_weeks_min',
      'roadmaps.duration_weeks_max',
      'roadmaps.version',
      'roadmaps.published_at',
      'roadmap_categories.key as category_key',
      'roadmap_categories.label as category_label'
    ])
    .where('roadmaps.id', '=', id)
    .executeTakeFirst() as Promise<RoadmapWithCategory | undefined>
}

export type RoadmapCoreUpdate = {
  title: string
  description: string | null
  duration?: string | null
  durationWeeks?: { min: number | null; max: number | null }
  version?: string
  publishedAt?: string
}

const SQLITE_UPDATE_ROADMAP_CORE = `
  UPDATE roadmaps SET title = ?, description = ?,
    duration = CASE WHEN ? = 1 THEN ? ELSE duration END,
    duration_weeks_min = CASE WHEN ? = 1 THEN ? ELSE duration_weeks_min END,
    duration_weeks_max = CASE WHEN ? = 1 THEN ? ELSE duration_weeks_max END,
    version = CASE WHEN ? = 1 THEN ? ELSE version END,
    published_at = CASE WHEN ? = 1 THEN ? ELSE published_at END
  WHERE id = ?
`

export async function updateRoadmapCore(db: DatabaseClient, id: number, patch: RoadmapCoreUpdate): Promise<number> {
  const hasDuration = patch.duration !== undefined
  const hasDurationWeeks = patch.durationWeeks !== undefined
  const hasVersion = patch.version !== undefined
  const hasPublishedAt = patch.publishedAt !== undefined

  if (db.backend !== 'postgres') {
    const result = await db.run(SQLITE_UPDATE_ROADMAP_CORE, [
      patch.title,
      patch.description,
      hasDuration ? 1 : 0,
      patch.duration ?? null,
      hasDurationWeeks ? 1 : 0,
      patch.durationWeeks?.min ?? null,
      hasDurationWeeks ? 1 : 0,
      patch.durationWeeks?.max ?? null,
      hasVersion ? 1 : 0,
      patch.version ?? null,
      hasPublishedAt ? 1 : 0,
      patch.publishedAt ?? null,
      id
    ])
    return result.changes ?? 0
  }

  const values: Updateable<RoadmapsTable> = {
    title: patch.title,
    description: patch.description
  }
  if (hasDuration) values.duration = patch.duration ?? null
  if (hasDurationWeeks) {
    values.duration_weeks_min = patch.durationWeeks?.min ?? null
    values.duration_weeks_max = patch.durationWeeks?.max ?? null
  }
  if (hasVersion) values.version = patch.version
  if (hasPublishedAt) values.published_at = patch.publishedAt

  const pool = (db as PostgresDb).getPool()
  const result = await getQueryDatabase(pool)
    .updateTable('roadmaps')
    .set(values)
    .where('id', '=', id)
    .executeTakeFirst()

  return Number(result.numUpdatedRows ?? 0)
}
