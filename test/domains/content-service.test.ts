import { describe, expect, it, vi } from 'vitest'
import { RoadmapImportConflictError } from '../../lib/domains/content/import'
import { parseRoadmapSearchQuery } from '../../lib/domains/content/search'
import { buildCatalogMetadata, emptyCatalogMetadata, makeContentService, type ContentPorts } from '../../lib/domains/content/service'
import type {
  CatalogAggregates,
  LessonWithRoadmapId,
  ModuleRecord,
  NormalizedRoadmapImport,
  RoadmapRecord
} from '../../lib/domains/content/types'

function moduleRecord(id: number, roadmapId: number): ModuleRecord {
  return {
    id, roadmap_id: roadmapId, position: id, title: `Module ${id}`, duration: null,
    duration_weeks_min: null, duration_weeks_max: null, level: null, objective: null, contents: null,
    importance: null, official_resources: null, support_videos: null, practical_activity: null,
    deliverable_evidence: null, evaluation: null, quiz_bank: null, quiz_pass_percentage: null,
    quiz_max_attempts: null, quiz_cooldown_minutes: null
  }
}

function roadmapRecord(id: number, title = `Roadmap ${id}`): RoadmapRecord {
  return {
    id, title, description: null, duration: null, objectives: null, methodology: null,
    evaluation_weights: null, category_id: null, duration_weeks_min: null, duration_weeks_max: null,
    version: 'v1.0.0', published_at: '2026-01-01T00:00:00.000Z'
  }
}

type Overrides = {
  [K in keyof ContentPorts]?: Partial<ContentPorts[K]>
}

/** Builds a service whose ports fail loudly unless a test provides them. */
function setup(overrides: Overrides = {}) {
  const missing = (name: string) => () => { throw new Error(`unexpected call: ${name}`) }
  const proxy = <K extends keyof ContentPorts>(group: K): ContentPorts[K] =>
    new Proxy((overrides[group] ?? {}) as object, {
      get: (target, prop: string) => (target as Record<string, unknown>)[prop] ?? missing(`${group}.${prop}`)
    }) as ContentPorts[K]

  const roadmaps = proxy('roadmaps')
  const metadata = proxy('metadata')

  return makeContentService({
    roadmaps,
    metadata,
    catalog: proxy('catalog'),
    modules: proxy('modules'),
    lessons: proxy('lessons'),
    imports: proxy('imports'),
    learnerProgress: proxy('learnerProgress'),
    unitOfWork: { run: overrides.unitOfWork?.run ?? (work => work({ roadmaps, metadata })) }
  })
}

const aggregates: CatalogAggregates = {
  categories: [{ key: 'cloud', label: 'Cloud', roadmap_count: 2 }],
  topics: [{ key: 'aws', label: 'AWS', roadmap_count: 2 }],
  duration: {
    min_weeks: 2, max_weeks: 20, total_count: 3,
    up_to_4_count: 1, from_5_to_12_count: 1, over_12_count: 1
  },
  levelCounts: [{ key: 'beginner', roadmap_count: 2 }],
  unclassifiedCount: 1
}

describe('catalog metadata aggregation', () => {
  it('maps duration ranges, levels and progress buckets to the public shape', () => {
    const metadata = buildCatalogMetadata(aggregates, { completed: 1, inProgress: 1, notStarted: 1 })

    expect(metadata.categories).toEqual(aggregates.categories)
    expect(metadata.duration).toEqual({ min_weeks: 2, max_weeks: 20 })
    expect(metadata.duration_ranges.map(item => item.roadmap_count)).toEqual([1, 1, 1])
    expect(metadata.levels).toEqual([
      { key: 'beginner', roadmap_count: 2 },
      { key: 'intermediate', roadmap_count: 0 },
      { key: 'advanced', roadmap_count: 0 },
      { key: 'capstone', roadmap_count: 0 }
    ])
    expect(Object.fromEntries(metadata.progress_statuses.map(item => [item.key, item.roadmap_count])))
      .toEqual({ not_started: 1, in_progress: 1, completed: 1 })
    expect(metadata.unclassified_roadmaps).toBe(1)
  })

  it('returns an empty structure when the scope grants no roadmaps', async () => {
    const service = setup()
    expect(await service.getCatalogMetadata({ user: null, allRoadmaps: false, roadmapIds: [] }))
      .toEqual(emptyCatalogMetadata())
  })

  it('restricts every aggregate to the scoped roadmaps and counts the learner progress inside it', async () => {
    const catalog = {
      listCategoryCounts: vi.fn().mockResolvedValue(aggregates.categories),
      listTopicCounts: vi.fn().mockResolvedValue(aggregates.topics),
      getDurationStats: vi.fn().mockResolvedValue({ ...aggregates.duration, total_count: 3 }),
      listLevelCounts: vi.fn().mockResolvedValue(aggregates.levelCounts),
      countUnclassified: vi.fn().mockResolvedValue(0)
    }
    const service = setup({
      catalog,
      learnerProgress: {
        listUserRoadmapProgress: async () => [
          { roadmap_id: 1, status: 'completed' },
          { roadmap_id: 2, status: 'paused' },
          { roadmap_id: 99, status: 'completed' }
        ]
      }
    })

    const metadata = await service.getCatalogMetadata({ user: { id: 5 }, allRoadmaps: false, roadmapIds: [1, 2, 3] })

    expect(catalog.listCategoryCounts).toHaveBeenCalledWith([1, 2, 3])
    expect(catalog.countUnclassified).toHaveBeenCalledWith([1, 2, 3])
    expect(Object.fromEntries(metadata.progress_statuses.map(item => [item.key, item.roadmap_count])))
      .toEqual({ not_started: 1, in_progress: 1, completed: 1 })
  })

  it('treats every roadmap as not started for anonymous visitors', async () => {
    const service = setup({
      catalog: {
        listCategoryCounts: async () => [],
        listTopicCounts: async () => [],
        getDurationStats: async () => aggregates.duration,
        listLevelCounts: async () => [],
        countUnclassified: async () => 0
      }
    })

    const metadata = await service.getCatalogMetadata({ user: null, allRoadmaps: true, roadmapIds: [] })
    expect(metadata.progress_statuses.find(item => item.key === 'not_started')?.roadmap_count).toBe(3)
  })
})

describe('catalog search', () => {
  const rows = [
    { id: 1, title: 'AWS', module_search_text: '' },
    { id: 2, title: 'Kubernetes', module_search_text: '' }
  ]

  it('hides roadmaps outside the scope and overlays the learner progress status', async () => {
    const service = setup({
      catalog: { listCatalogRows: async () => rows.map(row => ({ ...row })) },
      learnerProgress: { listUserRoadmapProgress: async () => [{ roadmap_id: 1, status: 'completed' }] }
    })

    const result = await service.searchCatalog(
      { user: { id: 5 }, allRoadmaps: false, roadmapIds: [1] },
      parseRoadmapSearchQuery('')
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 1, user_progress_status: 'completed' })
  })

  it('does not query anything for a scope without roadmaps', async () => {
    const service = setup()
    expect(await service.searchCatalog({ user: null, allRoadmaps: false, roadmapIds: [] }, parseRoadmapSearchQuery('')))
      .toEqual([])
  })
})

describe('modules and lessons visibility', () => {
  it('lists modules according to the read scope', async () => {
    const modules = {
      findAll: vi.fn().mockResolvedValue([moduleRecord(1, 1), moduleRecord(2, 2)]),
      findByRoadmapId: vi.fn().mockResolvedValue([moduleRecord(1, 1)]),
      findByRoadmapIds: vi.fn().mockResolvedValue([moduleRecord(2, 2)])
    }
    const service = setup({ modules })
    const everything = { user: null, allRoadmaps: true, roadmapIds: [] }
    const restricted = { user: null, allRoadmaps: false, roadmapIds: [2] }

    expect(await service.listModules(everything)).toHaveLength(2)
    expect(await service.listModules(everything, 1)).toHaveLength(1)
    expect(await service.listModules(restricted, 1)).toEqual([])
    expect(await service.listModules(restricted)).toEqual([moduleRecord(2, 2)])
    expect(await service.listModules({ user: null, allRoadmaps: false, roadmapIds: [] })).toEqual([])
  })

  it('hides lessons of modules outside the scope and strips the roadmap id', async () => {
    const lesson: LessonWithRoadmapId = { id: 9, module_id: 4, title: 'Intro', completed: 0, roadmap_id: 2 }
    const service = setup({
      lessons: { findWithRoadmapId: async () => lesson },
      modules: { findById: async () => moduleRecord(4, 2) }
    })

    expect(await service.getLesson({ user: null, allRoadmaps: false, roadmapIds: [3] }, 9)).toBeNull()
    expect(await service.getLesson({ user: null, allRoadmaps: false, roadmapIds: [2] }, 9))
      .toEqual({ id: 9, module_id: 4, title: 'Intro', completed: 0 })
  })

  it('returns null when updating or deleting something that does not exist', async () => {
    const service = setup({
      modules: { updateCore: async () => 0, findById: async () => undefined },
      lessons: { update: async () => 0, findById: async () => undefined }
    })

    expect(await service.updateModule(1, { title: 'x' })).toBeNull()
    expect(await service.deleteModule(1)).toBeNull()
    expect(await service.updateLesson(1, { title: 'x', completed: false })).toBeNull()
    expect(await service.deleteLesson(1)).toBeNull()
  })
})

describe('roadmap use cases', () => {
  it('keeps the current category and topics when only one of them is updated', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const service = setup({
      roadmaps: {
        updateCore: async () => 1,
        findCategoryLabelById: async () => 'Cloud',
        findRecordById: async () => roadmapRecord(4)
      },
      metadata: { getTopics: async () => [{ key: 'aws', label: 'AWS' }], save }
    })

    await service.updateRoadmap(4, { title: 'T', topics: ['Docker'] })
    expect(save).toHaveBeenLastCalledWith('4', 'Cloud', ['Docker'])

    await service.updateRoadmap(4, { title: 'T', category: 'DevOps' })
    expect(save).toHaveBeenLastCalledWith('4', 'DevOps', ['AWS'])
  })

  it('does not touch metadata when neither category nor topics change', async () => {
    const save = vi.fn()
    const service = setup({
      roadmaps: { updateCore: async () => 1, findRecordById: async () => roadmapRecord(4) },
      metadata: { save }
    })

    await service.updateRoadmap(4, { title: 'T' })
    expect(save).not.toHaveBeenCalled()
  })

  it('reports a missing roadmap on update and creates metadata on create', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const service = setup({
      roadmaps: { updateCore: async () => 0, insert: async () => 8, findRecordById: async () => roadmapRecord(8) },
      metadata: { save }
    })

    expect(await service.updateRoadmap(4, { title: 'T' })).toBeNull()
    const created = await service.createRoadmap({
      title: 'New', version: 'v1.0.0', publishedAt: '2026-01-01', durationWeeks: { min: null, max: null }, category: 'Cloud'
    })
    expect(created).toMatchObject({ id: 8, topics: [] })
    expect(save).toHaveBeenCalledWith(8, 'Cloud', [])
  })

  it('fails creation without saving metadata when the insert yields no id', async () => {
    const save = vi.fn()
    const service = setup({ roadmaps: { insert: async () => undefined }, metadata: { save } })

    expect(await service.createRoadmap({
      title: 'New', version: 'v1.0.0', publishedAt: '2026-01-01', durationWeeks: { min: null, max: null }
    })).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('creates and updates roadmaps with their metadata inside one unit of work', async () => {
    const run = vi.fn((work: (repos: any) => Promise<unknown>) => work({
      roadmaps: { insert: async () => 8, updateCore: async () => 1, findCategoryLabelById: async () => 'Cloud' },
      metadata: { save: async () => undefined, getTopics: async () => [] }
    }))
    const service = setup({
      unitOfWork: { run } as any,
      roadmaps: { findRecordById: async () => roadmapRecord(8) }
    })

    await service.createRoadmap({ title: 'New', version: 'v1.0.0', publishedAt: '2026-01-01', durationWeeks: { min: null, max: null } })
    await service.updateRoadmap(8, { title: 'T', category: 'Cloud' })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('propagates a metadata failure from the unit of work without returning a roadmap', async () => {
    const failure = new Error('metadata failed')
    const service = setup({
      unitOfWork: {
        run: async work => work({
          roadmaps: { insert: async () => 8 } as any,
          metadata: { save: async () => { throw failure } } as any
        })
      },
      roadmaps: { findRecordById: async () => { throw new Error('must not read after a failed write') } }
    })

    await expect(service.createRoadmap({
      title: 'New', version: 'v1.0.0', publishedAt: '2026-01-01', durationWeeks: { min: null, max: null }, category: 'Cloud'
    })).rejects.toBe(failure)
  })

  it('deleting is idempotent: it reports whether a row was removed and the previous title', async () => {
    const remove = vi.fn().mockResolvedValue(0)
    const service = setup({ roadmaps: { findTitleById: async () => null, delete: remove } })

    expect(await service.deleteRoadmap(3)).toEqual({ deleted: false, title: null })
    expect(remove).toHaveBeenCalledWith(3)

    const existing = setup({ roadmaps: { findTitleById: async () => 'AWS', delete: vi.fn().mockResolvedValue(1) } })
    expect(await existing.deleteRoadmap(3)).toEqual({ deleted: true, title: 'AWS' })
  })
})

describe('roadmap import', () => {
  const roadmap = { title: 'Plataforma', modules: [] } as unknown as NormalizedRoadmapImport

  it('maps conflict errors to a typed outcome and rethrows anything else', async () => {
    const conflict = setup({ imports: { persist: async () => { throw new RoadmapImportConflictError('already_exists') } } })
    expect(await conflict.importRoadmap(roadmap, 'create')).toEqual({ status: 'conflict', code: 'already_exists' })

    const broken = setup({ imports: { persist: async () => { throw new Error('disk full') } } })
    await expect(broken.importRoadmap(roadmap, 'create')).rejects.toThrow('disk full')

    const ok = setup({ imports: { persist: async () => ({ roadmap_id: 1, created_modules: 0, updated_modules: 0 }) } })
    expect(await ok.importRoadmap(roadmap, 'create')).toMatchObject({ status: 'ok', result: { roadmap_id: 1 } })
  })

  it('normalizes a missing import target to null', async () => {
    const service = setup({ imports: { findByTitle: async () => undefined } })
    expect(await service.findImportTarget('Plataforma')).toBeNull()
  })
})
