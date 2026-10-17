import type {
  CatalogAggregates,
  CatalogRow,
  ImportExisting,
  ImportResult,
  LessonRecord,
  LessonWithRoadmapId,
  ModuleCoreInsert,
  ModuleCoreUpdate,
  ModuleRecord,
  NormalizedRoadmapImport,
  RoadmapCoreUpdate,
  RoadmapImportStrategy,
  RoadmapInsert,
  RoadmapRecord,
  TopicRecord
} from './types'

export interface RoadmapRepository {
  /** Returns the new id, or a falsy value when the insert produced none. */
  insert(data: RoadmapInsert): Promise<number | undefined>
  findRecordById(id: number): Promise<RoadmapRecord | undefined>
  findTitleById(id: number): Promise<string | null>
  findCategoryLabelById(id: number): Promise<string | null | undefined>
  updateCore(id: number, patch: RoadmapCoreUpdate): Promise<number>
  delete(id: number): Promise<void>
}

export interface MetadataRepository {
  save(roadmapId: number | string, category: unknown, topics: unknown): Promise<void>
  getTopics(roadmapId: number | string): Promise<TopicRecord[]>
}

export interface CatalogRepository {
  listCatalogRows(): Promise<CatalogRow[]>
  /** `roadmapIds` is null for an unrestricted scope. */
  listCategoryCounts(roadmapIds: number[] | null): Promise<CatalogAggregates['categories']>
  listTopicCounts(roadmapIds: number[] | null): Promise<CatalogAggregates['topics']>
  getDurationStats(roadmapIds: number[] | null): Promise<CatalogAggregates['duration']>
  listLevelCounts(roadmapIds: number[] | null): Promise<CatalogAggregates['levelCounts']>
  countUnclassified(roadmapIds: number[] | null): Promise<number>
}

export interface ModuleRepository {
  findAll(): Promise<ModuleRecord[]>
  findByRoadmapId(roadmapId: number | string): Promise<ModuleRecord[]>
  findByRoadmapIds(roadmapIds: Array<number | string>): Promise<ModuleRecord[]>
  findById(id: number | string): Promise<ModuleRecord | undefined>
  insert(data: ModuleCoreInsert): Promise<number>
  updateCore(id: number | string, patch: ModuleCoreUpdate): Promise<number>
  delete(id: number | string): Promise<number>
}

export interface LessonRepository {
  findByModuleId(moduleId: number | string): Promise<LessonRecord[]>
  findById(id: number | string): Promise<LessonRecord | undefined>
  findWithRoadmapId(id: number | string): Promise<LessonWithRoadmapId | undefined>
  insert(data: { module_id: number; title: string }): Promise<number>
  update(id: number | string, data: { title: string; completed: boolean }): Promise<number>
  delete(id: number | string): Promise<number>
}

export interface ImportRepository {
  findByTitle(title: string): Promise<ImportExisting>
  persist(roadmap: NormalizedRoadmapImport, strategy: RoadmapImportStrategy): Promise<ImportResult>
  exportRoadmap(roadmapId: number | string): Promise<NormalizedRoadmapImport | null>
}

/** Read-only view of the learner's progress, implemented by the progress domain. */
export interface LearnerProgressReader {
  listUserRoadmapProgress(userId: number): Promise<Array<{ roadmap_id: number; status: string }>>
}
