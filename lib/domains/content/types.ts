import type { NormalizedRoadmapImport, RoadmapImportStrategy } from './import'
import type { RoadmapSearchRow } from './search'

export type RoadmapRecord = {
  id: number
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

export type RoadmapWithCategory = RoadmapRecord & {
  category_key: string | null
  category_label: string | null
}

/** Public module: what an API response may contain (no `quiz_bank`). */
export type ModuleRecord = {
  id: number
  roadmap_id: number
  position: number | null
  title: string
  duration: string | null
  duration_weeks_min: number | null
  duration_weeks_max: number | null
  level: string | null
  objective: string | null
  contents: string | null
  importance: string | null
  official_resources: string | null
  support_videos: string | null
  practical_activity: string | null
  deliverable_evidence: string | null
  evaluation: string | null
  quiz_pass_percentage: number | null
  quiz_max_attempts: number | null
  quiz_cooldown_minutes: number | null
}

/** Internal view of a module: the public record plus the quiz answers. Never send it in a response. */
export type ModuleWithQuizBank = ModuleRecord & { quiz_bank: string | null }

export type LessonRecord = {
  id: number
  module_id: number
  title: string
  completed: number
}

export type LessonWithRoadmapId = LessonRecord & { roadmap_id: number }

export type DurationWeeks = { min: number | null; max: number | null }

export type RoadmapInsert = {
  title: string
  description: string | null
  duration: string | null
  durationWeeks: DurationWeeks
  version: string
  publishedAt: string
}

export type RoadmapCoreUpdate = {
  title: string
  description: string | null
  duration?: string | null
  durationWeeks?: DurationWeeks
  version?: string
  publishedAt?: string
}

export type ModuleCoreInsert = {
  roadmap_id: number
  title: string
  level: string | null
  duration: string | null
  duration_weeks_min: number | null
  duration_weeks_max: number | null
}

export type ModuleCoreUpdate = {
  title: string
  level?: string | null
  duration?: string | null
  durationWeeks?: DurationWeeks
}

/** What a caller may read: the structural part of the auth read scope. */
export type ContentReadScope = {
  user: { id: number } | null
  allRoadmaps: boolean
  roadmapIds: number[]
}

export type CatalogRow = RoadmapSearchRow

export type CountedItem = { key: string; label: string; roadmap_count: number }

export type DurationStats = {
  min_weeks: number | null
  max_weeks: number | null
  total_count: number | null
  up_to_4_count: number | null
  from_5_to_12_count: number | null
  over_12_count: number | null
}

/** Raw aggregates produced by the catalog repository for one read scope. */
export type CatalogAggregates = {
  categories: CountedItem[]
  topics: CountedItem[]
  duration: DurationStats | undefined
  levelCounts: Array<{ key: string; roadmap_count: number }>
  unclassifiedCount: number
}

export type TopicRecord = { key: string; label: string }

export type ImportExisting = { id: number; title: string } | undefined

export type ImportResult = { roadmap_id: number; created_modules: number; updated_modules: number }

export type { NormalizedRoadmapImport, RoadmapImportStrategy }
