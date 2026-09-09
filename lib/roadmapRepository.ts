import { Kysely, PostgresDialect, Generated } from 'kysely'
import { Pool } from 'pg'

export interface RoadmapsTable {
  id: Generated<number>
  title: string
  description: string | null
  duration: string | null
  objectives: string | null
  methodology: string | null
  evaluation_weights: string | null
  category_id: number | null
  duration_weeks_min: number | null
  duration_weeks_max: number | null
  version: string
  published_at: Date | string
}

export interface RoadmapCategoriesTable {
  id: Generated<number>
  key: string
  label: string
}

export interface RoadmapQueryDatabase {
  roadmaps: RoadmapsTable
  roadmap_categories: RoadmapCategoriesTable
}

export type RoadmapWithCategory = RoadmapsTable & {
  category_key: string | null
  category_label: string | null
}

let database: Kysely<RoadmapQueryDatabase> | null = null

export function getRoadmapQueryDatabase(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL es obligatoria para Kysely.')
  if (!database) {
    database = new Kysely<RoadmapQueryDatabase>({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString,
          max: 5,
          ssl: { rejectUnauthorized: false }
        })
      })
    })
  }
  return database
}

export async function findRoadmapById(id: number, connectionString?: string): Promise<RoadmapWithCategory | undefined> {
  return getRoadmapQueryDatabase(connectionString)
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
