import { Kysely, PostgresDialect, Generated, ColumnType } from 'kysely'
import type { Pool } from 'pg'

type OptionalOnInsert<T> = ColumnType<T | null, T | null | undefined, T | null | undefined>

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

export interface ModulesTable {
  id: Generated<number>
  roadmap_id: number
  position: OptionalOnInsert<number>
  title: string
  duration: OptionalOnInsert<string>
  duration_weeks_min: OptionalOnInsert<number>
  duration_weeks_max: OptionalOnInsert<number>
  level: OptionalOnInsert<string>
  objective: OptionalOnInsert<string>
  contents: OptionalOnInsert<string>
  importance: OptionalOnInsert<string>
  official_resources: OptionalOnInsert<string>
  support_videos: OptionalOnInsert<string>
  practical_activity: OptionalOnInsert<string>
  deliverable_evidence: OptionalOnInsert<string>
  evaluation: OptionalOnInsert<string>
  quiz_bank: OptionalOnInsert<string>
  quiz_pass_percentage: OptionalOnInsert<number>
  quiz_max_attempts: OptionalOnInsert<number>
  quiz_cooldown_minutes: OptionalOnInsert<number>
}

export interface LessonsTable {
  id: Generated<number>
  module_id: number
  title: string
  completed: Generated<number>
}

export interface AuditLogsTable {
  id: Generated<number>
  actor_user_id: number | null
  actor_email: string | null
  action: string
  entity_type: string
  entity_id: string | null
  details: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: Date | string
}

export interface Database {
  roadmaps: RoadmapsTable
  roadmap_categories: RoadmapCategoriesTable
  modules: ModulesTable
  lessons: LessonsTable
  audit_logs: AuditLogsTable
}

const kyselyByPool = new WeakMap<Pool, Kysely<Database>>()

export function getQueryDatabase(pool: Pool): Kysely<Database> {
  let instance = kyselyByPool.get(pool)
  if (!instance) {
    instance = new Kysely<Database>({
      dialect: new PostgresDialect({ pool })
    })
    kyselyByPool.set(pool, instance)
  }
  return instance
}
