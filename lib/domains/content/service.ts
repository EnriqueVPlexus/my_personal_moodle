import { scopeAllowsRoadmap } from '../auth/policy'
import { RoadmapImportConflictError } from './import'
import { MODULE_LEVELS } from './metadata'
import { ROADMAP_DURATION_FILTERS, ROADMAP_PROGRESS_STATUS_FILTERS, type RoadmapCatalogFilters } from './filters'
import { filterAndRankRoadmaps, type RoadmapSearchQuery } from './search'
import type {
  CatalogRepository,
  ImportRepository,
  LearnerProgressReader,
  LessonRepository,
  MetadataRepository,
  ModuleRepository,
  RoadmapRepository
} from './ports'
import type {
  CatalogAggregates,
  ContentReadScope,
  DurationWeeks,
  ImportResult,
  LessonRecord,
  ModuleRecord,
  NormalizedRoadmapImport,
  RoadmapImportStrategy,
  RoadmapRecord
} from './types'

export type ContentPorts = {
  roadmaps: RoadmapRepository
  metadata: MetadataRepository
  catalog: CatalogRepository
  modules: ModuleRepository
  lessons: LessonRepository
  imports: ImportRepository
  learnerProgress: LearnerProgressReader
}

export type RoadmapDraft = {
  title: string
  description?: string | null
  duration?: string | null
  category?: string | null
  version: string
  publishedAt: string
  durationWeeks: DurationWeeks
  topics?: string[]
}

export type RoadmapChanges = {
  title: string
  description?: string | null
  duration?: string | null
  category?: string | null
  durationWeeks?: DurationWeeks
  version?: string
  publishedAt?: string
  topics?: string[]
}

export type ModuleDraft = {
  roadmap_id: number
  title: string
  level: string | null
  duration?: string | null
  durationWeeks: DurationWeeks
}

export type ModuleChanges = {
  title: string
  level?: string | null
  duration?: string | null
  durationWeeks?: DurationWeeks | null
}

/** Progress bucket counts shown next to the status filters. */
export type ProgressStatusCounts = {
  completed: number
  inProgress: number
  notStarted: number
}

export function buildCatalogMetadata(aggregates: CatalogAggregates, progress: ProgressStatusCounts) {
  const { categories, topics, duration, levelCounts, unclassifiedCount } = aggregates
  const counts = new Map(levelCounts.map(row => [row.key, row.roadmap_count]))

  return {
    categories,
    topics,
    levels: MODULE_LEVELS.map(key => ({ key, roadmap_count: counts.get(key) ?? 0 })),
    duration: {
      min_weeks: duration?.min_weeks ?? null,
      max_weeks: duration?.max_weeks ?? null
    },
    duration_ranges: ROADMAP_DURATION_FILTERS.map((range, index) => ({
      key: range.key,
      label: range.label,
      roadmap_count: Number([
        duration?.up_to_4_count,
        duration?.from_5_to_12_count,
        duration?.over_12_count
      ][index] ?? 0)
    })),
    progress_statuses: ROADMAP_PROGRESS_STATUS_FILTERS.map(item => ({
      key: item.key,
      label: item.label,
      roadmap_count: item.key === 'completed'
        ? progress.completed
        : item.key === 'in_progress'
          ? progress.inProgress
          : progress.notStarted
    })),
    unclassified_roadmaps: unclassifiedCount
  }
}

export function emptyCatalogMetadata() {
  return {
    categories: [],
    topics: [],
    levels: MODULE_LEVELS.map(key => ({ key, roadmap_count: 0 })),
    duration: { min_weeks: null, max_weeks: null },
    duration_ranges: ROADMAP_DURATION_FILTERS.map(range => ({
      key: range.key,
      label: range.label,
      roadmap_count: 0
    })),
    progress_statuses: ROADMAP_PROGRESS_STATUS_FILTERS.map(item => ({
      key: item.key,
      label: item.label,
      roadmap_count: 0
    })),
    unclassified_roadmaps: 0
  }
}

export type ContentService = ReturnType<typeof makeContentService>

export function makeContentService(ports: ContentPorts) {
  const { roadmaps, metadata, catalog, modules, lessons, imports, learnerProgress } = ports

  return {
    // --- Catalog: search and filter metadata -------------------------------

    async searchCatalog(scope: ContentReadScope, search: RoadmapSearchQuery, filters?: RoadmapCatalogFilters) {
      if (!scope.allRoadmaps && scope.roadmapIds.length === 0) return []

      const rows = await catalog.listCatalogRows()
      const visibleRows = scope.allRoadmaps
        ? rows
        : rows.filter(row => scope.roadmapIds.includes(Number(row.id)))

      if (scope.user) {
        const userProgress = await learnerProgress.listUserRoadmapProgress(scope.user.id)
        const progressMap = new Map<number, string>()
        userProgress.forEach(item => {
          progressMap.set(item.roadmap_id, item.status === 'completed' ? 'completed' : 'in_progress')
        })
        visibleRows.forEach(row => {
          row.user_progress_status = progressMap.get(Number(row.id)) || 'not_started'
        })
      }

      return filterAndRankRoadmaps(visibleRows, search, filters)
    },

    async getCatalogMetadata(scope: ContentReadScope) {
      const roadmapIds = scope.allRoadmaps ? null : scope.roadmapIds
      if (roadmapIds && roadmapIds.length === 0) return emptyCatalogMetadata()

      const [categories, topics, duration] = await Promise.all([
        catalog.listCategoryCounts(roadmapIds),
        catalog.listTopicCounts(roadmapIds),
        catalog.getDurationStats(roadmapIds)
      ])

      const totalRoadmaps = Number(duration?.total_count || 0)
      const progress: ProgressStatusCounts = { completed: 0, inProgress: 0, notStarted: totalRoadmaps }

      if (scope.user) {
        const userProgress = await learnerProgress.listUserRoadmapProgress(scope.user.id)
        const visibleUserProgress = scope.allRoadmaps
          ? userProgress
          : userProgress.filter(item => scope.roadmapIds.includes(item.roadmap_id))

        progress.completed = visibleUserProgress.filter(item => item.status === 'completed').length
        progress.inProgress = visibleUserProgress.filter(item => item.status !== 'completed').length
        progress.notStarted = Math.max(0, totalRoadmaps - progress.completed - progress.inProgress)
      }

      const levelCounts = await catalog.listLevelCounts(roadmapIds)
      const unclassifiedCount = await catalog.countUnclassified(roadmapIds)

      return buildCatalogMetadata(
        { categories, topics, duration, levelCounts, unclassifiedCount },
        progress
      )
    },

    // --- Roadmaps ---------------------------------------------------------

    async createRoadmap(draft: RoadmapDraft): Promise<{ id: number; roadmap: RoadmapRecord | undefined; topics: string[] } | null> {
      const topics = draft.topics ?? []
      const id = await roadmaps.insert({
        title: draft.title,
        description: draft.description || null,
        duration: draft.duration || null,
        durationWeeks: draft.durationWeeks,
        version: draft.version,
        publishedAt: draft.publishedAt
      })
      if (!id) return null

      await metadata.save(id, draft.category, topics)
      return { id, roadmap: await roadmaps.findRecordById(id), topics }
    },

    /** Returns null when the roadmap does not exist. */
    async updateRoadmap(id: number, changes: RoadmapChanges): Promise<{ roadmap: RoadmapRecord | undefined; topics: string[] } | null> {
      const topics = changes.topics ?? []
      const hasCategory = changes.category !== undefined
      const hasTopics = changes.topics !== undefined

      const updatedRows = await roadmaps.updateCore(id, {
        title: changes.title,
        description: changes.description || null,
        ...(changes.duration !== undefined ? { duration: changes.duration || null } : {}),
        ...(changes.durationWeeks
          ? { durationWeeks: { min: changes.durationWeeks.min, max: changes.durationWeeks.max } }
          : {}),
        ...(changes.version !== undefined ? { version: changes.version } : {}),
        ...(changes.publishedAt !== undefined ? { publishedAt: changes.publishedAt } : {})
      })
      if (!updatedRows) return null

      if (hasCategory || hasTopics) {
        const currentCategory = hasCategory
          ? changes.category
          : await roadmaps.findCategoryLabelById(id)
        const currentTopics = hasTopics ? topics : await metadata.getTopics(String(id))
        await metadata.save(
          String(id),
          currentCategory,
          Array.isArray(currentTopics) ? currentTopics.map((topic: any) => topic.label ?? topic) : []
        )
      }

      return { roadmap: await roadmaps.findRecordById(id), topics }
    },

    /** Deleting is idempotent: a missing roadmap still succeeds. */
    async deleteRoadmap(id: number): Promise<{ title: string | null }> {
      const title = await roadmaps.findTitleById(id)
      await roadmaps.delete(id)
      return { title }
    },

    // --- Modules ----------------------------------------------------------

    async listModules(scope: ContentReadScope, roadmapId?: number): Promise<ModuleRecord[]> {
      if (roadmapId) {
        if (!scopeAllowsRoadmap(scope, roadmapId)) return []
        return modules.findByRoadmapId(roadmapId)
      }

      if (!scope.allRoadmaps && scope.roadmapIds.length === 0) return []
      if (!scope.allRoadmaps) return modules.findByRoadmapIds(scope.roadmapIds)

      return modules.findAll()
    },

    async createModule(draft: ModuleDraft) {
      const id = await modules.insert({
        roadmap_id: draft.roadmap_id,
        title: draft.title,
        level: draft.level,
        duration: draft.duration || null,
        duration_weeks_min: draft.durationWeeks.min,
        duration_weeks_max: draft.durationWeeks.max
      })
      return { id, module: await modules.findById(id) }
    },

    /** Returns null when the module does not exist. */
    async updateModule(id: number, changes: ModuleChanges): Promise<{ module: ModuleRecord | undefined } | null> {
      const updatedRows = await modules.updateCore(id, {
        title: changes.title,
        ...(changes.level !== undefined ? { level: changes.level } : {}),
        ...(changes.duration !== undefined ? { duration: changes.duration || null } : {}),
        ...(changes.durationWeeks
          ? { durationWeeks: { min: changes.durationWeeks.min, max: changes.durationWeeks.max } }
          : {})
      })
      if (!updatedRows) return null

      return { module: await modules.findById(id) }
    },

    /** Returns the deleted module, or null when it does not exist. */
    async deleteModule(id: number): Promise<ModuleRecord | null> {
      const moduleRow = await modules.findById(id)
      if (!moduleRow) return null

      await modules.delete(id)
      return moduleRow
    },

    // --- Lessons ----------------------------------------------------------

    async listLessons(scope: ContentReadScope, moduleId: number): Promise<LessonRecord[]> {
      const moduleRow = await modules.findById(moduleId)
      if (!moduleRow || !scopeAllowsRoadmap(scope, moduleRow.roadmap_id)) return []
      return lessons.findByModuleId(moduleId)
    },

    /** Returns the lesson without its roadmap id, or null when hidden or missing. */
    async getLesson(scope: ContentReadScope, id: number): Promise<LessonRecord | null> {
      const lesson = await lessons.findWithRoadmapId(id)
      if (!lesson) return null
      if (!scopeAllowsRoadmap(scope, lesson.roadmap_id)) return null

      const { roadmap_id: _roadmapId, ...lessonBody } = lesson
      return lessonBody
    },

    async createLesson(draft: { module_id: number; title: string }) {
      const id = await lessons.insert(draft)
      return { id, lesson: await lessons.findById(id) }
    },

    async updateLesson(id: number, changes: { title: string; completed: boolean }): Promise<{ lesson: LessonRecord | undefined } | null> {
      const updatedRows = await lessons.update(id, changes)
      if (!updatedRows) return null

      return { lesson: await lessons.findById(id) }
    },

    /** Returns the deleted lesson, or null when it does not exist. */
    async deleteLesson(id: number): Promise<LessonRecord | null> {
      const lesson = await lessons.findById(id)
      if (!lesson) return null

      await lessons.delete(id)
      return lesson
    },

    // --- Import / export --------------------------------------------------

    /** Existing roadmap with the same title, which an import would touch. */
    async findImportTarget(title: string) {
      return (await imports.findByTitle(title)) ?? null
    },

    async importRoadmap(
      roadmap: NormalizedRoadmapImport,
      strategy: RoadmapImportStrategy
    ): Promise<{ status: 'ok'; result: ImportResult } | { status: 'conflict'; code: 'already_exists' | 'not_found' }> {
      try {
        return { status: 'ok', result: await imports.persist(roadmap, strategy) }
      } catch (error) {
        if (error instanceof RoadmapImportConflictError) return { status: 'conflict', code: error.code }
        throw error
      }
    },

    exportRoadmap(roadmapId: number | string) {
      return imports.exportRoadmap(roadmapId)
    }
  }
}
